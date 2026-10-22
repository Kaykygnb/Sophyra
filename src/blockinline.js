// Texto dentro de um bloco: Markdown em linha ⇄ HTML editável. `inlineToHtml` desenha o que a pessoa vê (negrito de
// verdade, links, tags, fórmulas); `htmlToInline` lê o HTML de volta para Markdown depois de uma edição. Trechos que não
// dá para editar letra a letra (fórmula, [[link]], embed, imagem) viram "peças" com o Markdown original guardado em
// `data-md`, então nada se perde no caminho de ida e volta.

import { escapeHtml, safeColorStyle } from "./markdown.js";
import { renderMath } from "./math.js";

const TAG = /^#([A-Za-z0-9_\-/À-ÿ]+)/;

function chip(cls, md, inner, extra = "") {
  return `<span class="bk-chip ${cls}" contenteditable="false" data-md="${escapeHtml(md)}"${extra}>${inner}</span>`;
}

// `ctx.exists(alvo)` diz se um [[link]] aponta para uma nota que existe (para marcar os quebrados).
export function inlineToHtml(text, ctx = {}) {
  const exists = ctx.exists || (() => true);
  const s = String(text ?? "");
  let out = "";
  let i = 0;
  let plain = "";
  const flush = () => {
    if (plain) out += escapeHtml(plain).replace(/\n/g, "<br>");
    plain = "";
  };
  while (i < s.length) {
    const rest = s.slice(i);
    const prev = i === 0 ? "" : s[i - 1];
    let m;
    if ((m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest))) {
      flush();
      out += `<code>${escapeHtml(m[2].replace(/^ (.*) $/, "$1"))}</code>`;
      i += m[0].length;
    } else if ((m = /^\$\$([^$\n]+?)\$\$/.exec(rest)) || (!/[\w$]/.test(prev) && (m = /^\$(?!\s)([^$\n]*?[^\s$])\$(?![\w$])/.exec(rest)))) {
      flush();
      out += chip("bk-math", m[0], renderMath(m[1]));
      i += m[0].length;
    } else if ((m = /^!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(rest))) {
      flush();
      out += chip("bk-embed", m[0], escapeHtml((m[2] || m[1]).trim()));
      i += m[0].length;
    } else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest))) {
      flush();
      out += chip("bk-embed", m[0], escapeHtml(m[1] || m[2]));
      i += m[0].length;
    } else if ((m = /^<time datetime="(\d{4}-\d{2}-\d{2})">([^<]*)<\/time>/.exec(rest))) {
      flush();
      out += chip("bk-date", m[0], escapeHtml(m[2] || m[1]), ` data-date="${m[1]}"`);
      i += m[0].length;
    } else if ((m = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/.exec(rest))) {
      flush();
      const target = m[1].trim();
      const label = (m[2] || target).trim();
      out += `<a class="wikilink bk-chip${exists(target) ? "" : " unresolved"}" contenteditable="false" data-md="${escapeHtml(m[0])}" data-target="${escapeHtml(target)}" href="#">${escapeHtml(label)}</a>`;
      i += m[0].length;
    } else if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest))) {
      flush();
      out += `<a class="bk-a" href="${escapeHtml(m[2])}">${inlineToHtml(m[1], ctx)}</a>`;
      i += m[0].length;
    } else if ((m = /^<span style="([^"]*)">([\s\S]*?)<\/span>/.exec(rest)) && safeColorStyle(m[1])) {
      flush();
      out += `<span style="${safeColorStyle(m[1])}">${inlineToHtml(m[2], ctx)}</span>`;
      i += m[0].length;
    } else if ((m = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(rest))) {
      flush();
      out += `<strong>${inlineToHtml(m[1], ctx)}</strong>`;
      i += m[0].length;
    } else if ((m = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest))) {
      flush();
      out += `<del>${inlineToHtml(m[1], ctx)}</del>`;
      i += m[0].length;
    } else if ((m = /^==(?=\S)([\s\S]*?\S)==/.exec(rest))) {
      flush();
      out += `<mark>${inlineToHtml(m[1], ctx)}</mark>`;
      i += m[0].length;
    } else if (!/[*\w]/.test(prev) && (m = /^\*(?=[^\s*])([^*]*?[^\s*])\*(?!\*)/.exec(rest))) {
      flush();
      out += `<em>${inlineToHtml(m[1], ctx)}</em>`;
      i += m[0].length;
    } else if (!/[_\w]/.test(prev) && (m = /^_(?=[^\s_])([^_]*?[^\s_])_(?![\w_])/.exec(rest))) {
      flush();
      out += `<em>${inlineToHtml(m[1], ctx)}</em>`;
      i += m[0].length;
    } else if ((prev === "" || /\s/.test(prev)) && (m = TAG.exec(rest))) {
      flush();
      out += `<span class="tag" data-tag="${escapeHtml(m[1])}">#${escapeHtml(m[1])}</span>`;
      i += m[0].length;
    } else {
      plain += s[i];
      i++;
    }
  }
  flush();
  return out;
}

