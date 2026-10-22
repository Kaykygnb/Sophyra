// Modelo do Canvas: um arquivo .canvas é JSON no formato aberto "JSON Canvas" (nós text/file/link/group e arestas).
// O viewport (x, y, zoom) NÃO fica no arquivo: é estado do espaço de trabalho, guardado à parte.
// Tudo aqui é puro (sem DOM) para poder ser testado.

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const DEFAULT_SIZE = { text: [260, 120], file: [320, 240], link: [320, 160], group: [420, 300], table: [260, 140] };
export const SIDES = ["top", "right", "bottom", "left"];
export const NODE_TYPES = ["text", "file", "link", "group", "table"];

// Formas desenhadas (extensão da Biblioteca): são nós `text` com os campos extras `shape`, `fill`, `dashed` e, nas linhas, `points`.
// Quem só conhece o JSON Canvas básico vê um cartão de texto comum e ignora os campos extras.
export const SHAPES = ["rect", "round", "ellipse", "diamond", "triangle", "sticky", "line", "arrow", "draw", "image"];
// Espessuras do traço (fino, médio, grosso) e limite do tamanho de uma imagem embutida (texto do data URL).
export const STROKES = [1, 2, 4];
export const IMAGE_MAX_CHARS = 3_000_000;
export const isImageSrc = (v) => typeof v === "string" && v.length <= IMAGE_MAX_CHARS && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v);
export const LINE_SHAPES = "line arrow draw".split(" ");
export const FILLS = "none soft solid".split(" ");
export const SHAPE_SIZE = { rect: [200, 120], round: [200, 120], ellipse: [200, 130], diamond: [180, 150], triangle: [180, 150], sticky: [180, 180], image: [240, 180] };
const MAX_POINTS = 3000;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Limpa os campos de forma de um nó lido de arquivo: o que for inválido é tirado, e o nó segue como cartão de texto.
function cleanShapeFields(node) {
  if (node.shape === "image" && (node.type !== "text" || !isImageSrc(node.image))) delete node.shape;
  if (node.shape !== "image") delete node.image;
  if (!STROKES.includes(node.stroke)) delete node.stroke;
  if (!SHAPES.includes(node.shape) || node.type !== "text") {
    delete node.shape;
    delete node.points;
    if (!FILLS.includes(node.fill)) delete node.fill;
    if (typeof node.dashed !== "boolean") delete node.dashed;
    return;
  }
  if (!FILLS.includes(node.fill)) delete node.fill;
  if (typeof node.dashed !== "boolean") delete node.dashed;
  if (LINE_SHAPES.includes(node.shape)) {
    const pts = Array.isArray(node.points) ? node.points.filter((p) => Array.isArray(p) && isNum(p[0]) && isNum(p[1])).slice(0, MAX_POINTS) : [];
    node.points = pts.length >= 2 ? pts.map((p) => [p[0], p[1]]) : [[0, 0], [node.width, node.height]];
  } else {
    delete node.points;
  }
}

// Tabela do diagrama: nó `table` com nome e campos. Começa com uma chave primária `id`.
export function addTableNode(data, { x = 0, y = 0, name = "Tabela" } = {}) {
  const node = addNode(data, { type: "table", x, y, width: 260, height: 140 });
  node.name = name;
  node.fields = [{ name: "id", type: "inteiro", pk: true, nn: true }];
  return node;
}

// Altura que a tabela precisa para mostrar todos os campos (cabeçalho + uma linha por campo).
export const tableHeight = (fields) => 44 + Math.max(1, fields.length) * 26 + 12;

export function emptyCanvas() {
  return { nodes: [], edges: [] };
}

// Lê o texto de um .canvas. Nunca lança: JSON inválido vira um canvas vazio com `error`, como a degradação
// observada no original; nós e arestas defeituosos são descartados e contados em `dropped`.
export function parseCanvas(source) {
  const text = String(source ?? "");
  if (text.trim() === "") return { data: emptyCanvas(), error: null, dropped: 0 };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { data: emptyCanvas(), error: `JSON inválido: ${err.message}`, dropped: 0 };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { data: emptyCanvas(), error: "O arquivo não é um objeto com nodes e edges.", dropped: 0 };
  }
  let dropped = 0;
  const ids = new Set();
  const nodes = [];
  for (const n of Array.isArray(raw.nodes) ? raw.nodes : []) {
    if (!n || typeof n !== "object" || typeof n.id !== "string" || !n.id || ids.has(n.id) || !isNum(n.x) || !isNum(n.y)) {
      dropped++;
      continue;
    }
    const type = NODE_TYPES.includes(n.type) ? n.type : "text";
    const [dw, dh] = DEFAULT_SIZE[type];
    const node = { ...n, type, width: isNum(n.width) && n.width > 0 ? n.width : dw, height: isNum(n.height) && n.height > 0 ? n.height : dh };
    if (type === "text" && typeof node.text !== "string") node.text = "";
    cleanShapeFields(node);
    ids.add(n.id);
    nodes.push(node);
  }
  const edgeIds = new Set();
  const edges = [];
  for (const e of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!e || typeof e !== "object" || typeof e.id !== "string" || !e.id || edgeIds.has(e.id) || !ids.has(e.fromNode) || !ids.has(e.toNode)) {
      dropped++;
      continue;
    }
    edgeIds.add(e.id);
    edges.push({ ...e });
  }
  return { data: { nodes, edges }, error: null, dropped };
}

