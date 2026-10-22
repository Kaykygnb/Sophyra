// Diagramas Mermaid desenhados localmente, sem biblioteca nem rede. Suporta um subconjunto:
//   - fluxogramas: graph/flowchart TD|TB|BT|LR|RL, formas [] () ([]) (()) {} [[]], setas --> --- -.-> ==>, rótulos
//   - diagramas de sequência: participant/actor, ->> -->> -> --> -) -x, Note over/left of/right of
// Qualquer outro tipo (pizza, gantt, classes…) vira um aviso com o código, em vez de quebrar a nota.

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const CHAR_W = 7.4;
const textWidth = (s) => Math.max(...String(s).split(/\n/).map((l) => l.length), 1) * CHAR_W;

function cleanLabel(raw) {
  return String(raw)
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&quot;/g, '"');
}

// --- Fluxograma ------------------------------------------------------------------------------

const NODE_RE = /^\s*([A-Za-z0-9_À-￿]+)\s*(\(\[|\(\(|\[\[|\[|\(|\{)?/;
const SHAPES = {
  "[": { close: "]", shape: "rect" }, "(": { close: ")", shape: "round" }, "{": { close: "}", shape: "diamond" },
  "([": { close: "])", shape: "stadium" }, "((": { close: "))", shape: "circle" }, "[[": { close: "]]", shape: "sub" },
};
const EDGE_RE = /^\s*(?:(<?-->|<?---|-\.->|-\.-|<?==>|===|--[ox]|~~~)(?:\|([^|]*)\|)?|(--|==|-\.)\s+([^<>=\n]*?)\s+(-->|---|==>|===|\.->|\.-)(?:\|([^|]*)\|)?)/;

export function parseFlowchart(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/%%.*$/, "").trim()).filter(Boolean);
  const head = /^(?:graph|flowchart)\s*(TD|TB|BT|LR|RL)?/i.exec(lines[0] || "");
  if (!head) throw new Error("Cabeçalho de fluxograma ausente");
  const dir = (head[1] || "TD").toUpperCase() === "TB" ? "TD" : (head[1] || "TD").toUpperCase();
  const nodes = new Map();
  const edges = [];

  const touch = (id, label, shape) => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: id, shape: "rect", order: nodes.size };
      nodes.set(id, n);
    }
    if (label != null) {
      n.label = cleanLabel(label);
      n.shape = shape;
    }
    return n;
  };

  const readNode = (s) => {
    const m = NODE_RE.exec(s);
    if (!m) return null;
    let rest = s.slice(m[0].length);
    let label = null;
    let shape = "rect";
    if (m[2]) {
      const def = SHAPES[m[2]];
      const end = rest.indexOf(def.close);
      if (end === -1) throw new Error(`Falta fechar ${def.close} no nó ${m[1]}`);
      label = rest.slice(0, end);
      shape = def.shape;
      rest = rest.slice(end + def.close.length);
    }
    return { id: m[1], label, shape, rest };
  };

  for (const rawLine of lines.slice(1)) {
    if (/^(subgraph|end|direction|classDef|class|style|linkStyle|click)\b/i.test(rawLine)) continue;
    for (const stmt of rawLine.split(";")) {
      let rest = stmt.trim();
      if (!rest) continue;
      let prev = readNode(rest);
      if (!prev) continue;
      touch(prev.id, prev.label, prev.shape);
      rest = prev.rest;
      while (rest.trim()) {
        const e = EDGE_RE.exec(rest);
        if (!e) break;
        const arrow = e[1] || e[5];
        const label = cleanLabel(e[2] ?? e[4] ?? e[6] ?? "");
        rest = rest.slice(e[0].length);
        const target = readNode(rest);
        if (!target) throw new Error(`Falta o nó depois da seta em: ${stmt.trim()}`);
        touch(target.id, target.label, target.shape);
        edges.push({
          from: prev.id, to: target.id, label,
          dashed: /\./.test(arrow), thick: /=/.test(arrow), arrow: />$/.test(arrow),
        });
        rest = target.rest;
        prev = target;
      }
    }
  }
  if (nodes.size === 0) throw new Error("Fluxograma sem nós");
  return { dir, nodes: [...nodes.values()], edges };
}

function layoutFlow(model) {
  const { nodes, edges } = model;
  const out = new Map(nodes.map((n) => [n.id, []]));
  const state = new Map();
  const forward = [];
  // ignora arestas que voltam (ciclos) ao calcular as camadas
  const visit = (id) => {
    state.set(id, 1);
    for (const e of edges.filter((x) => x.from === id)) {
      if (state.get(e.to) === 1) continue;
      forward.push(e);
      if (!state.get(e.to)) visit(e.to);
    }
    state.set(id, 2);
  };
  for (const n of nodes) if (!state.get(n.id)) visit(n.id);
  for (const e of forward) out.get(e.from).push(e.to);
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const e of forward) {
      if (layer.get(e.to) < layer.get(e.from) + 1) {
        layer.set(e.to, layer.get(e.from) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const depth = Math.max(...layer.values());
  const rows = Array.from({ length: depth + 1 }, () => []);
  for (const n of nodes) {
    n.layer = layer.get(n.id);
    rows[n.layer].push(n);
  }
  // uma passada de ordenação pela posição média dos pais
  for (let r = 1; r <= depth; r++) {
    const pos = new Map(rows[r - 1].map((n, i) => [n.id, i]));
    const score = (n) => {
      const parents = forward.filter((e) => e.to === n.id && pos.has(e.from)).map((e) => pos.get(e.from));
      return parents.length ? parents.reduce((a, b) => a + b, 0) / parents.length : n.order;
    };
    rows[r].sort((a, b) => score(a) - score(b) || a.order - b.order);
  }

  const horizontal = model.dir === "LR" || model.dir === "RL";
  for (const n of nodes) {
    if (n.fixed) continue; // caixas com tamanho próprio (diagrama de classes)
    if (n.shape === "start" || n.shape === "end") {
      n.w = n.h = 26;
      continue;
    }
    const lines = n.label.split("\n");
    n.w = Math.max(64, textWidth(n.label) + 28) + (n.shape === "diamond" ? 40 : 0);
    n.h = Math.max(38, lines.length * 18 + 16) + (n.shape === "diamond" ? 18 : 0);
    if (n.shape === "circle") n.w = n.h = Math.max(n.w * 0.8, n.h, 56);
  }
  const gapMain = 56;
  const gapCross = 36;
  let cursor = 0;
  const pad = 24;
  const sizes = rows.map((row) => ({
    main: Math.max(...row.map((n) => (horizontal ? n.w : n.h))),
    cross: row.reduce((a, n) => a + (horizontal ? n.h : n.w), 0) + gapCross * (row.length - 1),
  }));
  const maxCross = Math.max(...sizes.map((s) => s.cross));
  rows.forEach((row, r) => {
    let c = (maxCross - sizes[r].cross) / 2;
    for (const n of row) {
      const mainPos = cursor + (sizes[r].main - (horizontal ? n.w : n.h)) / 2;
      n.x = pad + (horizontal ? mainPos : c);
      n.y = pad + (horizontal ? c : mainPos);
      c += (horizontal ? n.h : n.w) + gapCross;
    }
    cursor += sizes[r].main + gapMain;
  });
  const total = cursor - gapMain;
  let width = pad * 2 + (horizontal ? total : maxCross);
  let height = pad * 2 + (horizontal ? maxCross : total);
  if (model.dir === "BT") for (const n of nodes) n.y = height - n.y - n.h;
  if (model.dir === "RL") for (const n of nodes) n.x = width - n.x - n.w;
  // espaço extra para as setas que voltam, que contornam o desenho pelo lado
  if (edges.some((e) => e.from !== e.to && layer.get(e.to) <= layer.get(e.from))) {
    if (horizontal) height += 60;
    else width += 60;
  }
  width = Math.max(width, 120);
  height = Math.max(height, 80);
  return { width, height };
}

function borderPoint(n, toward) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = toward.x + toward.w / 2 - cx;
  const dy = toward.y + toward.h / 2 - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : n.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : n.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

function shapeSvg(n) {
  const { x, y, w, h } = n;
  const common = 'class="m-node"';
  if (n.shape === "diamond") return `<polygon ${common} points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}"/>`;
  if (n.shape === "circle") return `<ellipse ${common} cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}"/>`;
  if (n.shape === "start") return `<circle class="m-start" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 3}"/>`;
  if (n.shape === "end") return `<circle class="m-node" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 1}"/><circle class="m-start" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2 - 7}"/>`;
  const r = n.shape === "stadium" ? h / 2 : n.shape === "round" ? 10 : 6;
  const extra = n.shape === "sub" ? `<line class="m-sub" x1="${x + 8}" y1="${y}" x2="${x + 8}" y2="${y + h}"/><line class="m-sub" x1="${x + w - 8}" y1="${y}" x2="${x + w - 8}" y2="${y + h}"/>` : "";
  return `<rect ${common} x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>${extra}`;
}

function textSvg(label, cx, cy, cls = "m-text") {
  const lines = label.split("\n");
  const top = cy - ((lines.length - 1) * 16) / 2;
  return lines.map((l, i) => `<text class="${cls}" x="${cx}" y="${top + i * 16}" text-anchor="middle" dominant-baseline="central">${esc(l)}</text>`).join("");
}

export function flowchartSvg(src) {
  return modelSvg(parseFlowchart(src));
}

// Desenha um modelo { dir, nodes, edges }. `drawNode` troca o desenho dos nós (caixas de classe); as setas podem
// ter `marker` próprio e ficam tracejadas com `dashed`.
function modelSvg(model, drawNode = (n) => `<g>${shapeSvg(n)}${n.shape === "start" || n.shape === "end" ? "" : textSvg(n.label, n.x + n.w / 2, n.y + n.h / 2)}</g>`) {
  const { width, height } = layoutFlow(model);
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const parts = [];
  const labels = [];
  for (const e of model.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    let p1;
    let p2;
    let d;
    let bulge = { x: 0, y: 0 }; // desvio do rótulo nas setas que voltam, para não cair em cima de outra seta
    if (a === b) {
      p1 = { x: a.x + a.w, y: a.y + a.h / 2 };
      p2 = { x: a.x + a.w, y: a.y + a.h / 2 + 6 };
      d = `M${p1.x},${p1.y - 6} C${p1.x + 34},${p1.y - 24} ${p1.x + 34},${p1.y + 24} ${p2.x},${p2.y}`;
    } else {
      p1 = borderPoint(a, b);
      p2 = borderPoint(b, a);
      d = `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
      if (!e.rev && b.layer <= a.layer) {
        // seta que volta: sai pelo lado e contorna, para não passar por cima das outras
        const horizontalFlow = model.dir === "LR" || model.dir === "RL";
        const off = 54;
        bulge = horizontalFlow ? { x: 0, y: off * 0.75 } : { x: off * 0.75, y: 0 };
        const s1 = horizontalFlow ? { x: a.x + a.w / 2, y: a.y + a.h } : { x: a.x + a.w, y: a.y + a.h / 2 };
        const s2 = horizontalFlow ? { x: b.x + b.w / 2, y: b.y + b.h } : { x: b.x + b.w, y: b.y + b.h / 2 };
        p1 = s1;
        p2 = s2;
        d = horizontalFlow
          ? `M${s1.x},${s1.y} C${s1.x},${s1.y + off} ${s2.x},${s2.y + off} ${s2.x},${s2.y}`
          : `M${s1.x},${s1.y} C${s1.x + off},${s1.y} ${s2.x + off},${s2.y} ${s2.x},${s2.y}`;
      }
    }
    const cls = `m-edge${e.dashed ? " dashed" : ""}${e.thick ? " thick" : ""}`;
    const marker = e.marker ? ` marker-end="url(#${e.marker})"` : e.arrow ? ' marker-end="url(#m-arrow)"' : "";
    parts.push(`<path class="${cls}" d="${d}"${marker}/>`);
    // cardinalidade nas pontas (diagrama ER): um pouco para dentro da linha e para o lado
    const endLabel = (from, to, text) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const lx = from.x + (dx / len) * 18 - (dy / len) * 11;
      const ly = from.y + (dy / len) * 18 + (dx / len) * 11;
      return textSvg(text, lx, ly, "m-text small");
    };
    if (e.fromLabel) labels.push(endLabel(p1, p2, e.fromLabel));
    if (e.toLabel) labels.push(endLabel(p2, p1, e.toLabel));
    if (e.label) {
      const mx = (p1.x + p2.x) / 2 + bulge.x;
      const my = (p1.y + p2.y) / 2 + bulge.y;
      const w = textWidth(e.label) + 12;
      labels.push(`<rect class="m-label-bg" x="${mx - w / 2}" y="${my - 10}" width="${w}" height="20" rx="4"/>${textSvg(e.label, mx, my, "m-text small")}`);
    }
  }
  const nodes = model.nodes.map((n) => drawNode(n));
  return svgWrap(width, height, [...parts, ...nodes, ...labels].join(""));
}

// --- Diagrama de estados ---------------------------------------------------------------------------------------------------

export function parseState(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/%%.*$/, "").trim()).filter(Boolean);
  if (!/^stateDiagram(-v2)?\b/.test(lines[0] || "")) throw new Error("Cabeçalho stateDiagram ausente");
  const nodes = new Map();
  const edges = [];
  let dir = "TD";
  const node = (id, label) => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: id, shape: id === "__start" ? "start" : id === "__end" ? "end" : "round", order: nodes.size };
      nodes.set(id, n);
    }
    if (label) n.label = cleanLabel(label);
    return n;
  };
  const ref = (token, role) => (token === "[*]" ? (role === "from" ? "__start" : "__end") : token);
  for (const line of lines.slice(1)) {
    let m = /^direction\s+(TB|TD|BT|LR|RL)$/i.exec(line);
    if (m) {
      dir = m[1].toUpperCase() === "TB" ? "TD" : m[1].toUpperCase();
      continue;
    }
    m = /^state\s+"([^"]+)"\s+as\s+(\S+)$/.exec(line);
    if (m) {
      node(m[2], m[1]);
      continue;
    }
    m = /^(\[\*\]|[^\s:]+)\s*-->\s*(\[\*\]|[^\s:]+)\s*(?::\s*(.*))?$/.exec(line);
    if (m) {
      node(ref(m[1], "from"));
      node(ref(m[2], "to"));
      edges.push({ from: ref(m[1], "from"), to: ref(m[2], "to"), label: cleanLabel(m[3] || ""), arrow: true });
      continue;
    }
    m = /^([^\s:]+)\s*:\s*(.+)$/.exec(line);
    if (m) {
      node(m[1], m[2]);
      continue;
    }
    if (/^(state\s+\S+\s*\{?|\}|note\b|end note)/.test(line) || /^\S+$/.test(line)) {
      const solo = /^(\S+)$/.exec(line);
      if (solo && !["}", "end"].includes(solo[1])) node(solo[1]);
      continue;
    }
    throw new Error(`Linha não reconhecida: ${line}`);
  }
  if (nodes.size === 0) throw new Error("Diagrama de estados vazio");
  return { dir, nodes: [...nodes.values()], edges };
}

export function stateSvg(src) {
  return modelSvg(parseState(src));
}

// --- Gráfico de pizza ---------------------------------------------------------------------------------------------------------

const PIE_COLORS = ["var(--accent)", "var(--info)", "var(--warning)", "var(--success)", "var(--danger)", "#7a4fa8", "#b58b00", "#2c8c99"];

export function parsePie(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/%%.*$/, "").trim()).filter(Boolean);
  const head = /^pie\b\s*(showData)?\s*(?:title\s+(.*))?$/i.exec(lines[0] || "");
  if (!head) throw new Error("Cabeçalho pie ausente");
  let title = head[2] ? cleanLabel(head[2]) : "";
  const slices = [];
  for (const line of lines.slice(1)) {
    const t = /^title\s+(.*)$/i.exec(line);
    if (t) {
      title = cleanLabel(t[1]);
      continue;
    }
    const m = /^"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!m) throw new Error(`Linha não reconhecida: ${line}`);
    if (Number(m[2]) < 0) throw new Error(`Valor negativo em “${m[1]}”`);
    slices.push({ label: m[1], value: Number(m[2]) });
  }
  if (slices.length === 0) throw new Error("Gráfico de pizza sem fatias");
  if (slices.every((s) => s.value === 0)) throw new Error("Todos os valores são zero");
  return { title, showData: !!head[1], slices };
}

export function pieSvg(src) {
  const { title, showData, slices } = parsePie(src);
  const total = slices.reduce((n, s) => n + s.value, 0);
  const cx = 130;
  const cy = (title ? 50 : 20) + 110;
  const r = 100;
  let angle = -Math.PI / 2;
  const parts = [];
  if (title) parts.push(`<text class="m-text title" x="${cx + 130}" y="24" text-anchor="middle">${esc(title)}</text>`);
  slices.forEach((s, i) => {
    if (s.value === 0) return;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    if (s.value === total) {
      parts.push(`<circle class="m-slice" cx="${cx}" cy="${cy}" r="${r}" style="fill:${color}"/>`);
      return;
    }
    const a1 = angle;
    const a2 = angle + (s.value / total) * Math.PI * 2;
    const large = a2 - a1 > Math.PI ? 1 : 0;
    const p = (a) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    parts.push(`<path class="m-slice" d="M${cx},${cy} L${p(a1)} A${r},${r} 0 ${large} 1 ${p(a2)} Z" style="fill:${color}"/>`);
    const mid = (a1 + a2) / 2;
    const pct = Math.round((s.value / total) * 100);
    if (pct >= 5) parts.push(`<text class="m-text slice-label" x="${(cx + r * 0.62 * Math.cos(mid)).toFixed(1)}" y="${(cy + r * 0.62 * Math.sin(mid)).toFixed(1)}" text-anchor="middle" dominant-baseline="central">${pct}%</text>`);
    angle = a2;
  });
  slices.forEach((s, i) => {
    const y = (title ? 60 : 30) + i * 24;
    const pct = ((s.value / total) * 100).toFixed(0);
    parts.push(`<rect x="${cx + 125}" y="${y}" width="14" height="14" rx="3" style="fill:${PIE_COLORS[i % PIE_COLORS.length]}"/><text class="m-text legend" x="${cx + 146}" y="${y + 7}" dominant-baseline="central">${esc(s.label)}${showData ? ` [${s.value}]` : ` — ${pct}%`}</text>`);
  });
  const legendW = Math.max(...slices.map((s) => textWidth(`${s.label} — 100%`))) + 50;
  const height = Math.max(cy + r + 24, (title ? 60 : 30) + slices.length * 24 + 16);
  return svgWrap(cx + 130 + legendW, height, parts.join(""));
}

// --- Diagrama de classes ----------------------------------------------------------------------------------------------------

const CLASS_RELATIONS = [
  ["<|--", "inherit", false, true], ["--|>", "inherit", false, false], ["*--", "compose", false, true], ["--*", "compose", false, false],
  ["o--", "aggregate", false, true], ["--o", "aggregate", false, false], ["..>", "arrow", true, false], ["<..", "arrow", true, true],
  ["-->", "arrow", false, false], ["<--", "arrow", false, true], ["..", "line", true, false], ["--", "line", false, false],
];

export function parseClass(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/%%.*$/, "").replace(/\s+$/, "")).filter((l) => l.trim());
  if (!/^classDiagram\b/.test(lines[0].trim())) throw new Error("Cabeçalho classDiagram ausente");
  const classes = new Map();
  const relations = [];
  const get = (name) => {
    if (!classes.has(name)) classes.set(name, { name, members: [], order: classes.size });
    return classes.get(name);
  };
  let open = null;
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (open) {
      if (line === "}") open = null;
      else open.members.push(line);
      continue;
    }
    let m = /^class\s+([A-Za-z0-9_]+)\s*\{$/.exec(line);
    if (m) {
      open = get(m[1]);
      continue;
    }
    m = /^class\s+([A-Za-z0-9_]+)\s*$/.exec(line);
    if (m) {
      get(m[1]);
      continue;
    }
    m = /^([A-Za-z0-9_]+)\s*:\s*(.+)$/.exec(line);
    if (m && !/(<\|--|--\|>|\*--|--\*|o--|--o|\.\.>|<\.\.|-->|<--|\.\.|--)/.test(m[1])) {
      get(m[1]).members.push(m[2].trim());
      continue;
    }
    const rel = /^([A-Za-z0-9_]+)\s+(?:"[^"]*"\s+)?(<\|--|--\|>|\*--|--\*|o--|--o|\.\.>|<\.\.|-->|<--|\.\.|--)\s+(?:"[^"]*"\s+)?([A-Za-z0-9_]+)\s*(?::\s*(.*))?$/.exec(line);
    if (rel) {
      get(rel[1]);
      get(rel[3]);
      const [, kind, dashed, reversed] = CLASS_RELATIONS.find((r) => r[0] === rel[2]);
      relations.push({ from: rel[1], to: rel[3], kind, dashed, reversed, label: rel[4] ? cleanLabel(rel[4]) : "" });
      continue;
    }
    throw new Error(`Linha não reconhecida: ${line}`);
  }
  if (open) throw new Error(`Falta fechar a chave da classe ${open.name}`);
  if (classes.size === 0) throw new Error("Diagrama de classes vazio");
  return { classes: [...classes.values()], relations };
}

export function classSvg(src) {
  const { classes, relations } = parseClass(src);
  const nodes = classes.map((c) => {
    const lines = [c.name, ...c.members];
    const w = Math.max(110, ...lines.map((l) => textWidth(l) + 24));
    const h = 30 + Math.max(1, c.members.length) * 20 + 8;
    return { id: c.name, label: c.name, members: c.members, order: c.order, fixed: true, w, h, shape: "class" };
  });
  // a seta "A <|-- B" aponta de B (filha) para A (mãe): a base fica em cima, como no Mermaid
  const edges = relations.map((r) => {
    const markerFor = { inherit: "m-tri", compose: "m-diamond", aggregate: "m-diamond-open", arrow: "m-arrow", line: null }[r.kind];
    const [from, to] = r.reversed ? [r.to, r.from] : [r.from, r.to];
    return { from, to, label: r.label, dashed: r.dashed, marker: markerFor };
  });
  // heranças e composições: a classe "mãe" (ponta da seta) fica em cima; o layout usa o sentido inverso
  const model = { dir: "TD", nodes, edges: edges.map((e) => ({ ...e, rev: e.marker === "m-tri" || e.marker === "m-diamond" || e.marker === "m-diamond-open" })) };
  const draw = (n) => {
    const head = `<rect class="m-node" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4"/><line class="m-sub" x1="${n.x}" y1="${n.y + 28}" x2="${n.x + n.w}" y2="${n.y + 28}"/>`;
    const title = `<text class="m-text strong" x="${n.x + n.w / 2}" y="${n.y + 15}" text-anchor="middle" dominant-baseline="central">${esc(n.label)}</text>`;
    const members = n.members.map((m, i) => `<text class="m-text mono" x="${n.x + 10}" y="${n.y + 40 + i * 20}" dominant-baseline="central">${esc(m)}</text>`).join("");
    return `<g>${head}${title}${members}</g>`;
  };
  return modelSvg(model, draw);
}

// --- Diagrama de sequência ---------------------------------------------------------------------------------------------

export function parseSequence(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/%%.*$/, "").trim()).filter(Boolean);
  if (!/^sequenceDiagram\b/.test(lines[0] || "")) throw new Error("Cabeçalho sequenceDiagram ausente");
  const actors = [];
  const items = [];
  const ensure = (id, label) => {
    let a = actors.find((x) => x.id === id);
    if (!a) {
      a = { id, label: id };
      actors.push(a);
    }
    if (label) a.label = label;
    return a;
  };
  for (const line of lines.slice(1)) {
    let m = /^(?:participant|actor)\s+(\S+?)(?:\s+as\s+(.+))?$/.exec(line);
    if (m) {
      ensure(m[1], m[2] && cleanLabel(m[2]));
      continue;
    }
    m = /^Note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/i.exec(line);
    if (m) {
      const ids = m[2].split(",").map((s) => s.trim());
      ids.forEach((id) => ensure(id));
      items.push({ kind: "note", pos: m[1].toLowerCase(), actors: ids, text: cleanLabel(m[3]) });
      continue;
    }
    m = /^(\S+?)\s*(-->>|->>|-->|->|--\)|-\)|--x|-x)\s*([+-]?)(\S+?)\s*:\s*(.*)$/.exec(line);
    if (m) {
      ensure(m[1]);
      ensure(m[4]);
      items.push({ kind: "msg", from: m[1], to: m[4], text: cleanLabel(m[5]), dashed: m[2].startsWith("--"), head: m[2].endsWith(">>") ? "full" : m[2].endsWith(")") ? "open" : m[2].endsWith("x") ? "full" : "none", cross: m[2].endsWith("x") });
      continue;
    }
    if (/^(loop|alt|else|opt|par|and|end|rect|critical|break|activate|deactivate|autonumber|title)\b/i.test(line)) continue;
    throw new Error(`Linha não reconhecida: ${line}`);
  }
  if (actors.length === 0) throw new Error("Diagrama de sequência sem participantes");
  return { actors, items };
}

export function sequenceSvg(src) {
  const model = parseSequence(src);
  const colW = Math.max(150, ...model.actors.map((a) => textWidth(a.label) + 40));
  const pad = 24;
  const xs = new Map(model.actors.map((a, i) => [a.id, pad + colW / 2 + i * colW]));
  const headH = 34;
  const width = pad * 2 + colW * model.actors.length;
  const rowH = 46;
  const height = pad + headH + 16 + model.items.length * rowH + 30;
  const parts = [];
  for (const a of model.actors) {
    const x = xs.get(a.id);
    parts.push(`<line class="m-life" x1="${x}" y1="${pad + headH}" x2="${x}" y2="${height - 16}"/>`);
  }
  model.items.forEach((it, i) => {
    const y = pad + headH + 30 + i * rowH;
    if (it.kind === "msg") {
      const x1 = xs.get(it.from);
      const x2 = xs.get(it.to);
      if (x1 === x2) {
        parts.push(`<path class="m-edge${it.dashed ? " dashed" : ""}" d="M${x1},${y - 8} h30 v16 h-30" marker-end="url(#m-arrow)"/>${textSvg(it.text, x1 + 36, y - 16, "m-text small").replace('text-anchor="middle"', 'text-anchor="start"')}`);
      } else {
        parts.push(`<path class="m-edge${it.dashed ? " dashed" : ""}" d="M${x1},${y} L${x2},${y}"${it.head === "open" ? ' marker-end="url(#m-arrow-open)"' : it.head === "full" ? ' marker-end="url(#m-arrow)"' : ""}/>`);
        parts.push(textSvg(it.text, (x1 + x2) / 2, y - 11, "m-text small"));
      }
    } else {
      const xsN = it.actors.map((id) => xs.get(id));
      let x1 = Math.min(...xsN) - 60;
      let x2 = Math.max(...xsN) + 60;
      if (it.pos === "left of") {
        x2 = Math.min(...xsN) - 12;
        x1 = x2 - 130;
      } else if (it.pos === "right of") {
        x1 = Math.max(...xsN) + 12;
        x2 = x1 + 130;
      }
      parts.push(`<rect class="m-note" x="${x1}" y="${y - 14}" width="${x2 - x1}" height="28" rx="4"/>${textSvg(it.text, (x1 + x2) / 2, y, "m-text small")}`);
    }
  });
  const heads = model.actors.map((a) => {
    const x = xs.get(a.id);
    return `<g><rect class="m-node" x="${x - colW / 2 + 10}" y="${pad - 6}" width="${colW - 20}" height="${headH}" rx="6"/>${textSvg(a.label, x, pad - 6 + headH / 2)}</g>`;
  });
  return svgWrap(width, height, [...parts, ...heads].join(""));
}

// --- Diagrama de entidades e relacionamentos (ER) ------------------------------------------------------------------------

const ER_LEFT = { "||": "1", "|o": "0..1", "}o": "0..N", "}|": "1..N" };
const ER_RIGHT = { "||": "1", "o|": "0..1", "o{": "0..N", "|{": "1..N" };

export function parseEr(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/%%.*$/, "").trim()).filter(Boolean);
  if (!/^erDiagram\b/.test(lines[0] || "")) throw new Error("Cabeçalho erDiagram ausente");
  const entities = new Map();
  const relations = [];
  const get = (name) => {
    if (!entities.has(name)) entities.set(name, { name, attrs: [], order: entities.size });
    return entities.get(name);
  };
  let open = null;
  for (const line of lines.slice(1)) {
    if (open) {
      if (line === "}") {
        open = null;
        continue;
      }
      const m = /^(\S+)\s+(\S+)(?:\s+(PK|FK|UK)(?:\s*,\s*(PK|FK|UK))?)?(?:\s+"[^"]*")?$/.exec(line);
      if (!m) throw new Error(`Atributo não reconhecido: ${line}`);
      open.attrs.push({ type: m[1], name: m[2], keys: [m[3], m[4]].filter(Boolean) });
      continue;
    }
    let m = /^([A-Za-z0-9_-]+)\s*\{$/.exec(line);
    if (m) {
      open = get(m[1]);
      continue;
    }
    m = /^([A-Za-z0-9_-]+)\s+(\|\||\|o|\}o|\}\|)(--|\.\.)(\|\||o\||o\{|\|\{)\s+([A-Za-z0-9_-]+)\s*:\s*(.+)$/.exec(line);
    if (m) {
      get(m[1]);
      get(m[5]);
      relations.push({ from: m[1], to: m[5], fromCard: ER_LEFT[m[2]], toCard: ER_RIGHT[m[4]], dashed: m[3] === "..", label: cleanLabel(m[6]) });
      continue;
    }
    m = /^([A-Za-z0-9_-]+)$/.exec(line);
    if (m) {
      get(m[1]);
      continue;
    }
    throw new Error(`Linha não reconhecida: ${line}`);
  }
  if (open) throw new Error(`Falta fechar a chave da entidade ${open.name}`);
  if (entities.size === 0) throw new Error("Diagrama ER vazio");
  return { entities: [...entities.values()], relations };
}

export function erSvg(src) {
  const { entities, relations } = parseEr(src);
  const nodes = entities.map((e) => {
    const rows = e.attrs.map((a) => `${a.type} ${a.name}${a.keys.length ? ` ${a.keys.join(",")}` : ""}`);
    const w = Math.max(120, ...[e.name, ...rows].map((l) => textWidth(l) + 28));
    const h = 30 + Math.max(1, rows.length) * 20 + 8;
    return { id: e.name, label: e.name, rows, order: e.order, fixed: true, w, h, shape: "entity" };
  });
  const edges = relations.map((r) => ({ from: r.from, to: r.to, label: r.label, dashed: r.dashed, arrow: false, fromLabel: r.fromCard, toLabel: r.toCard }));
  const draw = (n) => {
    const head = `<rect class="m-node" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4"/><line class="m-sub" x1="${n.x}" y1="${n.y + 28}" x2="${n.x + n.w}" y2="${n.y + 28}"/>`;
    const title = `<text class="m-text strong" x="${n.x + n.w / 2}" y="${n.y + 15}" text-anchor="middle" dominant-baseline="central">${esc(n.label)}</text>`;
    const rows = n.rows.map((r, i) => `<text class="m-text mono" x="${n.x + 10}" y="${n.y + 40 + i * 20}" dominant-baseline="central">${esc(r)}</text>`).join("");
    return `<g>${head}${title}${rows}</g>`;
  };
  return modelSvg({ dir: "TD", nodes, edges }, draw);
}

// --- Gráfico de Gantt ------------------------------------------------------------------------------------------------------------

const DAY = 24 * 3600 * 1000;
const parseDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
};
const parseDuration = (s) => {
  const m = /^(\d+(?:\.\d+)?)([dwmy])$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * { d: 1, w: 7, m: 30, y: 365 }[m[2]] * DAY;
};
const fmtDate = (t) => new Date(t).toISOString().slice(0, 10);

export function parseGantt(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/%%.*$/, "").trim()).filter(Boolean);
  if (!/^gantt\b/.test(lines[0] || "")) throw new Error("Cabeçalho gantt ausente");
  let title = "";
  let section = "";
  const tasks = [];
  const byId = new Map();
  for (const line of lines.slice(1)) {
    let m = /^title\s+(.+)$/.exec(line);
    if (m) {
      title = cleanLabel(m[1]);
      continue;
    }
    m = /^section\s+(.+)$/.exec(line);
    if (m) {
      section = cleanLabel(m[1]);
      continue;
    }
    if (/^(dateFormat|axisFormat|excludes|todayMarker|tickInterval|includes|weekday)\b/.test(line)) continue;
    m = /^(.+?)\s*:\s*(.+)$/.exec(line);
    if (!m) throw new Error(`Linha não reconhecida: ${line}`);
    const parts = m[2].split(",").map((p) => p.trim()).filter(Boolean);
    const task = { name: cleanLabel(m[1]), section, status: "", id: "", start: null, end: null };
    const rest = [];
    for (const p of parts) {
      if (/^(done|active|crit|milestone)$/.test(p)) task.status = task.status || p;
      else rest.push(p);
    }
    if (rest.length && !/^\d{4}-\d{2}-\d{2}$/.test(rest[0]) && !parseDuration(rest[0]) && !/^after\s+/.test(rest[0])) task.id = rest.shift();
    const prev = tasks[tasks.length - 1];
    const resolveStart = (token) => {
      const after = /^after\s+(\S+)$/.exec(token);
      if (after) {
        const dep = byId.get(after[1]);
        if (!dep) throw new Error(`“${task.name}” depende de “${after[1]}”, que não foi definido antes.`);
        return dep.end;
      }
      const d = parseDate(token);
      if (d === null) throw new Error(`Data inválida em “${task.name}”: ${token}`);
      return d;
    };
    if (rest.length === 0) throw new Error(`“${task.name}” precisa de datas ou duração.`);
    if (rest.length === 1) {
      const dur = parseDuration(rest[0]);
      if (dur !== null) {
        task.start = prev ? prev.end : null;
        if (task.start === null) throw new Error(`“${task.name}” é a primeira tarefa e precisa de uma data de início.`);
        task.end = task.start + dur;
      } else {
        task.start = resolveStart(rest[0]);
        task.end = task.start + DAY;
      }
    } else {
      task.start = resolveStart(rest[0]);
      const dur = parseDuration(rest[1]);
      task.end = dur !== null ? task.start + dur : resolveStart(rest[1]);
    }
    if (task.status === "milestone") task.end = task.start;
    if (task.end < task.start) throw new Error(`“${task.name}” termina antes de começar.`);
    if (task.id) byId.set(task.id, task);
    tasks.push(task);
  }
  if (tasks.length === 0) throw new Error("Gantt sem tarefas");
  return { title, tasks };
}

