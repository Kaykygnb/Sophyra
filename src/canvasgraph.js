// Grafo no canvas: as notas de um conjunto viram cartões, e os links internos entre elas viram setas. A posição vem da
// mesma física do grafo da biblioteca (layout.js), que é determinística: a mesma pasta sempre sai com o mesmo desenho.
// Funções puras; quem chama fornece o conteúdo das notas e a resolução de nomes.

import { Layout } from "./layout.js";

const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;

// Setas entre as notas do conjunto: uma seta de A para B quando A cita B por [[link]]. Sem repetição e sem laço.
// O rótulo é o apelido do link ([[Nota|apelido]]), se houver; o primeiro link entre duas notas vale.
export function linksAmong(paths, contentOf, resolve) {
  const inSet = new Set(paths);
  const seen = new Set();
  const edges = [];
  for (const from of paths) {
    const text = String(contentOf(from) ?? "");
    for (const m of text.matchAll(LINK)) {
      const to = resolve(m[1].trim(), from);
      if (!to || to === from || !inSet.has(to)) continue;
      const key = `${from}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const label = (m[2] || "").trim();
      edges.push(label ? { source: from, target: to, label } : { source: from, target: to });
    }
  }
  return edges;
}

// Posições assentadas para cada nota: { id -> { x, y } }, em unidades da simulação (centro em 0,0).
export function settleGraph(ids, edges, { max = 600 } = {}) {
  const degree = new Map(ids.map((id) => [id, 0]));
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const layout = new Layout();
  layout.setData({ nodes: ids.map((id) => ({ id, label: id, degree: degree.get(id) || 0 })), edges });
  layout.settle(max);
  return new Map(layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}

// Leva as posições da simulação para o canvas: espalha pelo tamanho do cartão e centraliza em (cx, cy).
export function placeOnCanvas(positions, { cx = 0, cy = 0, spacing = 1.6, cardW = 320, cardH = 240 } = {}) {
  const out = new Map();
  for (const [id, p] of positions) {
    out.set(id, { x: Math.round(cx + p.x * spacing * (cardW / 160) - cardW / 2), y: Math.round(cy + p.y * spacing * (cardH / 160) - cardH / 2) });
  }
  return out;
}

// Afasta os cartões que se cruzam entre si e os cartões que já estão no canvas (`obstacles`, que não se mexem).
// Empurra pelo eixo de menor sobreposição, até não haver cruzamento ou acabar o limite de passos.
export function separateCards(positions, { cardW = 320, cardH = 240, gap = 40, max = 400, obstacles = [] } = {}) {
  const pts = new Map([...positions].map(([id, p]) => [id, { x: p.x, y: p.y }]));
  const ids = [...pts.keys()];
  const w = cardW + gap;
  const h = cardH + gap;
  for (let step = 0; step < max; step++) {
    let moved = false;
    for (const id of ids) {
      const a = pts.get(id);
      for (const o of obstacles) {
        const ow = o.w || cardW;
        const oh = o.h || cardH;
        const dx = o.x + ow / 2 - (a.x + cardW / 2);
        const dy = o.y + oh / 2 - (a.y + cardH / 2);
        const ox = ow / 2 + w / 2 - Math.abs(dx);
        const oy = oh / 2 + h / 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) a.x -= (dx >= 0 ? 1 : -1) * ox;
        else a.y -= (dy >= 0 ? 1 : -1) * oy;
      }
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pts.get(ids[i]);
        const b = pts.get(ids[j]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const ox = w - Math.abs(dx);
        const oy = h - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const push = ((dx >= 0 ? 1 : -1) * ox) / 2;
          a.x -= push;
          b.x += push;
        } else {
          const push = ((dy >= 0 ? 1 : -1) * oy) / 2;
          a.y -= push;
          b.y += push;
        }
      }
    }
    if (!moved) break;
  }
  return new Map([...pts].map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]));
}
