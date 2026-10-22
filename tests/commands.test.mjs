import test from "node:test";
import assert from "node:assert/strict";
import { EDITOR_COMMANDS, findEditorCommand } from "../src/commands.js";

// Roda um comando como o app faz: aplica a edição e devolve o texto e a seleção finais.
function run(id, text, s = 0, e = s) {
  const edit = findEditorCommand(id).run(text, s, e);
  if (!edit) return null;
  return { text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to), sel: edit.sel };
}

const sel = (r) => r.text.slice(r.sel[0], r.sel[1]);

test("Comandos: ids únicos, com nome e função", () => {
  const ids = EDITOR_COMMANDS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of EDITOR_COMMANDS) {
    assert.equal(typeof c.run, "function");
    assert.ok(c.name.length > 2);
  }
  assert.ok(EDITOR_COMMANDS.length >= 35);
});

test("Marcas: aplicam, tiram por fora, tiram por dentro e abrem par sem seleção", () => {
  let r = run("bold", "uma palavra aqui", 4, 11);
  assert.equal(r.text, "uma **palavra** aqui");
  assert.equal(sel(r), "palavra");
  r = run("bold", r.text, r.sel[0], r.sel[1]);
  assert.equal(r.text, "uma palavra aqui", "segunda vez desfaz");
  r = run("bold", "uma **palavra** aqui", 4, 15);
  assert.equal(r.text, "uma palavra aqui", "seleção que já inclui as marcas");
  r = run("italic", "x", 1, 1);
  assert.equal(r.text, "x**".slice(0, 1) + "**");
  assert.deepEqual(r.sel, [2, 2]);
  assert.equal(run("strike", "a b", 0, 1).text, "~~a~~ b");
  assert.equal(run("highlight", "a b", 2, 3).text, "a ==b==");
  assert.equal(run("code", "x y", 0, 1).text, "`x` y");
  assert.equal(run("math-inline", "a", 0, 1).text, "$a$");
  assert.equal(run("comment", "a", 0, 1).text, "%%a%%");
});

test("Listas: aplicar, desfazer e trocar de tipo, com recuo e linhas vazias preservados", () => {
  let r = run("bullet", "um\ndois\n\ntrês", 0, 13);
  assert.equal(r.text, "- um\n- dois\n\n- três");
  r = run("bullet", r.text, 0, r.text.length);
  assert.equal(r.text, "um\ndois\n\ntrês", "todas já eram lista: desfaz");
  assert.equal(run("numbered", "a\nb\nc", 0, 5).text, "1. a\n2. b\n3. c");
  assert.equal(run("checklist", "  a", 2, 2).text, "  - [ ] a");
  assert.equal(run("bullet", "1. a\n2. b", 0, 9).text, "- a\n- b", "troca numerada por marcadores");
  assert.equal(run("numbered", "- [x] a", 0, 0).text, "1. a");
});

test("Citação e títulos: alternam e trocam o nível", () => {
  assert.equal(run("quote", "a\nb", 0, 3).text, "> a\n> b");
  assert.equal(run("quote", "> a\n> b", 0, 7).text, "a\nb");
  assert.equal(run("h2", "Título", 2, 2).text, "## Título");
  assert.equal(run("h3", "## Título", 0, 0).text, "### Título");
  assert.equal(run("h2", "## Título", 0, 0).text, "Título", "mesmo nível remove");
  assert.equal(run("h0", "#### x", 0, 0).text, "x");
});

test("Tarefas: alterna entre texto, item e tarefa; marca e desmarca", () => {
  let r = run("cycle-list", "tarefa");
  assert.equal(r.text, "- tarefa");
  r = run("cycle-list", r.text);
  assert.equal(r.text, "- [ ] tarefa");
  r = run("cycle-list", r.text);
  assert.equal(r.text, "tarefa");
  assert.equal(run("toggle-task", "- [ ] a").text, "- [x] a");
  assert.equal(run("toggle-task", "- [x] a").text, "- [ ] a");
  assert.equal(run("toggle-task", "- a").text, "- [ ] a");
  assert.equal(run("toggle-task", "texto").text, "- [ ] texto");
});

