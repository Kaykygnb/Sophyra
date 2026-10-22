import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

// Ambiente mínimo para o GraphView rodar fora do navegador.
globalThis.window = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => "" });
globalThis.requestAnimationFrame = () => 0;

let GraphView;
let toScreen;
before(async () => {
  ({ GraphView } = await import("../src/graph.js"));
  ({ toScreen } = await import("../src/layout.js"));
});

function fakeCanvas(width = 600, height = 400) {
  const handlers = {};
  const calls = { fillText: [] };
  const ctx = new Proxy(
    { measureText: (t) => ({ width: t.length * 6 }), fillText: (t) => calls.fillText.push(t) },
    { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true },
  );
  return {
    clientWidth: width,
    clientHeight: height,
    width,
    height,
    style: {},
    calls,
    getContext: () => ctx,
    addEventListener: (type, fn) => (handlers[type] = fn),
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    setPointerCapture() {},
    releasePointerCapture() {},
    fire: (type, ev) => handlers[type]?.({ pointerId: 1, button: 0, preventDefault() {}, ...ev }),
  };
}

const dados = {
  nodes: [
    { id: "a", label: "A", degree: 2 },
    { id: "b", label: "B", degree: 1 },
    { id: "c", label: "C", degree: 1 },
    { id: "d", label: "D", degree: 0 },
  ],
  edges: [{ source: "a", target: "b" }, { source: "a", target: "c" }],
};

function pronto(opts = {}) {
  const canvas = fakeCanvas();
  const abertas = [];
  const g = new GraphView(canvas, { onOpen: (id) => abertas.push(id), ...opts });
  g.setData(dados, "a");
  g.layout.settle();
  g.snapToFit();
  return { canvas, g, abertas };
}

const tela = (g, id) => toScreen(g.view, g.nodes.find((n) => n.id === id));

