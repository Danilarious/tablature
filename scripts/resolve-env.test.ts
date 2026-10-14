/**
 * Tests for scripts/resolve-env.cjs
 *
 * Verifies that the launcher resolves MUSIC_NOTEBOOK_DATA_DIR using the same dotenv
 * semantics as Next.js (via @next/env) rather than custom grep/sed parsing.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnv } from '@next/env';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { resolveEnvVar } = require('./resolve-env.cjs') as { resolveEnvVar: (key: string, dir: string) => string | undefined };

const TEST_KEY = 'BXB_TEST_RESOLVE_ENV';

let tmpDir: string;
let savedNodeEnv: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bxb-resolve-env-'));
  delete process.env[TEST_KEY];
  // @next/env uses process.env.NODE_ENV to pick which .env files to load. Set 'development'
  // to match how launch-app.sh uses resolve-env.cjs (next dev context).
  savedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  resetEnv();
});

afterEach(() => {
  delete process.env[TEST_KEY];
  delete process.env.BXB_TEST_BASE;
  process.env.NODE_ENV = savedNodeEnv;
  resetEnv();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeEnvFile(filename: string, content: string) {
  fs.writeFileSync(path.join(tmpDir, filename), content);
}

describe('resolveEnvVar dotenv semantics', () => {
  it('returns undefined when no .env files exist', () => {
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBeUndefined();
  });

  it('resolves a plain value from .env', () => {
    writeEnvFile('.env', `${TEST_KEY}=/plain/path/to/data\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/plain/path/to/data');
  });

  it('strips double quotes from a double-quoted path', () => {
    writeEnvFile('.env', `${TEST_KEY}="/double quoted/path"\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/double quoted/path');
  });

  it('strips single quotes from a single-quoted path (including paths with spaces)', () => {
    writeEnvFile('.env', `${TEST_KEY}='/Volumes/Notebook Data'\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/Volumes/Notebook Data');
  });

  it('ignores comment lines', () => {
    writeEnvFile('.env', `# This is a comment\n${TEST_KEY}=/data/after/comment\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/data/after/comment');
  });

  it('expands variables defined within the same .env file (dotenv-expand behavior)', () => {
    // @next/env uses dotenv-expand: $VAR references in a value expand using variables
    // defined earlier in the same file. This lets users write things like
    //   MUSIC_NOTEBOOK_DATA_DIR=$DATA_ROOT/BxBMusic in their .env files.
    writeEnvFile('.env', `DATA_ROOT=/my/data\n${TEST_KEY}=$DATA_ROOT/notebook\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/my/data/notebook');
  });

  it('.env.development.local takes precedence over .env', () => {
    writeEnvFile('.env', `${TEST_KEY}=/from-env\n`);
    writeEnvFile('.env.development.local', `${TEST_KEY}=/from-dev-local\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/from-dev-local');
  });

  it('.env.local takes precedence over .env but loses to .env.development.local', () => {
    writeEnvFile('.env', `${TEST_KEY}=/from-env\n`);
    writeEnvFile('.env.local', `${TEST_KEY}=/from-local\n`);
    writeEnvFile('.env.development.local', `${TEST_KEY}=/from-dev-local\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/from-dev-local');
  });

  it('.env.development takes precedence over .env but loses to .env.local', () => {
    writeEnvFile('.env', `${TEST_KEY}=/from-env\n`);
    writeEnvFile('.env.development', `${TEST_KEY}=/from-dev\n`);
    writeEnvFile('.env.local', `${TEST_KEY}=/from-local\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBe('/from-local');
  });

  it('returns undefined when the key is absent from all .env files', () => {
    writeEnvFile('.env', `OTHER_VAR=/something\n`);
    expect(resolveEnvVar(TEST_KEY, tmpDir)).toBeUndefined();
  });
});
