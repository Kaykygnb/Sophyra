import test from "node:test";
import assert from "node:assert/strict";
import { isCoverUrl, setCover, removeCover, renameCovers, tasksInFolder, childFolders, folderName, folderOf } from "../src/collections.js";
import { parseBlocks, serializeBlocks } from "../src/blocks.js";

test("Capa: só endereço http(s) é aceito", () => {
  assert.equal(isCoverUrl("https://exemplo.com/a.png"), true);
  assert.equal(isCoverUrl("javascript:alert(1)"), false);
  assert.equal(isCoverUrl("data:image/png;base64,AAA"), false);
  assert.equal(isCoverUrl("https://x.com/a b"), false, "espaço não entra num endereço");
  assert.throws(() => setCover({}, "Projetos", "javascript:x"), /http/);
});

test("Capa: definir, trocar e tirar; vazio remove", () => {
  let m = setCover({}, "Projetos", "https://a.com/1.jpg");
  assert.equal(m.Projetos, "https://a.com/1.jpg");
  m = setCover(m, "Projetos", "https://a.com/2.jpg");
  assert.equal(m.Projetos, "https://a.com/2.jpg");
  assert.deepEqual(setCover(m, "Projetos", "  "), {}, "vazio tira a capa");
  assert.equal(removeCover(m, "nada"), m);
});

test("Capa: renomear a coleção leva as subcoleções, e não pega irmãs com prefixo parecido", () => {
  const m = { A: "https://x/a", "A/B": "https://x/b", AB: "https://x/ab" };
  assert.deepEqual(renameCovers(m, "A", "Z"), { Z: "https://x/a", "Z/B": "https://x/b", AB: "https://x/ab" });
  assert.equal(renameCovers(m, "nada", "Z"), m);
});

test("Tarefas da coleção: as das notas dentro dela, em qualquer subnível", () => {
  const tasks = [{ path: "Projetos/a.md" }, { path: "Projetos/sub/b.md" }, { path: "Projetos-antigo/c.md" }, { path: "raiz.md" }];
  assert.deepEqual(tasksInFolder(tasks, "Projetos").map((t) => t.path), ["Projetos/a.md", "Projetos/sub/b.md"]);
  assert.equal(tasksInFolder(tasks, "").length, 4);
});

test("Árvore: subcoleções diretas, ordenadas, e nomes de coleção", () => {
  const root = { folders: new Map([
    ["Zeta", { name: "Zeta", path: "Zeta", folders: new Map() }],
    ["Alfa", { name: "Alfa", path: "Alfa", folders: new Map([["Sub", { name: "Sub", path: "Alfa/Sub", folders: new Map() }]]) }],
  ]) };
  assert.deepEqual(childFolders(root).map((f) => f.name), ["Alfa", "Zeta"]);
  assert.deepEqual(childFolders(root, "Alfa").map((f) => f.path), ["Alfa/Sub"]);
  assert.deepEqual(childFolders(root, "Nada"), []);
  assert.equal(folderName(""), "Raiz");
  assert.equal(folderName("A/B"), "B");
  assert.equal(folderOf("A/B/c.md"), "A/B");
  assert.equal(folderOf("c.md"), "");
});

test("Canvas na nota: `![[X.canvas]]` sozinho vira bloco e volta igual", () => {
  const md = "Antes\n\n![[Arquitetura.canvas]]\n\nDepois\n";
  const bs = parseBlocks(md);
  assert.deepEqual(bs.map((b) => b.type), ["paragraph", "canvasembed", "paragraph"]);
  assert.equal(bs[1].src, "Arquitetura.canvas");
  assert.equal(serializeBlocks(bs), md);
});
