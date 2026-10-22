// Lógica dos [[wikilinks]] que não depende do DOM: sugestões ao digitar, links para seções,
// menções sem link e a vinculação delas. A interface (app.js) só liga isto aos eventos.

import { baseName, stripExt } from "./vault.js";
import { extractMetadata, parseLinkTarget } from "./markdown.js";

// --- Nome usado no link ------------------------------------------------------------------

// O menor nome que ainda identifica a nota: só o nome, ou o caminho se houver outra nota com o mesmo nome.
export function linkNameFor(vault, path) {
  const name = stripExt(baseName(path));
  const same = vault.markdownFiles().filter((f) => stripExt(baseName(f.path)).toLowerCase() === name.toLowerCase());
  return same.length > 1 ? path.replace(/\.md$/i, "") : name;
}

// --- Contexto de digitação ------------------------------------------------------------------

// Descobre se o cursor está dentro de um `[[` ainda aberto, na mesma linha.
// Devolve { stage: "note" | "heading", start, end, query, note?, hashPos?, hasClose } ou null.
export function findLinkContext(text, caret) {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const before = text.slice(lineStart, caret);
  const open = before.lastIndexOf("[[");
  if (open === -1) return null;
  const inside = before.slice(open + 2);
  if (inside.includes("]") || inside.includes("|")) return null;
  const lineEndRaw = text.indexOf("\n", caret);
  const after = text.slice(caret, lineEndRaw === -1 ? text.length : lineEndRaw);
  const hasClose = after.startsWith("]]");
  const start = lineStart + open + 2;
  const hash = inside.indexOf("#");
  if (hash === -1) return { stage: "note", start, end: caret, query: inside, hasClose };
  return { stage: "heading", start, end: caret, query: inside.slice(hash + 1), note: inside.slice(0, hash), hashPos: start + hash + 1, hasClose };
}

// Texto a trocar e posição do cursor depois de aceitar uma sugestão.
export function applySuggestion(text, ctx, item) {
  const from = ctx.stage === "heading" ? ctx.hashPos : ctx.start;
  const closing = ctx.hasClose ? "" : "]]";
  const insert = item.insert + closing;
  const next = text.slice(0, from) + insert + text.slice(ctx.end);
  const caret = from + item.insert.length + 2; // depois do `]]`, novo ou já existente
  return { from, to: ctx.end, insert, text: next, caret: Math.min(caret, next.length) };
}

// --- Sugestões ---------------------------------------------------------------------------------

function subsequence(text, query) {
  let i = 0;
  for (const ch of text) if (ch === query[i]) i++;
  return i === query.length;
}

function scoreName(name, path, q) {
  const n = name.toLowerCase();
  if (n === q) return 5;
  if (n.startsWith(q)) return 4;
  if (n.split(/[\s\-_/]+/).some((w) => w.startsWith(q))) return 3;
  if (n.includes(q)) return 2;
  if (path.toLowerCase().includes(q)) return 1;
  if (subsequence(n, q)) return 0.5;
  return 0;
}

// Notas e apelidos que combinam com o texto digitado, as mais prováveis primeiro.
export function suggestNotes(vault, query, { limit = 8, exclude = "" } = {}) {
  const q = query.trim().toLowerCase();
  const items = [];
  for (const f of vault.markdownFiles()) {
    if (f.path === exclude) continue;
    const name = stripExt(baseName(f.path));
    const entries = [{ kind: "note", label: name, insert: linkNameFor(vault, f.path), path: f.path }];
    for (const alias of vault.aliasesOf(f.path)) entries.push({ kind: "alias", label: alias, insert: alias, path: f.path, note: name });
    for (const e of entries) {
      const score = q ? scoreName(e.label, f.path, q) : 1;
      if (score > 0) items.push({ ...e, score, mtime: f.mtime });
    }
  }
  items.sort((a, b) => b.score - a.score || b.mtime - a.mtime || a.label.localeCompare(b.label, "pt-BR"));
  return items.slice(0, limit);
}

