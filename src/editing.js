// Ajudas de edição do textarea, sem DOM. Cada função devolve uma edição { from, to, insert, sel: [início, fim] }
// (posições no texto ANTES da edição, sel no texto DEPOIS) ou null para deixar o navegador agir sozinho.

const LIST_RE = /^(\s*)([-*+]|(\d+)\.)(\s+)(\[[ xX]\]\s+)?/;
const QUOTE_RE = /^(\s*(?:>\s?)+)/;

function lineBounds(text, pos) {
  const from = text.lastIndexOf("\n", pos - 1) + 1;
  let to = text.indexOf("\n", pos);
  if (to === -1) to = text.length;
  return { from, to };
}

// Enter dentro de uma lista, tarefa ou citação: continua o marcador; em item vazio, termina a lista.
export function onEnter(text, start, end) {
  if (start !== end) return null;
  const { from, to } = lineBounds(text, start);
  const line = text.slice(from, to);
  const rel = start - from;

  const list = LIST_RE.exec(line);
  if (list && rel >= list[0].length) {
    const rest = line.slice(list[0].length);
    if (rest.trim() === "" && start === to) {
      // item vazio: tira o marcador e sai da lista
      return { from, to, insert: "", sel: [from, from] };
    }
    const indent = list[1];
    const ordered = list[3] !== undefined;
    const marker = ordered ? `${Number(list[3]) + 1}.` : list[2];
    const task = list[5] ? "[ ] " : "";
    const insert = `\n${indent}${marker}${list[4]}${task}`;
    return { from: start, to: start, insert, sel: [start + insert.length, start + insert.length] };
  }

  const quote = QUOTE_RE.exec(line);
  if (quote && rel >= quote[0].length) {
    const rest = line.slice(quote[0].length);
    if (rest.trim() === "" && start === to) return { from, to, insert: "", sel: [from, from] };
    const insert = `\n${quote[1]}`;
    return { from: start, to: start, insert, sel: [start + insert.length, start + insert.length] };
  }
  return null;
}

const PAIRS = { "(": ")", "[": "]", "{": "}", '"': '"', "`": "`" };
const WRAPS = { ...PAIRS, "*": "*", _: "_", "~": "~", "=": "=" };
const CLOSERS = new Set(Object.values(PAIRS));

// Caractere digitado: envolve a seleção, abre pares e pula o fecho que já está lá.
export function onChar(text, start, end, key) {
  if (key.length !== 1) return null;
  if (start !== end) {
    const close = WRAPS[key];
    if (!close) return null;
    const selected = text.slice(start, end);
    return { from: start, to: end, insert: key + selected + close, sel: [start + 1, start + 1 + selected.length] };
  }
  const next = text[start] ?? "";
  const prev = text[start - 1] ?? "";
  if (CLOSERS.has(key) && next === key) return { from: start, to: start, insert: "", sel: [start + 1, start + 1], skip: true };
  const close = PAIRS[key];
  if (!close) return null;
  // aspas e crase só em par quando não estão dentro de uma palavra (apóstrofo, 5" etc.) e o que vem depois é espaço ou fecho
  if ((key === '"' || key === "`") && (/\w/.test(prev) || (next && !/[\s)\]}.,;:!?]/.test(next)))) return null;
  if (next && /\w/.test(next)) return null;
  return { from: start, to: start, insert: key + close, sel: [start + 1, start + 1] };
}

// Backspace entre um par vazio apaga os dois lados: ( | ) → |
export function onBackspace(text, start, end) {
  if (start !== end || start === 0) return null;
  const a = text[start - 1];
  const b = text[start];
  if (PAIRS[a] && PAIRS[a] === b) return { from: start - 1, to: start + 1, insert: "", sel: [start - 1, start - 1] };
  return null;
}

// Tab e Shift+Tab em listas e várias linhas: recua ou avança duas casas.
export function indentLines(text, start, end, outdent = false) {
  const first = lineBounds(text, start).from;
  const last = lineBounds(text, end > start && text[end - 1] === "\n" ? end - 1 : end).to;
  const lines = text.slice(first, last).split("\n");
  const multi = lines.length > 1 || start !== end;
  const list = LIST_RE.test(lines[0]);
  if (!outdent && !multi && !list) return null;
  const next = lines.map((l) => (outdent ? l.replace(/^( {1,2}|\t)/, "") : `  ${l}`));
  const insert = next.join("\n");
  const delta = insert.length - (last - first);
  const firstDelta = next[0].length - lines[0].length;
  return { from: first, to: last, insert, sel: [Math.max(first, start + firstDelta), end + delta] };
}
