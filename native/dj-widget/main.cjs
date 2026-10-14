/* eslint-disable @typescript-eslint/no-require-imports -- Electron main/preload use CommonJS. */
const { app, BrowserWindow, ipcMain, screen, powerSaveBlocker } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const session = process.argv[2];
const runtime = path.join(root, '.bttb-widget');
// The parent selects a private session directory, never a URL or script to run.
if (!session || path.dirname(path.resolve(session)) !== path.join(runtime, 'sessions') || !/^[a-f0-9-]{36}$/.test(path.basename(session))) process.exit(1);
app.setName('BTTB DJ Widget');
app.setPath('userData', path.join(runtime, 'desktop-profile'));
app.setPath('crashDumps', path.join(runtime, 'crash-dumps'));
app.commandLine.appendSwitch('disable-background-networking');
let win, timer, lastText = '', closed = false, ready = false, blocker;
const read = name => { try { return JSON.parse(fs.readFileSync(path.join(session, name), 'utf8')); } catch { return null; } };
function write(name, data) {
  const target = path.join(session, name), tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, target);
}
function command(type, value) { write('command.json', { id: randomUUID(), type, value }); }
function fail(message) {
  try { write('error.json', { message }); } catch { /* Closing must still work if the session folder is unavailable. */ }
  app.quit();
}
function finish() {
  if (closed) return;
  closed = true; clearInterval(timer);
  try { write('widget.json', { closed: true, updatedAt: Date.now() }); } catch { /* Parent may already have removed an expired session. */ }
  if (blocker !== undefined && powerSaveBlocker.isStarted(blocker)) powerSaveBlocker.stop(blocker);
}
function update() {
  try {
    const snapshot = read('snapshot.json');
    if (snapshot?.closed) { app.quit(); return; }
    if (snapshot && ready) {
      const text = JSON.stringify(snapshot);
      if (text !== lastText) { win.webContents.send('snapshot', snapshot); lastText = text; }
    }
    write('widget.json', { closed: false, ready, updatedAt: Date.now(), pid: process.pid, alwaysOnTop: win.isAlwaysOnTop(), bounds: win.getBounds() });
  } catch {
    fail('The widget connection stopped. Reopen the widget from BTTB.');
  }
}
app.on('before-quit', finish);
app.on('window-all-closed', () => app.quit());
app.whenReady().then(async () => {
  app.dock?.hide();
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const width = Math.min(1180, area.width - 24);
  win = new BrowserWindow({ x: Math.round(area.x + (area.width - width) / 2), y: area.y + 6,
    width, height: 180, frame: false, alwaysOnTop: true, skipTaskbar: true,
    show: false, resizable: false, maximizable: false, minimizable: false,
    fullscreenable: false, backgroundColor: '#19102e', title: 'BTTB DJ Widget',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true, backgroundThrottling: false, devTools: false },
  });
  win.setMenu(null);
  win.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.on('render-process-gone', () => fail('The widget display stopped. Reopen the widget from BTTB.'));
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  // The display loads only its packaged assets, with no account cookies or network.
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  ipcMain.on('widget', (event, message) => {
    if (event.sender !== win.webContents || !message || typeof message !== 'object') return;
    if (message.type === 'ready') { ready = true; update(); }
    if (message.type === 'size' && Number.isFinite(message.value)) {
      const bounds = win.getBounds(), display = screen.getDisplayMatching(bounds).workArea;
      const height = Math.min(display.height, Math.max(95, Math.ceil(message.value) + 12));
      win.setBounds({ ...bounds, height, y: Math.max(display.y, Math.min(bounds.y, display.y + display.height - height)) });
    }
    if (message.type === 'mode' && ['compact', 'standard'].includes(message.value)) command('mode', message.value);
    if (message.type === 'console') {
      command('console');
      // Stay visible until the existing console acknowledges the return by
      // closing this session. A stalled browser must not make the controls vanish.
    }
    if (message.type === 'close') { command('close'); app.quit(); }
  });
  win.on('closed', () => { finish(); app.quit(); });
  await win.loadURL(pathToFileURL(path.join(runtime, 'dist/index.html')).href);
  win.showInactive();
  blocker = powerSaveBlocker.start('prevent-app-suspension');
  timer = setInterval(update, 500);
  update();
}).catch(error => fail(error.message));
