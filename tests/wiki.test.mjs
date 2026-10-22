import test from "node:test";
import assert from "node:assert/strict";
import { wikiHomeText, wikiPageText, wikiIndexBase, isWikiHome, WIKI_STATUS } from "../src/wiki.js";
import { parseFrontmatter } from "../src/markdown.js";

test("Wiki: a página inicial é um documento com cabeçalho de wiki e sumário", () => {
  const t = wikiHomeText("Equipe", "2026-10-22");
  const fm = parseFrontmatter(t).data;
  assert.equal(fm.tipo, "wiki");
  assert.equal(fm.status, "rascunho");
  assert.equal(fm.revisao, "2026-10-22");
  assert.match(t, /^# Equipe$/m);
  assert.match(t, /<!-- toc -->/);
  assert.match(t, /!\[\[Páginas\.base\]\]/);
});

test("Wiki: página nova nasce como rascunho com a data de hoje", () => {
  const fm = parseFrontmatter(wikiPageText("Processo de férias", "2026-10-22")).data;
  assert.equal(fm.status, "rascunho");
  assert.equal(fm.tipo, "wiki");
  assert.equal(fm.revisao, "2026-10-22");
});

test("Wiki: o índice é uma tabela de documentos, com status e responsável", () => {
  const b = wikiIndexBase("Equipe");
  assert.equal(b.source.folder, "Equipe");
  assert.deepEqual(b.props.status.options, WIKI_STATUS);
  assert.equal(b.props.responsavel.type, "pessoa");
  assert.equal(b.views[0].type, "table");
});

test("Wiki: reconhece a página inicial pelo tipo, e não confunde com nota comum", () => {
  assert.equal(isWikiHome(wikiHomeText("X", "2026-01-01")), true);
  assert.equal(isWikiHome("---\nstatus: x\n---\n# nota"), false);
  assert.equal(isWikiHome("# sem cabeçalho"), false);
});
