// Arquivos externos: a biblioteca só abre o que está dentro dele. Endereços de disco (C:\..., file:///..., /home/...)
// são recusados de forma controlada (resposta nula, sem erro), como o original faz com getExternalFile.
// Para trazer um arquivo de fora, a pessoa o importa: ele vira uma cópia dentro da biblioteca.

import { normalizePath, baseName, extOf, stripExt } from "./vault.js";

export const IMPORTABLE = { md: "md", markdown: "md", txt: "md", canvas: "canvas" };
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// Endereço que aponta para fora da biblioteca: URL file://, letra de unidade, caminho de rede ou caminho absoluto.
export function isExternalReference(ref) {
  const r = String(ref ?? "").trim();
  return /^file:/i.test(r) || /^[a-z]:[\\/]/i.test(r) || /^\\\\/.test(r) || /^\//.test(r) || /(^|[\\/])\.\.([\\/]|$)/.test(r);
}

// Devolve o arquivo da biblioteca, ou null se o endereço for externo ou não existir. Nunca lança.
export function getExternalFile(vault, ref) {
  if (isExternalReference(ref)) return null;
  try {
    return vault.get(ref);
  } catch {
    return null;
  }
}

export function canOpenExternalFiles() {
  return false;
}

function cleanName(name) {
  return stripExt(baseName(String(name).replace(/\\/g, "/")))
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/^\.+/, "")
    .trim();
}

// Decide se um arquivo de fora pode ser importado e com que nome. `file` = { name, size, text }.
export function planImport(vault, file, { dir = "" } = {}) {
  const ext = String(extOf(file.name) || "").toLowerCase();
  const target = IMPORTABLE[ext];
  if (!target) return { ok: false, reason: `Tipo “.${ext || "?"}” não é importado (aceita .md, .txt e .canvas).` };
  if (typeof file.text !== "string") return { ok: false, reason: "Não foi possível ler o arquivo como texto." };
  if ((file.size ?? file.text.length) > MAX_IMPORT_BYTES) return { ok: false, reason: "O arquivo passa de 2 MB." };
  if (file.text.includes("\u0000")) return { ok: false, reason: "O arquivo parece binário." };
  const base = cleanName(file.name) || "Importado";
  const prefix = dir ? `${normalizePath(dir)}/` : "";
  let path = `${prefix}${base}.${target}`;
  let n = 2;
  while (vault.has(path)) path = `${prefix}${base} ${n++}.${target}`;
  return { ok: true, path, content: file.text };
}

export function importFiles(vault, files, options) {
  const done = [];
  const failed = [];
  for (const f of files) {
    const plan = planImport(vault, f, options);
    if (!plan.ok) {
      failed.push({ name: f.name, reason: plan.reason });
      continue;
    }
    vault.create(plan.path, plan.content);
    done.push(plan.path);
  }
  return { done, failed };
}
