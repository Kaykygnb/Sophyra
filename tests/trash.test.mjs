import test from "node:test";
import assert from "node:assert/strict";
import {
  trashAdd, trashRestore, trashRemove, trashPurge, sanitizeTrash, snapshotAdd, snapshotRename, snapshotRemove, sanitizeSnapshots, diffSummary,
  TRASH_MAX_ITEMS, SNAP_MAX_PER_NOTE, SNAP_MIN_INTERVAL, SNAP_MAX_CHARS,
} from "../src/trash.js";

const DAY = 24 * 3600 * 1000;

test("Lixeira: o mais novo vem primeiro e um caminho repetido substitui o anterior", () => {
  let t = trashAdd([], { path: "A.md", content: "a" }, 1);
  t = trashAdd(t, { path: "B.md", content: "b" }, 2);
  assert.deepEqual(t.map((i) => i.path), ["B.md", "A.md"]);
  t = trashAdd(t, { path: "A.md", content: "novo" }, 3);
  assert.deepEqual(t.map((i) => i.path), ["A.md", "B.md"]);
  assert.equal(t[0].content, "novo");
  assert.deepEqual(trashAdd(t, null), t);
  assert.deepEqual(trashAdd(t, { path: "x" }), t);
});

test("Lixeira: respeita o limite de itens e o de texto", () => {
  let t = [];
  for (let i = 0; i < TRASH_MAX_ITEMS + 20; i++) t = trashAdd(t, { path: `n${i}.md`, content: "x" }, i);
  assert.equal(t.length, TRASH_MAX_ITEMS);
  assert.equal(t[0].path, `n${TRASH_MAX_ITEMS + 19}.md`);
  const big = trashAdd(trashAdd([], { path: "a.md", content: "a".repeat(400_000) }, 1), { path: "b.md", content: "b".repeat(400_000) }, 2);
  assert.deepEqual(big.map((i) => i.path), ["b.md"], "o que não cabe sai, começando pelo mais antigo");
});

test("Lixeira: restaurar devolve o arquivo; nome ocupado vira (restaurado)", () => {
  const t = trashAdd(trashAdd([], { path: "Pasta/A.md", content: "a" }, 1), { path: "B.md", content: "b" }, 2);
  let r = trashRestore(t, "Pasta/A.md");
  assert.deepEqual(r.file, { path: "Pasta/A.md", content: "a" });
  assert.deepEqual(r.items.map((i) => i.path), ["B.md"]);
  r = trashRestore(t, "Pasta/A.md", (p) => p === "Pasta/A.md");
  assert.equal(r.file.path, "Pasta/A (restaurado).md");
  r = trashRestore(t, "Pasta/A.md", (p) => p === "Pasta/A.md" || p === "Pasta/A (restaurado).md");
  assert.equal(r.file.path, "Pasta/A (restaurado 2).md");
  assert.equal(trashRestore(t, "nada.md").file, null);
  assert.equal(trashRestore(trashAdd([], { path: "sem-ext", content: "" }, 1), "sem-ext", (p) => p === "sem-ext").file.path, "sem-ext (restaurado)");
});

test("Lixeira: remover, expirar e limpar dados salvos estragados", () => {
  const now = 100 * DAY;
  let t = trashAdd(trashAdd([], { path: "velha.md", content: "v" }, now - 40 * DAY), { path: "nova.md", content: "n" }, now - DAY);
  assert.deepEqual(trashPurge(t, now).map((i) => i.path), ["nova.md"]);
  assert.deepEqual(trashRemove(t, "nova.md").map((i) => i.path), ["velha.md"]);
  assert.deepEqual(sanitizeTrash("x"), []);
  assert.deepEqual(sanitizeTrash([{ path: "a.md", content: "c", deletedAt: 1 }, { path: "a.md", content: "dup", deletedAt: 2 }, { path: 3 }, null, { path: "b.md", content: "c", deletedAt: "x" }]).map((i) => i.path), ["a.md"]);
});

