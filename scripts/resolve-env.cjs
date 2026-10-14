'use strict';
/**
 * Resolves a single environment variable using the same dotenv file loading semantics as
 * Next.js (via @next/env), so the launcher and `next dev`/`next start` always agree.
 *
 * Usage: node scripts/resolve-env.cjs <VAR_NAME> [<dir>]
 *   <VAR_NAME>  — the environment variable to look up
 *   <dir>       — directory to search for .env files (default: cwd)
 *
 * Prints the resolved value to stdout and exits 0. Exits 0 with no output if the
 * variable is not set in any .env file. Exits 1 if no variable name is provided.
 *
 * File precedence (development mode, matching `next dev`):
 *   .env.development.local  >  .env.local  >  .env.development  >  .env
 * Shell environment variables always take precedence over .env files in both this script
 * and in Next.js; the caller should only invoke this when the shell env is not already set.
 */
const { loadEnvConfig, resetEnv } = require('@next/env');

/**
 * Returns the value of `key` as loaded from .env files in `dir` (development precedence),
 * or undefined if the key is absent from all .env files.
 *
 * Exported for unit testing. Production callers use the CLI entry point below.
 * @param {string} key
 * @param {string} dir
 * @returns {string | undefined}
 */
function resolveEnvVar(key, dir) {
  resetEnv(); // clear module-level cache so each call re-reads files from disk
  const { combinedEnv } = loadEnvConfig(dir, /* dev= */ true, { info: () => {}, error: () => {} }, /* forceReload= */ true);
  return combinedEnv[key];
}

module.exports = { resolveEnvVar };

if (require.main === module) {
  const key = process.argv[2];
  const dir = process.argv[3] ?? process.cwd();
  if (!key) {
    process.stderr.write('Usage: node scripts/resolve-env.cjs <VAR_NAME> [<dir>]\n');
    process.exit(1);
  }
  const val = resolveEnvVar(key, dir);
  if (val !== undefined) process.stdout.write(val);
}
