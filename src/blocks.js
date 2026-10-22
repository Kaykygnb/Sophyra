// Modelo de blocos do editor: uma nota Markdown vira uma árvore de blocos (parágrafo, título, listas, tarefa, citação,
// callout, toggle, código, fórmula, tabela, divisor, imagem) e volta a Markdown sem inventar formato novo. O que o
// modelo não entende fica como bloco "raw" com as linhas originais, para nunca perder conteúdo.
//
// O texto de cada bloco é Markdown em linha (`**negrito**`, `[[nota]]`, `#tag`…): a vista converte de e para HTML.

export const LIST_TYPES = "bullet number todo".split(" ");
export const TEXT_TYPES = ["paragraph", "heading", "bullet", "number", "todo", "quote", "callout", "toggle"];
export const RAW_TYPES = ["code", "math", "table", "raw"];
export const MEDIA_TYPES = ["video", "audio", "file"];
export const BLOCK_TYPES = [...TEXT_TYPES, ...RAW_TYPES, "divider", "image", "toc", "bookmark", "baseembed", "canvasembed", ...MEDIA_TYPES, "button", "columns", "column"];

let counter = 0;
export function newBlockId() {
  counter = (counter + 1) % 1e9;
  return `b${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeBlock(type = "paragraph", props = {}) {
  const b = { id: newBlockId(), type, text: "", children: [], ...props };
  if (type === "heading" && !b.level) b.level = 1;
  if (type === "todo") b.checked = !!b.checked;
  if (type === "toggle") b.open = !!b.open;
  if (type === "callout" && !b.kind) b.kind = "note";
  if (type === "code" && b.lang === undefined) b.lang = "";
  return b;
}

// Só alguns tipos aceitam filhos: itens de lista (que só carregam itens de lista) e toggle (que carrega qualquer bloco).
// Colunas: um bloco `columns` só carrega blocos `column`, e cada `column` carrega qualquer bloco menos outra coluna.
export function canHaveChildren(type) {
  return LIST_TYPES.includes(type) || type === "toggle" || type === "columns" || type === "column";
}

export function canNest(parentType, childType) {
  if (parentType === "columns") return childType === "column";
  if (childType === "column") return parentType === "columns";
  if (parentType === "toggle" || parentType === "column") return childType !== "columns" || parentType === "toggle";
  if (LIST_TYPES.includes(parentType)) return LIST_TYPES.includes(childType);
  return false;
}

// Deixa a árvore válida: coluna sem nada ganha um parágrafo vazio e um conjunto de colunas com menos de duas vira
// os blocos soltos (uma coluna sozinha não é coluna). Mexe na lista recebida.
export function normalizeBlocks(list) {
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    b.children = b.children || [];
    normalizeBlocks(b.children);
    if (b.type === "column" && b.children.length === 0) b.children.push(makeBlock("paragraph"));
    if (b.type === "columns") {
      b.children = b.children.filter((c) => c.type === "column");
      if (b.children.length < 2) {
        const loose = b.children.flatMap((c) => c.children);
        list.splice(i, 1, ...loose);
        i += loose.length - 1;
      }
    }
  }
  return list;
}

export const hasText = (type) => TEXT_TYPES.includes(type);
export const isRawType = (type) => RAW_TYPES.includes(type);

// --- Leitura ----------------------------------------------------------------------------------------------------------

const RE = {
  heading: /^ {0,3}(#{1,6})\s+(.*)$/,
  fence: /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)\s*$/,
  divider: /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/,
  quote: /^ {0,3}>/,
  item: /^(\s*)([-*+]|\d+[.)])(?:\s+(.*))?$/,
  image: /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/,
  mathOne: /^\s*\$\$(.+)\$\$\s*$/,
  mathOpen: /^\s*\$\$\s*$/,
  toc: /^\s*<!--\s*toc\s*-->\s*$/i,
  bookmark: /^\s*<(https?:\/\/[^>\s]+)>\s*$/i,
  baseEmbed: /^\s*!\[\[([^\]|#]+\.base)\]\]\s*$/i,
  canvasEmbed: /^\s*!\[\[([^\]|#]+\.canvas)\]\]\s*$/i,
  columnsOpen: /^\s*<!--\s*columns\s*-->\s*$/i,
  columnsEnd: /^\s*<!--\s*\/columns\s*-->\s*$/i,
  columnMark: /^\s*<!--\s*column\s*-->\s*$/i,
  media: /^\s*<(video|audio)\s+src="([^"]*)"[^>]*>\s*<\/\1>\s*$/i,
  file: /^\s*<a\s+class="file"\s+href="([^"]*)">(.*)<\/a>\s*$/i,
  button: /^\s*<a\s+class="button"\s+href="([^"]*)">(.*)<\/a>\s*$/i,
  details: /^\s*<details(\s+open)?\s*>\s*$/i,
  summary: /^\s*<summary>(.*)<\/summary>\s*$/i,
  detailsEnd: /^\s*<\/details>\s*$/i,
  tableSep: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
};

const indentWidth = (s) => s.replace(/\t/g, "    ").length;
const isBlank = (l) => l.trim() === "";

function isTableStart(lines, i) {
  return lines[i].includes("|") && i + 1 < lines.length && lines[i + 1].includes("-") && RE.tableSep.test(lines[i + 1]) && lines[i + 1].includes("|");
}

// Uma linha que começa um bloco próprio (e portanto encerra o parágrafo que vinha antes).
function startsBlock(lines, i) {
  const l = lines[i];
  return RE.heading.test(l) || RE.fence.test(l) || RE.divider.test(l) || RE.quote.test(l) || RE.item.test(l) || RE.image.test(l)
    || RE.mathOpen.test(l) || RE.mathOne.test(l) || RE.details.test(l) || RE.toc.test(l) || RE.bookmark.test(l) || RE.baseEmbed.test(l) || RE.canvasEmbed.test(l)
    || RE.columnsOpen.test(l) || RE.columnsEnd.test(l) || RE.columnMark.test(l) || RE.media.test(l) || RE.file.test(l) || RE.button.test(l) || isTableStart(lines, i);
}

export function parseBlocks(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  return normalizeBlocks(parseLines(lines));
}

// Aspas dentro de endereços e `<`/`>` dentro de rótulos quebrariam a linha HTML do bloco: saem antes de gravar.
const attr = (s) => String(s ?? "").replace(/"/g, "%22").replace(/[\r\n]+/g, " ");
const label = (s) => String(s ?? "").replace(/[<>\r\n]+/g, " ").trim();

function parseLines(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }
    let m;
    if ((m = RE.fence.exec(line))) {
      const mark = m[1];
      const body = [];
      i++;
      while (i < lines.length && !(lines[i].trim().startsWith(mark[0].repeat(mark.length)) && /^[`~]+\s*$/.test(lines[i].trim()))) body.push(lines[i++]);
      if (i >= lines.length && body.length && body[body.length - 1] === "") body.pop(); // não fechou: a linha vazia final é só o fim do arquivo
      i++; // fecha o bloco (ou passa do fim, se não fechou)
      out.push(makeBlock("code", { lang: m[2], text: body.join("\n") }));
      continue;
    }
    if (RE.mathOpen.test(line)) {
      const body = [];
      i++;
      while (i < lines.length && !RE.mathOpen.test(lines[i])) body.push(lines[i++]);
      i++;
      out.push(makeBlock("math", { text: body.join("\n") }));
      continue;
    }
    if ((m = RE.mathOne.exec(line))) {
      out.push(makeBlock("math", { text: m[1].trim() }));
      i++;
      continue;
    }
    if ((m = RE.details.exec(line))) {
      let depth = 1;
      let j = i + 1;
      const inner = [];
      for (; j < lines.length; j++) {
        if (RE.details.test(lines[j])) depth++;
        else if (RE.detailsEnd.test(lines[j]) && --depth === 0) break;
        inner.push(lines[j]);
      }
      let summary = "";
      if (inner.length && RE.summary.test(inner[0])) summary = RE.summary.exec(inner.shift())[1].trim();
      // `<summary>## Título</summary>` é um título recolhível: o nível fica no bloco e o texto sem as cerquilhas
      const th = /^(#{1,3})\s+(.*)$/.exec(summary);
      out.push(makeBlock("toggle", { text: th ? th[2] : summary, ...(th ? { level: th[1].length } : {}), open: !!m[1], children: parseLines(inner) }));
      i = j + 1;
      continue;
    }
    if (RE.columnsOpen.test(line)) {
      // `<!-- columns -->` … `<!-- column -->` … `<!-- /columns -->`: cada trecho entre marcas é uma coluna
      let depth = 1;
      let j = i + 1;
      const cols = [];
      let cur = null;
      for (; j < lines.length; j++) {
        if (RE.columnsOpen.test(lines[j])) depth++;
        else if (RE.columnsEnd.test(lines[j]) && --depth === 0) break;
        if (depth === 1 && RE.columnMark.test(lines[j])) {
          cur = [];
          cols.push(cur);
          continue;
        }
        if (!cur) {
          if (isBlank(lines[j])) continue;
          cur = [];
          cols.push(cur);
        }
        cur.push(lines[j]);
      }
      out.push(makeBlock("columns", { children: cols.map((c) => makeBlock("column", { children: parseLines(c) })) }));
      i = j + 1;
      continue;
    }
    if ((m = RE.media.exec(line))) {
      out.push(makeBlock(m[1].toLowerCase(), { src: m[2] }));
      i++;
      continue;
    }
    if ((m = RE.file.exec(line))) {
      out.push(makeBlock("file", { src: m[1], text: m[2] }));
      i++;
      continue;
    }
    if ((m = RE.button.exec(line))) {
      out.push(makeBlock("button", { src: m[1], text: m[2] }));
      i++;
      continue;
    }
    if ((m = RE.canvasEmbed.exec(line))) {
      out.push(makeBlock("canvasembed", { src: m[1].trim() }));
      i++;
      continue;
    }
    if ((m = RE.baseEmbed.exec(line))) {
      out.push(makeBlock("baseembed", { src: m[1].trim() }));
      i++;
      continue;
    }
    if (RE.toc.test(line)) {
      out.push(makeBlock("toc"));
      i++;
      continue;
    }
    if ((m = RE.bookmark.exec(line))) {
      out.push(makeBlock("bookmark", { src: m[1] }));
      i++;
      continue;
    }
    if ((m = RE.heading.exec(line))) {
      out.push(makeBlock("heading", { level: m[1].length, text: m[2].trim() }));
      i++;
      continue;
    }
    if (RE.divider.test(line)) {
      out.push(makeBlock("divider"));
      i++;
      continue;
    }
    if ((m = RE.image.exec(line))) {
      out.push(makeBlock("image", { text: m[1], src: m[2] }));
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !isBlank(lines[i])) rows.push(lines[i++]);
      out.push(makeBlock("table", { text: rows.join("\n") }));
      continue;
    }
    if (RE.quote.test(line)) {
      const rows = [];
      while (i < lines.length && RE.quote.test(lines[i])) rows.push(lines[i++].replace(/^ {0,3}> ?/, ""));
      const co = /^\[!(\w+)\][+-]?\s*(.*)$/.exec(rows[0]);
      if (co) out.push(makeBlock("callout", { kind: co[1].toLowerCase(), text: [co[2], ...rows.slice(1)].join("\n") }));
      else out.push(makeBlock("quote", { text: rows.join("\n") }));
      continue;
    }
    if (RE.item.test(line)) {
      i = parseList(lines, i, out);
      continue;
    }
    // parágrafo: linhas seguidas até uma linha em branco ou o começo de outro bloco
    const rows = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) rows.push(lines[i++]);
    out.push(makeBlock("paragraph", { text: rows.join("\n") }));
  }
  return out;
}