export function ganttSvg(src) {
  const { title, tasks } = parseGantt(src);
  const min = Math.min(...tasks.map((t) => t.start));
  const max = Math.max(...tasks.map((t) => t.end), min + DAY);
  const labelW = Math.max(120, ...tasks.map((t) => textWidth(t.name) + 24));
  const plotW = 560;
  const top = title ? 70 : 44;
  const rowH = 30;
  const x = (t) => labelW + 16 + ((t - min) / (max - min)) * plotW;
  const parts = [];
  if (title) parts.push(`<text class="m-text title" x="${(labelW + plotW) / 2 + 16}" y="22" text-anchor="middle">${esc(title)}</text>`);
  // eixo: cerca de 6 marcas, em datas redondas pelo intervalo
  const span = (max - min) / DAY;
  const step = span <= 14 ? 2 : span <= 45 ? 7 : span <= 200 ? 30 : 90;
  for (let t = min; t <= max + 1; t += step * DAY) {
    parts.push(`<line class="m-grid" x1="${x(t)}" y1="${top - 8}" x2="${x(t)}" y2="${top + tasks.length * rowH}"/><text class="m-text small" x="${x(t)}" y="${top - 16}" text-anchor="middle">${fmtDate(t).slice(5)}</text>`);
  }
  const sections = [...new Set(tasks.map((t) => t.section))];
  tasks.forEach((t, i) => {
    const y = top + i * rowH;
    const color = PIE_COLORS[sections.indexOf(t.section) % PIE_COLORS.length];
    const cls = `m-bar${t.status ? ` ${t.status}` : ""}`;
    parts.push(`<text class="m-text legend" x="12" y="${y + rowH / 2}" dominant-baseline="central">${esc(t.name)}</text>`);
    if (t.status === "milestone") {
      const cx = x(t.start);
      parts.push(`<polygon class="${cls}" points="${cx},${y + 5} ${cx + 10},${y + rowH / 2} ${cx},${y + rowH - 5} ${cx - 10},${y + rowH / 2}" style="fill:${color}"/>`);
    } else {
      const w = Math.max(4, x(t.end) - x(t.start));
      parts.push(`<rect class="${cls}" x="${x(t.start)}" y="${y + 5}" width="${w}" height="${rowH - 10}" rx="4" style="fill:${t.status === "crit" ? "var(--danger)" : color}"/>`);
    }
  });
  return svgWrap(labelW + plotW + 40, top + tasks.length * rowH + 16, parts.join(""));
}

