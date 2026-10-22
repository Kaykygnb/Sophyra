// Comandos de edição do Markdown. Cada um é uma função pura
// (texto, início, fim) → edição { from, to, insert, sel } ou null; o app aplica a edição no textarea.

import { indentLines } from "./editing.js";

const lineStart = (t, p) => t.lastIndexOf("\n", p - 1) + 1;
const lineEnd = (t, p) => {
  const i = t.indexOf("\n", p);
  return i === -1 ? t.length : i;
};

// Intervalo de linhas inteiras tocadas pela seleção (uma seleção que termina no início de uma linha não a inclui).
function lineSpan(t, s, e) {
  const from = lineStart(t, s);
  const to = lineEnd(t, e > s && t[e - 1] === "\n" ? e - 1 : e);
  return { from, to, lines: t.slice(from, to).split("\n") };
}

function replaceLines(t, s, e, mapper) {
  const { from, to, lines } = lineSpan(t, s, e);
  const next = mapper(lines);
  const insert = next.join("\n");
  const delta = insert.length - (to - from);
  const firstDelta = next[0].length - lines[0].length;
  return { from, to, insert, sel: [Math.max(from, s + firstDelta), Math.max(from, e + delta)] };
}

// --- Marcas em volta do texto -------------------------------------------------------------------------------------------

function toggleWrap(mark, close = mark) {
  return (t, s, e) => {
    const a = mark.length;
    const b = close.length;
    if (s === e) {
      // sem seleção: se o cursor já está entre as marcas vazias, não faz nada útil; senão abre o par
      return { from: s, to: s, insert: mark + close, sel: [s + a, s + a] };
    }
    const sel = t.slice(s, e);
    if (t.slice(s - a, s) === mark && t.slice(e, e + b) === close) {
      return { from: s - a, to: e + b, insert: sel, sel: [s - a, e - a] };
    }
    if (sel.length >= a + b && sel.startsWith(mark) && sel.endsWith(close)) {
      const inner = sel.slice(a, sel.length - b);
      return { from: s, to: e, insert: inner, sel: [s, s + inner.length] };
    }
    return { from: s, to: e, insert: mark + sel + close, sel: [s + a, e + a] };
  };
}

// --- Prefixos de linha --------------------------------------------------------------------------------------------------