// Lê uma lista (com itens aninhados) a partir de `start`, acrescenta em `out` e devolve a próxima linha.
function parseList(lines, start, out) {
  const stack = []; // { indent, block }
  let i = start;
  let last = null;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      // linha em branco dentro da lista só continua se o próximo texto ainda for item
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j < lines.length && RE.item.test(lines[j]) && !RE.divider.test(lines[j])) {
        i = j;
        continue;
      }
      break;
    }
    const m = RE.item.exec(line);
    if (m && !RE.divider.test(line)) {
      const indent = indentWidth(m[1]);
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const marker = m[2];
      let rest = m[3] ?? "";
      let block;
      if (/^\d/.test(marker)) block = makeBlock("number", { text: rest });
      else {
        const t = /^\[([ xX])\]\s*(.*)$/.exec(rest);
        if (t) block = makeBlock("todo", { checked: t[1] !== " ", text: t[2] });
        else block = makeBlock("bullet", { text: rest });
      }
      const parent = stack.length ? stack[stack.length - 1].block : null;
      (parent ? parent.children : out).push(block);
      stack.push({ indent, block });
      last = block;
      i++;
      continue;
    }
    // linha indentada logo depois de um item: continua o texto dele
    if (last && /^\s+\S/.test(line) && !startsBlock(lines, i)) {
      last.text += `\n${line.trim()}`;
      i++;
      continue;
    }
    break;
  }
  return i;
}

