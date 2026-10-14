import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function buildRemotePlayer() {
  const folder = path.join(root, '.bttb-remote', 'dist');
  await fs.mkdir(folder, { recursive: true });
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: 'production', context: root, devtool: false,
      entry: './remote/player/client.tsx', output: { path: folder, filename: 'player.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: {
        'next/link$': path.join(root, 'remote/player/navigation.tsx'),
        'next/navigation$': path.join(root, 'remote/player/navigation.tsx'),
        [path.join(root, 'components/game/GameAccessPanel')]: path.join(root, 'remote/player/GameInfo.tsx'),
        '@': root,
      } },
      module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.join(root, 'scripts/lib/widget-ts-loader.cjs') }] },
      plugins: [new webpack.DefinePlugin({ 'process.env.NEXT_PUBLIC_APP_URL': JSON.stringify('') })],
      performance: { hints: false }, optimization: { minimize: false },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = (await Promise.all(['app/styles/cards.css', 'app/styles/player-card.css'].map(file => fs.readFile(path.join(root, file), 'utf8')))).join('\n');
  await fs.writeFile(path.join(folder, 'player.css'), `html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#080d19;color:white;font-family:system-ui,sans-serif}a{color:#a5b4fc}button,input{font:inherit}${css}`);
  await fs.writeFile(path.join(folder, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BTTB Private Practice</title><link rel="stylesheet" href="/player.css"></head><body><div id="player"></div><script src="/player.js" defer></script></body></html>');
  return folder;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildRemotePlayer();
  console.log('PASS remote player screens built locally');
}