// Títulos da nota citada (ou da própria nota, se o nome estiver vazio) que combinam com o texto.
export function suggestHeadings(vault, noteName, query, fromPath = "", limit = 10) {
  const path = noteName.trim() ? vault.resolveLink(noteName.trim(), fromPath) : fromPath;
  if (!path || !vault.has(path)) return [];
  const q = query.trim().toLowerCase();
  return extractMetadata(vault.read(path))
    .headings.filter((h) => !q || h.text.toLowerCase().includes(q))
    .slice(0, limit)
    .map((h) => ({ kind: "heading", label: h.text, insert: h.text, level: h.level, path }));
}

// --- Verificação de alvos -----------------------------------------------------------------------

// O alvo existe? Vale para nota, nota#Seção e nota#^bloco.
export function linkTargetExists(vault, rawTarget, fromPath = "") {
  const { name, heading, block } = parseLinkTarget(rawTarget);
  const path = name ? vault.resolveLink(name, fromPath) : fromPath;
  if (!path || !vault.has(path)) return false;
  if (!heading && !block) return true;
  const content = vault.read(path);
  if (block) return new RegExp(`\\^${escapeRe(block)}\\s*$`, "m").test(content);
  const wanted = heading.trim().toLowerCase();
  return extractMetadata(content).headings.some((h) => h.text.trim().toLowerCase() === wanted);
}

// --- Menções sem link ---------------------------------------------------------------------------

// Troca por espaços tudo o que não conta como texto corrido, mantendo as quebras de linha e as posições.
export function maskIgnored(text) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, blank)
    .replace(/(```|~~~)[\s\S]*?(\1|$)/g, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(/!?\[\[[^\]\n]*\]\]/g, blank)
    .replace(/\[[^\]\n]*\]\([^)\n]*\)/g, blank);
}

function mentionRegex(titles) {
  const alt = titles.map(escapeRe).sort((a, b) => b.length - a.length).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt})(?![\\p{L}\\p{N}_])`, "giu");
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Títulos que contam como menção: o nome da nota e seus apelidos (com pelo menos 3 letras).
export function mentionTitles(vault, path) {
  return [stripExt(baseName(path)), ...vault.aliasesOf(path)].filter((t) => t.length >= 3);
}

// Todas as ocorrências de `titles` em `content` fora de código, de links e do frontmatter.
export function findMentions(content, titles) {
  if (!titles.length) return [];
  const masked = maskIgnored(content);
  const re = mentionRegex(titles);
  const out = [];
  for (const m of masked.matchAll(re)) {
    out.push({ index: m.index, length: m[0].length, text: content.slice(m.index, m.index + m[0].length) });
  }
  return out;
}

// Notas que citam o título de `path` sem ter um link para ele.
export function findUnlinkedMentions(vault, path) {
  const titles = mentionTitles(vault, path);
  if (!titles.length) return [];
  const result = [];
  for (const f of vault.markdownFiles()) {
    if (f.path === path) continue;
    const found = findMentions(f.content, titles);
    if (!found.length) continue;
    const first = found[0];
    const lineStart = f.content.lastIndexOf("\n", first.index - 1) + 1;
    const lineEndRaw = f.content.indexOf("\n", first.index);
    const line = f.content.slice(lineStart, lineEndRaw === -1 ? f.content.length : lineEndRaw).trim();
    result.push({ source: f.path, count: found.length, snippet: line.length > 140 ? `${line.slice(0, 140)}…` : line });
  }
  return result.sort((a, b) => b.count - a.count || a.source.localeCompare(b.source, "pt-BR"));
}

// Transforma a primeira menção em link. Se o texto original for diferente do alvo, mantém-no como apelido.
export function linkFirstMention(content, titles, target) {
  const found = findMentions(content, titles);
  if (!found.length) return { content, changed: false };
  const m = found[0];
  const link = m.text === target ? `[[${target}]]` : `[[${target}|${m.text}]]`;
  return { content: content.slice(0, m.index) + link + content.slice(m.index + m.length), changed: true };
}

