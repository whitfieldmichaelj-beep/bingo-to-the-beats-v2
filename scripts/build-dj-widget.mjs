import { createRequire } from 'node:module';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function buildDjWidget() {
  const folder = path.join(root, '.bttb-widget');
  const resources = path.join(folder, 'dist');
  const files = ['native/dj-widget/client.tsx', 'components/dj-console/DjMiniView.tsx', 'components/dj-console/dj-mini-view.css', 'scripts/lib/widget-ts-loader.cjs', 'scripts/build-dj-widget.mjs', 'package-lock.json'];
  const hash = createHash('sha256');
  for (const file of files) hash.update(await fs.readFile(path.join(root, file)));
  const fingerprint = hash.digest('hex');
  const stamp = path.join(folder, 'build.sha256');
  if (await fs.readFile(stamp, 'utf8').catch(() => '') === fingerprint && await fs.stat(path.join(resources, 'widget.js')).catch(() => null)) return resources;
  await fs.mkdir(resources, { recursive: true });
  const { webpack } = require('next/dist/compiled/webpack/webpack');
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: 'production', context: root, devtool: false,
      entry: './native/dj-widget/client.tsx', output: { path: resources, filename: 'widget.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'] },
      module: { rules: [{ test: /\.(tsx?|css)$/, exclude: /node_modules/, use: path.join(root, 'scripts/lib/widget-ts-loader.cjs') }] },
      performance: { hints: false }, optimization: { minimize: false },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error ?? new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = await fs.readFile(path.join(root, 'components/dj-console/dj-mini-view.css'), 'utf8');
  await fs.writeFile(path.join(resources, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'"><style>${css}
html,body{margin:0;padding:0;background:#19102e;color:#fff;overflow:hidden}#widget{position:relative}.widget-drag{height:12px;app-region:drag;background:#211332;display:flex;justify-content:center;align-items:center}.widget-drag:after{content:'';height:3px;width:44px;background:#9273b6;border-radius:3px}.dj-mini{box-shadow:none;border:0}.dj-mini-row{padding-right:32px}.dj-mini--compact .dj-mini-row{padding-right:32px}.widget-close{position:absolute;right:6px;top:5px;width:22px;height:22px;color:#ddc8f3;border:0;background:transparent;font:19px system-ui;cursor:pointer}.widget-close:focus-visible{outline:2px solid #d6baff}.dj-mini-now-playing strong{font-size:18px}.dj-mini-counts{font-size:12px}
</style></head><body><div class="widget-drag" title="Drag to move widget"></div><div id="widget"></div><script src="widget.js"></script></body></html>`);
  await fs.writeFile(stamp, fingerprint);
  console.log('READY — borderless BTTB DJ Widget');
  return resources;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await buildDjWidget();