// --- HTML → Markdown --------------------------------------------------------------------------------------------------------

function wrap(marker, inner) {
  if (inner.trim() === "") return inner;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
}

// `rgb(224, 49, 49)` ou `rgba(…, .4)` → `#e03131` / `#e0313166`; hexadecimais passam; o resto (nome de cor, var()) fica de fora.
export function toHex(value) {
  const v = String(value || "").trim();
  if (/^#[0-9a-f]{3}$|^#[0-9a-f]{4}$|^#[0-9a-f]{6}$|^#[0-9a-f]{8}$/i.test(v)) return v.toLowerCase();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(v);
  if (!m) return "";
  const h = (n) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, "0");
  let alpha = "";
  if (m[4] !== undefined) {
    const a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (a < 1) alpha = h(Math.round(a * 255));
  }
  return `#${h(m[1])}${h(m[2])}${h(m[3])}${alpha}`;
}

// Cores de um elemento (atributo style ou, no <font>, `color`), já em hexadecimal.
function colorsOf(node) {
  const style = (node.getAttribute && node.getAttribute("style")) || "";
  const font = node.getAttribute && node.getAttribute("color");
  const c = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style);
  const b = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style);
  const color = toHex(c ? c[1] : font || "");
  const bg = toHex(b ? b[1] : "");
  return [color && `color:${color}`, bg && `background:${bg}`].filter(Boolean).join(";");
}

function codeSpan(text) {
  if (text === "") return "";
  const fence = text.includes("`") ? "``" : "`";
  return `${fence}${text.startsWith("`") || text.endsWith("`") ? ` ${text} ` : text}${fence}`;
}

function nodeToInline(node, first = true) {
  if (node.nodeType === 3) return String(node.nodeValue ?? "").replace(/ /g, " ").replace(/​/g, "");
  if (node.nodeType !== 1) return "";
  const md = node.getAttribute ? node.getAttribute("data-md") : null;
  if (md !== null && md !== undefined) return md;
  const tag = String(node.nodeName).toLowerCase();
  const kids = Array.from(node.childNodes || []);
  const inner = () => kids.map((k, idx) => nodeToInline(k, idx === 0)).join("");
  switch (tag) {
    case "br":
      return "\n";
    case "strong":
    case "b":
      return wrap("**", inner());
    case "em":
    case "i":
      return wrap("*", inner());
    case "del":
    case "s":
    case "strike":
      return wrap("~~", inner());
    case "mark":
      return wrap("==", inner());
    case "span":
    case "font": {
      const st = colorsOf(node);
      const text = inner();
      if (!st || text.trim() === "") return text;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
      return `${m[1]}<span style="${st}">${m[2]}</span>${m[3]}`;
    }
    case "code":
      return codeSpan(String(node.textContent ?? ""));
    case "a": {
      const href = node.getAttribute ? node.getAttribute("href") : null;
      const label = inner();
      if (!href || href === "#" || label.trim() === "") return label;
      return `[${label}](${href})`;
    }
    case "div":
    case "p":
      return `${first ? "" : "\n"}${inner()}`;
    default:
      return inner();
  }
}

// Lê o conteúdo de um elemento editável (os filhos dele) e devolve o Markdown em linha.
export function htmlToInline(root) {
  return Array.from(root.childNodes || []).map((k, i) => nodeToInline(k, i === 0)).join("");
}
