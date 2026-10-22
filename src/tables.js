// Tabelas Markdown como dados: ler (`| a | b |` com separador e alinhamento), editar (linhas, colunas, alinhamento, mover)
// e escrever de volta com as colunas alinhadas. O texto de cada célula é Markdown em linha; `|` dentro da célula vira `\|`
// e quebra de linha vira `<br>`. Tudo puro, sem DOM.

export const ALIGNS = ["", "left", "center", "right"];

// Quebra uma linha em células nos `|` que não estão escapados (`\|`), ignorando o `|` de fora no começo e no fim.
export function splitCells(line) {
  const cells = [];
  let cur = "";
  const s = String(line).trim();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "\\|";
      i++;
    } else if (ch === "|") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  if (s.startsWith("|")) cells.shift();
  if (s.endsWith("|") && !s.endsWith("\\|") && cells.length) cells.pop();
  return cells.map((c) => c.trim());
}

export const unescapeCell = (s) => String(s).replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n");
export const escapeCell = (s) => String(s ?? "").replace(/\r?\n/g, "<br>").replace(/\\?\|/g, "\\|").trim();

const SEP = /^:?-+:?$/;
const alignOf = (c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : /^:-/.test(c) ? "left" : "");

// Lê o texto de uma tabela. Devolve null se não for uma (precisa de cabeçalho e linha de separação).
export function parseTable(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) return null;
  const sepCells = splitCells(lines[1]);
  if (!sepCells.length || !sepCells.every((c) => SEP.test(c))) return null;
  const header = splitCells(lines[0]).map(unescapeCell);
  const n = Math.max(header.length, sepCells.length);
  const table = {
    header: pad(header, n),
    align: pad(sepCells.map(alignOf), n, ""),
    rows: lines.slice(2).map((l) => pad(splitCells(l).map(unescapeCell), n)),
  };
  return table;
}

function pad(list, n, fill = "") {
  const out = list.slice(0, n);
  while (out.length < n) out.push(fill);
  return out;
}

// Escreve a tabela com as colunas alinhadas (largura mínima 3, como o separador pede).
export function serializeTable(t) {
  const n = t.header.length;
  const head = t.header.map(escapeCell);
  const body = t.rows.map((r) => pad(r, n).map(escapeCell));
  const width = Array.from({ length: n }, (_, c) => Math.max(3, head[c].length, ...body.map((r) => r[c].length)));
  const fit = (text, w, a) => {
    const gap = w - text.length;
    if (a === "right") return " ".repeat(gap) + text;
    if (a === "center") return " ".repeat(Math.floor(gap / 2)) + text + " ".repeat(Math.ceil(gap / 2));
    return text + " ".repeat(gap);
  };
  const line = (cells) => `| ${cells.map((c, i) => fit(c, width[i], t.align[i])).join(" | ")} |`;
  const sep = `| ${width.map((w, i) => (t.align[i] === "center" ? `:${"-".repeat(w - 2)}:` : t.align[i] === "right" ? `${"-".repeat(w - 1)}:` : t.align[i] === "left" ? `:${"-".repeat(w - 1)}` : "-".repeat(w))).join(" | ")} |`;
  return [line(head), sep, ...body.map(line)].join("\n");
}

export function emptyTable(cols = 3, rows = 2) {
  return {
    header: Array.from({ length: cols }, (_, i) => `Coluna ${i + 1}`),
    align: Array(cols).fill(""),
    rows: Array.from({ length: rows }, () => Array(cols).fill("")),
  };
}

const clone = (t) => ({ header: [...t.header], align: [...t.align], rows: t.rows.map((r) => [...r]) });
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// As operações devolvem uma tabela nova (a de entrada não muda). Linhas são contadas só no corpo: 0 é a primeira depois do cabeçalho.
export function insertRow(t, at) {
  const c = clone(t);
  c.rows.splice(clamp(at, 0, c.rows.length), 0, Array(c.header.length).fill(""));
  return c;
}

export function deleteRow(t, i) {
  const c = clone(t);
  if (i >= 0 && i < c.rows.length) c.rows.splice(i, 1);
  return c;
}

export function insertCol(t, at) {
  const c = clone(t);
  const i = clamp(at, 0, c.header.length);
  c.header.splice(i, 0, `Coluna ${c.header.length + 1}`);
  c.align.splice(i, 0, "");
  for (const r of c.rows) r.splice(i, 0, "");
  return c;
}

// A última coluna não se apaga: uma tabela sem colunas deixaria de ser uma tabela.
export function deleteCol(t, i) {
  if (t.header.length <= 1 || i < 0 || i >= t.header.length) return clone(t);
  const c = clone(t);
  c.header.splice(i, 1);
  c.align.splice(i, 1);
  for (const r of c.rows) r.splice(i, 1);
  return c;
}

export function setAlign(t, col, a) {
  const c = clone(t);
  if (col >= 0 && col < c.align.length && ALIGNS.includes(a)) c.align[col] = a;
  return c;
}

export function moveRow(t, from, to) {
  const c = clone(t);
  if (from < 0 || from >= c.rows.length) return c;
  const [r] = c.rows.splice(from, 1);
  c.rows.splice(clamp(to, 0, c.rows.length), 0, r);
  return c;
}

export function moveCol(t, from, to) {
  const c = clone(t);
  const n = c.header.length;
  if (from < 0 || from >= n) return c;
  const t2 = clamp(to, 0, n - 1);
  const mv = (list) => {
    const [x] = list.splice(from, 1);
    list.splice(t2, 0, x);
  };
  mv(c.header);
  mv(c.align);
  c.rows.forEach(mv);
  return c;
}

export function setCell(t, row, col, text) {
  const c = clone(t);
  if (row === 0) {
    if (col < c.header.length) c.header[col] = text;
  } else if (c.rows[row - 1] && col < c.header.length) c.rows[row - 1][col] = text;
  return c;
}

// Texto copiado de uma planilha (colunas separadas por tabulação) vira tabela; a primeira linha é o cabeçalho.
export function tableFromTsv(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (!lines.length || !lines.every((l) => l.includes("\t")) || lines.length < 2) return null;
  const grid = lines.map((l) => l.split("\t").map((c) => c.trim()));
  const n = Math.max(...grid.map((r) => r.length));
  return { header: pad(grid[0], n), align: Array(n).fill(""), rows: grid.slice(1).map((r) => pad(r, n)) };
}
