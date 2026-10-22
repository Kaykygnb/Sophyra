import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCanvas, serializeCanvas, emptyCanvas, addNode, addLineNode, resizeNode, moveNode, normalizeRect, simplifyPoints, arrowHead,
  bringToFront, sendToBack, setLineEndpoint, nearestSide, duplicateNode, styleNode, History, SHAPES,
} from "../src/canvas.js";

test("Formas: ficam como cartão de texto com campos extras e voltam iguais do arquivo", () => {
  const d = emptyCanvas();
  const a = addNode(d, { type: "text", shape: "ellipse", x: 10, y: 20, fill: "solid", dashed: true, color: "4", text: "ok" });
  assert.equal(a.type, "text");
  assert.equal(a.shape, "ellipse");
  assert.deepEqual([a.width, a.height], [200, 130]);
  const back = parseCanvas(serializeCanvas(d)).data;
  assert.deepEqual(back.nodes[0], a);
  assert.equal(SHAPES.length, 10);
});

test("Formas: campos inválidos são limpos ao ler, e o nó continua como texto", () => {
  const raw = { nodes: [
    { id: "a", type: "text", x: 0, y: 0, shape: "estrela", fill: "neon", dashed: "sim", points: [[1, 2]] },
    { id: "b", type: "file", x: 0, y: 0, file: "A.md", shape: "ellipse" },
    { id: "c", type: "text", x: 0, y: 0, shape: "rect", points: [[1, 2]] },
  ], edges: [] };
  const { data } = parseCanvas(JSON.stringify(raw));
  const [a, b, c] = data.nodes;
  for (const k of ["shape", "fill", "dashed", "points"]) assert.equal(k in a, false, k);
  assert.equal("shape" in b, false, "só nós de texto viram formas");
  assert.equal(c.shape, "rect");
  assert.equal("points" in c, false, "pontos só valem em linhas");
});

test("Linhas: pontos inválidos ou ausentes ganham uma diagonal; excesso é cortado", () => {
  const { data } = parseCanvas(JSON.stringify({ nodes: [
    { id: "l", type: "text", x: 0, y: 0, width: 100, height: 50, shape: "line" },
    { id: "m", type: "text", x: 0, y: 0, width: 100, height: 50, shape: "arrow", points: [[0, 0], ["x", 1], null, [5, 5]] },
    { id: "d", type: "text", x: 0, y: 0, width: 100, height: 50, shape: "draw", points: Array.from({ length: 4000 }, (_, i) => [i, i]) },
  ], edges: [] }));
  assert.deepEqual(data.nodes[0].points, [[0, 0], [100, 50]]);
  assert.deepEqual(data.nodes[1].points, [[0, 0], [5, 5]]);
  assert.equal(data.nodes[2].points.length, 3000);
});

test("Linha criada por pontos do mundo: a caixa envolve com folga e os pontos ficam relativos", () => {
  const d = emptyCanvas();
  const n = addLineNode(d, "arrow", [[100, 100], [200, 160]], { color: "1" });
  assert.deepEqual([n.x, n.y, n.width, n.height], [92, 92, 116, 76]);
  assert.deepEqual(n.points, [[8, 8], [108, 68]]);
  assert.equal(n.shape, "arrow");
  assert.equal(n.color, "1");
  assert.equal(addLineNode(d, "rect", [[0, 0], [1, 1]]), null);
  assert.equal(addLineNode(d, "line", [[0, 0]]), null);
  const horizontal = addLineNode(d, "line", [[0, 50], [80, 50]]);
  assert.ok(horizontal.height >= 12, "linha reta não tem altura zero");
});

test("Redimensionar: linhas levam os pontos junto; formas têm tamanho mínimo menor que cartões", () => {
  const d = emptyCanvas();
  const l = addLineNode(d, "line", [[0, 0], [100, 40]]);
  const [w0, h0] = [l.width, l.height];
  resizeNode(d, l.id, w0 * 2, h0);
  assert.equal(l.points[1][0], 216);
  const s = addNode(d, { type: "text", shape: "rect" });
  resizeNode(d, s.id, 1, 1);
  assert.deepEqual([s.width, s.height], [40, 30]);
  const t = addNode(d, { type: "text" });
  resizeNode(d, t.id, 1, 1);
  assert.deepEqual([t.width, t.height], [60, 40]);
  moveNode(d, l.id, 5, 5);
  assert.deepEqual(l.points[0], [16, 8], "mover não mexe nos pontos relativos");
});

