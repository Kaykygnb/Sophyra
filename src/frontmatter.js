// Edição do frontmatter (o bloco --- no começo da nota) sem desmontar o resto do texto. Cada função recebe o texto
// da nota e devolve o texto novo; nada aqui lança. Equivalem a markdown:add-alias, add-metadata-property e
// clear-metadata-properties do original.

const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function split(source) {
  const m = BLOCK.exec(source);
  if (!m) return { has: false, lines: [], rest: source, nl: "\n" };
  const nl = source.includes("\r\n") ? "\r\n" : "\n";
  return { has: true, lines: m[1].split(/\r?\n/), rest: source.slice(m[0].length), nl };
}

function join({ lines, rest, nl }) {
  return `---${nl}${lines.join(nl)}${nl}---${nl}${rest}`;
}

// Números e true/false ficam sem aspas (o valor digitado vale como número ou booleano); o resto só ganha aspas se o YAML pedir.
const needsQuotes = (v) => /^[\s>*&!|%@`#\[-]|[:#]\s|\s$|^$/.test(v); // `[` começa lista em YAML: um link [[Nota]] precisa de aspas
const fmt = (v) => (needsQuotes(String(v)) ? JSON.stringify(String(v)) : String(v));

// Acrescenta um apelido em `aliases`, criando a lista quando falta. Não repete.
export function addAlias(source, alias) {
  const a = String(alias).trim();
  if (!a) return source;
  const fm = split(source);
  if (!fm.has) return `---\naliases:\n  - ${fmt(a)}\n---\n${source}`;
  const i = fm.lines.findIndex((l) => /^aliases?\s*:/i.test(l));
  if (i === -1) return join({ ...fm, lines: [...fm.lines, "aliases:", `  - ${fmt(a)}`] });
  const head = fm.lines[i];
  const inline = /^aliases?\s*:\s*\[(.*)\]\s*$/i.exec(head);
  if (inline) {
    const items = inline[1].split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    if (items.includes(a)) return source;
    fm.lines[i] = `${head.split(":")[0]}: [${[...items, a].map(fmt).join(", ")}]`;
    return join(fm);
  }
  const scalar = /^aliases?\s*:\s*(\S.*)$/i.exec(head);
  if (scalar) {
    const existing = scalar[1].replace(/^["']|["']$/g, "");
    if (existing === a) return source;
    fm.lines.splice(i, 1, `${head.split(":")[0]}:`, `  - ${fmt(existing)}`, `  - ${fmt(a)}`);
    return join(fm);
  }
  // lista em bloco: acha o fim dos itens
  let end = i + 1;
  const present = [];
  while (end < fm.lines.length && /^\s*-\s+/.test(fm.lines[end])) {
    present.push(fm.lines[end].replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
    end++;
  }
  if (present.includes(a)) return source;
  fm.lines.splice(end, 0, `  - ${fmt(a)}`);
  return join(fm);
}

// Acrescenta (ou troca) uma propriedade simples `chave: valor`.
export function addProperty(source, key, value = "") {
  const k = cleanKey(key);
  if (!k) return source;
  return putLine(source, k, `${k}: ${value === "" ? "" : fmt(value)}`.trimEnd());
}

const cleanKey = (key) => String(key).trim().replace(/[:\n]/g, "");

// Define uma propriedade com qualquer valor simples: texto, número, booleano ou lista (`[a, b]`). Valor vazio remove a chave.
export function setProperty(source, key, value) {
  const k = cleanKey(key);
  if (!k) return source;
  if (value === "" || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return removeProperty(source, k);
  if (Array.isArray(value)) return putLine(source, k, `${k}: [${value.map((v) => fmt(v)).join(", ")}]`);
  return putLine(source, k, `${k}: ${fmt(value)}`);
}

// Troca o nome de uma propriedade, mantendo o valor e a posição. Não faz nada se o nome novo já existe.
export function renameProperty(source, from, to) {
  const a = cleanKey(from);
  const b = cleanKey(to);
  const fm = split(source);
  if (!a || !b || a === b || !fm.has) return source;
  const re = (k) => new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`);
  const i = fm.lines.findIndex((l) => re(a).test(l));
  if (i === -1 || fm.lines.some((l) => re(b).test(l))) return source;
  fm.lines[i] = fm.lines[i].replace(re(a), `${b}:`);
  return join(fm);
}

// Tira uma propriedade (e os itens de lista que ela tinha). Se o bloco ficar vazio, ele some.
export function removeProperty(source, key) {
  const k = cleanKey(key);
  const fm = split(source);
  if (!k || !fm.has) return source;
  const i = fm.lines.findIndex((l) => new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(l));
  if (i === -1) return source;
  let end = i + 1;
  while (end < fm.lines.length && /^\s+-\s+|^\s+\S/.test(fm.lines[end])) end++;
  fm.lines.splice(i, end - i);
  return fm.lines.every((l) => l.trim() === "") ? fm.rest : join(fm);
}

function putLine(source, k, line) {
  const fm = split(source);
  if (!fm.has) return `---\n${line}\n---\n${source}`;
  const i = fm.lines.findIndex((l) => new RegExp(`^${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(l));
  if (i === -1) {
    fm.lines.push(line);
    return join(fm);
  }
  // troca o valor, tirando itens de lista em bloco que pertenciam à chave antiga
  let end = i + 1;
  while (end < fm.lines.length && /^\s+-\s+|^\s+\S/.test(fm.lines[end])) end++;
  fm.lines.splice(i, end - i, line);
  return join(fm);
}

// Tira o bloco de propriedades inteiro.
export function clearProperties(source) {
  const m = BLOCK.exec(source);
  return m ? source.slice(m[0].length) : source;
}

// Lista as chaves do frontmatter, na ordem em que aparecem.
export function propertyKeys(source) {
  return split(source).lines.map((l) => /^([A-Za-z0-9_\- ]+):/.exec(l)?.[1]?.trim()).filter(Boolean);
}
