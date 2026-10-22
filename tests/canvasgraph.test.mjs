import test from "node:test";
import assert from "node:assert/strict";
import { linksAmong, settleGraph, placeOnCanvas, separateCards } from "../src/canvasgraph.js";

const notes = {
  "A.md": "veja [[B]] e [[C|apelido]] e [[A]]",
  "B.md": "volta para [[A]] e fala de [[Fora]]",
  "C.md": "sem links",
  "D.md": "[[B#Seção]]",
};
const resolve = (name) => (`${name}.md` in notes ? `${name}.md` : null);

test("Links entre as notas do conjunto: sem laço, sem repetição, sem o que está fora", () => {
  const edges = linksAmong(["A.md", "B.md", "C.md", "D.md"], (p) => notes[p], resolve);
  const key = (e) => `${e.source}>${e.target}`;
  assert.deepEqual(edges.map(key).sort(), ["A.md>B.md", "A.md>C.md", "B.md>A.md", "D.md>B.md"].sort());
  assert.equal(linksAmong(["A.md"], (p) => notes[p], resolve).length, 0, "B e C ficam de fora do conjunto");
});

test("Posições: é determinístico, e notas ligadas ficam mais perto que as separadas", () => {
  const ids = ["A.md", "B.md", "C.md", "D.md", "E.md", "F.md"];
  const edges = [{ source: "A.md", target: "B.md" }, { source: "B.md", target: "C.md" }, { source: "D.md", target: "E.md" }];
  const p1 = settleGraph(ids, edges);
  const p2 = settleGraph(ids, edges);
  assert.deepEqual(p1.get("A.md"), p2.get("A.md"), "mesma entrada, mesma saída");
  const d = (a, b) => Math.hypot(p1.get(a).x - p1.get(b).x, p1.get(a).y - p1.get(b).y);
  assert.ok(d("A.md", "B.md") < d("A.md", "E.md"), "ligadas mais perto");
  for (const id of ids) assert.ok(Number.isFinite(p1.get(id).x) && Number.isFinite(p1.get(id).y), id);
});

test("Canvas: posições centradas no ponto escolhido e com o tamanho do cartão", () => {
  const pos = placeOnCanvas(new Map([["A.md", { x: 0, y: 0 }], ["B.md", { x: 100, y: 0 }]]), { cx: 500, cy: 300 });
  assert.equal(pos.get("A.md").x, 500 - 160, "centro menos metade do cartão");
  assert.ok(pos.get("B.md").x > pos.get("A.md").x);
  assert.equal(Number.isInteger(pos.get("B.md").y), true);
});

test("Cartões que se cruzam são afastados: nenhum fica por cima de outro", () => {
  const raw = new Map([["A", { x: 0, y: 0 }], ["B", { x: 10, y: 5 }], ["C", { x: 20, y: 0 }], ["D", { x: 400, y: 300 }]]);
  const placed = placeOnCanvas(raw, { cx: 0, cy: 0 });
  const sep = separateCards(placed, { cardW: 320, cardH: 240, gap: 40 });
  const ids = [...sep.keys()];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = sep.get(ids[i]), b = sep.get(ids[j]);
    const overlap = Math.abs(a.x - b.x) < 320 && Math.abs(a.y - b.y) < 240;
    assert.equal(overlap, false, `${ids[i]} e ${ids[j]} se cruzam`);
  }
});

test("Rótulo: o apelido do link vira o rótulo da seta", () => {
  const edges = linksAmong(["A.md", "B.md"], (p) => (p === "A.md" ? "veja [[B|a dupla]]" : ""), (n) => `${n}.md`);
  assert.equal(edges[0].label, "a dupla");
  const plain = linksAmong(["A.md", "B.md"], (p) => (p === "A.md" ? "veja [[B]]" : ""), (n) => `${n}.md`);
  assert.equal("label" in plain[0], false);
});

test("Cartões do grafo contornam os cartões que já estavam no canvas", () => {
  const sep = separateCards(new Map([["A", { x: 0, y: 0 }]]), { cardW: 320, cardH: 240, obstacles: [{ x: 0, y: 0, w: 320, h: 240 }] });
  const a = sep.get("A");
  const apart = Math.abs(a.x) >= 320 || Math.abs(a.y) >= 240; // sem sobreposição (folga de 20 px)
  assert.ok(apart, "saiu de cima do obstáculo");
});
