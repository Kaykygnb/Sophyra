// Registro de bibliotecas (workspaces) e do perfil local. Guarda só caminhos e preferências; as notas continuam nas
// pastas. Usado pelo aplicativo desktop para trocar de biblioteca e lembrar qual estava aberta.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const DEFAULTS = () => ({
  libraries: [],
  activeId: null,
  profile: { name: "", icon: "user", bio: "" },
  serve: { port: 8787, host: "0.0.0.0" },
});

export class Registry {
  constructor(file) {
    this.file = file;
    this.data = DEFAULTS();
  }

  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, "utf8"));
      const base = DEFAULTS();
      this.data = {
        libraries: (Array.isArray(raw.libraries) ? raw.libraries : []).filter((l) => l && l.id && l.path).map((l) => ({ id: String(l.id), name: String(l.name || basename(l.path)), path: String(l.path), added: l.added || "" })),
        activeId: raw.activeId || null,
        profile: { ...base.profile, ...(raw.profile || {}) },
        serve: { ...base.serve, ...(raw.serve || {}) },
      };
      if (!this.data.libraries.some((l) => l.id === this.data.activeId)) this.data.activeId = this.data.libraries[0]?.id || null;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    return this;
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2));
    await rename(tmp, this.file);
  }

  list() {
    return this.data.libraries.map((l) => ({ ...l, active: l.id === this.data.activeId }));
  }

  get active() {
    return this.data.libraries.find((l) => l.id === this.data.activeId) || null;
  }

  // Cadastra uma pasta como biblioteca. A mesma pasta não entra duas vezes: devolve a que já existe.
  async add(path, name) {
    const full = resolve(String(path));
    const info = await stat(full).catch(() => null);
    if (!info?.isDirectory()) throw new Error(`Pasta não encontrada: ${full}`);
    const same = this.data.libraries.find((l) => resolve(l.path).toLowerCase() === full.toLowerCase());
    if (same) return same;
    const lib = { id: randomBytes(5).toString("hex"), name: String(name || "").trim() || basename(full), path: full, added: new Date().toISOString() };
    this.data.libraries.push(lib);
    if (!this.data.activeId) this.data.activeId = lib.id;
    await this.save();
    return lib;
  }

  async setActive(id) {
    if (!this.data.libraries.some((l) => l.id === id)) throw new Error("Biblioteca não encontrada.");
    this.data.activeId = id;
    await this.save();
    return this.active;
  }

  async rename(id, name) {
    const lib = this.data.libraries.find((l) => l.id === id);
    if (!lib) throw new Error("Biblioteca não encontrada.");
    if (!String(name).trim()) throw new Error("Informe um nome.");
    lib.name = String(name).trim();
    await this.save();
    return lib;
  }

  // Tira da lista. Os arquivos da pasta não são tocados.
  async remove(id) {
    this.data.libraries = this.data.libraries.filter((l) => l.id !== id);
    if (this.data.activeId === id) this.data.activeId = this.data.libraries[0]?.id || null;
    await this.save();
  }

  async setProfile(patch) {
    const p = this.data.profile;
    if (patch.name !== undefined) p.name = String(patch.name).trim().slice(0, 60);
    if (patch.icon !== undefined) p.icon = String(patch.icon).slice(0, 40) || "user";
    if (patch.bio !== undefined) p.bio = String(patch.bio).slice(0, 280);
    await this.save();
    return p;
  }

  async setServe(patch) {
    const s = this.data.serve;
    if (patch.port !== undefined) {
      const port = Number(patch.port);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("A porta precisa estar entre 1024 e 65535.");
      s.port = port;
    }
    if (patch.host !== undefined) s.host = String(patch.host) === "127.0.0.1" ? "127.0.0.1" : "0.0.0.0";
    await this.save();
    return s;
  }
}