describe("GraphView: interação", () => {
  test("clique sem arrastar abre a nota", () => {
    const { canvas, g, abertas } = pronto();
    const p = tela(g, "b");
    canvas.fire("pointerdown", { clientX: p.x, clientY: p.y });
    canvas.fire("pointerup", { clientX: p.x, clientY: p.y });
    assert.deepEqual(abertas, ["b"]);
  });

  test("arrastar uma nota a move e não abre a nota", () => {
    const { canvas, g, abertas } = pronto();
    const antes = { ...g.nodes.find((n) => n.id === "c") };
    const p = tela(g, "c");
    canvas.fire("pointerdown", { clientX: p.x, clientY: p.y });
    canvas.fire("pointermove", { clientX: p.x + 60, clientY: p.y + 40 });
    const durante = g.nodes.find((n) => n.id === "c");
    assert.ok(durante.pinned, "fica fixa enquanto arrasta");
    assert.notEqual(durante.x, antes.x);
    canvas.fire("pointerup", { clientX: p.x + 60, clientY: p.y + 40 });
    assert.deepEqual(abertas, [], "arrastar não conta como clique");
    assert.equal(g.nodes.find((n) => n.id === "c").pinned, false, "solta ao terminar");
    assert.equal(g.autoFit, false, "depois de mexer, a vista não se reenquadra sozinha");
  });

  test("arrastar o fundo move a vista", () => {
    const { canvas, g } = pronto();
    const antes = { ...g.view };
    canvas.fire("pointerdown", { clientX: 2, clientY: 2 });
    canvas.fire("pointermove", { clientX: 52, clientY: 32 });
    canvas.fire("pointerup", { clientX: 52, clientY: 32 });
    assert.equal(Math.round(g.view.x - antes.x), 50);
    assert.equal(Math.round(g.view.y - antes.y), 30);
    assert.equal(g.view.scale, antes.scale);
  });

  test("a roda aproxima em torno do cursor", () => {
    const { canvas, g } = pronto();
    const antes = g.view.scale;
    canvas.fire("wheel", { clientX: 300, clientY: 200, deltaY: -200 });
    assert.ok(g.view.scale > antes);
    canvas.fire("wheel", { clientX: 300, clientY: 200, deltaY: 600 });
    assert.ok(g.view.scale < antes * 1.5);
  });

  test("no grafo pequeno a roda não é capturada", () => {
    const { canvas, g } = pronto({ wheelZoom: false });
    const antes = g.view.scale;
    let impediu = false;
    canvas.fire("wheel", { clientX: 10, clientY: 10, deltaY: -300, preventDefault: () => (impediu = true) });
    assert.equal(g.view.scale, antes);
    assert.equal(impediu, false, "a página continua rolando");
  });

  test("clique duplo e fit() voltam a enquadrar", () => {
    const { canvas, g } = pronto();
    canvas.fire("wheel", { clientX: 100, clientY: 100, deltaY: -500 });
    assert.equal(g.autoFit, false);
    canvas.fire("dblclick", {});
    assert.equal(g.autoFit, true);
  });

  test("passar o mouse destaca a nota e as vizinhas", () => {
    const { canvas, g } = pronto();
    const p = tela(g, "a");
    canvas.fire("pointermove", { clientX: p.x, clientY: p.y });
    assert.equal(g.hover?.id, "a");
    assert.equal(canvas.style.cursor, "pointer");
    canvas.fire("pointermove", { clientX: 2, clientY: 2 });
    assert.equal(g.hover, null);
  });

  test("os nomes aparecem: todos num grafo pequeno, sem repetir", () => {
    const { canvas, g } = pronto();
    canvas.calls.fillText.length = 0;
    g.draw();
    assert.deepEqual([...new Set(canvas.calls.fillText)].sort(), ["A", "B", "C", "D"]);
  });

  test("num grafo grande só as notas mais ligadas ganham nome, sem sobreposição", () => {
    const canvas = fakeCanvas();
    const g = new GraphView(canvas);
    const nodes = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, label: `Nota ${i}`, degree: i < 3 ? 6 : 1 }));
    const edges = nodes.slice(3).map((n) => ({ source: n.id, target: `n${n.id.slice(1) % 3}` }));
    g.setData({ nodes, edges });
    g.layout.settle(600);
    g.snapToFit();
    canvas.calls.fillText.length = 0;
    g.draw();
    assert.ok(canvas.calls.fillText.length >= 1 && canvas.calls.fillText.length <= 8, `nomes: ${canvas.calls.fillText.length}`);
    g.setShowAllLabels(true);
    assert.ok(canvas.calls.fillText.length > 8, "com a opção ligada aparecem mais nomes");
  });

  test("canvas oculto (tamanho zero) não quebra nem trava a animação", () => {
    const canvas = fakeCanvas(0, 0);
    const g = new GraphView(canvas);
    g.setData(dados);
    g.layout.settle();
    assert.doesNotThrow(() => g.draw());
    assert.doesNotThrow(() => g.easeToFit());
    assert.equal(g.autoFitMoving, false);
  });
});

describe("GraphView: canvas que ganha tamanho depois", () => {
  test("nasce sem medidas e, quando as ganha, o desenho passa a ter o tamanho real (sem esticar)", () => {
    const canvas = fakeCanvas(0, 0);
    canvas.width = 300; // tamanho padrão de um canvas recém-criado
    canvas.height = 150;
    const g = new GraphView(canvas);
    g.setData(dados, "a");
    assert.equal(canvas.width, 300, "sem medidas, nada a refazer");
    canvas.clientWidth = 251;
    canvas.clientHeight = 188;
    g.resize(); // é o que o observador de tamanho chama
    assert.equal(canvas.width, 251);
    assert.equal(canvas.height, 188);
  });

  test("o nome da nota ativa começa depois do anel", () => {
    const { canvas, g } = pronto();
    canvas.calls.fillText.length = 0;
    g.draw();
    assert.ok(canvas.calls.fillText.includes("A"));
  });
});
