// Bases: visões de banco de dados sobre as propriedades (frontmatter) das notas. Uma base é um arquivo `.base` com JSON:
// de onde vêm as notas (pasta e/ou tag), o tipo de cada propriedade e várias visões (tabela, lista, quadro, calendário),
// cada uma com seus filtros, ordem, agrupamento e colunas. As notas continuam sendo a fonte dos dados: editar uma célula
// grava no frontmatter da nota. Nada aqui toca no DOM.

import { extractMetadata } from "./markdown.js";
import { baseName, stripExt } from "./vault.js";
import { addProperty, setProperty } from "./frontmatter.js";

export const VIEW_TYPES = ["table", "list", "board", "calendar", "gallery", "timeline"];
export const VIEW_NAMES = { table: "Tabela", list: "Lista", board: "Quadro", calendar: "Calendário", gallery: "Galeria", timeline: "Cronograma" };
export const PROP_TYPES = ["text", "number", "checkbox", "date", "select", "list", "pessoa", "relacao", "formula"];
export const PROP_TYPE_NAMES = { text: "Texto", number: "Número", checkbox: "Caixa de marcar", date: "Data", select: "Seleção", list: "Lista", pessoa: "Pessoa", relacao: "Relação (links internos)", formula: "Fórmula" };
export const OPS = {
  is: "é", isnot: "não é", contains: "contém", notcontains: "não contém", empty: "está vazio", notempty: "não está vazio",
  gt: "maior que", lt: "menor que", gte: "maior ou igual a", lte: "menor ou igual a",
};
export const NO_VALUE_OPS = ["empty", "notempty"];

// Propriedades que não vêm do frontmatter.
export const KEY_LABELS = { "file.name": "Nome", "file.folder": "Pasta", "file.path": "Caminho", "file.mtime": "Modificada em", "file.backlinks": "Ligações de entrada", tags: "Etiquetas" };
export const keyLabel = (key) => KEY_LABELS[key] || key;
const READ_ONLY = new Set(["file.name", "file.folder", "file.path", "file.mtime", "file.backlinks"]);
export const isEditable = (key) => !READ_ONLY.has(key);

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// --- Definição da base ---------------------------------------------------------------------------------------------------

