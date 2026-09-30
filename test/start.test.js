import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

test('container entrypoint starts a writable store and serves as a non-root user', {
  skip: process.getuid?.() === 0 && process.env.CONTAINER_TEST !== '1', timeout: 15000,
}, async () => {
  const root = process.getuid?.() === 0;
  const directory = root ? '/app/data' : mkdtempSync(join(tmpdir(), 'addon-start-'));
  const database = join(directory, 'activity.sqlite');
  const child = spawn(process.execPath, ['src/start.js'], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '17843', CONFIG_SECRET: '', TMDB_READ_ACCESS_TOKEN: '', KO_FI_URL: '',
      ANALYTICS_DB_PATH: database, ANALYTICS_ADMIN_PASSWORD: randomBytes(32).toString('hex') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  child.stderr.on('data', data => { errors += data; });
  try {
    await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Entrypoint exited ${code}: ${errors}`)));
      child.stdout.on('data', data => { output += data; if (output.includes('is listening')) resolve(); });
    });
    assert.match(output, new RegExp(`Server runtime UID: ${root ? 1000 : process.getuid?.() ?? 'unavailable'}`));
    assert.equal((await fetch('http://127.0.0.1:17843/health')).status, 200);
    assert.equal((await fetch('http://127.0.0.1:17843/admin/analytics.json')).status, 401);
    assert.equal(statSync(database).mode & 0o777, 0o600);
    if (root) assert.equal(statSync(database).uid, 1000);
  } finally {
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    if (!root) rmSync(directory, { recursive: true, force: true });
  }
});