test("Retângulo arrastado: qualquer direção dá o mesmo retângulo", () => {
  assert.deepEqual(normalizeRect({ x: 10, y: 20 }, { x: 50, y: 70 }), { x: 10, y: 20, width: 40, height: 50 });
  assert.deepEqual(normalizeRect({ x: 50, y: 70 }, { x: 10, y: 20 }), { x: 10, y: 20, width: 40, height: 50 });
});

test("Traço à mão livre: simplificar mantém as pontas e os cantos e tira o que está em linha reta", () => {
  const reta = Array.from({ length: 50 }, (_, i) => [i, i * 2]);
  assert.deepEqual(simplifyPoints(reta), [[0, 0], [49, 98]]);
  const canto = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10]];
  assert.deepEqual(simplifyPoints(canto), [[0, 0], [10, 0], [10, 10]]);
  assert.deepEqual(simplifyPoints([[1, 1], [2, 2]]), [[1, 1], [2, 2]]);
  assert.deepEqual(simplifyPoints([]), []);
});

test("Ponta da seta: a ponta fica no destino e as asas ficam para trás", () => {
  const [tip, a, b] = arrowHead([0, 0], [100, 0], 10);
  assert.deepEqual(tip, [100, 0]);
  assert.ok(a[0] < 100 && b[0] < 100);
  assert.ok(Math.abs(a[1] + b[1]) < 1e-9, "simétricas");
});

test("Ordem, cópia e estilo", () => {
  const d = emptyCanvas();
  const [a, b, c] = ["um", "dois", "tres"].map((t) => addNode(d, { text: t }));
  assert.equal(bringToFront(d, a.id), true);
  assert.deepEqual(d.nodes.map((n) => n.text), ["dois", "tres", "um"]);
  assert.equal(bringToFront(d, a.id), false, "já está na frente");
  assert.equal(sendToBack(d, c.id), true);
  assert.deepEqual(d.nodes.map((n) => n.text), ["tres", "dois", "um"]);
  const copy = duplicateNode(d, b.id);
  assert.notEqual(copy.id, b.id);
  assert.deepEqual([copy.x - b.x, copy.y - b.y], [24, 24]);
  assert.equal(d.nodes.length, 4);
  assert.equal(duplicateNode(d, "nada"), null);
  assert.equal(styleNode(d, a.id, { color: "5", fill: "solid", dashed: true, estranho: 1 }), true);
  assert.deepEqual([a.color, a.fill, a.dashed, a.estranho], ["5", "solid", true, undefined]);
  styleNode(d, a.id, { color: null, fill: "neon", dashed: false });
  assert.deepEqual(["color" in a, a.fill, "dashed" in a], [false, "solid", false], "fill inválido é ignorado");
  assert.equal(styleNode(d, "nada", { color: "1" }), false);
});

test("Histórico: desfazer e refazer, sem estados repetidos, com limite", () => {
  const h = new History("a", 3);
  assert.equal(h.push("a"), false);
  h.push("b");
  h.push("c");
  assert.equal(h.undo(), "b");
  assert.equal(h.undo(), "a");
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), "b");
  h.push("x");
  assert.equal(h.canRedo, false, "nova ação apaga o refazer");
  h.push("y");
  h.push("z");
  assert.equal(h.states.length, 3, "limite");
  assert.equal(h.undo(), "y");
});

test("Ponta de seta: mover uma ponta refaz a caixa e mantém a outra no lugar", () => {
  const d = emptyCanvas();
  const a = addLineNode(d, "arrow", [[100, 100], [200, 100]]);
  assert.equal(setLineEndpoint(d, a.id, 1, [180, 220]), true);
  const world = a.points.map(([x, y]) => [a.x + x, a.y + y]);
  assert.deepEqual(world, [[100, 100], [180, 220]]);
  assert.equal(setLineEndpoint(d, a.id, 0, [50, 60]), true);
  assert.deepEqual(a.points.map(([x, y]) => [a.x + x, a.y + y]), [[50, 60], [180, 220]]);
  const t = addNode(d, { type: "text" });
  assert.equal(setLineEndpoint(d, t.id, 0, [1, 1]), false);
});

test("Seta de ligação: o lado mais próximo do ponto escolhe de onde a seta sai e onde chega", () => {
  const d = emptyCanvas();
  const n = addNode(d, { type: "text", x: 0, y: 0, width: 200, height: 100 });
  assert.equal(nearestSide(n, { x: 210, y: 50 }), "right");
  assert.equal(nearestSide(n, { x: -20, y: 40 }), "left");
  assert.equal(nearestSide(n, { x: 100, y: -30 }), "top");
  assert.equal(nearestSide(n, { x: 90, y: 140 }), "bottom");
});