let idCounter = 0;
const newViewId = () => `v${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function makeView(type = "table", name) {
  return { id: newViewId(), name: name || VIEW_NAMES[type], type, columns: [], filters: [], sort: [], groupBy: "", dateKey: "", endKey: "", totals: {} };
}

export function defaultBase({ folder = "", tag = "" } = {}) {
  return { source: { folder, tag }, props: {}, views: [makeView("table")] };
}

const str = (v) => (typeof v === "string" ? v : "");

// Totais do rodapé: { chave: "soma" | "media" | "contagem" }. Chaves e tipos inválidos são descartados.
export const TOTAL_KINDS = "soma media contagem".split(" ");
const cleanTotals = (t) => {
  if (!t || typeof t !== "object" || Array.isArray(t)) return {};
  return Object.fromEntries(Object.entries(t).filter(([k, v]) => typeof k === "string" && k && TOTAL_KINDS.includes(v)));
};

// Valor de cada total, para as linhas mostradas. Soma e média só valem para número; contagem vale para qualquer tipo.
export function totalsOf(rows, totals = {}, types = {}) {
  const out = {};
  for (const [key, kind] of Object.entries(totals)) {
    const nums = rows.map((r) => valueOf(r, key)).filter((v) => !isEmpty(v)).map((v) => coerce("number", v)).filter((n) => n !== "");
    if (kind === "contagem") out[key] = { kind, value: rows.filter((r) => !isEmpty(valueOf(r, key))).length };
    else if (!["number", "formula"].includes(types[key]) && nums.length === 0) out[key] = { kind, value: null };
    else if (kind === "soma") out[key] = { kind, value: nums.reduce((a, b) => a + b, 0) };
    else out[key] = { kind, value: nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null };
  }
  return out;
}

function cleanView(v, taken) {
  const type = VIEW_TYPES.includes(v?.type) ? v.type : "table";
  let id = typeof v?.id === "string" && v.id && !taken.has(v.id) ? v.id : newViewId();
  while (taken.has(id)) id = newViewId();
  taken.add(id);
  return {
    id,
    name: str(v?.name).trim() || VIEW_NAMES[type],
    type,
    columns: Array.isArray(v?.columns) ? v.columns.filter((c) => typeof c === "string" && c) : [],
    filters: (Array.isArray(v?.filters) ? v.filters : [])
      .filter((f) => f && typeof f.key === "string" && f.key && Object.hasOwn(OPS, f.op))
      .map((f) => ({ key: f.key, op: f.op, value: "string number boolean".split(" ").includes(typeof f.value) ? f.value : "" })),
    sort: (Array.isArray(v?.sort) ? v.sort : []).filter((s) => s && typeof s.key === "string" && s.key).map((s) => ({ key: s.key, dir: s.dir === "desc" ? "desc" : "asc" })),
    groupBy: str(v?.groupBy),
    dateKey: str(v?.dateKey),
    endKey: str(v?.endKey),
    totals: cleanTotals(v?.totals),
  };
}

// Lê o texto de um .base. Nunca lança: JSON inválido devolve uma base padrão e `error`, e o arquivo só muda se a pessoa editar.
export function parseBase(text) {
  const raw = String(text ?? "").trim();
  if (raw === "") return { base: defaultBase(), error: null };
  let j;
  try {
    j = JSON.parse(raw);
  } catch (err) {
    return { base: defaultBase(), error: `JSON inválido: ${err.message}` };
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { base: defaultBase(), error: "O arquivo não é um objeto." };
  const taken = new Set();
  const views = (Array.isArray(j.views) ? j.views : []).filter((v) => v && typeof v === "object").map((v) => cleanView(v, taken));
  const props = {};
  for (const [k, p] of Object.entries(j.props && typeof j.props === "object" ? j.props : {})) {
    if (!p || typeof p !== "object") continue;
    const entry = {};
    if (PROP_TYPES.includes(p.type)) entry.type = p.type;
    if (typeof p.expr === "string") entry.expr = p.expr.slice(0, 300);
    if (Array.isArray(p.options)) entry.options = p.options.map(String).filter(Boolean);
    props[k] = entry;
  }
  return {
    base: {
      source: { folder: str(j.source?.folder).replace(/^\/+|\/+$/g, ""), tag: str(j.source?.tag).replace(/^#/, "") },
      props,
      views: views.length ? views : [makeView("table")],
    },
    error: null,
  };
}

// Modelos de base de dados para uso real. Cada modelo é uma base de partida: propriedades com tipo e opções, e visões
// prontas. A pessoa escolhe um modelo ao criar a base e depois ajusta à vontade.
const opts = (s) => s.split(" ");
export const BASE_TEMPLATES = [
  {
    id: "vazia",
    name: "Em branco",
    hint: "Começa sem colunas: você define tudo.",
    props: {},
    views: [],
  },
  {
    id: "leituras",
    name: "Leituras",
    hint: "Livros e artigos: autor, situação e nota.",
    props: {
      autor: { type: "text" },
      situacao: { type: "select", options: opts("quero-ler lendo lido abandonado") },
      nota: { type: "number" },
      terminei_em: { type: "date" },
    },
    views: [
      { ...makeView("table", "Leituras"), columns: ["file.name", "autor", "situacao", "nota", "terminei_em"], sort: [{ key: "file.name", dir: "asc" }] },
      { ...makeView("board", "Por situação"), groupBy: "situacao" },
    ],
  },
  {
    id: "contatos",
    name: "Contatos",
    hint: "Pessoas e empresas, com o último contato.",
    props: {
      tipo: { type: "select", options: opts("cliente fornecedor amigo familia outro") },
      empresa: { type: "text" },
      telefone: { type: "text" },
      email: { type: "text" },
      ultimo_contato: { type: "date" },
    },
    views: [
      { ...makeView("table", "Contatos"), columns: ["file.name", "tipo", "empresa", "telefone", "ultimo_contato"], sort: [{ key: "ultimo_contato", dir: "desc" }] },
      { ...makeView("list", "Por tipo"), groupBy: "tipo" },
    ],
  },
  {
    id: "despesas",
    name: "Despesas",
    hint: "Gastos do mês: valor, categoria e quando foi pago.",
    props: {
      valor: { type: "number" },
      categoria: { type: "select", options: opts("moradia comida transporte lazer saude outros") },
      data: { type: "date" },
      pago: { type: "checkbox" },
    },
    views: [
      { ...makeView("table", "Gastos"), columns: ["file.name", "categoria", "valor", "data", "pago"], sort: [{ key: "data", dir: "desc" }], totals: { valor: "soma" } },
      { ...makeView("board", "Por categoria"), groupBy: "categoria" },
      { ...makeView("calendar", "Calendário"), dateKey: "data" },
    ],
  },
  {
    id: "projetos",
    name: "Projetos",
    hint: "Trabalhos em andamento, com prazo e responsável.",
    props: {
      situacao: { type: "select", options: opts("ideia fazendo pausado pronto") },
      responsavel: { type: "pessoa" },
      prazo: { type: "date" },
      prioridade: { type: "number" },
    },
    views: [
      { ...makeView("table", "Projetos"), columns: ["file.name", "situacao", "responsavel", "prazo", "prioridade"], sort: [{ key: "prazo", dir: "asc" }] },
      { ...makeView("board", "Quadro"), groupBy: "situacao" },
      { ...makeView("timeline", "Cronograma"), dateKey: "prazo" },
    ],
  },
];

// Base nova a partir de um modelo. Modelo desconhecido vira base em branco.
export function templateBase(id = "vazia", { folder = "" } = {}) {
  const t = BASE_TEMPLATES.find((x) => x.id === id) || BASE_TEMPLATES[0];
  const views = t.views.length ? t.views : [makeView("table")];
  return { source: { folder, tag: "" }, props: structuredClone(t.props), views: structuredClone(views) };
}

// Itens do cronograma: cada nota com início (`startKey`) e fim (`endKey`, ou o próprio início). Notas sem data de início
// ficam de fora; fim antes do início vira um dia só. Devolve também o intervalo total, em dias.
export function timelineItems(rows, startKey, endKey = "") {
  const day = (v) => {
    const iso = readDate(v);
    return iso ? Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86400000) : null;
  };
  const items = [];
  for (const row of rows) {
    const start = day(valueOf(row, startKey));
    if (start === null) continue;
    const endRaw = endKey ? day(valueOf(row, endKey)) : null;
    const end = endRaw === null || endRaw < start ? start : endRaw;
    items.push({ row, start, end });
  }
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  const min = items.length ? Math.min(...items.map((i) => i.start)) : 0;
  const max = items.length ? Math.max(...items.map((i) => i.end)) : 0;
  return { items, min, max, span: Math.max(1, max - min + 1) };
}

export const serializeBase = (base) => `${JSON.stringify(base, null, 2)}\n`;

// --- Linhas (notas) ------------------------------------------------------------------------------------------------------

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// `files`: [{ path, content, mtime }]. `getMeta(file)` devolve extractMetadata (com cache, se o app tiver).
// Alvos dos links internos ([[Nota]], [[Nota|apelido]], [[Nota#Seção]]) num valor ou numa lista de valores.
export function linkTargets(v) {
  const out = [];
  for (const x of Array.isArray(v) ? v : [v]) {
    for (const m of String(x ?? "").matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const name = m[1].trim();
      if (name && !out.includes(name)) out.push(name);
    }
  }
  return out;
}

// Texto digitado numa relação: "Alfa, [[Beta]]" vira ["[[Alfa]]", "[[Beta]]"]. Sem colchetes, cada item vira um link.
export function linksFromText(text) {
  const items = String(text ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const out = [];
  for (const item of items) {
    const targets = linkTargets(item);
    const names = targets.length ? targets : [item.replace(/^\[\[|\]\]$/g, "").trim()];
    for (const n of names) if (n && !out.includes(`[[${n}]]`)) out.push(`[[${n}]]`);
  }
  return out;
}

// --- Fórmulas ----------------------------------------------------------------------------------------------------------------
// Aritmética sobre propriedades numéricas: + - * / ( ), números, nomes de propriedade (entre aspas se tiverem espaço) e as
// funções soma(…), media(…) e arred(x, casas). Um analisador próprio lê a expressão: nada é executado como código.

const TOKEN = /\s*(?:(\d+(?:[.,]\d+)?)|"([^"]+)"|([\p{L}_][\p{L}\p{N}_]*)|(\+|-|\*|\/|\(|\)|,))/uy;
const FUNCTIONS = "soma media arred".split(" ");

function tokenize(src) {
  const s = String(src ?? "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s.slice(i).trim() === "") break;
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(s);
    if (!m) throw new Error(`Não entendi a partir de “${s.slice(i).trim().slice(0, 16)}”`);
    i = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1].replace(",", ".")) });
    else if (m[2] !== undefined) out.push({ t: "name", v: m[2] });
    else if (m[3] !== undefined) out.push({ t: "word", v: m[3] });
    else out.push({ t: "op", v: m[4] });
  }
  return out;
}

// Árvore da expressão. Lança Error com mensagem em português se a expressão não estiver certa.
export function parseFormula(src) {
  const toks = tokenize(src);
  if (toks.length === 0) throw new Error("A fórmula está vazia");
  let p = 0;
  const peekOp = (...ops) => toks[p]?.t === "op" && ops.includes(toks[p].v);
  const eat = (v) => {
    if (peekOp(v)) {
      p++;
      return true;
    }
    return false;
  };
  const expr = () => {
    let node = term();
    while (peekOp("+", "-")) {
      const op = toks[p++].v;
      node = { op, a: node, b: term() };
    }
    return node;
  };
  const term = () => {
    let node = unary();
    while (peekOp("*", "/")) {
      const op = toks[p++].v;
      node = { op, a: node, b: unary() };
    }
    return node;
  };
  const unary = () => (eat("-") ? { op: "neg", a: unary() } : primary());
  const primary = () => {
    const t = toks[p++];
    if (!t) throw new Error("A fórmula termina antes da hora");
    if (t.t === "num") return { num: t.v };
    if (t.t === "name") return { prop: t.v };
    if (t.t === "word") {
      if (!eat("(")) return { prop: t.v };
      const fn = t.v.toLowerCase();
      if (!FUNCTIONS.includes(fn)) throw new Error(`Função desconhecida: ${t.v}`);
      const args = [];
      if (!eat(")")) {
        do args.push(expr());
        while (eat(","));
        if (!eat(")")) throw new Error("Falta fechar um parêntese");
      }
      return { fn, args };
    }
    if (t.t === "op" && t.v === "(") {
      const node = expr();
      if (!eat(")")) throw new Error("Falta fechar um parêntese");
      return node;
    }
    throw new Error(`Não esperava “${t.v}”`);
  };
  const tree = expr();
  if (p < toks.length) throw new Error(`Sobrou “${toks[p].v}” no fim da fórmula`);
  return tree;
}

// Valor de uma expressão. `get(nome)` devolve número ou null. Qualquer operando vazio dá null (a célula fica vazia),
// e divisão por zero também. soma e média ignoram os vazios.
export function evalFormula(tree, get) {
  const ev = (node) => {
    if (node.num !== undefined) return node.num;
    if (node.prop !== undefined) return get(node.prop);
    if (node.op === "neg") {
      const a = ev(node.a);
      return a === null ? null : -a;
    }
    if (node.fn) {
      const xs = node.args.map(ev);
      const present = xs.filter((x) => x !== null);
      if (node.fn === "soma") return present.reduce((a, b) => a + b, 0);
      if (node.fn === "media") return present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
      const [x, casas = 0] = xs;
      if (x === null || casas === null) return null;
      const k = 10 ** Math.max(0, Math.min(6, Math.round(casas)));
      return Math.round(x * k) / k;
    }
    const a = ev(node.a);
    const b = ev(node.b);
    if (a === null || b === null) return null;
    if (node.op === "+") return a + b;
    if (node.op === "-") return a - b;
    if (node.op === "*") return a * b;
    return b === 0 ? null : a / b;
  };
  const out = ev(tree);
  return out === null || !Number.isFinite(out) ? null : out;
}

// Confere a expressão para a tela (mensagem em português, ou ok).
export function checkFormula(src) {
  try {
    parseFormula(src);
    return { ok: true, error: "" };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Calcula as fórmulas de uma base em cada linha (em `row.calc`). Quem lê a célula (valueOf) usa esse valor.
export function applyFormulas(rows, props = {}) {
  const formulas = Object.entries(props).filter(([, p]) => p?.type === "formula" && p.expr);
  if (!formulas.length) return rows;
  for (const [key, p] of formulas) {
    let tree = null;
    try {
      tree = parseFormula(p.expr);
    } catch {
      tree = null;
    }
    for (const row of rows) {
      row.calc = row.calc || {};
      row.calc[key] = tree ? evalFormula(tree, (name) => {
        const n = coerce("number", valueOf(row, name));
        return n === "" ? null : n;
      }) : null;
    }
  }
  return rows;
}

export function collectRows(files, source = {}, getMeta = (f) => extractMetadata(f.content)) {
  const folder = (source.folder || "").replace(/^\/+|\/+$/g, "");
  const tag = fold(source.tag || "").replace(/^#/, "");
  const rows = [];
  // quantas notas diferentes apontam para cada nome (ligações de entrada), contadas em toda a biblioteca
  const inbound = new Map();
  for (const f of files) {
    if (!/\.md$/i.test(f.path)) continue;
    for (const target of linkTargets(f.content || "")) {
      const key = target.toLowerCase();
      if (!inbound.has(key)) inbound.set(key, new Set());
      inbound.get(key).add(f.path);
    }
  }
  for (const f of files) {
    if (!/\.md$/i.test(f.path) || f.path.split("/").some((part) => part.startsWith("."))) continue;
    if (folder && !f.path.startsWith(`${folder}/`)) continue;
    const meta = getMeta(f);
    if (!meta) continue;
    if (tag && !meta.tags.some((t) => fold(t) === tag)) continue;
    rows.push({
      path: f.path,
      name: stripExt(baseName(f.path)),
      folder: f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "",
      mtime: f.mtime || 0,
      props: meta.frontmatter || {},
      tags: meta.tags || [],
      backlinks: (inbound.get(stripExt(baseName(f.path)).toLowerCase()) || new Set()).size,
    });
  }
  return rows;
}

export function valueOf(row, key) {
  if (row.calc && key in row.calc) return row.calc[key];
  switch (key) {
    case "file.name": return row.name;
    case "file.folder": return row.folder;
    case "file.path": return row.path;
    case "file.mtime": return row.mtime ? isoDay(row.mtime) : "";
    case "file.backlinks": return row.backlinks ?? 0;
    case "tags": return row.tags;
    default: {
      const v = row.props[key];
      return v === undefined || v === null ? "" : v;
    }
  }
}

export const isEmpty = (v) => v === "" || v === undefined || v === null || (Array.isArray(v) && v.length === 0);

// Chaves de frontmatter usadas pelas notas, das mais comuns para as menos (empate: ordem de aparição).
export function propertyKeys(rows) {
  const count = new Map();
  for (const r of rows) for (const k of Object.keys(r.props)) count.set(k, (count.get(k) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

// Todas as propriedades que dá para mostrar: as do arquivo e as do frontmatter.
export function availableKeys(rows) {
  const fm = propertyKeys(rows).filter((k) => k !== "tags");
  return ["file.name", "tags", ...fm, "file.mtime", "file.folder", "file.backlinks"];
}

const ISO = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

// Data de uma célula: AAAA-MM-DD (com hora, se tiver) ou DD/MM/AAAA (ou DD/MM/AA). Devolve AAAA-MM-DD, ou "" se não for uma
// data que existe. Só lê: o valor gravado na nota continua como foi escrito.
export function readDate(v) {
  const raw = Array.isArray(v) ? v[0] : v;
  const s = String(raw ?? "").trim();
  let y;
  let mo;
  let d;
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(s);
    if (!m) return "";
    [d, mo, y] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  }
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return "";
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}


export function inferType(rows, key, props = {}) {
  if (props[key]?.type) return props[key].type;
  if (key === "tags") return "list";
  if (key === "file.mtime") return "date";
  if (key === "file.backlinks") return "number";
  if (key.startsWith("file.")) return "text";
  const vals = rows.map((r) => valueOf(r, key)).filter((v) => !isEmpty(v));
  if (vals.length === 0) return "text";
  if (vals.every((v) => typeof v === "boolean")) return "checkbox";
  if (vals.every(isNum)) return "number";
  if (vals.every((v) => Array.isArray(v))) return "list";
  if (vals.every((v) => typeof v === "string" && readDate(v) !== "")) return "date";
  if (vals.every((v) => typeof v === "string")) {
    const distinct = new Set(vals);
    if (vals.length >= 2 && distinct.size <= 8 && distinct.size < vals.length) return "select";
  }
  return "text";
}

export function typesFor(rows, keys, props = {}) {
  return Object.fromEntries(keys.map((k) => [k, inferType(rows, k, props)]));
}

// Valores que a propriedade já tem nas notas (ou as opções definidas na base), para listas de escolha.
export function optionsFor(rows, key, props = {}) {
  const set = new Set(props[key]?.options || []);
  for (const r of rows) {
    const v = valueOf(r, key);
    for (const x of Array.isArray(v) ? v : [v]) if (!isEmpty(x) && typeof x !== "boolean") set.add(String(x));
  }
  return [...set];
}

// --- Filtrar, ordenar, agrupar ----------------------------------------------------------------------------------------

function compare(a, b, type) {
  const ea = isEmpty(a);
  const eb = isEmpty(b);
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // vazios sempre no fim, qualquer que seja a ordem
  if (type === "number" || type === "formula") return Number(a) - Number(b);
  if (type === "checkbox") return Number(!!a) - Number(!!b);
  if (type === "date") return (readDate(a) || String(a)).localeCompare(readDate(b) || String(b));
  const sa = Array.isArray(a) ? a.join(", ") : String(a);
  const sb = Array.isArray(b) ? b.join(", ") : String(b);
  return sa.localeCompare(sb, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function matchesFilter(row, f, type) {
  const v = valueOf(row, f.key);
  if (f.op === "empty") return isEmpty(v);
  if (f.op === "notempty") return !isEmpty(v);
  if (f.value === "" || f.value === undefined || f.value === null) return true; // filtro ainda sem valor não esconde nada
  const list = (Array.isArray(v) ? v : [v]).filter((x) => !isEmpty(x)).map(String);
  const want = String(f.value ?? "");
  if (f.op === "is") return type === "checkbox" ? String(!!v) === want : list.some((x) => fold(x) === fold(want));
  if (f.op === "isnot") return !(type === "checkbox" ? String(!!v) === want : list.some((x) => fold(x) === fold(want)));
  if (f.op === "contains") return list.some((x) => fold(x).includes(fold(want)));
  if (f.op === "notcontains") return !list.some((x) => fold(x).includes(fold(want)));
  if (isEmpty(v)) return false;
  const c = compare(type === "number" ? Number(v) : v, type === "number" ? Number(want) : want, type);
  if (f.op === "gt") return c > 0;
  if (f.op === "lt") return c < 0;
  if (f.op === "gte") return c >= 0;
  if (f.op === "lte") return c <= 0;
  return true;
}

// Aplica os filtros e a ordem de uma visão. Sem ordem definida, vale o nome da nota.
export function applyView(rows, view, types = {}) {
  let out = rows.filter((r) => view.filters.every((f) => matchesFilter(r, f, types[f.key] || "text")));
  const sort = view.sort.length ? view.sort : [{ key: "file.name", dir: "asc" }];
  out = out
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      for (const s of sort) {
        const t = types[s.key] || "text";
        const a = valueOf(x.r, s.key);
        const b = valueOf(y.r, s.key);
        const c = compare(a, b, t);
        if (c !== 0) return isEmpty(a) || isEmpty(b) ? c : s.dir === "desc" ? -c : c;
      }
      return x.i - y.i;
    })
    .map((x) => x.r);
  return out;
}

const groupValue = (row, key) => {
  const v = valueOf(row, key);
  const first = Array.isArray(v) ? v[0] : v;
  return isEmpty(first) ? "" : typeof first === "boolean" ? String(first) : String(first);
};

// Grupos de um quadro ou de uma tabela agrupada: as opções definidas vêm primeiro, depois os valores na ordem em que aparecem,
// e "sem valor" por último. Listas agrupam pelo primeiro item.
export function groupRows(rows, key, props = {}, { withEmpty = true } = {}) {
  const order = [...(props[key]?.options || [])];
  const buckets = new Map(order.map((o) => [o, []]));
  for (const r of rows) {
    const g = groupValue(r, key);
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push(r);
  }
  const empty = buckets.get("") || [];
  buckets.delete("");
  const groups = [...buckets.entries()].map(([value, list]) => ({ value, rows: list }));
  if (withEmpty || empty.length) groups.push({ value: "", rows: empty });
  return groups;
}

// --- Calendário ------------------------------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");
export const isoDate = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // `m` de 0 a 11
export const todayIso = (now = new Date()) => isoDate(now.getFullYear(), now.getMonth(), now.getDate());

// Semanas (domingo a sábado) que cobrem o mês; cada dia: { date, inMonth, rows }.
export function monthGrid(year, month, rows = [], dateKey = "") {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const byDay = new Map();
  for (const r of rows) {
    const v = valueOf(r, dateKey);
    const d = readDate(v);
    if (d) {
      if (!byDay.has(d)) byDay.set(d, []);
      byDay.get(d).push(r);
    }
  }
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const date = isoDate(day.getFullYear(), day.getMonth(), day.getDate());
      week.push({ date, day: day.getDate(), inMonth: day.getMonth() === month, rows: byDay.get(date) || [] });
    }
    if (w >= 4 && !week.some((c) => c.inMonth)) break; // sem semana inteira do mês seguinte
    weeks.push(week);
  }
  return weeks;
}

export const rowsWithoutDate = (rows, dateKey) => rows.filter((r) => {
  const v = valueOf(r, dateKey);
  return !readDate(v);
});

// --- Escrever ---------------------------------------------------------------------------------------------------------------

// Texto digitado → valor do frontmatter, conforme o tipo da propriedade.
export function coerce(type, input) {
  const t = typeof input === "string" ? input.trim() : input;
  if (type === "checkbox") return t === true || t === "true";
  if (t === "" || t === null || t === undefined) return "";
  if (type === "number") {
    const n = Number(String(t).replace(",", "."));
    return Number.isFinite(n) ? n : "";
  }
  if (type === "list") return (Array.isArray(t) ? t : String(t).split(",")).map((x) => String(x).trim()).filter(Boolean);
  if (type === "relacao") {
    const links = linksFromText(t);
    return links.length === 0 ? "" : links.length === 1 ? links[0] : links;
  }
  return String(t);
}

// Novo texto da nota com a propriedade trocada. Propriedades do arquivo (nome, pasta, data de modificação) não se editam.
export function setValue(source, key, value) {
  if (!isEditable(key)) return source;
  return setProperty(source, key, value);
}

// Frontmatter inicial de uma nota criada de dentro de uma visão: já nasce com o que a visão filtra ou agrupa, para
// aparecer nela (a pasta e a tag da base também valem).
export function newRowProps(base, view, extra = {}) {
  const out = {};
  if (base.source.tag) out.tags = [base.source.tag];
  for (const f of view.filters) {
    if (f.op !== "is" || f.key.startsWith("file.") || f.value === "") continue;
    if (f.key === "tags") out.tags = [...new Set([...(out.tags || []), String(f.value)])];
    else out[f.key] = f.value === "true" ? true : f.value === "false" ? false : f.value;
  }
  for (const [k, v] of Object.entries(extra)) if (!isEmpty(v) && isEditable(k)) out[k] = v;
  return out;
}

export function newRowContent(props) {
  let text = "";
  for (const [k, v] of Object.entries(props)) text = Array.isArray(v) ? setProperty(text, k, v) : addProperty(text, k, v);
  return text;
}

export function uniquePath(has, folder, name = "Nova nota") {
  const dir = folder ? `${folder}/` : "";
  let path = `${dir}${name}.md`;
  for (let n = 2; has(path); n++) path = `${dir}${name} ${n}.md`;
  return path;
}

// Colunas de uma visão: as escolhidas, ou o nome e as três propriedades mais usadas.
export function columnsOf(view, rows) {
  if (view.columns.length) return view.columns;
  return ["file.name", ...propertyKeys(rows).slice(0, 4)];
}
