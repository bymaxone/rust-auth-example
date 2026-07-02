#!/usr/bin/env node
/**
 * @fileoverview Export-usage audit for the browser package `@bymax-one/rust-auth`.
 *
 * Parses the four subpaths' `dist/**\/*.d.ts` (`/client`, `/react`, `/nextjs`,
 * `/shared`), extracts every exported symbol, and word-boundary-searches the
 * `apps/web` corpus. It fails when a public export is neither referenced nor
 * allow-listed (with a reason) in `.audit-ignore.json`.
 *
 * Flags:
 *   --report   Print the audit results and exit 0 (report-only mode, no failure).
 *   --self-test Assert the parser extracts a known export and flags a fake one; exit 0.
 *
 * @layer tooling
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CORPUS_DIR = join(ROOT, 'apps/web');
const DIST = join(ROOT, 'apps/web/node_modules/@bymax-one/rust-auth/dist');
const IGNORE_FILE = join(ROOT, '.audit-ignore.json');
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '.turbo', 'out', 'build']);

const args = process.argv.slice(2);
const reportMode = args.includes('--report');
const selfTest = args.includes('--self-test');

// ── File walking ──────────────────────────────────────────────────────────────

/**
 * Recursively collect `.ts` / `.tsx` file paths under a directory.
 * @param {string} dir Directory to walk.
 * @returns {string[]} Absolute file paths.
 */
function walkTs(dir) {
  const acc = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) acc.push(...walkTs(full));
    else if (
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.d.ts')
    )
      acc.push(full);
  }
  return acc;
}

/**
 * Join file contents with a sentinel separator for word-boundary searches.
 * @param {string[]} files Absolute paths to TypeScript source files.
 * @returns {string} Sentinel-joined corpus string.
 */
function buildCorpus(files) {
  return files.map((f) => readFileSync(f, 'utf8')).join('\n\0\n');
}

/**
 * Check whether a symbol appears word-boundary-matched in the corpus.
 * @param {string} corpus Sentinel-joined source corpus.
 * @param {string} symbol Identifier to search for.
 * @returns {boolean} True when at least one match exists.
 */
function isUsed(corpus, symbol) {
  return new RegExp(`\\b${symbol}\\b`).test(corpus);
}

// ── Export parsing ────────────────────────────────────────────────────────────

/**
 * Extract exported symbol names from a TypeScript declaration file.
 *
 * Handles:
 * - `export { Foo, type Bar, Baz as Qux }` — aliased name wins.
 * - `export type { … }` — included.
 * - `export const|let|var|function|class|interface|enum|type|namespace Foo`.
 * - `export [declare] [abstract] [async] class Foo`.
 * - Re-exports `export { … } from 'pkg'` — skipped.
 *
 * @param {string} dts Declaration-file content.
 * @returns {Set<string>} Exported symbol names.
 */
function parseExports(dts) {
  const symbols = new Set();
  let m;

  // export { Foo, type Bar, Baz as Qux } [from '...']
  // Skip re-exports from external npm packages (non-relative paths) — those
  // symbols originate in the dependency and are not part of this subpath's
  // own surface. Relative re-exports (from '../chunk') ARE this subpath's
  // surface and must be parsed.
  const braceRe = /^export\s+(?:type\s+)?\{([^}]+)\}([^;\n]*)?;/gm;
  while ((m = braceRe.exec(dts)) !== null) {
    const trailer = (m[2] ?? '').trim();
    // A path starting with '.' or '/' is relative/absolute (included); a bare
    // name (e.g. 'react', 'next/server') is an external package (skipped).
    const fromMatch = /from\s+['"]([^'"]+)['"]/.exec(trailer);
    if (fromMatch && !fromMatch[1].startsWith('.') && !fromMatch[1].startsWith('/')) continue;
    for (const part of m[1].split(',')) {
      const clean = part.trim().replace(/^type\s+/, '');
      if (!clean) continue;
      // 'Foo as Bar' → keep 'Bar' (the consumer-visible name).
      const asMatch = /\bas\s+(\w+)/.exec(clean);
      const name = asMatch ? asMatch[1] : /^(\w+)/.exec(clean)?.[1];
      if (name && name !== 'default') symbols.add(name);
    }
  }

  // export [declare] [abstract] [async] const|let|var|function|class|interface|enum|type|namespace Foo
  const namedRe =
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|enum|type|namespace)\s+(\w+)/gm;
  while ((m = namedRe.exec(dts)) !== null) symbols.add(m[1]);

  return symbols;
}

// ── Allow-list ────────────────────────────────────────────────────────────────

/**
 * Load the allow-listed keys from `.audit-ignore.json`.
 *
 * Format: `{ "<subpath>.<symbol>": "reason" }` — each key is the fully-qualified
 * subpath.symbol pair; the value is a human-readable reason.
 *
 * @returns {Set<string>} Allow-listed `subpath.symbol` keys.
 */
