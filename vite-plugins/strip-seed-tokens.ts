// strip-seed-tokens.ts
// Build-time Vite plugin: strip gateway tokens from seed-gateways.ts
// before it lands in the public bundle.
//
// Why: the source file at src/stores/seed-gateways.ts contains real
// operator-scoped tokens for the 9-agent lab fleet. They're needed at
// runtime because storage-manager.ts does not persist tokens to disk
// (by design — see storage-manager.ts:8-12). But the Vite build ships
// the file as a static asset at /assets/seed-gateways-*.js, which is
// a security regression (anyone with curl gets operator tokens).
//
// This plugin rewrites the module on the fly during the dev/build
// pipeline. Source file is unchanged on disk.
//
// Security audit: see /home/greench/shared/knowledge/research/hubclaw-greench-ai-net-deep-analysis-2026-06-02.md (F1)
// Plan:           /home/greench/shared/knowledge/research/hubclaw-bundle-fix-plan-2026-06-02.md (Option A1)
// Author:         Gohan (2026-06-02)

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Plugin } from 'vite';

const SOURCE_REL = 'src/stores/seed-gateways.ts';

/**
 * Read the source file and produce a version with all `token` field
 * string values replaced with empty strings.
 *
 * Match patterns:
 *   token: "abc..."   →   token: ""
 *   token: 'abc...'   →   token: ''
 *   token: `abc...`   →   token: ``  (template literal — less common but possible)
 *
 * We deliberately do NOT match `token: <variable>` (non-string-literal
 * values) — those are dev/test patterns and shouldn't exist in the
 * source file. If they do, the build will fail and we'll see it.
 */
function buildPublicVersion(sourcePath: string): string {
  const src = fs.readFileSync(sourcePath, 'utf8');
  const stripped = src.replace(
    /(\btoken:\s*)(["'`])([^"'`]*)\2/g,
    (_match, prefix, quote, _value) => `${prefix}${quote}${quote}`
  );

  // Sanity check: if the source had any `token:` lines, the stripped
  // version should have the same number but with shorter values. If
  // the count drops, something went wrong.
  const beforeCount = (src.match(/\btoken:\s*["'`]/g) ?? []).length;
  const afterCount = (stripped.match(/\btoken:\s*["'`]/g) ?? []).length;
  if (beforeCount !== afterCount) {
    throw new Error(
      `strip-seed-tokens: token count changed (${beforeCount} → ${afterCount}). ` +
      `The plugin regex is missing some patterns. Inspect the source.`
    );
  }

  return stripped;
}

export function stripSeedTokens(): Plugin {
  let publicVersion: string | null = null;

  function getPublicVersion(root: string): string {
    if (publicVersion !== null) return publicVersion;
    const sourcePath = path.resolve(root, SOURCE_REL);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`strip-seed-tokens: source file not found: ${sourcePath}`);
    }
    publicVersion = buildPublicVersion(sourcePath);
    return publicVersion;
  }

  return {
    name: 'strip-seed-tokens',
    enforce: 'pre',

    // Dev mode: rewrite the module when Vite serves it
    transform(_code, id) {
      if (!id.endsWith(SOURCE_REL)) return null;
      const root = process.cwd();
      const stripped = getPublicVersion(root);
      // eslint-disable-next-line no-console
      console.log(`[strip-seed-tokens] dev: stripped ${SOURCE_REL}`);
      return {
        code: stripped,
        map: null,
      };
    },

    // Build mode: also rewrite for the bundle output
    renderChunk(code, chunk) {
      if (!chunk.fileName.startsWith('seed-gateways')) return null;
      const root = process.cwd();
      const stripped = getPublicVersion(root);
      // eslint-disable-next-line no-console
      console.log(`[strip-seed-tokens] build: stripped ${chunk.fileName}`);
      return {
        code: stripped,
        map: null,
      };
    },

    // Build mode: rewrite the resolved module ID before Vite bundles it
    // (handles the case where Vite hasn't yet created a chunk for it)
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!fileName.endsWith('.js')) continue;
        // The seed file is a separate chunk in Vite's splitChunks config
        // (or gets inlined). Either way, we look for the SEED_GATEWAYS
        // export pattern and rewrite it.
        const file = bundle[fileName];
        if (file.type !== 'asset' && file.type !== 'chunk') continue;
        const code = typeof file.code === 'string' ? file.code : '';
        if (!code.includes('SEED_GATEWAYS')) continue;
        // Check if it still has actual token values
        if (!/token:\s*["'`][\w-]+["'`]/.test(code)) continue;
        // Strip tokens
        const stripped = code.replace(
          /(\btoken:\s*)(["'`])([^"'`]+)\2/g,
          (_m, prefix, quote) => `${prefix}${quote}${quote}`
        );
        // eslint-disable-next-line no-console
        console.log(`[strip-seed-tokens] generateBundle: stripped tokens from ${fileName}`);
        if (file.type === 'chunk') {
          file.code = stripped;
        } else {
          (file as { source: string }).source = stripped;
        }
      }
    },
  };
}
