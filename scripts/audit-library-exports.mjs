#!/usr/bin/env node
/**
 * @fileoverview Export-usage audit for the browser package `@bymax-one/rust-auth`.
 *
 * Parses the four subpaths' `dist/**\/*.d.ts` (`/client`, `/react`, `/nextjs`,
 * `/shared`), extracts every exported symbol, and word-boundary-searches the
 * `apps/web` corpus. It fails when a public export is neither referenced nor
 * allow-listed (with a reason) in `.audit-ignore.json`.
 *
 * It exits 0 when `apps/web` is absent (nothing to audit yet) or when the linked
 * package has not been built (`dist/` missing), so the gate becomes real only
 * once the console and the `file:` link are wired.
 *
 * @layer tooling
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WEB_DIR = join(ROOT, 'apps/web');
const DIST = join(ROOT, 'node_modules/@bymax-one/rust-auth/dist');
const IGNORE_FILE = join(ROOT, '.audit-ignore.json');
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', 'out', 'build']);

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
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/**
 * Extract exported symbol names from a `.d.ts` file. Re-exports from another
 * package are skipped (they are audited from their originating subpath).
 * @param {string} dts Declaration-file content.
 * @returns {Set<string>} Exported symbol names.
 */
function parseExports(dts) {
  const symbols = new Set();
  const braceRe = /^export\s+(?:type\s+)?\{([^}]+)\}([^;\n]*)?;/gm;
  let m;
  while ((m = braceRe.exec(dts)) !== null) {
    if (/from\s+['"]/.test((m[2] ?? '').trim())) continue;
    for (const part of m[1].split(',')) {
      const clean = part.trim().replace(/^type\s+/, '');
      if (!clean) continue;
      const asMatch = /\bas\s+(\w+)/.exec(clean);
      const name = asMatch ? asMatch[1] : /^(\w+)/.exec(clean)?.[1];
      if (name && name !== 'default') symbols.add(name);
    }
  }
  const namedRe =
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|enum|type|namespace)\s+(\w+)/gm;
  while ((m = namedRe.exec(dts)) !== null) symbols.add(m[1]);
  return symbols;
}

/**
 * Load the allow-listed `subpath.symbol` keys from `.audit-ignore.json`.
 * @returns {Set<string>} Allow-listed keys.
 */
function loadIgnore() {
  try {
    /** @type {{ exports?: { symbol: string }[] }} */
    const parsed = JSON.parse(readFileSync(IGNORE_FILE, 'utf8'));
    return new Set((parsed.exports ?? []).map((e) => e.symbol));
  } catch {
    return new Set();
  }
}

if (!existsSync(WEB_DIR)) {
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

const corpus = walkTs(WEB_DIR)
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n\0\n');
const ignore = loadIgnore();

/** @type {string[]} */
const missing = [];
for (const subpath of subpaths) {
  const dts = readFileSync(join(DIST, subpath, 'index.d.ts'), 'utf8');
  for (const symbol of parseExports(dts)) {
    const key = `${subpath}.${symbol}`;
    if (ignore.has(key)) continue;
    if (!new RegExp(`\\b${symbol}\\b`).test(corpus)) missing.push(key);
  }
}

if (missing.length === 0) {
  process.stdout.write('audit:exports — all exports referenced in apps/web.\n');
  process.exit(0);
}
process.stderr.write(
  'audit:exports — unreferenced exports (add to .audit-ignore.json with a reason):\n',
);
for (const key of missing.sort()) process.stderr.write(`  ${key}\n`);
process.exit(1);
