import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const cloudflaredVersion = '2026.9.3';
const releases = {
  'darwin-x64': ['cloudflared-darwin-amd64.tgz', 'd1155d0837487f261183b15c1eab6c4ebcad9dc49b94675f1524c3564cea3977'],
  'darwin-arm64': ['cloudflared-darwin-arm64.tgz', '587c2cfb1c230fe36c7fa7727da78be459dae028cabe8c001291999350f07095'],
  'win32-x64': ['cloudflared-windows-amd64.exe', 'f096265ec2fcbe9bb6e2d64268db167ced3fcbb83d894bdb9e2fcdb26f2ea7e2'],
};
export function tunnelExecutable() {
  if (!releases[`${process.platform}-${process.arch}`]) throw new Error('Remote rehearsal setup supports Intel/Apple Silicon Macs and Windows x64 PCs.');
  return path.join(root, '.bttb-remote', 'bin', cloudflaredVersion, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
}
export async function installTunnel() {
  const executable = tunnelExecutable();
  const [name, hash] = releases[`${process.platform}-${process.arch}`];
  await fs.mkdir(path.dirname(executable), { recursive: true, mode: 0o700 });
  const response = await fetch(`https://github.com/cloudflare/cloudflared/releases/download/${cloudflaredVersion}/${name}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Unable to download the official Cloudflare connector.');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('The Cloudflare download did not match its published checksum. Nothing was run.');
  if (name.endsWith('.exe')) await fs.writeFile(executable, bytes, { mode: 0o700 });
  else {
    const archive = path.join(path.dirname(executable), name);
    await fs.writeFile(archive, bytes, { mode: 0o600 });
    execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', path.dirname(executable), 'cloudflared']);
    await fs.chmod(executable, 0o700);
    await fs.unlink(archive);
  }
  const version = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (!version.includes(cloudflaredVersion)) throw new Error('Unexpected connector version.');
  console.log(`PASS official Cloudflare connector ${cloudflaredVersion} installed locally; no tunnel started`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await installTunnel();
