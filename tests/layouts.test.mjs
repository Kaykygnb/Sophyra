import test from "node:test";
import assert from "node:assert/strict";
import { captureLayout, sanitizeLayouts, saveLayout, deleteLayout, resolveLayout, MAX_LAYOUTS } from "../src/layouts.js";

const ws = {
  tabs: ["@home", "A.md", "B.md"], pinned: ["A.md"], sideOpen: true, ctxOpen: false,
  split: { open: true, tabs: ["C.md"], active: "C.md", edit: false },
};

test("Capturar: guarda abas, fixadas, painel da direita e painéis abertos", () => {
  const l = captureLayout(ws, "B.md");
  assert.deepEqual(l.tabs, ["@home", "A.md", "B.md"]);
  assert.equal(l.active, "B.md");
  assert.deepEqual(l.pinned, ["A.md"]);
  assert.equal(l.split.open, true);
  assert.equal(l.ctxOpen, false);
  assert.ok(l.savedAt > 0);
});

test("Salvar: o mesmo nome substitui; nomes vazios ou enormes são recusados", () => {
  let all = saveLayout({}, "  Estudo  ", captureLayout(ws, "A.md"));
  assert.deepEqual(Object.keys(all), ["Estudo"]);
  all = saveLayout(all, "Estudo", captureLayout({ ...ws, tabs: ["@home"] }, "@home"));
  assert.deepEqual(all["Estudo"].tabs, ["@home"]);
  assert.deepEqual(saveLayout(all, "   ", captureLayout(ws, null)), all);
  assert.deepEqual(saveLayout(all, "x".repeat(81), captureLayout(ws, null)), all);
});

test("Salvar: o mais recente vem primeiro e há um limite de quantos", () => {
  let all = {};
  for (let i = 0; i < MAX_LAYOUTS + 5; i++) all = saveLayout(all, `n${i}`, { ...captureLayout(ws, null), savedAt: 1000 + i });
  assert.equal(Object.keys(all).length, MAX_LAYOUTS);
  assert.equal(Object.keys(all)[0], `n${MAX_LAYOUTS + 4}`);
});

test("Excluir e limpar dados estragados", () => {
  const all = saveLayout({}, "A", captureLayout(ws, null));
  assert.deepEqual(deleteLayout(all, "A"), {});
  assert.deepEqual(deleteLayout(all, "nada"), all);
  assert.deepEqual(sanitizeLayouts(null), {});
  assert.deepEqual(sanitizeLayouts([1]), {});
  const s = sanitizeLayouts({ ok: { tabs: ["A.md", "A.md", 3], active: "zz", pinned: ["A.md", "B.md"], split: "lixo" }, ruim: { tabs: "x" }, "": { tabs: [] } });
  assert.deepEqual(Object.keys(s), ["ok"]);
  assert.deepEqual(s.ok.tabs, ["A.md"]);
  assert.equal(s.ok.active, "A.md");
  assert.deepEqual(s.ok.pinned, ["A.md"]);
  assert.equal(s.ok.split.open, false);
});

test("Carregar: notas que sumiram saem e o resto continua; telas do app ficam", () => {
  const l = captureLayout(ws, "B.md");
  const r = resolveLayout(l, (p) => p !== "B.md");
  assert.deepEqual(r.tabs, ["@home", "A.md"]);
  assert.equal(r.active, "@home", "a aba ativa sumiu: cai na primeira");
  assert.equal(r.missing, 1);
  assert.deepEqual(r.pinned, ["A.md"]);
  assert.deepEqual(r.split.tabs, ["C.md"]);
  const gone = resolveLayout(l, () => false);
  assert.deepEqual(gone.tabs, ["@home"]);
  assert.equal(gone.split.open, false, "painel da direita sem notas fecha");
  const empty = resolveLayout({ ...l, tabs: ["A.md"], pinned: [], active: "A.md" }, () => false);
  assert.deepEqual(empty.tabs, ["@home"]);
  assert.equal(empty.active, "@home");
});
