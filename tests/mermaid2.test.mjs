import test from "node:test";
import assert from "node:assert/strict";
import { parseState, parsePie, parseClass, renderMermaid, diagramType } from "../src/mermaid.js";

test("Estados: transições, início, fim e rótulos", () => {
  const m = parseState("stateDiagram-v2\n[*] --> Ocioso\nOcioso --> Ativo : começa\nAtivo --> Ocioso : para\nAtivo --> [*]");
  assert.deepEqual(m.nodes.map((n) => n.id), ["__start", "Ocioso", "Ativo", "__end"]);
  assert.equal(m.nodes[0].shape, "start");
  assert.equal(m.nodes[3].shape, "end");
  assert.deepEqual(m.edges.map((e) => e.label), ["", "começa", "para", ""]);
  assert.equal(m.dir, "TD");
});

test("Estados: descrição, apelido e direção", () => {
  const m = parseState('stateDiagram\ndirection LR\nstate "Esperando pedido" as Espera\nEspera --> Fim\nFim : Concluído');
  assert.equal(m.dir, "LR");
  assert.equal(m.nodes.find((n) => n.id === "Espera").label, "Esperando pedido");
  assert.equal(m.nodes.find((n) => n.id === "Fim").label, "Concluído");
});

test("Estados: erros claros e desenho com início e fim", () => {
  assert.throws(() => parseState("stateDiagram\nA ~~~ B ??"), /não reconhecida/);
  assert.throws(() => parseState("stateDiagram"), /vazio/);
  const html = renderMermaid("stateDiagram-v2\n[*] --> A\nA --> [*]");
  assert.match(html, /data-type="state"/);
  assert.match(html, /class="m-start"/);
});

test("Pizza: título, fatias, showData e validações", () => {
  const p = parsePie('pie showData title Bichos\n"Cães" : 10\n"Gatos" : 5.5');
  assert.equal(p.title, "Bichos");
  assert.equal(p.showData, true);
  assert.deepEqual(p.slices, [{ label: "Cães", value: 10 }, { label: "Gatos", value: 5.5 }]);
  assert.throws(() => parsePie("pie\n"), /sem fatias/);
  assert.throws(() => parsePie('pie\n"a" : -1'), /negativo/);
  assert.throws(() => parsePie('pie\n"a" : 0'), /zero/);
  assert.throws(() => parsePie("pie\ncoisa"), /não reconhecida/);
});

test("Pizza: o SVG tem uma fatia por valor e a legenda com porcentagem", () => {
  const html = renderMermaid('pie title T\n"A" : 1\n"B" : 1\n"C" : 2');
  assert.equal((html.match(/class="m-slice"/g) || []).length, 3);
  assert.match(html, /A — 25%/);
  assert.match(html, /C — 50%/);
  assert.match(renderMermaid('pie\n"Só" : 3'), /<circle class="m-slice"/, "uma fatia inteira vira círculo");
  assert.match(renderMermaid('pie\n"a" : 1\n"b" : 0'), /class="m-slice"/);
});

test("Classes: membros, relações e rótulos", () => {
  const m = parseClass("classDiagram\nclass Animal {\n  +nome: string\n  +comer()\n}\nAnimal <|-- Cachorro\nCachorro : +latir()\nCachorro --> Dono : pertence a\nDono *-- Casa");
  assert.deepEqual(m.classes.map((c) => c.name), ["Animal", "Cachorro", "Dono", "Casa"]);
  assert.deepEqual(m.classes[0].members, ["+nome: string", "+comer()"]);
  assert.deepEqual(m.classes[1].members, ["+latir()"]);
  assert.deepEqual(m.relations.map((r) => [r.kind, r.reversed, r.label]), [["inherit", true, ""], ["arrow", false, "pertence a"], ["compose", true, ""]]);
});

test("Classes: erros e desenho com caixas e marcadores", () => {
  assert.throws(() => parseClass("classDiagram\nclass A {\n  +x"), /Falta fechar/);
  assert.throws(() => parseClass("classDiagram\nlixo lixo lixo"), /não reconhecida/);
  assert.throws(() => parseClass("classDiagram"), /vazio/);
  const html = renderMermaid("classDiagram\nAnimal <|-- Cachorro\nAnimal : +nome");
  assert.match(html, /data-type="class"/);
  assert.equal((html.match(/<rect class="m-node"/g) || []).length, 2);
  assert.match(html, /marker-end="url\(#m-tri\)"/);
});

test("Tipos: reconhece os novos e continua avisando dos outros", () => {
  assert.equal(diagramType("stateDiagram-v2\nA-->B"), "state");
  assert.equal(diagramType("classDiagram\n"), "class");
  assert.equal(diagramType("pie\n"), "pie");
  const journey = renderMermaid("journey\ntitle x");
  assert.match(journey, /mermaid-error/);
  assert.match(journey, /classes, pizza/);
});
