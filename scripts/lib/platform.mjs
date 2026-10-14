import path from 'node:path';
import os from 'node:os';

export function platformPaths(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === 'darwin') {
    const support = path.posix.join(home, 'Library', 'Application Support');
    return { beta: path.posix.join(support, 'BTTB Beta'), database: path.posix.join(support, 'prisma-dev-nodejs', 'default') };
  }
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local');
    return { beta: path.win32.join(local, 'BTTB Beta'), database: path.win32.join(local, 'prisma-dev-nodejs', 'Data', 'default') };
  }
  throw new Error('BTTB desktop startup supports Windows PCs and Macs.');
}

export function browserCommand(url, platform = process.platform, env = process.env) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== 'localhost') throw new Error('Only the local BTTB address can be opened by startup.');
  if (platform === 'darwin') return ['/usr/bin/open', [url]];
  if (platform === 'win32') return [path.win32.join(env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url]];
  throw new Error('Unsupported desktop platform.');
}
