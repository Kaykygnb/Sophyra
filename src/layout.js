// Física do grafo, sem DOM: posições em unidades de mundo, independentes do tamanho da tela.
// A tela só escolhe como enquadrar (fit). Isso evita que o desenho dependa do tamanho do painel.

const REPULSION = 2600;
const REPULSION_RANGE = 320;
const LINK_DISTANCE = 80;
const SPRING = 0.035;
const GRAVITY = 0.012;
const ORPHAN_GRAVITY = 0.04;
const DAMPING = 0.8;
const COOLING = 0.986;
const REST_ALPHA = 0.02;

export class Layout {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.alpha = 0;
    this.spread = 1; // cresce com o número de notas, para um grafo grande não virar um bolo
  }

  // Mantém a posição das notas que já existiam; as novas entram em círculo ao redor do centro.
  setData({ nodes, edges }) {
    const prev = new Map(this.nodes.map((n) => [n.id, n]));
    const total = Math.max(1, nodes.length);
    this.spread = Math.max(1, Math.sqrt(total / 8));
    const ring = (40 + total * 7) * Math.min(this.spread, 2);
    this.nodes = nodes.map((n, i) => {
      const old = prev.get(n.id);
      const angle = (i / total) * Math.PI * 2;
      return {
        id: n.id,
        label: n.label,
        degree: n.degree || 0,
        x: old ? old.x : Math.cos(angle) * ring,
        y: old ? old.y : Math.sin(angle) * ring,
        vx: 0,
        vy: 0,
        pinned: false,
      };
    });
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.edges = edges.map((e) => ({ a: byId.get(e.source), b: byId.get(e.target) })).filter((e) => e.a && e.b);
    this.neighbors = new Map(this.nodes.map((n) => [n.id, new Set()]));
    for (const e of this.edges) {
      this.neighbors.get(e.a.id).add(e.b.id);
      this.neighbors.get(e.b.id).add(e.a.id);
    }
    this.reheat(1);
  }

  reheat(alpha = 0.4) {
    this.alpha = Math.max(this.alpha, alpha);
  }

  get settled() {
    return this.alpha < REST_ALPHA;
  }

  step() {
    const nodes = this.nodes;
    const a = this.alpha;
    const sp = this.spread;
    const range = REPULSION_RANGE * sp;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const p = nodes[i];
        const q = nodes[j];
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          // nós em cima um do outro: separa em direção determinística
          dx = (i - j) * 0.5;
          dy = 0.5;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        if (d > range) continue;
        const f = ((REPULSION * sp * sp) / d2) * a;
        p.vx += (dx / d) * f;
        p.vy += (dy / d) * f;
        q.vx -= (dx / d) * f;
        q.vy -= (dy / d) * f;
      }
    }
    for (const e of this.edges) {
      const dx = e.b.x - e.a.x;
      const dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - LINK_DISTANCE * sp) * SPRING * a;
      e.a.vx += (dx / d) * f;
      e.a.vy += (dy / d) * f;
      e.b.vx -= (dx / d) * f;
      e.b.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      const g = (n.degree === 0 ? ORPHAN_GRAVITY : GRAVITY) / sp;
      n.vx -= n.x * g * a;
      n.vy -= n.y * g * a;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      if (!n.pinned) {
        n.x += n.vx;
        n.y += n.vy;
      }
    }
    this.alpha *= COOLING;
  }

  // Roda a simulação até assentar (ou até `max` passos). Útil para testes e para o primeiro desenho.
  settle(max = 400) {
    let i = 0;
    while (!this.settled && i++ < max) this.step();
    return i;
  }

  // Retângulo que contém todas as notas, com folga em volta.
  bounds(pad = 0) {
    if (!this.nodes.length) return { minX: -1, minY: -1, maxX: 1, maxY: 1, w: 2, h: 2, cx: 0, cy: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of this.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }
}

// Escala e deslocamento que enquadram o grafo numa área de `width` × `height` pixels.
// `right` reserva espaço à direita para o nome da nota que fica ao lado do ponto.
export function fitTransform(bounds, width, height, { margin = 36, right = 0, maxScale = 1.6, minScale = 0.15 } = {}) {
  const bw = Math.max(bounds.w, 1);
  const bh = Math.max(bounds.h, 1);
  const usableW = Math.max(40, width - margin * 2 - right);
  const scale = Math.max(minScale, Math.min(maxScale, usableW / bw, (height - margin * 2) / bh));
  return { scale, x: margin + usableW / 2 - bounds.cx * scale, y: height / 2 - bounds.cy * scale };
}

// Conversões entre tela e mundo para a vista { x, y, scale }.
export const toScreen = (view, p) => ({ x: p.x * view.scale + view.x, y: p.y * view.scale + view.y });
export const toWorld = (view, p) => ({ x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale });

// Aproxima ou afasta mantendo o ponto sob o cursor no mesmo lugar.
export function zoomAt(view, point, factor, { min = 0.15, max = 5 } = {}) {
  const scale = Math.max(min, Math.min(max, view.scale * factor));
  const real = scale / view.scale;
  return { scale, x: point.x - (point.x - view.x) * real, y: point.y - (point.y - view.y) * real };
}
