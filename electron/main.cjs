// Casca desktop do Sophyra (Electron). Abre uma biblioteca (pasta) por vez, mantém a lista de bibliotecas, serve o
// próprio app em 127.0.0.1 (sem login, só esta máquina) e, se você pedir, serve a biblioteca na rede com contas.
// A interface é a mesma do navegador; ela descobre o servidor local sozinha e usa a ponte `window.sophyraDesktop`
// (preload.cjs) para trocar de biblioteca, ligar o servidor e gerenciar o perfil.

const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require("electron");
const { mkdir, writeFile } = require("node:fs/promises");
const { dirname, join } = require("node:path");
const { pathToFileURL } = require("node:url");

const root = join(__dirname, "..");
const PREFERRED_PORT = 47821; // porta fixa para o localStorage (que depende da origem) sobreviver entre execuções

let host;
let registry;
let win;
let localUrl;

const load = (file) => import(pathToFileURL(join(root, file)).href);

async function seedLibrary(dir) {
  const { sampleVault } = await load("src/sample.js");
  for (const f of sampleVault().list()) {
    const target = join(dir, f.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, f.content, { flag: "wx" }).catch(() => {});
  }
}

// Primeira execução (ou lista vazia): cria Documentos/Sophyra com as notas de exemplo.
async function ensureLibrary() {
  if (registry.active) return;
  const dir = join(app.getPath("documents"), "Sophyra");
  await mkdir(dir, { recursive: true });
  await seedLibrary(dir);
  const lib = await registry.add(dir, "Sophyra");
  await registry.setActive(lib.id);
}

async function openActive() {
  for (;;) {
    await ensureLibrary();
    const lib = registry.active;
    try {
      await host.open(lib.path, { name: lib.name });
      return lib;
    } catch (err) {
      const { response } = await dialog.showMessageBox({
        type: "warning",
        message: `Não consegui abrir “${lib.name}”`,
        detail: `${err.message}\n\nA pasta pode ter sido movida ou apagada. Tirar da lista e abrir outra biblioteca?`,
        buttons: ["Tirar da lista", "Sair"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 1) return app.quit();
      await registry.remove(lib.id);
    }
  }
}

function mcpCommand() {
  const args = [join(root, "bin", "sophyra-mcp.mjs"), "--pasta", registry.active?.path || ""];
  // Instalado, não há "node" garantido: o próprio executável roda o script no modo Node.
  return app.isPackaged ? { command: process.execPath, args, env: { ELECTRON_RUN_AS_NODE: "1" } } : { command: "node", args };
}

const snapshot = () => ({
  libraries: registry.list(),
  profile: registry.data.profile,
  serve: registry.data.serve,
  server: host.status(),
  mcp: mcpCommand(),
});

// Só a nossa própria página (o servidor local) pode usar a ponte.
function trusted(event) {
  return !!localUrl && event.senderFrame?.url?.startsWith(localUrl);
}

function handle(name, fn) {
  ipcMain.handle(`sophyra:${name}`, async (event, ...args) => {
    if (!trusted(event)) throw new Error("Origem não permitida.");
    return fn(...args);
  });
}

function registerIpc() {
  handle("state", snapshot);
  handle("addLibrary", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: "Escolher pasta da biblioteca", properties: ["openDirectory", "createDirectory"] });
    if (canceled || !filePaths[0]) return null;
    const lib = await registry.add(filePaths[0]);
    await registry.setActive(lib.id);
    await host.open(lib.path, { name: lib.name });
    return lib;
  });
  handle("useLibrary", async (id) => {
    const previous = registry.active?.id;
    const lib = await registry.setActive(id);
    try {
      await host.open(lib.path, { name: lib.name });
    } catch (err) {
      await registry.setActive(previous);
      throw err;
    }
    return lib;
  });
  handle("renameLibrary", async (id, name) => {
    const lib = await registry.rename(id, name);
    if (registry.active?.id === id && host.library) host.library.vault.name = lib.name;
    return lib;
  });
  handle("removeLibrary", async (id) => {
    const wasActive = registry.active?.id === id;
    await registry.remove(id);
    if (wasActive) await openActive();
  });
  handle("revealLibrary", async (id) => {
    const lib = registry.list().find((l) => l.id === id);
    if (lib) await shell.openPath(lib.path);
  });
  handle("setProfile", (patch) => registry.setProfile(patch));
  handle("startServing", async ({ port, host: bind }) => {
    await registry.setServe({ port, host: bind });
    const s = registry.data.serve;
    await host.startNetwork({ host: s.host, port: s.port });
  });
  handle("stopServing", () => host.stop("rede"));
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 720,
    minHeight: 520,
    title: "Sophyra",
    backgroundColor: "#fbfaf7",
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Links para fora do app abrem no navegador do sistema; a janela nunca navega para outro site.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(localUrl)) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  await win.loadURL(`${localUrl}/`);
}

async function start() {
  const { Host } = await load("server/host.js");
  const { Registry } = await load("server/workspaces.js");
  const data = app.getPath("userData");
  registry = await new Registry(join(data, "workspaces.json")).load();
  host = new Host({ staticRoot: root, accountsFile: join(data, "contas.json"), version: app.getVersion() });
  await openActive();
  let info;
  try {
    info = await host.startLocal(PREFERRED_PORT);
  } catch {
    info = await host.startLocal(0);
  }
  localUrl = `http://127.0.0.1:${info.port}`;
  registerIpc();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Sophyra", submenu: [{ role: "reload", label: "Recarregar" }, { role: "toggleDevTools", label: "Ferramentas de desenvolvimento" }, { type: "separator" }, { role: "quit", label: "Sair" }] },
    { label: "Editar", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "Janela", submenu: [{ role: "minimize" }, { role: "togglefullscreen" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
  ]));
  await createWindow();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(start).catch((err) => {
    dialog.showErrorBox("Sophyra não conseguiu iniciar", String(err?.stack || err));
    app.quit();
  });
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length && localUrl) createWindow();
  });
  let closing = false;
  app.on("before-quit", (event) => {
    if (closing || !host) return;
    event.preventDefault();
    closing = true;
    host.close().finally(() => app.quit());
  });
  app.on("window-all-closed", () => app.quit());
}
