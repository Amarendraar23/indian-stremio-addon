import { chownSync, chmodSync, existsSync, lstatSync, mkdirSync } from 'node:fs';

// Railway mounts volumes as root. Prepare only the fixed data directory, then
// permanently drop privileges before importing the application or opening a port.
if (process.getuid?.() === 0) {
  const directory = '/app/data';
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) throw new Error('Invalid data directory.');
  chownSync(directory, 1000, 1000);
  chmodSync(directory, 0o700);
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${directory}/activity.sqlite${suffix}`;
    if (!existsSync(file)) continue;
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error('Invalid data file.');
    chownSync(file, 1000, 1000);
    chmodSync(file, 0o600);
  }
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
}
console.log(`Server runtime UID: ${process.getuid?.() ?? 'unavailable'}`);
const { startServer } = await import('./server.js');
startServer();
