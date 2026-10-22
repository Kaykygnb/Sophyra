// Destaque de sintaxe do Markdown para o editor. Devolve HTML com <span class="hl-…"> e o MESMO texto do original
// (só escapado): nenhum caractere é acrescentado ou removido, para a camada colorida ficar alinhada ao textarea.
// Sem DOM.

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls, text) => `<span class="hl-${cls}">${esc(text)}</span>`;

// Ordem importa: o primeiro que casa em cada posição vence.
const INLINE = [
  ["code", /`[^`\n]+`/y],
  ["math", /(?<![\\$\w])\$(?!\s)[^$\n]*?[^\s\\$]\$(?![\w$])/y],
  ["embed", /!\[\[[^\]\n]*\]\]/y],
  ["wikilink", /\[\[[^\]\n]*\]\]/y],
  ["link", /!?\[[^\]\n]*\]\([^)\s]*\)/y],
  ["bold", /\*\*[^*\n]+\*\*/y],
  ["strike", /~~[^~\n]+~~/y],
  ["mark", /==[^=\n]+==/y],
  ["italic", /\*[^*\s][^*\n]*\*|(?<![\w_])_[^_\s][^_\n]*_(?![\w_])/y],
  ["tag", /#[A-Za-z0-9_\-/À-ÿ]+/y],
];

function inline(text) {
  let out = "";
  let plain = "";
  let i = 0;
  const flush = () => {
    out += esc(plain);
    plain = "";
  };
  while (i < text.length) {
    let hit = null;
    // tag só vale no começo ou depois de espaço
    for (const [cls, re] of INLINE) {
      if (cls === "tag" && i > 0 && !/\s/.test(text[i - 1])) continue;
      re.lastIndex = i;
      const m = re.exec(text);
      if (m) {
        hit = [cls, m[0]];
        break;
      }
    }
    if (hit) {
      flush();
      out += span(hit[0], hit[1]);
      i += hit[1].length;
    } else {
      plain += text[i++];
    }
  }
  flush();
  return out;
}

export function highlightLine(line, state = { fence: null, frontmatter: false }) {
  // bloco de código cercado
  const fence = /^\s*(```|~~~)/.exec(line);
  if (state.fence) {
    if (fence && fence[1] === state.fence) state.fence = null;
    return span("fence", line);
  }
  if (fence) {
    state.fence = fence[1];
    return span("fence", line);
  }
  // frontmatter
  if (state.frontmatter) {
    if (/^---\s*$/.test(line)) {
      state.frontmatter = false;
      return span("fm-mark", line);
    }
    const kv = /^([A-Za-z0-9_\- ]+):(.*)$/.exec(line);
    return kv ? `${span("fm-key", `${kv[1]}:`)}${span("fm-value", kv[2])}` : span("fm-value", line);
  }
  const heading = /^(#{1,6})(\s.*)?$/.exec(line);
  if (heading && (heading[2] !== undefined || line.length <= 6)) return `<span class="hl-h hl-h${heading[1].length}">${esc(heading[1])}${inline(heading[2] || "")}</span>`;
  if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) return span("hr", line);
  const quote = /^(\s*>+\s?)(.*)$/.exec(line);
  if (quote) return `${span("quote-mark", quote[1])}<span class="hl-quote">${inline(quote[2])}</span>`;
  const list = /^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s+)?(.*)$/.exec(line);
  if (list) {
    const done = list[4] && /\[[xX]\]/.test(list[4]);
    return `${esc(list[1])}${span("list", list[2])}${esc(list[3])}${list[4] ? span(done ? "task-done" : "task", list[4]) : ""}${done ? `<span class="hl-done-text">${inline(list[5])}</span>` : inline(list[5])}`;
  }
  return inline(line);
}

export function highlightMarkdown(source) {
  const lines = String(source ?? "").split("\n");
  const state = { fence: null, frontmatter: lines[0]?.trim() === "---" && lines.slice(1).some((l) => /^---\s*$/.test(l)) };
  const first = state.frontmatter;
  return lines
    .map((line, i) => {
      if (first && i === 0) return span("fm-mark", line);
      const clean = line.endsWith("\r") ? line.slice(0, -1) : line;
      const html = highlightLine(clean, state);
      return clean === line ? html : `${html}\r`;
    })
    .join("\n");
}
