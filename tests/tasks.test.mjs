import test from "node:test";
import assert from "node:assert/strict";
import { dueOf, groupTasks, taskSummary } from "../src/tasks.js";

const now = new Date(2026, 9, 22, 10); // 22/10/2026

test("Prazo: data no texto da tarefa, em vários formatos", () => {
  assert.equal(dueOf("pagar a conta @25/12/2026", now), "2026-12-25");
  assert.equal(dueOf("entregar 2026-11-05 cedo", now), "2026-11-05");
  assert.equal(dueOf("ligar @5/11", now), "2026-11-05", "sem ano usa o ano atual");
  assert.equal(dueOf("revisar 3/2", now), "2027-02-03", "se já passou este ano, vai para o próximo");
  assert.equal(dueOf("sem data nenhuma", now), "");
  assert.equal(dueOf("data que não existe 31/02/2026", now), "");
});

test("Grupos: atrasadas, hoje, próximos 7 dias, depois e sem prazo", () => {
  const tasks = [
    { text: "a @20/10/2026", path: "A.md", done: false },
    { text: "b @22/10/2026", path: "A.md", done: false },
    { text: "c @28/10/2026", path: "A.md", done: false },
    { text: "d @01/12/2026", path: "A.md", done: false },
    { text: "e sem prazo", path: "B.md", done: false },
    { text: "f feita @23/10/2026", path: "B.md", done: true },
  ];
  const g = groupTasks(tasks, now);
  assert.deepEqual(g.late.map((t) => t.text), ["a @20/10/2026"]);
  assert.deepEqual(g.today.map((t) => t.text), ["b @22/10/2026"]);
  assert.deepEqual(g.week.map((t) => t.text), ["c @28/10/2026"]);
  assert.deepEqual(g.later.map((t) => t.text), ["d @01/12/2026"]);
  assert.deepEqual(g.none.map((t) => t.text), ["e sem prazo"]);
  assert.deepEqual(g.done.map((t) => t.text), ["f feita @23/10/2026"]);
});

test("Grupos: dentro de cada grupo, a data mais cedo vem primeiro", () => {
  const tasks = [
    { text: "x @28/10/2026", path: "A.md", done: false },
    { text: "y @24/10/2026", path: "A.md", done: false },
  ];
  assert.deepEqual(groupTasks(tasks, now).week.map((t) => t.text), ["y @24/10/2026", "x @28/10/2026"]);
});

test("Resumo: contagens para o cabeçalho", () => {
  const g = groupTasks([
    { text: "a @20/10/2026", path: "A.md", done: false },
    { text: "b @22/10/2026", path: "A.md", done: false },
    { text: "c", path: "A.md", done: true },
  ], now);
  assert.deepEqual(taskSummary(g), { open: 2, late: 1, today: 1, done: 1 });
});