// --- Envoltório ----------------------------------------------------------------------------------------------------------------

function svgWrap(width, height, body) {
  const w = Math.ceil(width);
  const h = Math.ceil(height);
  return `<svg class="mermaid-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img">`
    + `<defs><marker id="m-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="m-head"/></marker>`
    + `<marker id="m-tri" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M1,1 L11,6 L1,11 z" class="m-head-hollow"/></marker>`
    + `<marker id="m-diamond" viewBox="0 0 14 10" refX="13" refY="5" markerWidth="13" markerHeight="10" orient="auto"><path d="M1,5 L7,1 L13,5 L7,9 z" class="m-head"/></marker>`
    + `<marker id="m-diamond-open" viewBox="0 0 14 10" refX="13" refY="5" markerWidth="13" markerHeight="10" orient="auto"><path d="M1,5 L7,1 L13,5 L7,9 z" class="m-head-hollow"/></marker>`
    + `<marker id="m-arrow-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" class="m-head-open"/></marker></defs>${body}</svg>`;
}

export function diagramType(src) {
  const first = (src.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("%%")) || "").split(/\s+/)[0];
  if (/^(graph|flowchart)$/i.test(first)) return "flowchart";
  if (first === "sequenceDiagram") return "sequence";
  if (/^stateDiagram(-v2)?$/.test(first)) return "state";
  if (first === "classDiagram") return "class";
  if (/^pie$/i.test(first)) return "pie";
  if (first === "erDiagram") return "er";
  if (first === "gantt") return "gantt";
  return first || "vazio";
}

