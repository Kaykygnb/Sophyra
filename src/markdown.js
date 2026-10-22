// Parser de Markdown com extensões de biblioteca: frontmatter, [[wikilinks]], ![[embeds]],
// #tags, tarefas, callouts, destaques, fórmulas ($…$, $$…$$) e diagramas ```mermaid. Não depende do DOM.

import { renderMath } from "./math.js";
import { renderMermaid } from "./mermaid.js";

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Frontmatter -----------------------------------------------------------

export function parseFrontmatter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  if (!match) return { data: {}, body: source, raw: null, bodyOffset: 0 };
  const data = {};
  let key = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    const pair = /^([A-Za-z0-9_\- ]+):\s*(.*)$/.exec(line);
    if (item && key) {
      data[key] = Array.isArray(data[key]) ? data[key] : [];
      data[key].push(parseScalar(item[1]));
    } else if (pair) {
      key = pair[1].trim();
      const value = pair[2].trim();
      data[key] = value === "" ? [] : parseScalar(value);
    }
  }
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length === 0) data[k] = "";
  }
  return {
    data,
    body: source.slice(match[0].length),
    raw: match[1],
    bodyOffset: match[0].length,
  };
}

function parseScalar(value) {
  const v = value.trim();
  if (v.startsWith("[") && v.endsWith("]")) {
    return v.slice(1, -1).split(",").map((s) => stripQuotes(s.trim())).filter(Boolean);
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return stripQuotes(v);
}

function stripQuotes(s) {
  return s.replace(/^["'](.*)["']$/, "$1");
}

// --- Alvo de link -------------------------------------------------------------

// Separa "Nota#Seção", "Nota#^bloco" ou só "Nota" em partes.
export function parseLinkTarget(raw) {
  const text = String(raw ?? "").trim();
  const hash = text.indexOf("#");
  if (hash === -1) return { name: text, heading: "", block: "" };
  const name = text.slice(0, hash).trim();
  const rest = text.slice(hash + 1).trim();
  if (rest.startsWith("^")) return { name, heading: "", block: rest.slice(1) };
  return { name, heading: rest, block: "" };
}

// Destino de um link no formato [texto](destino): devolve o alvo de nota (sem .md, com #seção) ou null
// quando o endereço é externo, uma âncora da própria página ou um arquivo que não é nota.
export function internalLinkTarget(href) {
  const raw = String(href ?? "").trim();
  if (!raw || raw.startsWith("#") || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // mantém o texto como veio se o escape for inválido
  }
  const hash = decoded.indexOf("#");
  const path = hash === -1 ? decoded : decoded.slice(0, hash);
  const rest = hash === -1 ? "" : decoded.slice(hash);
  const ext = /\.([a-z0-9]+)$/i.exec(path);
  if (ext && ext[1].toLowerCase() !== "md") return null;
  return `${path.replace(/\.md$/i, "")}${rest}`;
}

// --- Inline ----------------------------------------------------------------

// `resolve(target)` decide se um link existe. Devolve { exists, href, label }.
// Estilo de cor aceito em `<span style="…">`: só `color` e `background` com valor hexadecimal. Devolve o CSS pronto ou "".
export function safeColorStyle(style) {
  const out = [];
  for (const part of String(style || "").split(";")) {
    const m = /^\s*(color|background(?:-color)?)\s*:\s*(#[0-9a-fA-F]{3,8})\s*$/.exec(part);
    if (m && ![5, 7].includes(m[2].length - 1)) out.push(`${m[1].startsWith("background") ? "background-color" : "color"}:${m[2].toLowerCase()}`);
  }
  return out.join(";");
}

export function renderInline(text, resolve = () => ({ exists: true, href: "#" })) {
  const codes = [];
  // código protegido antes de qualquer outra transformação
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  // $$…$$ no meio de um parágrafo vale como fórmula em linha (em bloco é só quando ocupa a linha inteira)
  out = out.replace(/\$\$([^$\n]+?)\$\$/g, (_, tex) => {
    codes.push(renderMath(tex));
    return `\u0000${codes.length - 1}\u0000`;
  });
  // fórmulas $…$ protegidas como o código: nada dentro delas vira link, ênfase ou tag
  out = out.replace(/(?<![\$\w])\$(?!\s)([^$\n]*?[^\s\$])\$(?![\w$])/g, (_, tex) => {
    codes.push(renderMath(tex));
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out);

  // embeds ![[nota]] e ![alt](src)
  out = out.replace(/!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target, alias) => {
    const r = resolve(target.trim());
    const label = escapeHtml((alias || target).trim());
    return `<span class="embed${r.exists ? "" : " unresolved"}" data-target="${escapeHtml(target.trim())}">${label}</span>`;
  });
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
    `<img alt="${alt}" src="${src}">`);

  // wikilinks [[alvo|apelido]], [[nota#Seção]] e [[nota#^bloco]]
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, target, alias) => {
    const t = target.trim();
    const r = resolve(t);
    const parts = parseLinkTarget(t);
    const shown = parts.heading
      ? parts.name ? `${parts.name} › ${parts.heading}` : parts.heading
      : parts.block ? `${parts.name || "esta nota"} › bloco` : parts.name || t;
    const label = alias ? alias.trim() : shown;
    const cls = r.exists ? "wikilink" : "wikilink unresolved";
    return `<a class="${cls}" data-target="${t}" href="#" title="${r.exists ? "" : "Esta nota ou seção ainda não existe"}">${label}</a>`;
  });

  // links [texto](destino): endereços externos abrem em outra aba; caminhos de nota viram links internos
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    // arquivos de disco (file:///, C:\, \\rede) não abrem: a biblioteca só abre o que está dentro dele
    if (/^(file:|[a-z]:[\\/]|\\\\)/i.test(href)) {
      return `<span class="external-blocked" title="Arquivos fora da biblioteca não são abertos. Importe-o para a biblioteca se quiser usá-lo.">${label}</span>`;
    }
    const internal = internalLinkTarget(href);
    if (internal === null) {
      const anchor = href.startsWith("#");
      return `<a href="${href}"${anchor ? "" : ' target="_blank" rel="noopener"'}>${label}</a>`;
    }
    const r = resolve(internal);
    const cls = r.exists ? "wikilink" : "wikilink unresolved";
    return `<a class="${cls}" data-target="${internal.replace(/"/g, "&quot;")}" href="#">${label}</a>`;
  });

  // cor do texto e do fundo: <span style="color:#e03131;background:#ffd43b66">…</span>
  out = out.replace(/&lt;span style=&quot;([^&]*)&quot;&gt;([\s\S]*?)&lt;\/span&gt;/g, (m, style, inner) => {
    const safe = safeColorStyle(style);
    return safe ? `<span style="${safe}">${inner}</span>` : m;
  });

  // ênfase
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  out = out.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, "$1<em>$2</em>");

  // tags #tag (não dentro de títulos já convertidos, que começam com #)
  out = out.replace(/(^|\s)#([A-Za-z0-9_\-/À-ÿ]+)/g, (_, pre, tag) =>
    `${pre}<span class="tag" data-tag="${tag}">#${tag}</span>`);

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

