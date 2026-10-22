// Ligação com uma pasta real do disco pela File System Access API.
// - Lê os arquivos de texto da pasta para a biblioteca (ignora pastas ocultas e arquivos binários).
// - Depois da ligação, cada mudança na biblioteca é escrita no disco.
// - O identificador da pasta fica guardado no IndexedDB; ao reabrir, pede permissão de novo.

import { Vault, normalizePath, extOf } from "./vault.js";

const DB_NAME = "sophyra-disco";
const STORE = "handles";
const TEXT_EXTENSIONS = new Set(["md", "txt", "canvas", "base", "json", "css"]);

export function isSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// Mesma interface de pasta usada pelo OPFS (navigator.storage.getDirectory), útil para testes.

// --- Persistência do identificador (IndexedDB) -----------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbRun(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const diskHandles = {
  save: (handle) => dbRun("readwrite", (s) => s.put(handle, "pasta")),
  load: () => dbRun("readonly", (s) => s.get("pasta")).catch(() => null),
  clear: () => dbRun("readwrite", (s) => s.delete("pasta")).catch(() => {}),
};

// --- Permissão ----------------------------------------------------------------

export async function hasPermission(handle, write = true) {
  const opts = { mode: write ? "readwrite" : "read" };
  if ((await handle.queryPermission?.(opts)) === "granted") return true;
  return false;
}

export async function ensurePermission(handle, write = true) {
  if (await hasPermission(handle, write)) return true;
  const opts = { mode: write ? "readwrite" : "read" };
  return (await handle.requestPermission?.(opts)) === "granted";
}

export async function pickFolder() {
  return window.showDirectoryPicker({ mode: "readwrite", id: "biblioteca" });
}

// --- Leitura ----------------------------------------------------------------

// Lê a pasta inteira para um novo Vault. Devolve também a contagem de arquivos ignorados.
export async function readFolder(handle, name = handle.name) {
  const vault = new Vault(name);
  const skipped = { binary: 0 };
  await walk(handle, "", vault, skipped);
  return { vault, skipped };
}

async function walk(dir, prefix, vault, skipped) {
  for await (const [entryName, entry] of dir.entries()) {
    if (entryName.startsWith(".")) continue;
    const path = prefix ? `${prefix}/${entryName}` : entryName;
    if (entry.kind === "directory") {
      await walk(entry, path, vault, skipped);
      continue;
    }
    const ext = extOf(entryName);
    if (!TEXT_EXTENSIONS.has(ext)) {
      skipped.binary++;
      continue;
    }
    const file = await entry.getFile();
    const text = await file.text();
    vault.files.set(normalizePath(path), { path: normalizePath(path), content: text, mtime: file.lastModified });
  }
}

// --- Sincronização da biblioteca para o disco ------------------------------------

export class DiskSync {
  constructor(vault, handle, { onError = () => {} } = {}) {
    this.vault = vault;
    this.handle = handle;
    this.onError = onError;
    this.queue = Promise.resolve();
    this.unsubs = [
      vault.on("create", (f) => this.enqueue(() => this.writeFile(f.path, f.content))),
      vault.on("modify", (f) => this.enqueue(() => this.writeFile(f.path, f.content))),
      vault.on("delete", (f) => this.enqueue(() => this.removeFile(f.path))),
      vault.on("rename", ({ from, to, file }) =>
        this.enqueue(async () => {
          await this.writeFile(to, file.content);
          await this.removeFile(from);
        })),
    ];
  }

  stop() {
    for (const off of this.unsubs) off?.();
    this.unsubs = [];
  }

  enqueue(task) {
    this.queue = this.queue.then(task).catch((err) => this.onError(err));
    return this.queue;
  }

  // Caminhos do tipo "pasta/.keep" só criam a pasta, sem gravar o arquivo.
  async writeFile(path, content) {
    const parts = path.split("/");
    const name = parts.pop();
    let dir = this.handle;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
    if (name === ".keep") return;
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }

  async removeFile(path) {
    const parts = path.split("/");
    const name = parts.pop();
    let dir = this.handle;
    try {
      for (const part of parts) dir = await dir.getDirectoryHandle(part);
      await dir.removeEntry(name);
    } catch (err) {
      if (err?.name !== "NotFoundError") throw err;
    }
  }

  // Espera as gravações pendentes terminarem.
  flush() {
    return this.queue;
  }
}

