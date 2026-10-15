/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bttb", {
  onStatus(callback) {
    ipcRenderer.on("companion-status", (_event, value) => callback(String(value || "")));
  },
  openSite() {
    ipcRenderer.send("companion-open-site");
  },
  quit() {
    ipcRenderer.send("companion-quit");
  },
});
