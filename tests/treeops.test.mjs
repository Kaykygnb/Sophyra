import test from "node:test";
import assert from "node:assert/strict";
import { Vault } from "../src/vault.js";
import { planMove, canDrop, destOf, parentOf, isInside } from "../src/treeops.js";

const file = (path) => ({ path, dir: false });
const dir = (path) => ({ path, dir: true });
const takenIn = (paths) => (p, isDir) => paths.has(p) || (isDir && [...paths].some((x) => x.startsWith(`${p}/`)));

test("Mover: caminho novo mantém o nome, e a raiz não tem barra", () => {
  assert.equal(destOf(file("A/nota.md"), "B"), "B/nota.md");
  assert.equal(destOf(file("A/nota.md"), ""), "nota.md");
  assert.equal(destOf(dir("A/Sub"), "B"), "B/Sub");
  assert.equal(parentOf("A/B/c.md"), "A/B");
  assert.equal(parentOf("c.md"), "");
});

test("Mover: pasta não entra nela mesma nem em um descendente", () => {
  const none = takenIn(new Set());
  assert.equal(canDrop([dir("A")], "A", none), false);
  assert.equal(canDrop([dir("A")], "A/B", none), false);
  assert.equal(canDrop([dir("A")], "AB", none), true, "AB não é descendente de A");
  assert.equal(isInside("A/B", "A"), true);
  assert.equal(isInside("AB", "A"), false);
});

test("Mover: colisão de nome é recusada e nada é planejado", () => {
  const plan = planMove([file("A/x.md"), file("B/x.md")], "C", takenIn(new Set(["C/x.md"])));
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.moves, []);
  const twice = planMove([file("A/x.md"), file("B/x.md")], "C", takenIn(new Set()));
  assert.equal(twice.ok, false, "dois itens com o mesmo nome no mesmo destino");
});

test("Mover: item que já está no lugar é ignorado", () => {
  const plan = planMove([file("A/x.md"), file("B/y.md")], "A", takenIn(new Set()));
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.moves, [{ from: "B/y.md", to: "A/y.md", dir: false }]);
});

test("Cofre: mover uma pasta leva tudo dentro dela, inclusive o .keep e subpastas", () => {
  const v = new Vault("t");
  v.create("Projetos/.keep", "");
  v.create("Projetos/a.md", "x");
  v.create("Projetos/Sub/b.md", "y");
  v.create("Projetos-antigo/c.md", "z");
  assert.equal(v.applyMoves([{ from: "Projetos", to: "Arquivo/Projetos", dir: true }]), 3);
  assert.equal(v.has("Arquivo/Projetos/Sub/b.md"), true);
  assert.equal(v.has("Arquivo/Projetos/.keep"), true);
  assert.equal(v.has("Projetos-antigo/c.md"), true, "pasta com prefixo parecido não entra");
});

test("Cofre: vários arquivos de uma vez; se um falha, nada muda", () => {
  const v = new Vault("t");
  v.create("A/x.md", "1");
  v.create("B/y.md", "2");
  v.create("C/y.md", "3");
  assert.throws(() => v.applyMoves([{ from: "A/x.md", to: "Z/x.md" }, { from: "B/y.md", to: "C/y.md" }]), /Já existe/);
  assert.equal(v.has("A/x.md"), true, "o primeiro não foi movido");
  assert.equal(v.applyMoves([{ from: "A/x.md", to: "Z/x.md" }, { from: "B/y.md", to: "Z/y.md" }]), 2);
  assert.equal(v.has("Z/y.md"), true);
});

test("Cofre: pasta não vai para dentro dela e pasta inexistente é recusada", () => {
  const v = new Vault("t");
  v.create("A/x.md", "1");
  assert.throws(() => v.renameDir("A", "A/B"), /dela mesma/);
  assert.throws(() => v.renameDir("Nada", "Outra"), /não existe/);
});
