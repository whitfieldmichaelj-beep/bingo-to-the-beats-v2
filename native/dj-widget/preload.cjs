/* eslint-disable @typescript-eslint/no-require-imports -- Sandboxed Electron preload must use CommonJS. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bttbWidget', {
  receive(callback) { ipcRenderer.on('snapshot', (_event, snapshot) => callback(snapshot)); ipcRenderer.send('widget', { type: 'ready' }); },
  send(type, value) { if (['size', 'mode', 'console', 'close'].includes(type)) ipcRenderer.send('widget', { type, value }); },
});