export function serializeCanvas(data) {
  return JSON.stringify({ nodes: data.nodes, edges: data.edges }, null, "\t");
}

let counter = 0;
export function newId(prefix = "n") {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// --- Edição ------------------------------------------------------------------------------------------------------------

export function addNode(data, { type = "text", x = 0, y = 0, text = "", file = "", url = "", label = "", width, height, color, shape, fill, dashed, points, stroke, image } = {}) {
  const base = shape && SHAPE_SIZE[shape] ? SHAPE_SIZE[shape] : DEFAULT_SIZE[type] || DEFAULT_SIZE.text;
  const [dw, dh] = base;
  const node = { id: newId("n"), type, x: Math.round(x), y: Math.round(y), width: width || dw, height: height || dh };
  if (type === "text" && shape && SHAPES.includes(shape)) {
    node.shape = shape;
    if (fill && FILLS.includes(fill)) node.fill = fill;
    if (dashed) node.dashed = true;
    if (stroke && STROKES.includes(stroke)) node.stroke = stroke;
    if (LINE_SHAPES.includes(shape)) node.points = points || [[0, 0], [node.width, node.height]];
    if (shape === "image") {
      if (isImageSrc(image)) node.image = image;
      else delete node.shape;
    }
  }
  if (type === "text") node.text = text;
  if (type === "file") node.file = file;
  if (type === "link") node.url = url;
  if (type === "group") node.label = label;
  if (color) node.color = color;
  data.nodes.push(node);
  return node;
}

export function findNode(data, id) {
  return data.nodes.find((n) => n.id === id) || null;
}

export function moveNode(data, id, dx, dy) {
  const n = findNode(data, id);
  if (!n) return false;
  n.x = Math.round(n.x + dx);
  n.y = Math.round(n.y + dy);
  return true;
}

export function resizeNode(data, id, width, height) {
  const n = findNode(data, id);
  if (!n) return false;
  const line = n.shape && LINE_SHAPES.includes(n.shape);
  const nw = Math.max(line ? 12 : n.shape ? 40 : 60, Math.round(width));
  const nh = Math.max(line ? 12 : n.shape ? 30 : 40, Math.round(height));
  if (line && n.points) {
    // as linhas guardam pontos dentro da caixa: ao redimensionar, os pontos acompanham a proporção
    const sx = nw / (n.width || 1);
    const sy = nh / (n.height || 1);
    n.points = n.points.map(([px, py]) => [Math.round(px * sx * 10) / 10, Math.round(py * sy * 10) / 10]);
  }
  n.width = nw;
  n.height = nh;
  return true;
}

// --- Formas e desenho -----------------------------------------------------------------------------------------------------

// Retângulo (x, y, largura, altura) entre dois pontos arrastados, em qualquer direção.
export function normalizeRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

// Reduz um traço à mão livre: tira pontos que ficam a menos de `tolerance` da reta entre os vizinhos (Ramer–Douglas–Peucker).
export function simplifyPoints(points, tolerance = 1.2) {
  if (points.length <= 2) return points.map((p) => [...p]);
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1;
    let dist = 0;
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((by - ay) * points[i][0] - (bx - ax) * points[i][1] + bx * ay - by * ax) / len;
      if (d > dist) {
        dist = d;
        worst = i;
      }
    }
    if (worst !== -1 && dist > tolerance) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => [...p]);
}

// Cria um nó de linha, seta ou traço livre a partir de pontos do mundo. A caixa envolve os pontos, com uma folga para o traço e a ponta.
export function addLineNode(data, shape, worldPoints, { color, fill, dashed, stroke, pad = 8 } = {}) {
  if (!LINE_SHAPES.includes(shape) || worldPoints.length < 2) return null;
  const xs = worldPoints.map((p) => p[0]);
  const ys = worldPoints.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const width = Math.max(12, Math.max(...xs) - Math.min(...xs) + pad * 2);
  const height = Math.max(12, Math.max(...ys) - Math.min(...ys) + pad * 2);
  const pts = worldPoints.map(([px, py]) => [Math.round((px - x0) * 10) / 10, Math.round((py - y0) * 10) / 10]);
  return addNode(data, { type: "text", shape, x: x0, y: y0, width: Math.round(width), height: Math.round(height), points: pts, color, fill, dashed, stroke });
}