// HTML do bloco: o SVG, ou uma explicação com o código quando o diagrama não pode ser desenhado.
export function renderMermaid(src) {
  const type = diagramType(src);
  try {
    if (type === "flowchart") return `<div class="mermaid" data-type="flowchart">${flowchartSvg(src)}</div>`;
    if (type === "sequence") return `<div class="mermaid" data-type="sequence">${sequenceSvg(src)}</div>`;
    if (type === "state") return `<div class="mermaid" data-type="state">${stateSvg(src)}</div>`;
    if (type === "class") return `<div class="mermaid" data-type="class">${classSvg(src)}</div>`;
    if (type === "pie") return `<div class="mermaid" data-type="pie">${pieSvg(src)}</div>`;
    if (type === "er") return `<div class="mermaid" data-type="er">${erSvg(src)}</div>`;
    if (type === "gantt") return `<div class="mermaid" data-type="gantt">${ganttSvg(src)}</div>`;
    throw new Error(`O tipo de diagrama “${type}” ainda não é desenhado offline (há fluxograma, sequência, estados, classes, pizza, ER e gantt).`);
  } catch (err) {
    return `<div class="mermaid mermaid-error" data-type="${esc(type)}"><div class="mermaid-note">${esc(err.message)}</div><pre><code>${esc(src)}</code></pre></div>`;
  }
}
