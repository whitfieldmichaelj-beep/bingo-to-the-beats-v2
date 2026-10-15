import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCompanion } from "./build-companion.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const electronVersion =
  require("electron/package.json").version;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: "inherit",
      shell: options.shell ?? false,
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code}`
        )
      );
    });
  });
}

async function exists(file) {
  return Boolean(
    await fs.stat(file).catch(() => null)
  );
}

async function runNpm(
  args,
  options = {}
) {
  if (process.platform === "win32") {
    return run(
      process.env.ComSpec || "cmd.exe",
      [
        "/d",
        "/s",
        "/c",
        `npm ${args.join(" ")}`,
      ],
      options
    );
  }

  return run("npm", args, options);
}

async function ensureElectronRuntime() {
  const electronRoot = path.join(
    root,
    "node_modules",
    "electron"
  );

  const executable =
    process.platform === "darwin"
      ? path.join(
          electronRoot,
          "dist",
          "Electron.app",
          "Contents",
          "MacOS",
          "Electron"
        )
      : path.join(
          electronRoot,
          "dist",
          "electron.exe"
        );

  if (await exists(executable)) {
    return;
  }

  const installer = path.join(
    electronRoot,
    "install.js"
  );

  if (!(await exists(installer))) {
    throw new Error(
      "Electron install script was not found."
    );
  }

  console.log(
    "Electron runtime is missing; downloading the native runtime for this build machine..."
  );

  await run(
    process.execPath,
    [installer],
    {
      cwd: electronRoot,
    }
  );

  if (!(await exists(executable))) {
    throw new Error(
      "Electron runtime download completed without producing the expected executable."
    );
  }
}

async function prepareRuntime(runtimeDir) {
  await fs.rm(runtimeDir, {
    recursive: true,
    force: true,
  });
  await fs.mkdir(runtimeDir, {
    recursive: true,
  });

  await fs.writeFile(
    path.join(runtimeDir, "package.json"),
    JSON.stringify(
      {
        name: "bttb-companion-runtime",
        private: true,
        version: "0.1.0",
        dependencies: {
          "music-metadata": "11.14.0",
          "serato-connect": "1.4.5",
          seratolibraryparser: "1.3.3",
        },
      },
      null,
      2
    )
  );

  await runNpm(
    [
      "install",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: runtimeDir }
  );

  await runNpm(
    [
      "rebuild",
      "better-sqlite3-multiple-ciphers",
    ],
    {
      cwd: runtimeDir,
      env: {
        npm_config_runtime: "electron",
        npm_config_target: electronVersion,
        npm_config_disturl:
          "https://electronjs.org/headers",
        npm_config_arch: process.arch,
      },
    }
  );
}

async function copyRuntimeAppFiles({
  appResources,
  runtimeDir,
}) {
  const appDir = path.join(
    appResources,
    "app"
  );

  await fs.rm(appDir, {
    recursive: true,
    force: true,
  });
  await fs.mkdir(appDir, {
    recursive: true,
  });

  await fs.copyFile(
    path.join(
      root,
      ".bttb-companion",
      "companion.cjs"
    ),
    path.join(appDir, "companion.cjs")
  );

  await fs.copyFile(
    path.join(
      root,
      "native",
      "companion",
      "electron-main.cjs"
    ),
    path.join(appDir, "main.cjs")
  );

  await fs.copyFile(
    path.join(
      root,
      "native",
      "companion",
      "electron-preload.cjs"
    ),
    path.join(appDir, "preload.cjs")
  );

  await fs.cp(
    path.join(runtimeDir, "node_modules"),
    path.join(appDir, "node_modules"),
    {
      recursive: true,
      force: true,
    }
  );

  // npm's .bin links can resolve back to the build machine when copied
  // with Node's fs.cp(). The Companion never executes those helpers, so
  // remove them to keep every portable build self-contained.
  await fs.rm(
    path.join(
      appDir,
      "node_modules",
      ".bin"
    ),
    {
      recursive: true,
      force: true,
    }
  );

  await fs.writeFile(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "bttb-companion",
        version: "1.0.0",
        private: true,
        main: "main.cjs",
      },
      null,
      2
    )
  );
}

async function packageMac({
  releasesDir,
  runtimeDir,
}) {
  const electronApp = path.join(
    root,
    "node_modules",
    "electron",
    "dist",
    "Electron.app"
  );

  if (!(await exists(electronApp))) {
    throw new Error(
      "Electron.app was not found. Run npm install first."
    );
  }

  const workDir = path.join(
    root,
    ".bttb-companion",
    `package-darwin-${process.arch}`
  );

  await fs.rm(workDir, {
    recursive: true,
    force: true,
  });
  await fs.mkdir(workDir, {
    recursive: true,
  });

  const appPath = path.join(
    workDir,
    "BTTB Companion.app"
  );

  await run("ditto", [
    electronApp,
    appPath,
  ]);

  await copyRuntimeAppFiles({
    appResources: path.join(
      appPath,
      "Contents",
      "Resources"
    ),
    runtimeDir,
  });

  const oldExecutable = path.join(
    appPath,
    "Contents",
    "MacOS",
    "Electron"
  );
  const newExecutable = path.join(
    appPath,
    "Contents",
    "MacOS",
    "BTTB Companion"
  );

  await fs.rename(
    oldExecutable,
    newExecutable
  );

  const plist = path.join(
    appPath,
    "Contents",
    "Info.plist"
  );

  const plistBuddy =
    "/usr/libexec/PlistBuddy";

  const plistCommands = [
    [
      "Set :CFBundleExecutable BTTB Companion",
    ],
    [
      "Set :CFBundleIdentifier com.bingotothebeats.companion",
    ],
    [
      "Set :CFBundleName BTTB Companion",
    ],
    [
      "Set :CFBundleShortVersionString 1.0.0",
    ],
    [
      "Set :CFBundleVersion 1",
    ],
  ];

  for (const [command] of plistCommands) {
    await run(plistBuddy, [
      "-c",
      command,
      plist,
    ]);
  }

  try {
    await run(plistBuddy, [
      "-c",
      "Set :CFBundleDisplayName BTTB Companion",
      plist,
    ]);
  } catch {
    await run(plistBuddy, [
      "-c",
      "Add :CFBundleDisplayName string BTTB Companion",
      plist,
    ]);
  }

  await run("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    appPath,
  ]);

  await run("codesign", [
    "--verify",
    "--deep",
    "--strict",
    appPath,
  ]);

  const label =
    process.arch === "arm64"
      ? "Apple-Silicon"
      : "Intel";

  const zip = path.join(
    releasesDir,
    `BTTB-Companion-macOS-${label}-Beta.zip`
  );

  await fs.rm(zip, {
    force: true,
  });

  await run("ditto", [
    "-c",
    "-k",
    "--sequesterRsrc",
    "--keepParent",
    appPath,
    zip,
  ]);

  return zip;
}

async function packageWindows({
  releasesDir,
  runtimeDir,
}) {
  if (process.arch !== "x64") {
    throw new Error(
      `Windows Companion packaging currently supports x64, not ${process.arch}.`
    );
  }

  const electronDist = path.join(
    root,
    "node_modules",
    "electron",
    "dist"
  );

  const electronExe = path.join(
    electronDist,
    "electron.exe"
  );

  if (!(await exists(electronExe))) {
    throw new Error(
      "electron.exe was not found. Run npm install first."
    );
  }

  const workDir = path.join(
    root,
    ".bttb-companion",
    "package-win32-x64",
    "BTTB Companion"
  );

  await fs.rm(
    path.dirname(workDir),
    {
      recursive: true,
      force: true,
    }
  );

  await fs.cp(
    electronDist,
    workDir,
    {
      recursive: true,
      force: true,
    }
  );

  const oldExe = path.join(
    workDir,
    "electron.exe"
  );
  const newExe = path.join(
    workDir,
    "BTTB Companion.exe"
  );

  await fs.rename(oldExe, newExe);

  await copyRuntimeAppFiles({
    appResources: path.join(
      workDir,
      "resources"
    ),
    runtimeDir,
  });

  const zip = path.join(
    releasesDir,
    "BTTB-Companion-Windows-x64-Beta.zip"
  );

  await fs.rm(zip, {
    force: true,
  });

  const sourcePattern =
    path.join(workDir, "*");

  await run(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${sourcePattern.replace(/'/g, "''")}' -DestinationPath '${zip.replace(/'/g, "''")}' -Force`,
    ]
  );

  return zip;
}

async function main() {
  if (
    !["darwin", "win32"].includes(
      process.platform
    )
  ) {
    throw new Error(
      `BTTB Companion packaging is currently supported on macOS and Windows, not ${process.platform}.`
    );
  }

  await buildCompanion();
  await ensureElectronRuntime();

  const releasesDir = path.join(
    root,
    ".bttb-companion",
    "releases"
  );
  const runtimeDir = path.join(
    root,
    ".bttb-companion",
    `runtime-${process.platform}-${process.arch}`
  );

  await fs.mkdir(releasesDir, {
    recursive: true,
  });

  await prepareRuntime(runtimeDir);

  const artifact =
    process.platform === "darwin"
      ? await packageMac({
          releasesDir,
          runtimeDir,
        })
      : await packageWindows({
          releasesDir,
          runtimeDir,
        });

  const stat = await fs.stat(artifact);

  console.log(
    `READY — ${path.basename(artifact)} (${Math.round(
      stat.size / 1024 / 1024
    )} MB)`
  );
}

await main();
