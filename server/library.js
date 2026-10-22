// Biblioteca em uma pasta do disco, no Node. Usa o mesmo Vault e o mesmo índice do app, então o servidor, o MCP e a
// interface enxergam exatamente as mesmas regras (links, apelidos, tags, tarefas).
// O arquivo é a fonte de verdade: mudanças no Vault são gravadas na pasta e mudanças feitas por fora entram no Vault.

import { watch } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import { Vault, extOf, normalizePath } from "../src/vault.js";
import { MetadataIndex } from "../src/index.js";

export const TEXT_EXTENSIONS = new Set(["md", "txt", "canvas", "base", "json", "css"]);

export class Library {
  constructor(root, { name } = {}) {
    this.root = resolve(root);
    this.vault = new Vault(name || basename(this.root));
    this.index = new MetadataIndex(this.vault);
    this.queue = Promise.resolve();
    this.applying = false; // verdadeiro enquanto uma mudança vinda do disco entra no Vault (não regrava)
    this.errors = [];
    this.watcher = null;
    this.timers = new Map();
    this.unsubs = [];
  }

  get name() {
    return this.vault.name;
  }

  // Caminho absoluto dentro da pasta; recusa qualquer coisa que escape dela.
  abs(path) {
    const rel = normalizePath(path);
    const full = resolve(this.root, rel);
    if (full !== this.root && !full.startsWith(this.root + sep)) throw new Error(`Caminho fora da biblioteca: ${path}`);
    return full;
  }

  async load() {
    this.vault.files.clear();
    await this.#walk(this.root, "");
    this.vault.aliasCache = null;
    this.index.cache.clear();
    return this.vault.files.size;
  }

  async #walk(dir, prefix) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if (err.code === "ENOENT" && !prefix) throw new Error(`Pasta não encontrada: ${this.root}`);
      throw err;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await this.#walk(resolve(dir, entry.name), rel);
      } else if (entry.isFile() && TEXT_EXTENSIONS.has(extOf(entry.name))) {
        const full = resolve(dir, entry.name);
        const [content, info] = await Promise.all([readFile(full, "utf8"), stat(full)]);
        this.vault.files.set(rel, { path: rel, content, mtime: info.mtimeMs });
      }
    }
  }

  // Passa a gravar na pasta cada mudança feita no Vault.
  start() {
    if (this.unsubs.length) return;
    const v = this.vault;
    this.unsubs = [
      v.on("create", (f) => this.#enqueue(() => this.#writeFile(f.path, f.content))),
      v.on("modify", (f) => this.#enqueue(() => this.#writeFile(f.path, f.content))),
      v.on("delete", (f) => this.#enqueue(() => this.#removeFile(f.path))),
      v.on("rename", ({ from, to, file }) =>
        this.#enqueue(async () => {
          await this.#writeFile(to, file.content);
          await this.#removeFile(from);
        })),
    ];
  }

  stop() {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.unwatch();
  }

  #enqueue(task) {
    if (this.applying) return this.queue;
    this.queue = this.queue.then(task).catch((err) => this.errors.push(err.message));
    return this.queue;
  }

  flush() {
    return this.queue;
  }

  async #writeFile(path, content) {
    const full = this.abs(path);
    await mkdir(dirname(full), { recursive: true });
    if (basename(full) === ".keep") return;
    await writeFile(full, content, "utf8");
  }

  async #removeFile(path) {
    try {
      await rm(this.abs(path), { force: true });
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  // Acompanha mudanças feitas por outros programas. Cada evento é adiado um instante e relido, e só vira mudança
  // no Vault se o conteúdo for diferente, o que também evita laço com a nossa própria gravação.
  watch(onChange = () => {}) {
    if (this.watcher) return;
    try {
      this.watcher = watch(this.root, { recursive: true }, (_event, file) => {
        if (!file) return;
        const rel = file.replace(/\\/g, "/");
        if (rel.split("/").some((p) => p.startsWith("."))) return;
        clearTimeout(this.timers.get(rel));
        this.timers.set(rel, setTimeout(() => {
          this.timers.delete(rel);
          this.syncFromDisk(rel).then((changed) => changed && onChange(rel)).catch((err) => this.errors.push(err.message));
        }, 120));
      });
      this.watcher.on("error", (err) => this.errors.push(err.message));
    } catch (err) {
      this.errors.push(`Sem observação de pasta: ${err.message}`);
    }
  }

  unwatch() {
    this.watcher?.close();
    this.watcher = null;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  // Relê um caminho do disco e ajusta o Vault. Devolve se algo mudou.
  async syncFromDisk(rel) {
    if (!TEXT_EXTENSIONS.has(extOf(rel))) return false;
    await this.flush();
    let content = null;
    try {
      const info = await stat(this.abs(rel));
      if (info.isFile()) content = await readFile(this.abs(rel), "utf8");
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const current = this.vault.get(rel);
    this.applying = true;
    try {
      if (content === null) return current ? this.vault.remove(rel) : false;
      if (!current) {
        this.vault.create(rel, content);
        return true;
      }
      if (current.content === content) return false;
      this.vault.write(rel, content);
      return true;
    } finally {
      this.applying = false;
    }
  }

  // --- Operações usadas pela API e pelo MCP ---------------------------------

  // Cria a nota, ou troca o conteúdo se ela já existe.
  put(path, content) {
    const p = normalizePath(path);
    if (!TEXT_EXTENSIONS.has(extOf(p))) throw new Error(`Tipo de arquivo não aceito: ${p}`);
    return this.vault.has(p) ? this.vault.write(p, content) : this.vault.create(p, content);
  }

  summary() {
    const files = this.vault.list();
    return { name: this.name, files: files.length, notes: files.filter((f) => extOf(f.path) === "md").length };
  }
}
