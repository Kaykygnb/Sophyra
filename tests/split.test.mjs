import test from "node:test";
import assert from "node:assert/strict";
import { emptySplit, sanitizeSplit, splitOpen, splitActivate, splitCloseTab, splitClose, splitRename, splitDelete, splitDropMissing } from "../src/splitstate.js";
import { sanitizeWorkspace } from "../src/workspace.js";

test("Split: começa fechado e abrir cria a aba e ativa", () => {
  const s = splitOpen(emptySplit(), "A.md");
  assert.deepEqual(s, { open: true, tabs: ["A.md"], active: "A.md", edit: false });
  const t = splitOpen(s, "B.md");
  assert.deepEqual(t.tabs, ["A.md", "B.md"]);
  assert.equal(t.active, "B.md");
  assert.deepEqual(splitOpen(t, "A.md").tabs, ["A.md", "B.md"], "sem repetir aba");
  assert.equal(splitOpen(t, "A.md").active, "A.md");
});

test("Split: não abre telas do app nem textos inválidos", () => {
  assert.equal(splitOpen(emptySplit(), "@home").open, false);
  assert.equal(splitOpen(emptySplit(), "").open, false);
  assert.equal(splitOpen(emptySplit(), 5).open, false);
});

test("Split: fechar aba escolhe a vizinha; sem abas o painel fecha", () => {
  let s = splitOpen(splitOpen(splitOpen(emptySplit(), "A.md"), "B.md"), "C.md");
  s = splitCloseTab(s, "C.md");
  assert.equal(s.active, "B.md");
  s = splitCloseTab(s, "A.md");
  assert.deepEqual(s.tabs, ["B.md"]);
  s = splitCloseTab(s, "B.md");
  assert.deepEqual(s, emptySplit());
  assert.deepEqual(splitCloseTab(emptySplit(), "X.md"), emptySplit());
});

test("Split: fechar o painel mantém as abas para reabrir; ativar só vale para abas abertas", () => {
  const s = splitOpen(splitOpen(emptySplit(), "A.md"), "B.md");
  const c = splitClose(s);
  assert.equal(c.open, false);
  assert.deepEqual(c.tabs, ["A.md", "B.md"]);
  assert.equal(splitActivate(s, "A.md").active, "A.md");
  assert.equal(splitActivate(s, "Z.md").active, "B.md");
});

test("Split: renomear e excluir acompanham o cofre", () => {
  const s = splitOpen(splitOpen(emptySplit(), "A.md"), "B.md");
  const r = splitRename(s, "B.md", "Novo.md");
  assert.deepEqual(r.tabs, ["A.md", "Novo.md"]);
  assert.equal(r.active, "Novo.md");
  assert.deepEqual(splitRename(s, "nada.md", "x.md"), s);
  const d = splitDelete(r, "Novo.md");
  assert.deepEqual(d.tabs, ["A.md"]);
  assert.equal(d.active, "A.md");
});

test("Split: tira abas de arquivos que não existem mais", () => {
  const s = splitOpen(splitOpen(emptySplit(), "A.md"), "B.md");
  assert.deepEqual(splitDropMissing(s, (p) => p === "A.md").tabs, ["A.md"]);
  assert.deepEqual(splitDropMissing(s, () => false), emptySplit());
});

test("Split: dados estragados viram um estado válido", () => {
  assert.deepEqual(sanitizeSplit(null), emptySplit());
  assert.deepEqual(sanitizeSplit([1]), emptySplit());
  const s = sanitizeSplit({ open: true, tabs: ["A.md", "A.md", 3, "@home", ""], active: "sumiu.md", edit: "sim" });
  assert.deepEqual(s, { open: true, tabs: ["A.md"], active: "A.md", edit: false });
  assert.equal(sanitizeSplit({ open: true, tabs: [] }).open, false, "aberto sem abas não faz sentido");
});

test("Workspace: o painel da direita é guardado e corrigido junto", () => {
  const ok = sanitizeWorkspace({ tabs: ["A.md"], active: "A.md", split: { open: true, tabs: ["B.md"], active: "B.md", edit: true } });
  assert.deepEqual(ok.ws.split, { open: true, tabs: ["B.md"], active: "B.md", edit: true });
  assert.deepEqual(ok.issues, []);
  const bad = sanitizeWorkspace({ tabs: ["A.md"], split: "lixo" });
  assert.deepEqual(bad.ws.split, emptySplit());
  assert.ok(bad.issues.some((i) => /direita/.test(i)));
  assert.deepEqual(sanitizeWorkspace({ tabs: [] }).ws.split, emptySplit(), "ausente é normal");
});

import { splitSwap, splitToggleEdit } from "../src/splitstate.js";

test("Split: trocar os painéis leva cada nota para o outro lado", () => {
  const s = splitOpen(emptySplit(), "B.md");
  const r = splitSwap(s, "A.md");
  assert.equal(r.main, "B.md");
  assert.equal(r.split.active, "A.md");
  assert.deepEqual(r.split.tabs, ["B.md", "A.md"]);
  assert.equal(splitSwap(emptySplit(), "A.md"), null, "sem painel aberto");
  assert.equal(splitSwap(s, "B.md"), null, "a mesma nota nos dois lados");
  assert.equal(splitSwap(s, null), null);
  assert.equal(splitSwap({ ...s, open: false }, "A.md"), null);
});

test("Split: alternar leitura e edição do painel da direita", () => {
  const s = splitOpen(emptySplit(), "A.md");
  assert.equal(splitToggleEdit(s).edit, true);
  assert.equal(splitToggleEdit(splitToggleEdit(s)).edit, false);
  assert.equal(splitToggleEdit(s).open, true);
});
