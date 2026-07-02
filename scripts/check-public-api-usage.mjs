#!/usr/bin/env node
/**
 * @fileoverview Reference-coverage checker for the `cargo public-api` snapshots.
 *
 * Reads the three committed `*.txt` snapshot files, extracts the short name of
 * every `pub` item (the final path segment), word-boundary-searches the
 * `apps/api/src` and `apps/api/tests` trees for each, and reports items that
 * are neither referenced nor allow-listed in `apps/api/public-api/allow.json`.
 *
 * Flags:
 *   --report   Print findings and exit 0 (report-only mode, no failure).
 *
 * @layer tooling
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SNAPSHOT_DIR = join(ROOT, 'apps/api/public-api');
const ALLOW_FILE = join(SNAPSHOT_DIR, 'allow.json');
const SRC_DIRS = [join(ROOT, 'apps/api/src'), join(ROOT, 'apps/api/tests')];
const SNAPSHOTS = ['bymax-auth-axum.txt', 'bymax-auth-core.txt', 'bymax-auth-redis.txt'];
const SKIP_DIRS = new Set(['target', '.git', 'node_modules']);

const args = process.argv.slice(2);
const reportMode = args.includes('--report');

// ── File walking ──────────────────────────────────────────────────────────────

/**
 * Recursively collect Rust source file paths (`.rs`) under a directory.
 * @param {string} dir Directory to walk.
 * @returns {string[]} Absolute paths to `.rs` files.
 */
function walkRs(dir) {
  if (!existsSync(dir)) return [];
  const acc = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) acc.push(...walkRs(full));
    else if (extname(entry.name) === '.rs') acc.push(full);
  }
  return acc;
}

/**
 * Build a sentinel-joined corpus from all Rust source files.
 * @returns {string} Corpus string.
 */
function buildCorpus() {
  const files = SRC_DIRS.flatMap(walkRs);
  return files.map((f) => readFileSync(f, 'utf8')).join('\n\0\n');
}

// ── Snapshot parsing ──────────────────────────────────────────────────────────

/**
 * Extract the short name (final path segment) of every `pub` item from a
 * `cargo public-api` snapshot line.
 *
 * `cargo public-api` emits one item per line in the form:
 *   `pub fn bymax_auth_core::engine::AuthEngine::builder() -> ...`
 *
 * The short name is the identifier immediately after the last `::` in the path
 * component, before any `(` or `<` or ` `. Items without a `pub` prefix are
 * skipped (they are private or re-exported internals not part of the surface).
 *
 * @param {string} snapshot Contents of a `*.txt` snapshot file.
 * @returns {Set<string>} Short names of public items.
 */
function parseSnapshot(snapshot) {
  const names = new Set();
  for (const line of snapshot.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('pub ')) continue;
    // Strip the leading `pub fn ` / `pub struct ` / `pub enum ` etc. keyword,
    // including optional modifiers like `unsafe`, `async`, `#[…]` decorators.
    let withoutPub = trimmed.replace(
      /^pub\s+(?:unsafe\s+)?(?:async\s+)?(?:fn|struct|enum|trait|type|const|static|macro|mod|impl|use)\s+/,
      '',
    );
    // If no keyword matched (e.g. enum variant / associated item lines of the
    // form `pub crate::Module::Variant`), strip just the `pub ` prefix so the
    // path is extracted correctly rather than treating `pub` as the identifier.
    if (withoutPub === trimmed) {
      withoutPub = trimmed.slice('pub '.length);
    }
    // Match the fully-qualified path: one or more `identifier` segments joined
    // by `::`. Stop at any character that cannot be part of a Rust path
    // (`(`, `<`, ` `, `[`, `:` when not followed by `:`).
    // Pattern: (segment::)* segment
    const pathMatch = /^((?:[A-Za-z0-9_]+::)*[A-Za-z0-9_]+)/.exec(withoutPub);
    if (!pathMatch) continue;
    const parts = pathMatch[1].split('::');
    const shortName = parts[parts.length - 1];
    if (shortName) names.add(shortName);
  }
  return names;
}

// ── Allow-list ────────────────────────────────────────────────────────────────

/**
 * Load the allow-listed short names from `apps/api/public-api/allow.json`.
 *
 * Format: `{ "<short-name>": "reason" }`.
 *
 * @returns {Set<string>} Allow-listed item short names.
 */
function loadAllow() {
  if (!existsSync(ALLOW_FILE)) return new Set();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(ALLOW_FILE, 'utf8'));
  } catch (err) {
    process.stderr.write(`audit:public-api — failed to parse ${ALLOW_FILE}: ${String(err)}\n`);
    process.exit(1);
  }
  return new Set(Object.keys(parsed));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const corpus = buildCorpus();
const allow = loadAllow();

/** @type {Map<string, string[]>} crate → missing short names */
const missingByCrate = new Map();
let totalItems = 0;

for (const snapshotFile of SNAPSHOTS) {
  const snapshotPath = join(SNAPSHOT_DIR, snapshotFile);
  if (!existsSync(snapshotPath)) {
    process.stdout.write(
      `audit:public-api — snapshot ${snapshotFile} not found; run --bless first\n`,
    );
    continue;
  }
  const snapshot = readFileSync(snapshotPath, 'utf8');
  const names = parseSnapshot(snapshot);
  totalItems += names.size;
  const crate = snapshotFile.replace('.txt', '');
  process.stdout.write(`audit:public-api —   ${crate}: ${names.size} pub items\n`);
  for (const name of names) {
    if (allow.has(name)) continue;
    if (!new RegExp(`\\b${name}\\b`).test(corpus)) {
      const list = missingByCrate.get(crate) ?? [];
      list.push(name);
      missingByCrate.set(crate, list);
    }
  }
}

process.stdout.write(
  `audit:public-api — ${totalItems} total pub items across ${SNAPSHOTS.length} crates\n`,
);

if (missingByCrate.size === 0) {
  process.stdout.write('audit:public-api — all pub items referenced in apps/api.\n');
  process.exit(0);
}

const totalMissing = [...missingByCrate.values()].reduce((s, a) => s + a.length, 0);
process.stdout.write(
  `audit:public-api — ${totalMissing} unreferenced item(s) not in allow.json:\n`,
);
for (const [crate, names] of [...missingByCrate.entries()].sort()) {
  process.stdout.write(`  ${crate}: ${names.sort().join(', ')}\n`);
}

if (reportMode) {
  process.stdout.write(
    'audit:public-api — report mode: unreferenced items listed above; exiting 0.\n',
  );
  process.exit(0);
}
process.stderr.write('audit:public-api — FAILED: unreferenced pub items found (see above)\n');
process.exit(1);
