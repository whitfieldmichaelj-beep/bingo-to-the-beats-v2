/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PUBLIC_URL = "https://bttb-web-production.up.railway.app";
let win = null;
let companion = null;
let quitting = false;

function html() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BTTB Companion</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at top,#312e81 0%,#111827 48%,#030712 100%);color:#fff}
  main{min-height:100vh;padding:28px}.card{max-width:620px;margin:0 auto;background:rgba(15,23,42,.92);border:1px solid rgba(255,255,255,.16);border-radius:20px;padding:26px;box-shadow:0 24px 70px rgba(0,0,0,.35)}
  .brand{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#a78bfa;font-weight:800}h1{margin:8px 0 10px;font-size:28px}p{color:#cbd5e1;line-height:1.55}
  .status{margin:22px 0;padding:18px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12)}.label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#94a3b8;font-weight:800}
  #status{margin-top:7px;font-size:17px;font-weight:700;white-space:pre-wrap;overflow-wrap:anywhere}.note{font-size:13px;color:#94a3b8}
  button{width:100%;padding:13px 16px;border:0;border-radius:11px;font-weight:800;cursor:pointer;background:#ede9fe;color:#312e81}button.secondary{margin-top:10px;background:#1e293b;color:#e2e8f0;border:1px solid #475569}
  </style></head><body><main><section class="card"><div class="brand">Bingo to the Beats</div><h1>BTTB Companion</h1>
  <p>This app connects Serato on this DJ computer to the hosted Bingo to the Beats site. It shares crate names and song counts only. When you create a game, only the selected crate's song metadata is transferred temporarily. Audio files and local file paths are never uploaded.</p>
  <div class="status"><div class="label">Connection status</div><div id="status">Starting BTTB Companion…</div></div>
  <p class="note">Keep this app open while using Serato with Bingo to the Beats. Logging out of BTTB disconnects the account pairing.</p>
  <button id="open">Open Bingo to the Beats</button><button class="secondary" id="quit">Quit Companion</button></section></main>
  <script>document.getElementById("open").addEventListener("click",()=>window.bttb.openSite());document.getElementById("quit").addEventListener("click",()=>window.bttb.quit());window.bttb.onStatus(value=>{document.getElementById("status").textContent=value});</script>
  </body></html>`;
}

function updateStatus(text) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("companion-status", text);
}

function startCompanion() {
  const script = path.join(process.resourcesPath, "app", "companion.cjs");
  companion = spawn(
    process.execPath,
    [script, "--url", PUBLIC_URL],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        BTTB_COMPANION_URL: PUBLIC_URL,
      },
      cwd: path.join(process.resourcesPath, "app"),
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const processLine = raw => {
    const line = String(raw || "").trim();
    if (!line) return;
    if (line.includes("pairing code:")) {
      updateStatus("Pairing started. Follow the BTTB browser window.");
      return;
    }
    if (/^[A-Z2-9]{6}$/.test(line)) {
      updateStatus(`Pairing code: ${line}\nFollow the browser steps to log out and sign back in once.`);
      return;
    }
    if (line.includes("paired successfully")) {
      updateStatus("Paired successfully. Reading your Serato library…");
      return;
    }
    if (line.includes("Companion connected")) {
      updateStatus("Connected. Reading your Serato crates…");
      return;
    }
    if (line.startsWith("Synced ")) {
      updateStatus(line.replace("Synced ", "Connected — synced "));
      return;
    }
    if (line.includes("BTTB Companion sync warning:")) {
      updateStatus("Connected, but Serato library sync failed. Verify your Serato library is accessible on this Mac.");
      return;
    }
    if (line.startsWith("Now playing:")) {
      updateStatus(`Connected — ${line}`);
      return;
    }
    if (line.includes("disconnected")) {
      updateStatus("Disconnected. Your Serato library is no longer shared with the signed-out BTTB account.");
      return;
    }
    if (line.startsWith("BTTB Companion stopped:")) {
      updateStatus(line);
    }
  };

  companion.stdout.on("data", chunk => String(chunk).split(/\r?\n/).forEach(processLine));
  companion.stderr.on("data", chunk => String(chunk).split(/\r?\n/).forEach(processLine));

  companion.on("error", error => {
    updateStatus(`Companion could not start: ${error.message}`);
  });

  companion.on("exit", code => {
    companion = null;
    if (!quitting) {
      updateStatus(
        code === 0
          ? "Disconnected. Quit and reopen BTTB Companion when you want to connect again."
          : `Companion stopped with code ${code}. Quit and reopen it to retry.`
      );
    }
  });
}

function stopCompanion() {
  if (companion && !companion.killed) companion.kill("SIGTERM");
}

app.setName("BTTB Companion");
ipcMain.on("companion-open-site", () => void shell.openExternal(PUBLIC_URL + "/serato"));
ipcMain.on("companion-quit", () => app.quit());
app.on("before-quit", () => { quitting = true; stopCompanion(); });
app.on("window-all-closed", () => app.quit());

app.whenReady().then(async () => {
  win = new BrowserWindow({
    width: 660,
    height: 600,
    minWidth: 560,
    minHeight: 520,
    title: "BTTB Companion",
    backgroundColor: "#030712",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
    },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(PUBLIC_URL + "/")) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html()));
  startCompanion();
}).catch(error => {
  console.error(error);
  app.quit();
});
