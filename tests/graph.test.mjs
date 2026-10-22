import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Layout, fitTransform, toScreen, toWorld, zoomAt } from "../src/layout.js";
import { internalLinkTarget, renderInline, extractMetadata } from "../src/markdown.js";

function rede(n, ligacoes, orfas = 0) {
  const nodes = Array.from({ length: n + orfas }, (_, i) => ({ id: `n${i}`, label: `n${i}`, degree: 0 }));
  const edges = ligacoes.map(([a, b]) => ({ source: `n${a}`, target: `n${b}` }));
  for (const e of edges) {
    nodes.find((x) => x.id === e.source).degree++;
    nodes.find((x) => x.id === e.target).degree++;
  }
  return { nodes, edges };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe("física do grafo", () => {
  test("assenta, sem valores inválidos e sem notas coladas", () => {
    const l = new Layout();
    l.setData(rede(8, [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [0, 4]]));
    const passos = l.settle();
    assert.ok(l.settled, "terminou de assentar");
    assert.ok(passos < 400);
    for (const n of l.nodes) assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
    let menor = Infinity;
    for (let i = 0; i < l.nodes.length; i++) for (let j = i + 1; j < l.nodes.length; j++) menor = Math.min(menor, dist(l.nodes[i], l.nodes[j]));
    assert.ok(menor > 12, `notas muito próximas: ${menor}`);
  });

  test("notas ligadas ficam mais perto do que notas sem ligação", () => {
    const l = new Layout();
    l.setData(rede(4, [[0, 1], [1, 2], [2, 3]]));
    l.settle();
    const [a, b, c, d] = l.nodes;
    assert.ok(dist(a, b) < dist(a, d), "vizinhas mais perto que as extremas");
    assert.ok(dist(c, d) < dist(a, d));
  });

  test("notas sem links não fogem para longe do grupo", () => {
    const l = new Layout();
    l.setData(rede(5, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]], 3));
    l.settle();
    const ligadas = l.nodes.filter((n) => n.degree > 0);
    const cx = ligadas.reduce((s, n) => s + n.x, 0) / ligadas.length;
    const cy = ligadas.reduce((s, n) => s + n.y, 0) / ligadas.length;
    const raio = Math.max(...ligadas.map((n) => Math.hypot(n.x - cx, n.y - cy)));
    for (const o of l.nodes.filter((n) => n.degree === 0)) {
      assert.ok(Math.hypot(o.x - cx, o.y - cy) < raio * 3 + 80, "órfã perto do grupo");
    }
  });

  test("o resultado não depende do tamanho da tela (a física não conhece o canvas)", () => {
    const a = new Layout();
    const b = new Layout();
    const dados = rede(6, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
    a.setData(dados);
    b.setData(dados);
    a.settle();
    b.settle();
    assert.deepEqual(a.nodes.map((n) => [Math.round(n.x), Math.round(n.y)]), b.nodes.map((n) => [Math.round(n.x), Math.round(n.y)]));
  });

  test("setData mantém a posição de quem já existia e reaquece a simulação", () => {
    const l = new Layout();
    l.setData(rede(3, [[0, 1], [1, 2]]));
    l.settle();
    const antes = { x: l.nodes[0].x, y: l.nodes[0].y };
    l.setData(rede(4, [[0, 1], [1, 2], [2, 3]]));
    assert.equal(l.nodes[0].x, antes.x);
    assert.equal(l.nodes[0].y, antes.y);
    assert.equal(l.settled, false);
  });

  test("nota fixada não se mexe enquanto o resto se ajusta", () => {
    const l = new Layout();
    l.setData(rede(3, [[0, 1], [1, 2]]));
    l.settle();
    const alvo = l.nodes[1];
    alvo.x = 500;
    alvo.y = 500;
    alvo.pinned = true;
    l.reheat(0.5);
    for (let i = 0; i < 50; i++) l.step();
    assert.equal(alvo.x, 500);
    assert.ok(dist(l.nodes[0], alvo) < 600, "a vizinha foi puxada em direção à nota fixada");
  });

  test("um cofre grande não vira um bolo: 44 notas ficam separadas", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const nodes = Array.from({ length: 44 }, (_, i) => ({ id: `n${i}`, label: `n${i}`, degree: 0 }));
    const edges = [];
    for (let i = 0; i < 40; i++) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const j = Math.floor(rnd() * 40);
        if (j !== i) {
          edges.push({ source: `n${i}`, target: `n${j}` });
          nodes[i].degree++;
          nodes[j].degree++;
        }
      }
    }
    const l = new Layout();
    l.setData({ nodes, edges });
    l.settle(600);
    let menor = Infinity;
    for (let i = 0; i < l.nodes.length; i++) for (let j = i + 1; j < l.nodes.length; j++) menor = Math.min(menor, dist(l.nodes[i], l.nodes[j]));
    assert.ok(menor > 18, `duas notas a ${menor.toFixed(1)} unidades`);
    const b = l.bounds();
    assert.ok(Math.max(b.w, b.h) < 2500, "grafo não se espalha sem limite");
  });

  test("vazio e uma única nota não quebram", () => {
    const l = new Layout();
    l.setData({ nodes: [], edges: [] });
    l.settle();
    assert.equal(l.bounds().w, 2);
    l.setData({ nodes: [{ id: "a", label: "a", degree: 0 }], edges: [] });
    l.settle();
    assert.ok(Number.isFinite(l.nodes[0].x));
  });
});