// --- Bloco -----------------------------------------------------------------

export function renderMarkdown(source, resolve) {
  const { body } = parseFrontmatter(source);
  const lines = body.split(/\r?\n/);
  const html = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (buf.length) html.push(`<p>${renderInline(buf.join(" "), resolve)}</p>`);
    buf.length = 0;
  };

  let para = [];
  while (i < lines.length) {
    const line = lines[i];

    // bloco de código cercado
    const fence = /^(\s*)(```|~~~)(.*)$/.exec(line);
    if (fence) {
      flushParagraph(para);
      const marker = fence[2];
      const lang = fence[3].trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(marker)) {
        code.push(lines[i]);
        i++;
      }
      i++; // fecha
      if (/^mermaid\b/i.test(lang)) {
        html.push(renderMermaid(code.join("\n")));
        continue;
      }
      if (/^(math|latex|tex)\b/i.test(lang)) {
        html.push(renderMath(code.join("\n"), { display: true }));
        continue;
      }
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      html.push(`<pre><code${cls}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(para);
      i++;
      continue;
    }

    // fórmula em bloco: $$ … $$ na mesma linha ou em várias linhas
    const oneLine = /^\s*\$\$(.+?)\$\$\s*$/.exec(line);
    if (oneLine) {
      flushParagraph(para);
      html.push(renderMath(oneLine[1], { display: true }));
      i++;
      continue;
    }
    if (/^\s*\$\$\s*$/.test(line)) {
      let j = i + 1;
      const tex = [];
      while (j < lines.length && !/^\s*\$\$\s*$/.test(lines[j])) tex.push(lines[j++]);
      if (j < lines.length) {
        flushParagraph(para);
        html.push(renderMath(tex.join("\n"), { display: true }));
        i = j + 1;
        continue;
      }
    }

    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (heading) {
      flushParagraph(para);
      const level = heading[1].length;
      html.push(`<h${level} id="${slugify(heading[2])}">${renderInline(heading[2], resolve)}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph(para);
      html.push("<hr>");
      i++;
      continue;
    }

    // callout: > [!tipo] título
    if (/^>\s*\[!([\w-]+)\]/.test(line)) {
      flushParagraph(para);
      const head = /^>\s*\[!([\w-]+)\][+-]?\s*(.*)$/.exec(line);
      const type = head[1].toLowerCase();
      const title = head[2] || head[1];
      const inner = [];
      i++;
      while (i < lines.length && /^>/.test(lines[i])) {
        inner.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const content = renderMarkdown(inner.join("\n"), resolve);
      html.push(
        `<div class="callout callout-${type}"><div class="callout-title">${renderInline(title, resolve)}</div><div class="callout-body">${content}</div></div>`,
      );
      continue;
    }

    // citação simples
    if (/^>/.test(line)) {
      flushParagraph(para);
      const quote = [];
      while (i < lines.length && /^>/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(quote.join("\n"), resolve)}</blockquote>`);
      continue;
    }

    // tabela: linha com | seguida de separador
    if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flushParagraph(para);
      const head = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : /^:-/.test(c) ? "left" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const cell = (tag, text, a) =>
        `<${tag}${a ? ` style="text-align:${a}"` : ""}>${text.split(/<br\s*\/?>/i).map((part) => renderInline(part, resolve)).join("<br>")}</${tag}>`;
      html.push(
        `<table><thead><tr>${head.map((c, k) => cell("th", c, align[k])).join("")}</tr></thead><tbody>${rows
          .map((r) => `<tr>${r.map((c, k) => cell("td", c, align[k])).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }

    // índice: <!-- toc --> vira a lista dos títulos da nota
    if (/^\s*<!--\s*toc\s*-->\s*$/i.test(line)) {
      flushParagraph(para);
      html.push(renderToc(lines));
      i++;
      continue;
    }
    // favorito: um endereço sozinho entre < >
    const bm = /^\s*<(https?:\/\/[^>\s]+)>\s*$/i.exec(line);
    if (bm) {
      flushParagraph(para);
      let host = bm[1];
      try {
        host = new URL(bm[1]).hostname;
      } catch {
        /* mantém o endereço */
      }
      html.push(`<a class="bookmark" href="${escapeHtml(bm[1])}" target="_blank" rel="noopener"><strong>${escapeHtml(host)}</strong><small>${escapeHtml(bm[1])}</small></a>`);
      i++;
      continue;
    }

    // toggle: <details> com <summary>, com o conteúdo lido como Markdown
    const det = /^\s*<details(\s+open)?\s*>\s*$/i.exec(line);
    if (det) {
      let depth = 1;
      let j = i + 1;
      const inner = [];
      for (; j < lines.length; j++) {
        if (/^\s*<details(\s+open)?\s*>\s*$/i.test(lines[j])) depth++;
        else if (/^\s*<\/details>\s*$/i.test(lines[j]) && --depth === 0) break;
        inner.push(lines[j]);
      }
      if (j < lines.length) {
        flushParagraph(para);
        const sum = inner.length ? /^\s*<summary>(.*)<\/summary>\s*$/i.exec(inner[0]) : null;
        if (sum) inner.shift();
        const th = sum ? /^(#{1,3})\s+(.*)$/.exec(sum[1].trim()) : null; // título recolhível
        const label = th ? th[2] : sum ? sum[1] : "Detalhes";
        html.push(`<details${det[1] ? " open" : ""}><summary${th ? ` class="sum-h${th[1].length}"` : ""}>${renderInline(label, resolve)}</summary>${renderMarkdown(inner.join("\n"), resolve)}</details>`);
        i = j + 1;
        continue;
      }
    }

    // listas (incluindo tarefas), com itens aninhados pelo recuo
    const itemRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    if (itemRe.test(line)) {
      flushParagraph(para);
      const items = [];
      while (i < lines.length) {
        const m = itemRe.exec(lines[i]);
        if (!m) break;
        items.push({ indent: m[1].replace(/\t/g, "    ").length, ordered: /\d/.test(m[2]), text: m[3], line: i });
        i++;
      }
      html.push(renderListTree(items, resolve));
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushParagraph(para);
  return html.join("\n");
}

// Índice dos títulos (# a ###### e <summary>## …</summary>) das linhas dadas, fora de blocos de código.
function renderToc(lines) {
  const items = [];
  let fence = false;
  for (const l of lines) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (fence) continue;
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(l) || /^\s*<summary>(#{1,3})\s+(.*)<\/summary>\s*$/i.exec(l);
    if (h) items.push({ level: h[1].length, text: h[2] });
  }
  if (!items.length) return `<nav class="toc"><em>Sem títulos nesta nota.</em></nav>`;
  const min = Math.min(...items.map((x) => x.level));
  return `<nav class="toc">${items.map((x) => `<a class="toc-l${x.level - min}" href="#${slugify(x.text)}">${renderInline(x.text)}</a>`).join("")}</nav>`;
}

// Monta as listas (e as listas dentro de itens) a partir dos itens com recuo. Itens seguidos do mesmo tipo ficam na mesma lista.
function renderListTree(items, resolve) {
  const root = { children: [] };
  const stack = [{ indent: -1, node: root }];
  for (const it of items) {
    while (stack.length > 1 && stack[stack.length - 1].indent >= it.indent) stack.pop();
    const node = { it, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ indent: it.indent, node });
  }
  const li = (n) => {
    const task = /^\[([ xX])\]\s+(.*)$/.exec(n.it.text);
    const inner = n.children.length ? renderLevel(n.children) : "";
    if (task) {
      const done = task[1].toLowerCase() === "x";
      return `<li class="task${done ? " done" : ""}"><input type="checkbox" data-task="${n.it.line}" ${done ? "checked" : ""}> ${renderInline(task[2], resolve)}${inner}</li>`;
    }
    return `<li>${renderInline(n.it.text, resolve)}${inner}</li>`;
  };
  const renderLevel = (nodes) => {
    const parts = [];
    for (let a = 0; a < nodes.length; ) {
      let b = a;
      while (b < nodes.length && nodes[b].it.ordered === nodes[a].it.ordered) b++;
      const tag = nodes[a].it.ordered ? "ol" : "ul";
      parts.push(`<${tag}>${nodes.slice(a, b).map(li).join("")}</${tag}>`);
      a = b;
    }
    return parts.join("");
  };
  return renderLevel(root.children);
}

// Células de uma linha de tabela: separa nos | sem barra antes (`\|` fica dentro da célula, sem a barra).
function splitRow(line) {
  const s = line.trim();
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cur);
      cur = "";
    } else cur += s[i];
  }
  cells.push(cur);
  if (s.startsWith("|")) cells.shift();
  if (s.endsWith("|") && !s.endsWith("\\|") && cells.length) cells.pop();
  return cells.map((c) => c.trim());
}

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// --- Metadados ------------------------------------------------------------

