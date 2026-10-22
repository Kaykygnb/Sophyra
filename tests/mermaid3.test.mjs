import test from "node:test";
import assert from "node:assert/strict";
import { parseEr, parseGantt, renderMermaid, diagramType } from "../src/mermaid.js";

const DAY = 24 * 3600 * 1000;
const t = (s) => Date.parse(`${s}T00:00:00Z`);

test("ER: entidades, atributos com chaves e relações com cardinalidade", () => {
  const m = parseEr(`erDiagram
  CLIENTE ||--o{ PEDIDO : faz
  PEDIDO ||--|{ ITEM : contem
  PRODUTO }o..o| CATEGORIA : "pertence a"
  CLIENTE {
    int id PK
    string nome
    string email UK
  }`);
  assert.deepEqual(m.entities.map((e) => e.name), ["CLIENTE", "PEDIDO", "ITEM", "PRODUTO", "CATEGORIA"]);
  assert.deepEqual(m.entities[0].attrs.map((a) => [a.type, a.name, a.keys]), [["int", "id", ["PK"]], ["string", "nome", []], ["string", "email", ["UK"]]]);
  assert.deepEqual(m.relations.map((r) => [r.fromCard, r.toCard, r.dashed, r.label]), [["1", "0..N", false, "faz"], ["1", "1..N", false, "contem"], ["0..N", "0..1", true, "pertence a"]]);
});

test("ER: erros claros e desenho com caixas e cardinalidade", () => {
  assert.throws(() => parseEr("erDiagram\nA {\n int x"), /Falta fechar/);
  assert.throws(() => parseEr("erDiagram\nA ?? B : x"), /não reconhecida/);
  assert.throws(() => parseEr("erDiagram\nA {\n isto não é atributo ok ok ok\n}"), /Atributo/);
  assert.throws(() => parseEr("erDiagram"), /vazio/);
  const html = renderMermaid("erDiagram\nCLIENTE ||--o{ PEDIDO : faz\nCLIENTE {\n int id PK\n}");
  assert.match(html, /data-type="er"/);
  assert.equal((html.match(/<rect class="m-node"/g) || []).length, 2);
  assert.match(html, />1</);
  assert.match(html, />0\.\.N</);
});

test("Gantt: datas, durações, dependências e estados", () => {
  const g = parseGantt(`gantt
  title Plano
  dateFormat YYYY-MM-DD
  section Fase 1
  Projeto :a1, 2026-01-01, 10d
  Código :after a1, 5d
  Revisão :crit, r1, 2026-01-20, 2026-01-25
  section Fase 2
  Entrega :milestone, 2026-02-01, 0d`);
  assert.equal(g.title, "Plano");
  const [a, b, c, d] = g.tasks;
  assert.equal(a.start, t("2026-01-01"));
  assert.equal(a.end, t("2026-01-01") + 10 * DAY);
  assert.equal(b.start, a.end, "depois da anterior");
  assert.equal(b.end, b.start + 5 * DAY);
  assert.equal(c.status, "crit");
  assert.equal(c.end, t("2026-01-25"));
  assert.equal(d.status, "milestone");
  assert.equal(d.end, d.start);
  assert.deepEqual(g.tasks.map((x) => x.section), ["Fase 1", "Fase 1", "Fase 1", "Fase 2"]);
});

test("Gantt: sem início definido a tarefa segue a anterior; só duração na primeira é erro", () => {
  const g = parseGantt("gantt\nA : 2026-03-01, 2d\nB : 3d");
  assert.equal(g.tasks[1].start, g.tasks[0].end);
  assert.throws(() => parseGantt("gantt\nA : 3d"), /primeira tarefa/);
});

test("Gantt: erros claros", () => {
  assert.throws(() => parseGantt("gantt\nA : after x, 2d"), /depende de “x”/);
  assert.throws(() => parseGantt("gantt\nA : 2026-02-30, 2d"), /Data inválida/);
  assert.throws(() => parseGantt("gantt\nA : 2026-02-10, 2026-02-01"), /termina antes/);
  assert.throws(() => parseGantt("gantt\nA :"), /não reconhecida/);
  assert.throws(() => parseGantt("gantt\ntitle Só título"), /sem tarefas/);
  assert.throws(() => parseGantt("gantt\nlinha sem dois pontos"), /não reconhecida/);
});

test("Gantt: o SVG tem uma barra por tarefa e losango no marco", () => {
  const html = renderMermaid("gantt\ntitle X\nsection S\nA : 2026-01-01, 4d\nB : after x, 2d");
  assert.match(html, /mermaid-error/, "dependência inexistente vira aviso");
  const ok = renderMermaid("gantt\nsection S\nA : a, 2026-01-01, 4d\nB : after a, 2d\nMarco : milestone, 2026-01-08, 0d");
  assert.equal((ok.match(/<rect class="m-bar/g) || []).length, 2);
  assert.equal((ok.match(/<polygon class="m-bar milestone"/g) || []).length, 1);
  assert.match(ok, /data-type="gantt"/);
});

test("Tipos: ER e gantt reconhecidos; outros continuam avisando", () => {
  assert.equal(diagramType("erDiagram\n"), "er");
  assert.equal(diagramType("gantt\n"), "gantt");
  const html = renderMermaid("journey\ntitle x");
  assert.match(html, /mermaid-error/);
  assert.match(html, /ER e gantt/);
});