// --- Escrita ----------------------------------------------------------------------------------------------------------

const oneLine = (s) => String(s ?? "").replace(/\n+/g, " ").trim();
const isListFamily = (t) => t === "bullet" || t === "todo";

function listMarker(b, n) {
  if (b.type === "number") return `${n}. `;
  if (b.type === "todo") return `- [${b.checked ? "x" : " "}] `;
  return "- ";
}

function blockLines(b, n = 1) {
  const text = String(b.text ?? "");
  switch (b.type) {
    case "heading":
      return [`${"#".repeat(Math.min(6, Math.max(1, b.level || 1)))} ${oneLine(text)}`];
    case "bullet":
    case "number":
    case "todo": {
      const marker = listMarker(b, n);
      const pad = " ".repeat(marker.length);
      const [first, ...more] = text.split("\n");
      const own = [`${marker}${first}`, ...more.map((l) => `${pad}${l}`)];
      const kids = chunkLines(b.children || []).map((l) => (l === "" ? "" : `${pad}${l}`));
      return [...own, ...kids];
    }
    case "quote":
      return text.split("\n").map((l) => (l === "" ? ">" : `> ${l}`));
    case "callout": {
      const [first, ...more] = text.split("\n");
      return [`> [!${b.kind || "note"}] ${first}`.trimEnd(), ...more.map((l) => (l === "" ? ">" : `> ${l}`))];
    }
    case "toggle": {
      const inner = chunkLines(b.children || []);
      const head = b.level >= 1 && b.level <= 3 ? `${"#".repeat(b.level)} ` : "";
      return [`<details${b.open ? " open" : ""}>`, `<summary>${head}${oneLine(text)}</summary>`, ...(inner.length ? ["", ...inner, ""] : []), "</details>"];
    }
    case "code": {
      const fence = /^```/m.test(text) ? "~~~" : "```";
      return [`${fence}${b.lang || ""}`, ...text.split("\n"), fence];
    }
    case "math":
      return ["$$", ...text.split("\n"), "$$"];
    case "table":
    case "raw":
      return text.split("\n");
    case "divider":
      return ["---"];
    case "toc":
      return ["<!-- toc -->"];
    case "baseembed":
    case "canvasembed":
      return [`![[${b.src || ""}]]`];
    case "bookmark":
      return [`<${b.src || ""}>`];
    case "columns":
      return ["<!-- columns -->", ...(b.children || []).flatMap((c) => ["<!-- column -->", "", ...chunkLines(c.children || []), ""]), "<!-- /columns -->"];
    case "column":
      return chunkLines(b.children || []);
    case "video":
    case "audio":
      return [`<${b.type} src="${attr(b.src)}" controls></${b.type}>`];
    case "file":
      return [`<a class="file" href="${attr(b.src)}">${label(b.text) || attr(b.src)}</a>`];
    case "button":
      return [`<a class="button" href="${attr(b.src)}">${label(b.text) || "Botão"}</a>`];
    case "image":
      return [`![${b.text || ""}](${b.src || ""})`];
    default:
      return text === "" ? [] : text.split("\n");
  }
}