describe("enquadramento e zoom", () => {
  test("fitTransform coloca todas as notas dentro da área, com margem", () => {
    const l = new Layout();
    l.setData(rede(8, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]]));
    l.settle();
    const view = fitTransform(l.bounds(), 300, 200);
    for (const n of l.nodes) {
      const p = toScreen(view, n);
      assert.ok(p.x >= 0 && p.x <= 300 && p.y >= 0 && p.y <= 200, `fora da área: ${p.x},${p.y}`);
    }
  });

  test("fitTransform serve para áreas pequenas e grandes", () => {
    const l = new Layout();
    l.setData(rede(5, [[0, 1], [1, 2], [2, 3], [3, 4]]));
    l.settle();
    const pequena = fitTransform(l.bounds(), 240, 190);
    const grande = fitTransform(l.bounds(), 1400, 800);
    assert.ok(grande.scale >= pequena.scale);
    assert.ok(grande.scale <= 1.6);
  });

  test("toWorld é o inverso de toScreen", () => {
    const view = { x: 40, y: -12, scale: 1.7 };
    const p = { x: 33, y: 71 };
    const volta = toWorld(view, toScreen(view, p));
    assert.ok(Math.abs(volta.x - p.x) < 1e-9 && Math.abs(volta.y - p.y) < 1e-9);
  });

  test("zoomAt mantém o ponto sob o cursor no mesmo lugar e respeita os limites", () => {
    const view = { x: 10, y: 20, scale: 1 };
    const cursor = { x: 200, y: 120 };
    const mundoAntes = toWorld(view, cursor);
    const novo = zoomAt(view, cursor, 1.5);
    const mundoDepois = toWorld(novo, cursor);
    assert.ok(Math.abs(mundoAntes.x - mundoDepois.x) < 1e-9 && Math.abs(mundoAntes.y - mundoDepois.y) < 1e-9);
    assert.equal(zoomAt(view, cursor, 100).scale, 5);
    assert.equal(zoomAt(view, cursor, 0.0001).scale, 0.15);
  });
});

describe("links comuns para notas", () => {
  test("distingue endereço externo, âncora, arquivo que não é nota e caminho de nota", () => {
    assert.equal(internalLinkTarget("https://exemplo.com"), null);
    assert.equal(internalLinkTarget("mailto:a@b.com"), null);
    assert.equal(internalLinkTarget("//cdn.exemplo.com/x"), null);
    assert.equal(internalLinkTarget("#Seção"), null);
    assert.equal(internalLinkTarget("imagem.png"), null);
    assert.equal(internalLinkTarget("manual.pdf#page=2"), null);
    assert.equal(internalLinkTarget("Nota.md"), "Nota");
    assert.equal(internalLinkTarget("Minha%20Nota.md#Se%C3%A7%C3%A3o"), "Minha Nota#Seção");
    assert.equal(internalLinkTarget("pasta/Nota"), "pasta/Nota");
  });

  test("[texto](Nota.md#Seção) vira link interno; externo continua em outra aba", () => {
    const interno = renderInline("[ver aqui](Nota.md#Metas)", () => ({ exists: true }));
    assert.match(interno, /class="wikilink"/);
    assert.match(interno, /data-target="Nota#Metas"/);
    assert.match(interno, />ver aqui</);
    const faltando = renderInline("[x](Falta.md)", () => ({ exists: false }));
    assert.match(faltando, /wikilink unresolved/);
    const externo = renderInline("[site](https://exemplo.com)", () => ({ exists: true }));
    assert.match(externo, /target="_blank"/);
    assert.doesNotMatch(externo, /wikilink/);
  });

  test("link só com seção mostra apenas o título", () => {
    const html = renderInline("[[#Atalhos]]", () => ({ exists: true }));
    assert.match(html, />Atalhos</);
    assert.doesNotMatch(html, /›/);
  });

  test("o índice conta links comuns para notas, mas não imagens nem endereços externos", () => {
    const meta = extractMetadata("Veja [Outra](Outra.md#Seção), ![foto](foto.png), [web](https://a.com) e [[Wiki]].");
    assert.deepEqual(meta.links.map((l) => l.target).sort(), ["Outra#Seção", "Wiki"]);
  });
});
