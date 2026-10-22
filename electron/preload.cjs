// Ponte entre a página e o processo principal. Expõe só as ações abaixo, cada uma validada no main.

const { contextBridge, ipcRenderer } = require("electron");

const call = (name) => (...args) => ipcRenderer.invoke(`sophyra:${name}`, ...args);

contextBridge.exposeInMainWorld("sophyraDesktop", {
  state: call("state"),
  addLibrary: call("addLibrary"),
  useLibrary: call("useLibrary"),
  renameLibrary: call("renameLibrary"),
  removeLibrary: call("removeLibrary"),
  revealLibrary: call("revealLibrary"),
  setProfile: call("setProfile"),
  startServing: call("startServing"),
  stopServing: call("stopServing"),
});