// Extrai fatos da nota para o índice: títulos, links, embeds, tags e tarefas.
export function extractMetadata(source) {
  const { data, body, bodyOffset } = parseFrontmatter(source);
  const headings = [];
  const links = [];
  const embeds = [];
  const tags = new Set();
  const tasks = [];
  const lines = body.split(/\r?\n/);
  let inFence = false;
  const lineStart = (n) => bodyOffset + lines.slice(0, n).reduce((acc, l) => acc + l.length + 1, 0);

  // tags do frontmatter
  const fmTags = data.tags;
  if (Array.isArray(fmTags)) fmTags.forEach((t) => tags.add(String(t).replace(/^#/, "")));
  else if (typeof fmTags === "string" && fmTags) tags.add(fmTags.replace(/^#/, ""));

  let inMath = false;
  lines.forEach((line, n) => {
    if (/^(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    if (/^\s*\$\$\s*$/.test(line)) {
      inMath = !inMath;
      return;
    }
    if (inMath || /^\s*\$\$.+\$\$\s*$/.test(line)) return;
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(line);
    if (h) headings.push({ level: h[1].length, text: h[2], line: n, offset: lineStart(n) });
    // código inline não conta como link, tag nem tarefa
    const visible = line.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(visible);
    if (task) tasks.push({ done: task[1].toLowerCase() === "x", text: line.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, ""), line: n });
    for (const m of visible.matchAll(/(!?)\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const target = m[2].trim();
      if (m[1]) embeds.push({ target, line: n });
      else links.push({ target, line: n });
    }
    for (const m of visible.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = internalLinkTarget(m[1]);
      if (target) links.push({ target, line: n });
    }
    for (const m of visible.matchAll(/(?:^|\s)#([A-Za-z0-9_\-/À-ÿ]+)/g)) {
      if (!/^\s*#{1,6}\s/.test(line)) tags.add(m[1]);
    }
  });

  return { frontmatter: data, headings, links, embeds, tags: [...tags].sort(), tasks };
}

// Aponta problemas no frontmatter sem alterar o texto. A leitura (parseFrontmatter) continua tolerante; isto só explica
// à pessoa o que ficou de fora. Cada item: { line (1-based, no arquivo), message }.
export function diagnoseFrontmatter(source) {
  const text = String(source ?? "");
  if (!/^---\r?\n/.test(text)) return [];
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return [{ line: 1, message: "O frontmatter abre com --- mas não é fechado por outra linha ---, então não foi lido." }];
  const issues = [];
  const seen = new Map();
  let hasKey = false;
  match[1].split(/\r?\n/).forEach((line, i) => {
    const n = i + 2;
    if (line.trim() === "" || /^\s*#/.test(line)) return;
    const pair = /^([A-Za-z0-9_\- ]+):\s*(.*)$/.exec(line);
    if (pair) {
      hasKey = true;
      const key = pair[1].trim();
      if (seen.has(key)) issues.push({ line: n, message: `A propriedade “${key}” aparece de novo (a primeira está na linha ${seen.get(key)}).` });
      else seen.set(key, n);
      const v = pair[2].trim();
      if ((v.startsWith("[") && !v.endsWith("]")) || (!v.startsWith("[") && v.endsWith("]") && v.includes("["))) {
        issues.push({ line: n, message: `Faltou fechar ou abrir o colchete em “${key}”.` });
      }
      const quotes = (v.match(/"/g) || []).length;
      if (quotes % 2 === 1) issues.push({ line: n, message: `Aspas sem par em “${key}”.` });
      return;
    }
    if (/^\s*-\s+/.test(line)) {
      if (!hasKey) issues.push({ line: n, message: "Item de lista sem uma propriedade antes dele." });
      return;
    }
    if (/^\s+\S/.test(line) && hasKey) return; // continuação indentada
    issues.push({ line: n, message: `Esta linha não segue o formato “chave: valor”: ${line.trim().slice(0, 40)}` });
  });
  return issues;
}
