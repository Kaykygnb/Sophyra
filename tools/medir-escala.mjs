// Mede o tempo das partes pesadas do app com cofres sintéticos de vários tamanhos. Uso:
//   node tools/medir-escala.mjs [1000 5000 20000]
// Mede só o que roda no motor (sem DOM): ler metadados, índice de links e tarefas, linhas de base, filtro/ordem e
// agrupamento de tarefas. A pintura da tela não está aqui; ela é medida no navegador.

import { Vault } from "../src/vault.js";
import { MetadataIndex } from "../src/index.js";
import { collectRows, applyView, makeView, typesFor } from "../src/bases.js";
import { groupTasks } from "../src/tasks.js";

const sizes = (process.argv.slice(2).length ? process.argv.slice(2) : ["1000", "5000", "20000"]).map(Number);

function fakeNote(i, n) {
  const day = String((i % 28) + 1).padStart(2, "0");
  const links = [1, 7, 42].map((k) => `[[Nota ${(i * k) % n}]]`).join(" e ");
  return [
    "---",
    `tags: [area${i % 9}, tema${i % 23}]`,
    `status: ${["feito", "fazendo", "ideia"][i % 3]}`,
    `prioridade: ${i % 5}`,
    `prazo: 2026-11-${day}`,
    "---",
    `# Nota ${i}`,
    "",
    `Texto da nota ${i}, falando de coisas. ${links}.`,
    "",
    `- [ ] tarefa ${i} @${day}/11/2026`,
    `- [x] feita ${i}`,
    "",
  ].join("\n");
}

function time(label, fn) {
  const t0 = performance.now();
  const out = fn();
  return { label, ms: Math.round(performance.now() - t0), out };
}

for (const n of sizes) {
  const vault = new Vault("escala");
  for (let i = 0; i < n; i++) vault.create(`Pasta ${i % 20}/Nota ${i}.md`, fakeNote(i, n));
  const files = vault.markdownFiles();
  const index = new MetadataIndex(vault);

  const steps = [];
  steps.push(time("ler metadados de todas as notas", () => files.map((f) => index.meta(f.path))));
  steps.push(time("índice de links e tarefas (depois de ler)", () => index.tasks().length));
  steps.push(time("linhas da base (todas as notas)", () => collectRows(vault.list(), { folder: "" }, (f) => index.meta(f.path))));
  const rows = collectRows(vault.list(), { folder: "" }, (f) => index.meta(f.path));
  const view = { ...makeView("table"), sort: [{ key: "prazo", dir: "asc" }], filters: [{ key: "status", op: "is", value: "fazendo" }] };
  const types = typesFor(rows, ["prazo", "status", "prioridade"], {});
  steps.push(time("filtrar e ordenar a base", () => applyView(rows, view, types).length));
  steps.push(time("agrupar tarefas por prazo", () => groupTasks(index.tasks()).late.length));

  console.log(`\n${n} notas`);
  for (const s of steps) console.log(`  ${s.label.padEnd(44)} ${String(s.ms).padStart(6)} ms`);
}