test("Versões: só guarda se o texto mudou e se passou o intervalo; força ignora o intervalo", () => {
  let s = snapshotAdd({}, "A.md", "um", 1000);
  assert.equal(s["A.md"].length, 1);
  assert.equal(snapshotAdd(s, "A.md", "um", 1000 + SNAP_MIN_INTERVAL * 2), s, "texto igual");
  assert.equal(snapshotAdd(s, "A.md", "dois", 1000 + 1000), s, "cedo demais");
  assert.equal(snapshotAdd(s, "A.md", "dois", 1000 + 1000, { force: true })["A.md"].length, 2);
  s = snapshotAdd(s, "A.md", "dois", 1000 + SNAP_MIN_INTERVAL);
  assert.deepEqual(s["A.md"].map((v) => v.content), ["dois", "um"]);
});

test("Versões: guarda no máximo 10 por nota, as mais novas", () => {
  let s = {};
  for (let i = 0; i < 15; i++) s = snapshotAdd(s, "A.md", `v${i}`, i * SNAP_MIN_INTERVAL * 2);
  assert.equal(s["A.md"].length, SNAP_MAX_PER_NOTE);
  assert.equal(s["A.md"][0].content, "v14");
  assert.equal(s["A.md"][SNAP_MAX_PER_NOTE - 1].content, "v5");
});

test("Versões: o limite de texto joga fora as mais antigas, mas deixa a mais nova de cada nota", () => {
  let s = {};
  const chunk = "x".repeat(250_000);
  s = snapshotAdd(s, "A.md", chunk + "1", 1000, { force: true });
  s = snapshotAdd(s, "B.md", chunk + "2", 2000, { force: true });
  s = snapshotAdd(s, "A.md", chunk + "3", 3000, { force: true });
  const total = Object.values(s).flat().reduce((n, v) => n + v.content.length, 0);
  assert.ok(total <= SNAP_MAX_CHARS + 250_001);
  assert.equal(s["A.md"][0].content, chunk + "3");
  assert.equal(s["B.md"].length, 1);
});

test("Versões: renomear leva o histórico junto; apagar tira; dados ruins são limpos", () => {
  let s = snapshotAdd({}, "A.md", "um", 1000);
  s = snapshotRename(s, "A.md", "B.md");
  assert.equal(s["A.md"], undefined);
  assert.equal(s["B.md"][0].content, "um");
  assert.deepEqual(snapshotRemove(s, "B.md"), {});
  assert.deepEqual(snapshotRename(s, "nada.md", "x.md"), s);
  assert.deepEqual(sanitizeSnapshots(null), {});
  assert.deepEqual(sanitizeSnapshots({ "A.md": [{ t: 1, content: "a" }, { t: "x" }, null], "B.md": "lixo", "C.md": [] }), { "A.md": [{ t: 1, content: "a" }] });
});

test("Diferença: conta linhas acrescentadas e removidas", () => {
  assert.deepEqual(diffSummary("a\nb\nc", "a\nc\nd\ne"), { added: 2, removed: 1 });
  assert.deepEqual(diffSummary("igual", "igual"), { added: 0, removed: 0 });
  assert.deepEqual(diffSummary("", "x"), { added: 1, removed: 1 }, "texto vazio conta como uma linha vazia");
  assert.deepEqual(diffSummary("a\na", "a"), { added: 0, removed: 1 });
});

import { Vault } from "../src/vault.js";

test("Confinamento: a biblioteca recusa caminhos que saem dele (diferença deliberada do canal trash do original)", () => {
  const v = new Vault("t");
  v.create("A.md", "x");
  assert.throws(() => v.create("../fora.md", "x"), /fora da biblioteca/);
  assert.throws(() => v.remove("../fora.md"), /fora da biblioteca/);
  assert.throws(() => v.rename("A.md", "../fora.md"), /fora da biblioteca/);
  assert.throws(() => v.read("a/../../x.md"), /fora da biblioteca/);
  assert.equal(v.has("A.md"), true);
});
