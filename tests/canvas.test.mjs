import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCanvas, serializeCanvas, emptyCanvas, addNode, addEdge, removeNode, removeEdge, moveNode, resizeNode,
  autoSides, edgePath, bounds, normalizeViewport, zoomAt, panBy, toWorld, toScreen, fitViewport, MIN_ZOOM, MAX_ZOOM,
} from "../src/canvas.js";

const sample = {
  nodes: [
    { id: "a", type: "text", x: 0, y: 0, width: 200, height: 100, text: "Olá" },
    { id: "b", type: "file", x: 400, y: 0, width: 300, height: 200, file: "Alfa.md" },
  ],
  edges: [{ id: "e1", fromNode: "a", toNode: "b", fromSide: "right", toSide: "left" }],
};

test("Canvas: lê um arquivo válido e regrava em JSON com tabulação", () => {
  const { data, error, dropped } = parseCanvas(JSON.stringify(sample));
  assert.equal(error, null);
  assert.equal(dropped, 0);
  assert.equal(data.nodes.length, 2);
  const again = parseCanvas(serializeCanvas(data)).data;
  assert.deepEqual(again, data);
  assert.match(serializeCanvas(data), /\n\t"nodes"/);
});

test("Canvas: arquivo vazio vira canvas vazio sem erro", () => {
  assert.deepEqual(parseCanvas("").data, emptyCanvas());
  assert.equal(parseCanvas("   \n").error, null);
});

test("Canvas: JSON inválido degrada para vazio e explica, sem lançar", () => {
  for (const bad of ["{ nodes: [", "not json", "[1,2]", "42", "null"]) {
    const r = parseCanvas(bad);
    assert.deepEqual(r.data, emptyCanvas());
    assert.ok(r.error, `esperava erro para ${bad}`);
  }
});

test("Canvas: descarta nós e arestas defeituosos e conta quantos", () => {
  const raw = {
    nodes: [
      { id: "ok", x: 1, y: 2 },
      { id: "ok", x: 1, y: 2 },
      { x: 0, y: 0 },
      { id: "sem-y", x: 1 },
      { id: "t", type: "estranho", x: 5, y: 5, width: -3 },
    ],
    edges: [{ id: "e", fromNode: "ok", toNode: "t" }, { id: "x", fromNode: "ok", toNode: "fantasma" }, { fromNode: "ok", toNode: "t" }],
  };
  const { data, dropped } = parseCanvas(JSON.stringify(raw));
  assert.deepEqual(data.nodes.map((n) => n.id), ["ok", "t"]);
  assert.equal(data.nodes[0].width, 260); // tamanho padrão de texto
  assert.equal(data.nodes[1].type, "text");
  assert.equal(data.nodes[1].width, 260);
  assert.deepEqual(data.edges.map((e) => e.id), ["e"]);
  assert.equal(dropped, 5);
});

test("Canvas: criar, mover, redimensionar e remover nós leva as arestas junto", () => {
  const d = emptyCanvas();
  const a = addNode(d, { x: 0, y: 0, text: "um" });
  const b = addNode(d, { type: "file", x: 500, y: 0, file: "Nota.md" });
  const c = addNode(d, { type: "link", x: 0, y: 300, url: "https://exemplo.com" });
  assert.equal(new Set([a.id, b.id, c.id]).size, 3);
  assert.ok(addEdge(d, a.id, b.id));
  assert.ok(addEdge(d, b.id, c.id, { label: "depois" }));
  assert.equal(addEdge(d, a.id, b.id), null, "aresta repetida");
  assert.equal(addEdge(d, a.id, a.id), null, "laço");
  assert.equal(addEdge(d, a.id, "nada"), null);
  assert.ok(moveNode(d, a.id, 10.4, -5));
  assert.deepEqual([a.x, a.y], [10, -5]);
  assert.ok(resizeNode(d, a.id, 10, 10));
  assert.deepEqual([a.width, a.height], [60, 40]);
  assert.ok(removeNode(d, b.id));
  assert.equal(d.edges.length, 0);
  assert.equal(removeNode(d, "nada"), false);
});

test("Canvas: remover uma aresta mantém os nós", () => {
  const { data } = parseCanvas(JSON.stringify(sample));
  assert.ok(removeEdge(data, "e1"));
  assert.equal(data.nodes.length, 2);
  assert.equal(removeEdge(data, "e1"), false);
});

test("Canvas: lados automáticos seguem a direção entre os nós", () => {
  const n = (x, y) => ({ x, y, width: 100, height: 100 });
  assert.deepEqual(autoSides(n(0, 0), n(300, 0)), ["right", "left"]);
  assert.deepEqual(autoSides(n(300, 0), n(0, 0)), ["left", "right"]);
  assert.deepEqual(autoSides(n(0, 0), n(0, 300)), ["bottom", "top"]);
  assert.deepEqual(autoSides(n(0, 300), n(0, 0)), ["top", "bottom"]);
});

test("Canvas: o caminho da aresta liga as bordas dos nós", () => {
  const { data } = parseCanvas(JSON.stringify(sample));
  const p = edgePath(data, data.edges[0]);
  assert.deepEqual(p.p1, { x: 200, y: 50 });
  assert.deepEqual(p.p2, { x: 400, y: 100 });
  assert.match(p.d, /^M200,50 C/);
  assert.equal(edgePath(data, { fromNode: "a", toNode: "nada" }), null);
});

test("Canvas: caixa que envolve os nós", () => {
  const { data } = parseCanvas(JSON.stringify(sample));
  assert.deepEqual(bounds(data), { x: 0, y: 0, width: 700, height: 200 });
  assert.equal(bounds(emptyCanvas()), null);
});

test("Viewport: o zoom é limitado e valores ruins viram o padrão", () => {
  assert.equal(normalizeViewport({ zoom: 99 }).zoom, MAX_ZOOM);
  assert.equal(normalizeViewport({ zoom: 0.001 }).zoom, MIN_ZOOM);
  assert.deepEqual(normalizeViewport({ x: "a", y: NaN, zoom: "x" }), { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(normalizeViewport(null), { x: 0, y: 0, zoom: 1 });
});

test("Viewport: o zoom mantém fixo o ponto sob o cursor", () => {
  const vp = { x: 40, y: -20, zoom: 1 };
  const before = toWorld(vp, 300, 200);
  const next = zoomAt(vp, 2, 300, 200);
  const after = toWorld(next, 300, 200);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  assert.equal(next.zoom, 2);
  assert.equal(zoomAt(vp, 100, 0, 0).zoom, MAX_ZOOM);
});

test("Viewport: pan desloca e ida e volta entre tela e mundo fecha", () => {
  const vp = panBy({ x: 0, y: 0, zoom: 2 }, 15, -5);
  assert.deepEqual([vp.x, vp.y], [15, -5]);
  const w = toWorld(vp, 100, 100);
  const s = toScreen(vp, w.x, w.y);
  assert.ok(Math.abs(s.x - 100) < 1e-9 && Math.abs(s.y - 100) < 1e-9);
});

test("Viewport: enquadrar mostra todos os nós dentro da área", () => {
  const { data } = parseCanvas(JSON.stringify(sample));
  const vp = fitViewport(data, 800, 600);
  const tl = toScreen(vp, 0, 0);
  const br = toScreen(vp, 700, 200);
  assert.ok(tl.x >= 0 && tl.y >= 0 && br.x <= 800 && br.y <= 600);
  assert.deepEqual(fitViewport(emptyCanvas(), 800, 600), { x: 400, y: 300, zoom: 1 });
});