const MARKER = /^(\s*)(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/;

function toggleList(kind) {
  const has = (l) => {
    if (kind === "bullet") return /^\s*[-*+]\s+(?!\[[ xX]\])/.test(l);
    if (kind === "number") return /^\s*\d+\.\s+/.test(l);
    return /^\s*[-*+]\s+\[[ xX]\]\s+/.test(l);
  };
  return (t, s, e) =>
    replaceLines(t, s, e, (lines) => {
      const body = lines.filter((l) => l.trim() !== "");
      const all = body.length > 0 && body.every(has);
      let n = 0;
      return lines.map((l) => {
        if (l.trim() === "") return l;
        const m = MARKER.exec(l);
        const indent = m ? m[1] : /^\s*/.exec(l)[0];
        const rest = m ? l.slice(m[0].length) : l.slice(indent.length);
        if (all) return indent + rest;
        n++;
        return indent + (kind === "bullet" ? "- " : kind === "number" ? `${n}. ` : "- [ ] ") + rest;
      });
    });
}

function toggleQuote(t, s, e) {
  return replaceLines(t, s, e, (lines) => {
    const body = lines.filter((l) => l.trim() !== "");
    const all = body.length > 0 && body.every((l) => /^\s*>\s?/.test(l));
    return lines.map((l) => (l.trim() === "" ? l : all ? l.replace(/^(\s*)>\s?/, "$1") : `> ${l}`));
  });
}

function setHeading(level) {
  return (t, s, e) =>
    replaceLines(t, s, s === e ? e : e, (lines) =>
      lines.map((l, i) => {
        if (i > 0) return l;
        const m = /^(#{1,6})\s+/.exec(l);
        const rest = m ? l.slice(m[0].length) : l;
        if (level === 0 || (m && m[1].length === level)) return rest;
        return `${"#".repeat(level)} ${rest}`;
      }),
    );
}

function cycleChecklist(t, s, e) {
  return replaceLines(t, s, e, (lines) =>
    lines.map((l) => {
      if (l.trim() === "") return l;
      const indent = /^\s*/.exec(l)[0];
      if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(l)) return l.replace(/^(\s*)[-*+]\s+\[[ xX]\]\s+/, "$1"); // tarefa → texto
      if (/^\s*[-*+]\s+/.test(l)) return l.replace(/^(\s*)([-*+])\s+/, "$1$2 [ ] "); // item → tarefa
      return `${indent}- ${l.slice(indent.length)}`; // texto → item
    }),
  );
}

function toggleChecklistStatus(t, s, e) {
  return replaceLines(t, s, e, (lines) =>
    lines.map((l) => {
      if (/^\s*[-*+]\s+\[ \]\s/.test(l)) return l.replace("[ ]", "[x]");
      if (/^\s*[-*+]\s+\[[xX]\]\s/.test(l)) return l.replace(/\[[xX]\]/, "[ ]");
      if (l.trim() === "") return l;
      const m = MARKER.exec(l);
      return m ? l.replace(/^(\s*[-*+]\s+)/, "$1[ ] ") : `- [ ] ${l.trimStart()}`;
    }),
  );
}

// --- Mover e apagar linhas ----------------------------------------------------------------------------------------------

function swapLine(dir) {
  return (t, s, e) => {
    const { from, to } = lineSpan(t, s, e);
    if (dir < 0) {
      if (from === 0) return null;
      const prevFrom = lineStart(t, from - 1);
      const prev = t.slice(prevFrom, from - 1);
      const block = t.slice(from, to);
      return { from: prevFrom, to, insert: `${block}\n${prev}`, sel: [s - (prev.length + 1), e - (prev.length + 1)] };
    }
    if (to >= t.length) return null;
    const nextTo = lineEnd(t, to + 1);
    const next = t.slice(to + 1, nextTo);
    const block = t.slice(from, to);
    return { from, to: nextTo, insert: `${next}\n${block}`, sel: [s + next.length + 1, e + next.length + 1] };
  };
}

function deleteParagraph(t, s) {
  let from = lineStart(t, s);
  let to = lineEnd(t, s);
  if (t.slice(from, to).trim() === "") return null;
  while (from > 0) {
    const ps = lineStart(t, from - 1);
    if (t.slice(ps, from - 1).trim() === "") break;
    from = ps;
  }
  while (to < t.length) {
    const ne = lineEnd(t, to + 1);
    if (t.slice(to + 1, ne).trim() === "") break;
    to = ne;
  }
  if (to < t.length) to += 1; // a quebra que fecha o parágrafo
  if (to < t.length && t[to] === "\n") to += 1; // e a linha em branco depois
  return { from, to, insert: "", sel: [from, from] };
}

// --- Inserções ----------------------------------------------------------------------------------------------------------------

// Insere um bloco numa linha própria, com o cursor onde indicado (marcador ‸ no texto do bloco).
function insertBlock(block) {
  return (t, s, e) => {
    const before = s > 0 && t[s - 1] !== "\n" ? "\n" : "";
    const after = e < t.length && t[e] !== "\n" ? "\n" : "";
    const caret = block.indexOf("‸");
    const body = block.replace("‸", "");
    const insert = before + body + after;
    const at = s + before.length + (caret === -1 ? body.length : caret);
    return { from: s, to: e, insert, sel: [at, at] };
  };
}

function wrapBlock(open, close) {
  return (t, s, e) => {
    const sel = t.slice(s, e);
    const before = s > 0 && t[s - 1] !== "\n" ? "\n" : "";
    const after = e < t.length && t[e] !== "\n" ? "\n" : "";
    const body = sel ? `${sel}${sel.endsWith("\n") ? "" : "\n"}` : "\n";
    const insert = `${before}${open}\n${body}${close}${after}`;
    const at = s + before.length + open.length + 1;
    return { from: s, to: e, insert, sel: sel ? [at, at + sel.length] : [at, at] };
  };
}

function insertLink(t, s, e) {
  const sel = t.slice(s, e) || "texto";
  const insert = `[${sel}](url)`;
  const urlAt = s + sel.length + 3;
  return { from: s, to: e, insert, sel: [urlAt, urlAt + 3] };
}

function insertWikilink(t, s, e) {
  const sel = t.slice(s, e);
  return { from: s, to: e, insert: `[[${sel}]]`, sel: sel ? [s + 2 + sel.length + 2, s + 2 + sel.length + 2] : [s + 2, s + 2] };
}

function insertEmbed(t, s, e) {
  const sel = t.slice(s, e);
  return { from: s, to: e, insert: `![[${sel}]]`, sel: sel ? [s + 3 + sel.length + 2, s + 3 + sel.length + 2] : [s + 3, s + 3] };
}

function insertTag(t, s, e) {
  const sel = t.slice(s, e);
  const insert = sel ? `#${sel.replace(/\s+/g, "-")}` : "#";
  return { from: s, to: e, insert, sel: [s + insert.length, s + insert.length] };
}

// Nota de rodapé: põe a chamada no cursor e a definição no fim do texto. É uma troca do texto todo, em uma única ação.
function insertFootnote(t, s, e) {
  const used = [...t.matchAll(/\[\^(\d+)\]/g)].map((m) => Number(m[1]));
  const n = (used.length ? Math.max(...used) : 0) + 1;
  const withRef = t.slice(0, s) + `[^${n}]` + t.slice(e);
  const tail = withRef.endsWith("\n") ? "\n" : "\n\n";
  const full = `${withRef}${tail}[^${n}]: `;
  const caret = full.length;
  return { from: 0, to: t.length, insert: full, sel: [caret, caret] };
}

function toggleComment(t, s, e) {
  return toggleWrap("%%")(t, s, e);
}

// Tira marcas de formatação da seleção (ou da linha): negrito, itálico, riscado, marca, código e prefixos de bloco.
function clearFormatting(t, s, e) {
  const { from, to, lines } = lineSpan(t, s, e);
  const clean = (l) =>
    l
      .replace(/^(\s*)#{1,6}\s+/, "$1")
      .replace(/^(\s*)>\s?/, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/==([^=]+)==/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1$2")
      .replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, "$1$2");
  const insert = lines.map(clean).join("\n");
  return { from, to, insert, sel: [from, from + insert.length] };
}

// --- Tabela de comandos -----------------------------------------------------------------------------------------------------

export const EDITOR_COMMANDS = [
  { id: "bold", name: "Negrito", icon: "bold", run: toggleWrap("**") },
  { id: "italic", name: "Itálico", icon: "italic", run: toggleWrap("*") },
  { id: "strike", name: "Riscado", icon: "edit", run: toggleWrap("~~") },
  { id: "highlight", name: "Destacar (marca-texto)", icon: "edit", run: toggleWrap("==") },
  { id: "code", name: "Código em linha", icon: "code", run: toggleWrap("`") },
  { id: "math-inline", name: "Fórmula em linha", icon: "code", run: toggleWrap("$") },
  { id: "comment", name: "Comentário (%% %%)", icon: "edit", run: toggleComment },
  { id: "quote", name: "Citação", icon: "quote", run: toggleQuote },
  { id: "bullet", name: "Lista com marcadores", icon: "list", run: toggleList("bullet") },
  { id: "numbered", name: "Lista numerada", icon: "list", run: toggleList("number") },
  { id: "checklist", name: "Lista de tarefas", icon: "check-square", run: toggleList("task") },
  { id: "cycle-list", name: "Alternar texto, item e tarefa", icon: "check-square", run: cycleChecklist },
  { id: "toggle-task", name: "Marcar ou desmarcar a tarefa", icon: "check-circle", run: toggleChecklistStatus },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ id: `h${n}`, name: `Título ${n}`, icon: "heading", run: setHeading(n) })),
  { id: "h0", name: "Remover título (texto normal)", icon: "heading", run: setHeading(0) },
  { id: "indent", name: "Recuar item", icon: "arrow-right", run: (t, s, e) => indentLines(t, s, e, false) || { from: s, to: s, insert: "  ", sel: [s + 2, s + 2] } },
  { id: "unindent", name: "Avançar item (tirar recuo)", icon: "arrow-right", run: (t, s, e) => indentLines(t, s, e, true) },
  { id: "line-up", name: "Mover linha para cima", icon: "chevrons-up", run: swapLine(-1) },
  { id: "line-down", name: "Mover linha para baixo", icon: "chevron-down", run: swapLine(1) },
  { id: "delete-paragraph", name: "Apagar parágrafo", icon: "trash", run: deleteParagraph },
  { id: "link", name: "Inserir link", icon: "link", run: insertLink },
  { id: "wikilink", name: "Inserir link para nota [[ ]]", icon: "link", run: insertWikilink },
  { id: "embed", name: "Inserir incorporação ![[ ]]", icon: "file-plus", run: insertEmbed },
  { id: "tag", name: "Inserir tag", icon: "hash", run: insertTag },
  { id: "codeblock", name: "Inserir bloco de código", icon: "code", run: wrapBlock("```", "```") },
  { id: "mathblock", name: "Inserir bloco de fórmula", icon: "code", run: wrapBlock("$$", "$$") },
  { id: "callout", name: "Inserir destaque (callout)", icon: "info", run: insertBlock("> [!note] Título\n> ‸") },
  { id: "table", name: "Inserir tabela", icon: "columns", run: insertBlock("| ‸Coluna 1 | Coluna 2 |\n| --- | --- |\n|  |  |") },
  { id: "rule", name: "Inserir linha horizontal", icon: "maximize", run: insertBlock("---\n‸") },
  { id: "footnote", name: "Inserir nota de rodapé", icon: "info", run: insertFootnote },
  { id: "clear", name: "Limpar formatação", icon: "refresh", run: clearFormatting },
];

export function findEditorCommand(id) {
  return EDITOR_COMMANDS.find((c) => c.id === id) || null;
}