test("Linhas: mover para cima e para baixo carrega o cursor; nas pontas não faz nada", () => {
  let r = run("line-down", "um\ndois\ntrês", 1, 1);
  assert.equal(r.text, "dois\num\ntrês");
  assert.equal(r.sel[0], 6);
  r = run("line-up", "um\ndois\ntrês", 5, 5);
  assert.equal(r.text, "dois\num\ntrês");
  assert.equal(r.sel[0], 2);
  assert.equal(run("line-up", "um\ndois", 0, 0), null);
  assert.equal(run("line-down", "um\ndois", 5, 5), null);
  assert.equal(run("line-down", "a\nb\nc", 0, 3).text, "c\na\nb", "bloco de duas linhas desce uma");
});

test("Parágrafo: apaga o bloco ao redor do cursor e a linha em branco que o segue", () => {
  const t = "primeiro\nainda primeiro\n\nsegundo\n\nterceiro";
  assert.equal(run("delete-paragraph", t, 3, 3).text, "segundo\n\nterceiro");
  assert.equal(run("delete-paragraph", t, 28, 28).text, "primeiro\nainda primeiro\n\nterceiro");
  assert.equal(run("delete-paragraph", "a\n\nb", 2, 2), null, "linha em branco: nada a apagar");
});

test("Recuo: item recua e volta; sem lista, insere dois espaços", () => {
  assert.equal(run("indent", "- a\n- b", 7, 7).text, "- a\n  - b");
  assert.equal(run("unindent", "- a\n  - b", 9, 9).text, "- a\n- b");
  assert.equal(run("indent", "texto", 5, 5).text, "texto  ");
});

test("Inserções: link, wikilink, incorporação e tag", () => {
  let r = run("link", "veja aqui", 5, 9);
  assert.equal(r.text, "veja [aqui](url)");
  assert.equal(sel(r), "url");
  assert.equal(run("link", "", 0, 0).text, "[texto](url)");
  r = run("wikilink", "ver Alfa", 4, 8);
  assert.equal(r.text, "ver [[Alfa]]");
  assert.equal(r.sel[0], r.text.length);
  r = run("wikilink", "", 0, 0);
  assert.equal(r.text, "[[]]");
  assert.deepEqual(r.sel, [2, 2]);
  assert.equal(run("embed", "", 0, 0).text, "![[]]");
  assert.equal(run("tag", "ideia boa", 0, 9).text, "#ideia-boa");
  assert.equal(run("tag", "", 0, 0).text, "#");
});

test("Blocos: código, fórmula, destaque, tabela e linha horizontal em linha própria", () => {
  let r = run("codeblock", "x = 1", 0, 5);
  assert.equal(r.text, "```\nx = 1\n```");
  assert.equal(sel(r), "x = 1");
  assert.equal(run("codeblock", "", 0, 0).text, "```\n\n```");
  assert.equal(run("mathblock", "a^2", 0, 3).text, "$$\na^2\n$$");
  r = run("callout", "texto", 5, 5);
  assert.equal(r.text, "texto\n> [!note] Título\n> ");
  assert.equal(r.sel[0], r.text.length);
  r = run("table", "", 0, 0);
  assert.match(r.text, /^\| Coluna 1 \| Coluna 2 \|\n\| --- \| --- \|\n\|  \|  \|$/);
  assert.equal(run("rule", "a\nb", 1, 1).text, "a\n---\n\nb");
});

test("Nota de rodapé: referência no cursor e definição no fim, numeração seguinte", () => {
  let r = run("footnote", "texto aqui", 5, 5);
  assert.equal(r.text, "texto[^1] aqui\n\n[^1]: ");
  assert.equal(r.sel[0], r.text.length);
  r = run("footnote", "x[^1] y\n\n[^1]: nota\n", 1, 1);
  assert.match(r.text, /x\[\^2\]\[\^1\] y/);
  assert.match(r.text, /\n\[\^2\]: $/);
});

test("Limpar formatação: tira marcas e prefixos da seleção", () => {
  const r = run("clear", "## **negrito** e *itálico* e `código` e ==marca== ~~riscado~~", 0, 0);
  assert.equal(r.text, "negrito e itálico e código e marca riscado");
  assert.equal(run("clear", "> citação **forte**", 0, 0).text, "citação forte");
});
