import test from "node:test";
import assert from "node:assert/strict";
import { BlockEditor } from "../src/blockedit.js";
import { parseBlocks, flatten, makeBlock } from "../src/blocks.js";

const ed = (md, opts) => new BlockEditor(md, opts);
const texts = (e) => flatten(e.blocks).map((b) => b.text);
const idOf = (e, text) => flatten(e.blocks).find((b) => b.text === text).id;

test("Motor: documento vazio sempre tem um parágrafo", () => {
  const e = ed("");
  assert.equal(e.blocks.length, 1);
  assert.equal(e.blocks[0].type, "paragraph");
  e.remove(e.blocks[0].id);
  assert.equal(e.blocks.length, 1, "apagar o último bloco deixa um vazio");
});

test("Motor: Enter divide o bloco; em lista o novo bloco continua a lista", () => {
  const e = ed("- abcdef\n");
  const id = e.blocks[0].id;
  const nb = e.split(id, "abc", "def");
  assert.equal(nb.type, "bullet");
  assert.deepEqual(texts(e), ["abc", "def"]);
  assert.deepEqual(e.caret, { id: nb.id, offset: 0 });
  const p = ed("texto\n");
  assert.equal(p.split(p.blocks[0].id, "te", "xto").type, "paragraph");
  const h = ed("# Título\n");
  assert.equal(h.split(h.blocks[0].id, "Título", "").type, "paragraph", "depois de um título vem parágrafo");
});

test("Motor: dividir um item leva os filhos para a segunda metade", () => {
  const e = ed("- pai\n  - filho\n");
  const pai = e.blocks[0];
  const nb = e.split(pai.id, "p", "ai");
  assert.equal(pai.children.length, 0);
  assert.equal(nb.children[0].text, "filho");
});

test("Motor: dividir um toggle aberto cria o primeiro filho", () => {
  const e = ed("<details open>\n<summary>T</summary>\n\nx\n\n</details>\n");
  const t = e.blocks[0];
  const nb = e.split(t.id, "T", "");
  assert.equal(t.children[0].id, nb.id);
  assert.equal(t.children.length, 2);
});

test("Motor: Backspace no começo junta com o bloco de cima e leva os filhos", () => {
  const e = ed("um\n\n- dois\n  - filho\n");
  const dois = idOf(e, "dois");
  const prev = e.mergeBack(dois, 2);
  assert.equal(prev.text, "umdois");
  assert.deepEqual(e.caret, { id: prev.id, offset: 2 });
  assert.equal(e.blocks.length, 2, "o filho não cabe num parágrafo e vira irmão");
  assert.equal(e.blocks[1].text, "filho");
});

test("Motor: Backspace depois de divisor só apaga o bloco vazio", () => {
  const e = ed("---\n\ntexto\n");
  const t = e.blocks[1].id;
  assert.equal(e.mergeBack(t), null, "bloco com texto não junta com divisor");
  e.setText(t, "");
  assert.ok(e.mergeBack(t));
  assert.equal(e.blocks.length, 1);
  assert.equal(e.blocks[0].type, "divider");
  assert.equal(e.mergeBack(e.blocks[0].id), null, "primeiro bloco não junta com nada");
});

test("Motor: Delete no fim puxa o bloco de baixo", () => {
  const e = ed("a\n\nb\n");
  const a = e.blocks[0];
  e.mergeForward(a.id, 1);
  assert.equal(e.blocks.length, 1);
  assert.equal(e.blocks[0].text, "ab");
  assert.deepEqual(e.caret, { id: a.id, offset: 1 });
});

test("Motor: recuar só quando o item de cima aceita filhos; desrecuar traz os irmãos de baixo", () => {
  const e = ed("- a\n- b\n- c\n");
  const [a, b, c] = e.blocks;
  assert.equal(e.indent(a.id), false, "primeiro item não recua");
  assert.equal(e.indent(b.id), true);
  assert.equal(e.indent(c.id), true);
  assert.deepEqual(a.children.map((x) => x.text), ["b", "c"]);
  assert.equal(e.outdent(b.id), true);
  assert.deepEqual(e.blocks.map((x) => x.text), ["a", "b"]);
  assert.deepEqual(e.blocks[1].children.map((x) => x.text), ["c"], "c fica sob b");
  assert.equal(e.outdent(b.id), false, "já está na raiz");
  const p = ed("texto\n\noutro\n");
  assert.equal(p.indent(p.blocks[1].id), false, "parágrafo não aceita filhos");
});

test("Motor: recuar um bloco sob um toggle abre o toggle", () => {
  const e = ed("<details>\n<summary>T</summary>\n</details>\n\nsolto\n");
  assert.equal(e.indent(e.blocks[1].id), true);
  assert.equal(e.blocks[0].open, true);
  assert.equal(e.blocks[0].children[0].text, "solto");
});

test("Motor: trocar o tipo mantém o texto e a estrutura continua válida", () => {
  const e = ed("- a\n  - b\n");
  const b = e.blocks[0].children[0];
  e.setType(b.id, "heading", { level: 2 });
  assert.equal(e.blocks.length, 2, "item aninhado que virou título sai da lista");
  assert.equal(e.blocks[1].type, "heading");
  assert.equal(e.blocks[1].level, 2);
  assert.equal(e.blocks[1].text, "b");
  const a = e.blocks[0];
  e.setType(a.id, "todo");
  assert.equal(a.checked, false);
  e.setType(a.id, "divider");
  assert.equal(a.text, "");
});