// Linhas de uma sequência de irmãos: itens de lista seguidos ficam juntos; o resto é separado por uma linha em branco.
function chunkLines(blocks) {
  const lines = [];
  let prev = null;
  let n = 0;
  for (const b of blocks) {
    n = b.type === "number" ? (prev && prev.type === "number" ? n + 1 : 1) : 0;
    const chunk = blockLines(b, n || 1);
    if (chunk.length === 0) continue;
    const sameList = prev && ((isListFamily(prev.type) && isListFamily(b.type)) || (prev.type === "number" && b.type === "number"));
    if (lines.length && !sameList) lines.push("");
    lines.push(...chunk);
    prev = b;
  }
  return lines;
}

export function serializeBlocks(blocks) {
  const lines = chunkLines(blocks);
  return lines.length ? `${lines.join("\n")}\n` : "";
}

// --- Consultas ---------------------------------------------------------------------------------------------------------

// Percorre a árvore em ordem de leitura (só entra nos filhos de toggles abertos se `visibleOnly`).
export function walk(blocks, fn, { visibleOnly = false, parent = null } = {}) {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    fn(b, parent, i, blocks);
    if (b.children?.length && !(visibleOnly && b.type === "toggle" && !b.open)) walk(b.children, fn, { visibleOnly, parent: b });
  }
}

export function flatten(blocks, opts) {
  const out = [];
  walk(blocks, (b) => out.push(b), opts);
  return out;
}

export function locate(blocks, id, parent = null) {
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === id) return { block: blocks[i], parent, index: i, siblings: blocks };
    const inner = locate(blocks[i].children || [], id, blocks[i]);
    if (inner) return inner;
  }
  return null;
}

export const cloneBlocks = (blocks) => JSON.parse(JSON.stringify(blocks));
