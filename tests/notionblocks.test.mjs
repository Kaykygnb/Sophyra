import test from "node:test";
import assert from "node:assert/strict";
import { parseBlocks, serializeBlocks, canNest, canHaveChildren, flatten } from "../src/blocks.js";
import { BlockEditor } from "../src/blockedit.js";
import { inlineToHtml } from "../src/blockinline.js";
import { parseDateQuery, dateSuggestions, mentionAt, dateMarkdown, formatDate } from "../src/mentions.js";

const round = (md) => serializeBlocks(parseBlocks(md));

test("Colunas: leem e gravam de volta igual", () => {
  const md = "<!-- columns -->\n<!-- column -->\n\nEsquerda\n\n- item\n\n<!-- column -->\n\nDireita\n\n<!-- /columns -->\n";
  const [cols] = parseBlocks(md);
  assert.equal(cols.type, "columns");
  assert.equal(cols.children.length, 2);
  assert.deepEqual(cols.children[0].children.map((b) => b.type), ["paragraph", "bullet"]);
  assert.equal(round(md), md);
});

test("Colunas: regras de aninhamento", () => {
  assert.equal(canNest("columns", "column"), true);
  assert.equal(canNest("columns", "paragraph"), false);
  assert.equal(canNest("column", "paragraph"), true);
  assert.equal(canNest("column", "columns"), false);
  assert.equal(canNest("column", "column"), false);
  assert.equal(canNest("toggle", "column"), false);
  assert.equal(canHaveChildren("column"), true);
});

test("Colunas: uma coluna só vira blocos soltos e coluna vazia ganha parágrafo", () => {
  const one = parseBlocks("<!-- columns -->\n<!-- column -->\n\nSó eu\n\n<!-- /columns -->\n");
  assert.deepEqual(one.map((b) => b.type), ["paragraph"]);
  const [cols] = parseBlocks("<!-- columns -->\n<!-- column -->\n\n<!-- column -->\n\nB\n\n<!-- /columns -->\n");
  assert.equal(cols.children[0].children.length, 1);
});

test("Colunas: dividir, acrescentar, tirar e desfazer no motor", () => {
  const ed = new BlockEditor("Um\n\nDois\n");
  const id = ed.blocks[0].id;
  const wrap = ed.wrapInColumns(id, 3);
  assert.equal(wrap.children.length, 3);
  assert.equal(ed.blocks[0].type, "columns");
  assert.equal(ed.blocks.length, 2);
  assert.ok(ed.addColumn(wrap.id));
  assert.equal(ed.get(wrap.id).block.children.length, 4);
  const last = ed.get(wrap.id).block.children[3];
  ed.get(last.children[0].id).block.text = "no fim";
  assert.ok(ed.removeColumn(last.id));
  assert.match(ed.markdown(), /no fim/, "o conteúdo da coluna tirada passa para a vizinha");
  assert.equal(ed.wrapInColumns(wrap.id, 2), null, "colunas não entram em colunas");
  assert.ok(ed.unwrapColumns(wrap.id));
  assert.equal(ed.blocks.some((b) => b.type === "columns"), false);
  assert.equal(ed.blocks[0].text, "Um");
  ed.undo();
  assert.equal(ed.blocks[0].type, "columns");
});

test("Colunas: remover até sobrar uma desfaz as colunas sozinha", () => {
  const ed = new BlockEditor("A\n");
  const wrap = ed.wrapInColumns(ed.blocks[0].id, 2);
  ed.removeColumn(wrap.children[1].id);
  assert.equal(ed.blocks[0].type, "paragraph");
  assert.equal(ed.blocks[0].text, "A");
});

test("Colunas: Backspace no começo da coluna não junta com fora dela", () => {
  const ed = new BlockEditor("Antes\n\nDepois\n");
  const wrap = ed.wrapInColumns(ed.blocks[1].id, 2);
  const first = wrap.children[0].children[0];
  assert.equal(ed.mergeBack(first.id, 0), null);
});

test("Mídia, arquivo e botão: ida e volta", () => {
  const md = '<video src="https://x.com/a.mp4" controls></video>\n\n<audio src="https://x.com/a.mp3" controls></audio>\n\n<a class="file" href="https://x.com/r.pdf">Relatório</a>\n\n<a class="button" href="https://x.com">Abrir site</a>\n';
  const bs = parseBlocks(md);
  assert.deepEqual(bs.map((b) => b.type), ["video", "audio", "file", "button"]);
  assert.equal(bs[2].text, "Relatório");
  assert.equal(bs[3].src, "https://x.com");
  assert.equal(serializeBlocks(bs), md);
});

test("Mídia e botão: aspas e sinais de maior não quebram a linha", () => {
  const [b] = parseBlocks('<a class="button" href="Minha nota">ok</a>');
  b.src = 'a"b';
  b.text = "<x>Oi\nvocê";
  const out = serializeBlocks([b]);
  assert.equal(out, '<a class="button" href="a%22b">x Oi você</a>\n');
  assert.equal(parseBlocks(out)[0].type, "button");
});

test("Menção: datas por palavra, dia da semana e formatos", () => {
  const now = new Date(2026, 9, 22); // quinta, 22/10/2026
  assert.equal(parseDateQuery("hoje", now).iso, "2026-10-22");
  assert.equal(parseDateQuery("Amanhã", now).iso, "2026-10-23");
  assert.equal(parseDateQuery("ontem", now).iso, "2026-10-21");
  assert.equal(parseDateQuery("+3", now).iso, "2026-10-25");
  assert.equal(parseDateQuery("sex", now).iso, "2026-10-23");
  assert.equal(parseDateQuery("quinta", now).iso, "2026-10-29", "se é hoje, a semana que vem");
  assert.equal(parseDateQuery("25/12", now).iso, "2026-12-25");
  assert.equal(parseDateQuery("1/2/27", now).iso, "2027-02-01");
  assert.equal(parseDateQuery("2026-12-25", now).iso, "2026-12-25");
  assert.equal(parseDateQuery("31/02", now), null, "data que não existe");
  assert.equal(parseDateQuery("abc", now), null);
});

test("Menção: sugestões e gatilho do @", () => {
  const now = new Date(2026, 9, 22);
  assert.deepEqual(dateSuggestions("", now).map((d) => d.name), ["Hoje", "Amanhã", "Ontem"]);
  assert.equal(dateSuggestions("25/12", now)[0].iso, "2026-12-25");
  assert.deepEqual(mentionAt("fale com @am"), { query: "am", length: 3 });
  assert.equal(mentionAt("a@b"), null, "e-mail não abre o menu");
  assert.deepEqual(mentionAt("@"), { query: "", length: 1 });
});

test("Menção: a data vira peça em linha e guarda o Markdown", () => {
  const md = dateMarkdown("2026-12-25");
  assert.match(md, /^<time datetime="2026-12-25">.+<\/time>$/);
  const html = inlineToHtml(`vence ${md} ok`);
  assert.ok(html.includes('class="bk-chip bk-date"'));
  assert.ok(html.includes('data-date="2026-12-25"'));
  assert.ok(html.includes("data-md="));
  assert.ok(formatDate("2026-12-25").includes("2026"));
  assert.equal(flatten(parseBlocks(`vence ${md}`)).length, 1);
});