test("Motor: item com filhos que vira parágrafo solta os filhos como irmãos", () => {
  const e = ed("- a\n  - b\n  - c\n");
  e.setType(e.blocks[0].id, "paragraph");
  assert.deepEqual(e.blocks.map((x) => x.type), ["paragraph", "bullet", "bullet"]);
});

test("Motor: mover blocos, inclusive para dentro de toggle, sem entrar em si mesmo", () => {
  const e = ed("a\n\nb\n\n<details>\n<summary>T</summary>\n</details>\n\nc\n");
  const [a, b, t, c] = e.blocks;
  assert.equal(e.moveRelative(a.id, c.id, "after"), true);
  assert.deepEqual(e.blocks.map((x) => x.text), ["b", "T", "c", "a"]);
  assert.equal(e.moveRelative(c.id, t.id, "inside"), true);
  assert.deepEqual(t.children.map((x) => x.text), ["c"]);
  assert.equal(e.moveRelative(t.id, c.id, "after"), false, "um toggle não vai para dentro do próprio filho");
  assert.equal(e.moveBlock(a.id, b.id, 0), false, "parágrafo não aceita filhos");
  assert.equal(e.move(b.id, 1), true);
  assert.deepEqual(e.blocks.map((x) => x.text), ["T", "b", "a"]);
  assert.equal(e.move(e.blocks[0].id, -1), false);
});

test("Motor: apagar uma seleção que atravessa blocos junta as pontas", () => {
  const e = ed("primeiro\n\nmeio\n\n- ultimo\n  - filho\n");
  const [p, , u] = e.blocks;
  assert.equal(e.deleteBetween(p.id, "pri", u.id, "mo"), true);
  assert.deepEqual(e.blocks.map((x) => x.text), ["primo", "filho"]);
  assert.equal(e.deleteBetween("x", "", "y", ""), false);
});

test("Motor: colar blocos substitui o bloco vazio e se encaixa na estrutura", () => {
  const e = ed("a\n");
  const vazio = e.insertAfter(e.blocks[0].id, makeBlock("paragraph"));
  const colados = parseBlocks("# T\n\ntexto\n");
  e.insertBlocks(vazio.id, colados);
  assert.deepEqual(e.blocks.map((x) => x.text), ["a", "T", "texto"]);
  const f = ed("- a\n");
  f.insertBlocks(f.blocks[0].id, parseBlocks("parágrafo\n"));
  assert.deepEqual(f.blocks.map((x) => x.type), ["bullet", "paragraph"]);
});

test("Motor: duplicar gera ids novos em toda a subárvore", () => {
  const e = ed("- a\n  - b\n");
  const copy = e.duplicate(e.blocks[0].id);
  const ids = flatten(e.blocks).map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(copy.children[0].text, "b");
});

test("Motor: desfazer e refazer, com digitação agrupada", () => {
  let clock = 1000;
  const e = ed("a\n", { now: () => clock });
  const id = e.blocks[0].id;
  e.setCaret(id, 1);
  e.setText(id, "ab");
  clock += 200;
  e.setText(id, "abc");
  assert.equal(e.undoStack.length, 1, "digitação seguida é um passo só");
  clock += 5000;
  e.setText(id, "abcd");
  assert.equal(e.undoStack.length, 2);
  assert.deepEqual(e.undo().caret, { id, offset: 1 });
  assert.equal(e.blocks[0].text, "abc");
  e.undo();
  assert.equal(e.blocks[0].text, "a");
  assert.equal(e.undo(), null);
  e.redo();
  e.redo();
  assert.equal(e.blocks[0].text, "abcd");
  assert.equal(e.redo(), null);
  e.undo();
  e.setText(id, "novo");
  assert.equal(e.canRedo, false, "uma edição nova apaga o refazer");
});

test("Motor: operação recusada não mexe no documento nem no histórico", () => {
  const e = ed("a\n\nb\n");
  const antes = e.markdown();
  assert.equal(e.indent(e.blocks[1].id), false);
  assert.equal(e.outdent(e.blocks[0].id), false);
  assert.equal(e.toggleChecked(e.blocks[0].id), false);
  assert.equal(e.markdown(), antes);
  assert.equal(e.canUndo, false);
});

test("Motor: mudar sem efeito não entra no histórico, e onChange dispara uma vez por transação", () => {
  let n = 0;
  const e = ed("a\n", { onChange: () => n++ });
  e.setText(e.blocks[0].id, "a");
  assert.equal(n, 0);
  e.setType(e.blocks[0].id, "paragraph");
  assert.equal(n, 0);
  e.setType(e.blocks[0].id, "quote");
  assert.equal(n, 1);
  assert.equal(e.markdown(), "> a\n");
});

test("Motor: tarefa e toggle alternam e voltam ao Markdown", () => {
  const e = ed("- [ ] fazer\n\n<details>\n<summary>T</summary>\n</details>\n");
  e.toggleChecked(e.blocks[0].id);
  e.toggleOpen(e.blocks[1].id);
  assert.equal(e.markdown(), "- [x] fazer\n\n<details open>\n<summary>T</summary>\n</details>\n");
});

test("Motor: carregar de novo (mudança por fora) zera o histórico", () => {
  const e = ed("a\n");
  e.setText(e.blocks[0].id, "b");
  e.load("novo\n");
  assert.equal(e.canUndo, false);
  assert.equal(e.markdown(), "novo\n");
  assert.deepEqual(e.stats(), { blocks: 1, words: 1 });
});