function loadIgnore() {
  if (!existsSync(IGNORE_FILE)) return new Set();
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(IGNORE_FILE, 'utf8'));
  } catch (err) {
    // A present-but-invalid file must fail hard: silently continuing with an
    // empty set would disable the whole allow-list under false pretenses.
    process.stderr.write(`audit:exports — failed to parse .audit-ignore.json: ${String(err)}\n`);
    process.exit(1);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    process.stderr.write(
      'audit:exports — .audit-ignore.json must be an object mapping "subpath.symbol" to a reason string\n',
    );
    process.exit(1);
  }
  return new Set(Object.keys(parsed));
}

// ── Self-test ─────────────────────────────────────────────────────────────────

if (selfTest) {
  // Verify the parser finds a known export in the real /client index.d.ts.
  const clientDts = join(DIST, 'client', 'index.d.ts');
  if (!existsSync(clientDts)) {
    process.stderr.write(
      `audit:exports self-test — ${clientDts} not found; run scripts/link-library.sh first\n`,
    );
    process.exit(1);
  }
  const clientSymbols = parseExports(readFileSync(clientDts, 'utf8'));
  if (!clientSymbols.has('createAuthClient')) {
    process.stderr.write(
      "audit:exports self-test — expected 'createAuthClient' in /client exports but it was not found\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    `audit:exports self-test — 'createAuthClient' found in /client (${clientSymbols.size} exports total)\n`,
  );

  // Verify a fabricated symbol is not in the corpus (it must not appear in apps/web).
  if (!existsSync(CORPUS_DIR)) {
    process.stderr.write(
      `audit:exports self-test — ${CORPUS_DIR} not found; cannot verify corpus; run from the repo root with apps/web present\n`,
    );
    process.exit(1);
  }
  const fakeSymbol = '__definitely_not_exported__';
  const corpus = buildCorpus(walkTs(CORPUS_DIR));
  if (isUsed(corpus, fakeSymbol)) {
    process.stderr.write(
      `audit:exports self-test — expected '${fakeSymbol}' to be absent from corpus but it was found\n`,
    );
    process.exit(1);
  }
  process.stdout.write(
    `audit:exports self-test — '${fakeSymbol}' correctly absent from the corpus\n`,
  );
  process.stdout.write('audit:exports self-test — passed\n');
  process.exit(0);
}

// ── Main audit ────────────────────────────────────────────────────────────────

if (!existsSync(CORPUS_DIR)) {
  process.stdout.write('audit:exports — apps/web absent; nothing to audit yet.\n');
  process.exit(0);
}
if (!existsSync(DIST)) {
  process.stdout.write(
    'audit:exports — @bymax-one/rust-auth not built/linked; nothing to audit yet.\n',
  );
  process.exit(0);
}

const subpaths = readdirSync(DIST, { withFileTypes: true })
  .filter((e) => e.isDirectory() && existsSync(join(DIST, e.name, 'index.d.ts')))
  .map((e) => e.name)
  .sort();

process.stdout.write(
  `audit:exports — scanning ${subpaths.length} subpaths: ${subpaths.join(', ')}\n`,
);

const corpus = buildCorpus(walkTs(CORPUS_DIR));
const ignore = loadIgnore();

/** @type {Map<string, string[]>} */
const missingBySubpath = new Map();
let totalExports = 0;

for (const subpath of subpaths) {
  const dts = readFileSync(join(DIST, subpath, 'index.d.ts'), 'utf8');
  const symbols = parseExports(dts);
  totalExports += symbols.size;
  process.stdout.write(`audit:exports —   /${subpath}: ${symbols.size} exports\n`);
  for (const symbol of symbols) {
    const key = `${subpath}.${symbol}`;
    if (ignore.has(key)) continue;
    if (!isUsed(corpus, symbol)) {
      const list = missingBySubpath.get(subpath) ?? [];
      list.push(symbol);
      missingBySubpath.set(subpath, list);
    }
  }
}

process.stdout.write(
  `audit:exports — ${totalExports} total exports parsed across ${subpaths.length} subpaths\n`,
);

if (missingBySubpath.size === 0) {
  process.stdout.write('audit:exports — all exports referenced in apps/web.\n');
  process.exit(0);
}

// Some symbols are unreferenced.
const lines = [];
for (const [subpath, symbols] of [...missingBySubpath.entries()].sort()) {
  for (const sym of symbols.sort()) {
    lines.push(`  "${subpath}.${sym}": "reason"`);
  }
}
process.stdout.write(
  `audit:exports — ${lines.length} unreferenced export(s) not in .audit-ignore.json:\n`,
);
for (const [subpath, symbols] of [...missingBySubpath.entries()].sort()) {
  process.stdout.write(`  /${subpath}: ${symbols.sort().join(', ')}\n`);
}
process.stdout.write('\nTo allow-list with a reason, add to .audit-ignore.json:\n');
process.stdout.write('{\n' + lines.join(',\n') + '\n}\n');

if (reportMode) {
  process.stdout.write(
    'audit:exports — report mode: unreferenced exports listed above; exiting 0.\n',
  );
  process.exit(0);
}
process.stderr.write('audit:exports — FAILED: unreferenced exports found (see above)\n');
process.exit(1);
