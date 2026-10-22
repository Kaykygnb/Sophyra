// Busca e troca dentro do texto do editor (editor:open-search e editor:open-search-replace do original). Funções puras.

const MAX_MATCHES = 5000;

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Monta a expressão. `regex` usa o texto como expressão regular; sem ele, o texto é literal. Devolve { re } ou { error }.
export function buildPattern(query, { caseSensitive = false, regex = false, wholeWord = false } = {}) {
  if (!query) return { re: null };
  let source = regex ? query : escapeRe(query);
  if (wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`;
  try {
    const re = new RegExp(source, `g${caseSensitive ? "" : "i"}u`);
    if (re.test("")) return { error: "A expressão casa com texto vazio; escreva algo mais específico." };
    re.lastIndex = 0;
    return { re };
  } catch (err) {
    const reason = String(err.message).split(": ").pop(); // "Invalid regular expression: /(/u: Unterminated group" → "Unterminated group"
    const pt = { "Unterminated group": "falta fechar um parêntese", "Unmatched ')'": "parêntese fechado sem abrir", "Nothing to repeat": "nada para repetir antes do quantificador", "Unterminated character class": "falta fechar o colchete" }[reason];
    return { error: `Expressão inválida: ${pt || reason}` };
  }
}

// Todas as ocorrências como [{ start, end }], no máximo MAX_MATCHES.
export function findAll(text, query, options = {}) {
  const { re, error } = buildPattern(query, options);
  if (error) return { matches: [], error };
  if (!re) return { matches: [] };
  const matches = [];
  for (const m of text.matchAll(re)) {
    if (m[0].length === 0) continue;
    matches.push({ start: m.index, end: m.index + m[0].length });
    if (matches.length >= MAX_MATCHES) break;
  }
  return { matches, capped: matches.length >= MAX_MATCHES };
}

// Índice da próxima ocorrência a partir de `from` (dá a volta no fim do texto). -1 se não há.
export function nextMatch(matches, from, dir = 1) {
  if (!matches.length) return -1;
  if (dir >= 0) {
    const i = matches.findIndex((m) => m.start >= from);
    return i === -1 ? 0 : i;
  }
  for (let i = matches.length - 1; i >= 0; i--) if (matches[i].end <= from) return i;
  return matches.length - 1;
}

// Troca uma ocorrência. Em modo regex, $1, $2… do texto de troca valem. Devolve uma edição { from, to, insert, sel }.
export function replaceOne(text, match, query, replacement, options = {}) {
  const { re } = buildPattern(query, options);
  const found = text.slice(match.start, match.end);
  const insert = options.regex && re ? found.replace(new RegExp(re.source, re.flags.replace("g", "")), replacement) : replacement;
  return { from: match.start, to: match.end, insert, sel: [match.start + insert.length, match.start + insert.length] };
}

// Troca tudo de uma vez. Devolve { text, count }.
export function replaceAll(text, query, replacement, options = {}) {
  const { re, error } = buildPattern(query, options);
  if (error || !re) return { text, count: 0, error };
  let count = 0;
  const out = text.replace(re, (...args) => {
    count++;
    if (!options.regex) return replacement;
    const groups = args.slice(1, args.findIndex((a) => typeof a === "number"));
    return replacement.replace(/\$(\d+|&)/g, (_, g) => (g === "&" ? args[0] : groups[Number(g) - 1] ?? ""));
  });
  return { text: out, count };
}
