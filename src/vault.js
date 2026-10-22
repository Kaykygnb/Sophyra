// Biblioteca em memória: uma coleção de arquivos identificados por caminho relativo.
// O arquivo é a fonte de verdade; o índice (index.js) é derivado e reconstruível.

import { parseFrontmatter } from "./markdown.js";

export function normalizePath(path) {
  const parts = String(path)
    .replace(/\\/g, "/")
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) throw new Error(`Caminho fora da biblioteca: ${path}`);
  return parts.join("/");
}

export function baseName(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function stripExt(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function extOf(path) {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export class Vault {
  constructor(name = "Sophyra") {
    this.name = name;
    this.files = new Map(); // path -> { path, content, mtime }
    this.listeners = new Map(); // evento -> Set<fn>
    this.aliasCache = null; // apelido (minúsculo) -> caminho; refeito quando algum arquivo muda
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    for (const fn of this.listeners.get(event) || []) fn(payload);
  }

  has(path) {
    return this.files.has(normalizePath(path));
  }

  get(path) {
    return this.files.get(normalizePath(path)) || null;
  }

  read(path) {
    const f = this.get(path);
    if (!f) throw new Error(`Arquivo não existe: ${path}`);
    return f.content;
  }

  create(path, content = "") {
    const p = normalizePath(path);
    if (this.files.has(p)) throw new Error(`Já existe: ${p}`);
    const file = { path: p, content, mtime: Date.now() };
    this.files.set(p, file);
    this.aliasCache = null;
    this.emit("create", file);
    return file;
  }

  write(path, content) {
    const p = normalizePath(path);
    const file = this.files.get(p);
    if (!file) throw new Error(`Arquivo não existe: ${p}`);
    if (file.content === content) return file;
    file.content = content;
    file.mtime = Date.now();
    this.aliasCache = null;
    this.emit("modify", file);
    return file;
  }

  remove(path) {
    const p = normalizePath(path);
    const file = this.files.get(p);
    if (!file) return false;
    this.files.delete(p);
    this.aliasCache = null;
    this.emit("delete", file);
    return true;
  }

  // Renomeia um arquivo. Se `updateLinks` for verdadeiro, reescreve os [[links]] que apontavam para o nome antigo.
  rename(from, to, { updateLinks = true } = {}) {
    const a = normalizePath(from);
    const b = normalizePath(to);
    const file = this.files.get(a);
    if (!file) throw new Error(`Arquivo não existe: ${a}`);
    if (this.files.has(b)) throw new Error(`Já existe: ${b}`);
    this.files.delete(a);
    file.path = b;
    file.mtime = Date.now();
    this.files.set(b, file);
    this.aliasCache = null;
    this.emit("rename", { from: a, to: b, file });

    if (updateLinks && stripExt(baseName(a)) !== stripExt(baseName(b))) {
      const oldName = stripExt(baseName(a));
      const newName = stripExt(baseName(b));
      const pattern = new RegExp(`\\[\\[${escapeRe(oldName)}(#[^\\]|]*)?(\\|[^\\]]*)?\\]\\]`, "g");
      for (const other of this.files.values()) {
        if (other.path === b || extOf(other.path) !== "md") continue;
        const next = other.content.replace(pattern, (_, anchor = "", alias = "") => {
          const label = alias || "";
          return `[[${newName}${anchor}${label}]]`;
        });
        if (next !== other.content) this.write(other.path, next);
      }
    }
    return file;
  }

  // Aplica uma lista de mudanças de caminho ({ from, to, dir }). Antes de mexer em qualquer coisa, confere que nenhum
  // destino já existe e que nenhuma pasta vai para dentro dela mesma; se algo falhar, nada muda.
  applyMoves(moves) {
    const pairs = [];
    const targets = new Set();
    for (const m of moves) {
      const from = normalizePath(m.from);
      const to = normalizePath(m.to);
      if (from === to) continue;
      if (m.dir) {
        if (to === from || to.startsWith(`${from}/`)) throw new Error("Uma pasta não pode ir para dentro dela mesma.");
        const inside = [...this.files.keys()].filter((p) => p.startsWith(`${from}/`));
        if (!inside.length) throw new Error(`Pasta não existe: ${from}`);
        for (const p of inside) pairs.push({ from: p, to: `${to}${p.slice(from.length)}` });
      } else {
        if (!this.files.has(from)) throw new Error(`Arquivo não existe: ${from}`);
        pairs.push({ from, to });
      }
    }
    for (const { to } of pairs) {
      if (targets.has(to) || (this.files.has(to) && !pairs.some((p) => p.from === to))) throw new Error(`Já existe: ${to}`);
      targets.add(to);
    }
    for (const { from, to } of pairs) this.rename(from, to, { updateLinks: false });
    return pairs.length;
  }

  // Renomeia (ou move) uma pasta inteira: todos os arquivos dentro dela, inclusive o .keep, mudam o começo do caminho.
  renameDir(from, to) {
    return this.applyMoves([{ from, to, dir: true }]);
  }

  list() {
    return [...this.files.values()].sort((x, y) => x.path.localeCompare(y.path, "pt-BR"));
  }

  markdownFiles() {
    return this.list().filter((f) => extOf(f.path) === "md");
  }

  // Resolve um destino de link: pelo caminho completo ou pelo nome, sem diferenciar maiúsculas.
  resolveLink(target, fromPath = "") {
    const clean = String(target).split("#")[0].split("|")[0].trim();
    if (!clean) return null;
    const withMd = /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.md`;
    const exact = this.files.get(normalizePath(withMd));
    if (exact) return exact.path;
    const wanted = normalizePath(withMd).toLowerCase();
    const byPath = [...this.files.values()].find((f) => f.path.toLowerCase() === wanted);
    if (byPath) return byPath.path;
    const name = stripExt(baseName(wanted));
    const byName = [...this.files.values()].filter(
      (f) => stripExt(baseName(f.path)).toLowerCase() === name,
    );
    if (byName.length === 0) return this.aliasMap().get(clean.toLowerCase()) || null;
    if (byName.length === 1) return byName[0].path;
    // ambiguidade: prefere o mais próximo da nota de origem
    const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    const near = byName.find((f) => f.path.startsWith(dir ? `${dir}/` : ""));
    return (near || byName.sort((x, y) => x.path.length - y.path.length)[0]).path;
  }

  // Apelidos declarados no frontmatter (`aliases: [A, B]`). Um link para o apelido abre a nota.
  aliasesOf(path) {
    const file = this.files.get(normalizePath(path));
    if (!file || extOf(file.path) !== "md") return [];
    const { data } = parseFrontmatter(file.content);
    const raw = data.aliases ?? data.alias ?? [];
    return (Array.isArray(raw) ? raw : [raw]).map((a) => String(a).trim()).filter(Boolean);
  }

  aliasMap() {
    if (this.aliasCache) return this.aliasCache;
    const map = new Map();
    for (const f of this.markdownFiles()) {
      for (const alias of this.aliasesOf(f.path)) {
        const key = alias.toLowerCase();
        if (!map.has(key)) map.set(key, f.path);
      }
    }
    this.aliasCache = map;
    return map;
  }

  // Árvore de pastas e arquivos, para a barra lateral.
  tree() {
    const root = { name: "", path: "", folders: new Map(), files: [] };
    for (const file of this.list()) {
      const parts = file.path.split("/");
      let node = root;
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        if (!node.folders.has(parts[i])) {
          node.folders.set(parts[i], { name: parts[i], path: acc, folders: new Map(), files: [] });
        }
        node = node.folders.get(parts[i]);
      }
      node.files.push(file);
    }
    return root;
  }

  toJSON() {
    return { name: this.name, files: this.list().map((f) => ({ path: f.path, content: f.content, mtime: f.mtime })) };
  }

  static fromJSON(data) {
    const v = new Vault(data.name || "Sophyra");
    for (const f of data.files || []) {
      v.files.set(normalizePath(f.path), { path: normalizePath(f.path), content: f.content || "", mtime: f.mtime || Date.now() });
    }
    return v;
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