// Move uma ponta (índice 0 ou a última) de uma linha/seta para um ponto do mundo; a caixa é refeita em volta dos pontos.
export function setLineEndpoint(data, id, which, world, pad = 8) {
  const n = findNode(data, id);
  if (!n || !n.points || !LINE_SHAPES.includes(n.shape) || n.shape === "draw") return false;
  const pts = n.points.map(([px, py]) => [n.x + px, n.y + py]);
  pts[which === 0 ? 0 : pts.length - 1] = [world[0], world[1]];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  n.x = Math.round(x0);
  n.y = Math.round(y0);
  n.width = Math.round(Math.max(12, Math.max(...xs) - Math.min(...xs) + pad * 2));
  n.height = Math.round(Math.max(12, Math.max(...ys) - Math.min(...ys) + pad * 2));
  n.points = pts.map(([px, py]) => [Math.round((px - n.x) * 10) / 10, Math.round((py - n.y) * 10) / 10]);
  return true;
}

// Caminho SVG suave por um traço à mão livre: curvas quadráticas que passam pelos pontos médios (sem quinas).
export function smoothPath(points) {
  const f = (v) => Math.round(v * 10) / 10;
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M${f(points[0][0])} ${f(points[0][1])}`;
  if (points.length === 2) return `M${f(points[0][0])} ${f(points[0][1])} L${f(points[1][0])} ${f(points[1][1])}`;
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const mx = (x + points[i + 1][0]) / 2;
    const my = (y + points[i + 1][1]) / 2;
    d += ` Q${f(x)} ${f(y)} ${f(mx)} ${f(my)}`;
  }
  const last = points[points.length - 1];
  return `${d} L${f(last[0])} ${f(last[1])}`;
}

// Triângulo da ponta de uma seta em `to`, apontando de `from` para `to`. Devolve os três pontos.
export function arrowHead(from, to, size = 12) {
  const a = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const wing = (k) => [to[0] - size * Math.cos(a + k), to[1] - size * Math.sin(a + k)];
  return [[to[0], to[1]], wing(0.45), wing(-0.45)];
}

export function bringToFront(data, id) {
  const i = data.nodes.findIndex((n) => n.id === id);
  if (i === -1 || i === data.nodes.length - 1) return false;
  data.nodes.push(...data.nodes.splice(i, 1));
  return true;
}

export function sendToBack(data, id) {
  const i = data.nodes.findIndex((n) => n.id === id);
  if (i <= 0) return false;
  data.nodes.unshift(...data.nodes.splice(i, 1));
  return true;
}

// Copia um nó (sem as setas ligadas a ele), deslocado, e devolve a cópia.
export function duplicateNode(data, id, offset = 24) {
  const n = findNode(data, id);
  if (!n) return null;
  const copy = JSON.parse(JSON.stringify(n));
  copy.id = newId("n");
  copy.x += offset;
  copy.y += offset;
  data.nodes.push(copy);
  return copy;
}

// Muda campos de estilo de um nó. Valores nulos tiram o campo (voltam ao padrão).
export function styleNode(data, id, patch) {
  const n = findNode(data, id);
  if (!n) return false;
  for (const [k, v] of Object.entries(patch)) {
    if (!"color fill dashed stroke".split(" ").includes(k)) continue;
    if (v === null || v === undefined || v === false || v === "") delete n[k];
    else if (k === "fill" && !FILLS.includes(v)) continue;
    else if (k === "stroke" && !STROKES.includes(v)) continue;
    else n[k] = v;
  }
  return true;
}

// Histórico para desfazer e refazer: guarda o texto serializado do desenho, para não depender de referências.
export class History {
  constructor(initial, limit = 50) {
    this.limit = limit;
    this.states = [initial];
    this.index = 0;
  }

  push(state) {
    if (state === this.states[this.index]) return false;
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(state);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
    return true;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.states.length - 1;
  }

  undo() {
    return this.canUndo ? this.states[--this.index] : null;
  }

  redo() {
    return this.canRedo ? this.states[++this.index] : null;
  }
}

export function removeNode(data, id) {
  const before = data.nodes.length;
  data.nodes = data.nodes.filter((n) => n.id !== id);
  data.edges = data.edges.filter((e) => e.fromNode !== id && e.toNode !== id);
  return data.nodes.length < before;
}

export function addEdge(data, fromNode, toNode, { label = "", fromSide, toSide } = {}) {
  const a = findNode(data, fromNode);
  const b = findNode(data, toNode);
  if (!a || !b || fromNode === toNode) return null;
  if (data.edges.some((e) => e.fromNode === fromNode && e.toNode === toNode)) return null;
  const auto = autoSides(a, b);
  const edge = { id: newId("e"), fromNode, toNode, fromSide: fromSide || auto[0], toSide: toSide || auto[1] };
  if (label) edge.label = label;
  data.edges.push(edge);
  return edge;
}

export function removeEdge(data, id) {
  const before = data.edges.length;
  data.edges = data.edges.filter((e) => e.id !== id);
  return data.edges.length < before;
}

// --- Geometria ------------------------------------------------------------------------------------------------------------

export function centerOf(n) {
  return { x: n.x + n.width / 2, y: n.y + n.height / 2 };
}

// Escolhe os lados que ligam dois nós pelo caminho mais direto.
export function autoSides(a, b) {
  const ca = centerOf(a);
  const cb = centerOf(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (Math.abs(dx) * a.height > Math.abs(dy) * a.width) return dx >= 0 ? ["right", "left"] : ["left", "right"];
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

export function anchor(n, side) {
  const c = centerOf(n);
  if (side === "top") return { x: c.x, y: n.y };
  if (side === "bottom") return { x: c.x, y: n.y + n.height };
  if (side === "left") return { x: n.x, y: c.y };
  return { x: n.x + n.width, y: c.y };
}

// Lado do cartão cujo ponto de ligação fica mais perto de um ponto do mundo.
export function nearestSide(n, pt) {
  let best = "right";
  let dist = Infinity;
  for (const side of SIDES) {
    const a = anchor(n, side);
    const d = Math.hypot(a.x - pt.x, a.y - pt.y);
    if (d < dist) {
      dist = d;
      best = side;
    }
  }
  return best;
}

const NORMAL = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

// Curva de Bézier de uma aresta, com os pontos de partida e chegada.
export function edgePath(data, edge) {
  const a = findNode(data, edge.fromNode);
  const b = findNode(data, edge.toNode);
  if (!a || !b) return null;
  const [fa, ta] = edge.fromSide && edge.toSide ? [edge.fromSide, edge.toSide] : autoSides(a, b);
  const p1 = anchor(a, fa);
  const p2 = anchor(b, ta);
  const dist = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.35);
  const n1 = NORMAL[fa] || [1, 0];
  const n2 = NORMAL[ta] || [-1, 0];
  const c1 = { x: p1.x + n1[0] * dist, y: p1.y + n1[1] * dist };
  const c2 = { x: p2.x + n2[0] * dist, y: p2.y + n2[1] * dist };
  const mid = { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 };
  return { p1, p2, c1, c2, mid, d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, angle: Math.atan2(p2.y - c2.y, p2.x - c2.x) };
}

export function bounds(data, nodes = data.nodes) {
  if (nodes.length === 0) return null;
  const x0 = Math.min(...nodes.map((n) => n.x));
  const y0 = Math.min(...nodes.map((n) => n.y));
  const x1 = Math.max(...nodes.map((n) => n.x + n.width));
  const y1 = Math.max(...nodes.map((n) => n.y + n.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

// --- Viewport (separado do arquivo) ------------------------------------------------------------------------------------

export function normalizeViewport(vp) {
  const zoom = isNum(vp?.zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom)) : 1;
  return { x: isNum(vp?.x) ? vp.x : 0, y: isNum(vp?.y) ? vp.y : 0, zoom };
}

// Tela ↔ mundo. O viewport guarda o ponto do mundo que está no canto superior esquerdo, vezes o zoom.
export const toWorld = (vp, sx, sy) => ({ x: (sx - vp.x) / vp.zoom, y: (sy - vp.y) / vp.zoom });
export const toScreen = (vp, wx, wy) => ({ x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y });

export function panBy(vp, dx, dy) {
  return normalizeViewport({ ...vp, x: vp.x + dx, y: vp.y + dy });
}

// Aproxima ou afasta mantendo fixo o ponto sob o cursor.
export function zoomAt(vp, factor, sx, sy) {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * factor));
  const w = toWorld(vp, sx, sy);
  return { zoom, x: sx - w.x * zoom, y: sy - w.y * zoom };
}

// Enquadra todos os nós (ou os indicados) numa área de `width` × `height` pixels.
export function fitViewport(data, width, height, { padding = 48, nodes } = {}) {
  const box = bounds(data, nodes || data.nodes);
  if (!box) return { x: width / 2, y: height / 2, zoom: 1 };
  const zoom = Math.min(1.5, Math.max(MIN_ZOOM, Math.min((width - padding * 2) / box.width, (height - padding * 2) / box.height)));
  return normalizeViewport({ zoom, x: (width - box.width * zoom) / 2 - box.x * zoom, y: (height - box.height * zoom) / 2 - box.y * zoom });
}
