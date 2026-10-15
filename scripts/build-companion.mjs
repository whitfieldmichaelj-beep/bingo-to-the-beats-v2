import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export async function buildCompanion() {
  const folder = path.join(root, ".bttb-companion");
  const output = path.join(folder, "companion.cjs");
  const stamp = path.join(folder, "build.sha256");

  const files = [
    "native/companion/main.ts",
    "lib/dj/serato.ts",
    "lib/dj/normalize.ts",
    "lib/serato/finder.ts",
    "lib/serato/locations.ts",
    "lib/serato/playlists.ts",
    "lib/serato/playlist-reader.ts",
    "lib/serato/smart-crates.ts",
    "lib/serato/service.ts",
    "lib/serato/parser.ts",
    "scripts/lib/widget-ts-loader.cjs",
    "package-lock.json",
  ];

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(await fs.readFile(path.join(root, file)));
  }
  const fingerprint = hash.digest("hex");

  if (
    (await fs.readFile(stamp, "utf8").catch(() => "")) === fingerprint &&
    (await fs.stat(output).catch(() => null))
  ) {
    return output;
  }

  await fs.mkdir(folder, { recursive: true });

  const { webpack } = require(
    "next/dist/compiled/webpack/webpack"
  );

  await new Promise((resolve, reject) => {
    const compiler = webpack({
      mode: "production",
      target: "node22",
      context: root,
      entry: "./native/companion/main.ts",
      output: {
        path: folder,
        filename: "companion.cjs",
        library: { type: "commonjs2" },
      },
      externalsPresets: { node: true },
      externals: {
        "serato-connect": "commonjs serato-connect",
        "seratolibraryparser": "commonjs seratolibraryparser",
        "music-metadata": "commonjs music-metadata",
      },
      resolve: {
        extensions: [".ts", ".tsx", ".js", ".cjs"],
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            exclude: /node_modules/,
            use: path.join(
              root,
              "scripts/lib/widget-ts-loader.cjs"
            ),
          },
        ],
      },
      performance: { hints: false },
      optimization: { minimize: false },
    });

    compiler.run((error, stats) => {
      compiler.close(() => {
        if (error || stats.hasErrors()) {
          reject(
            error ??
              new Error(
                stats.toString({
                  all: false,
                  errors: true,
                })
              )
          );
          return;
        }
        resolve();
      });
    });
  });

  await fs.writeFile(stamp, fingerprint);
  console.log("READY — BTTB Companion");
  return output;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    fileURLToPath(import.meta.url)
) {
  await buildCompanion();
}
