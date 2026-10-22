import test from "node:test";
import assert from "node:assert/strict";
import { highlightMarkdown, highlightLine } from "../src/highlight.js";
import { onEnter, onChar, onBackspace, indentLines } from "../src/editing.js";

// Aplica uma edição a um texto, como o editor faz, e devolve texto e seleção.
function apply(text, edit) {
  return { text: text.slice(0, edit.from) + edit.insert + text.slice(edit.to), sel: edit.sel };
}

const strip = (html) => html.replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// --- Destaque -----------------------------------------------------------------------------------------------------

test("Destaque: nunca muda o texto, só envolve em spans", () => {
  const samples = [
    "# Título com **negrito** e `código`\n\n- item [[Nota|apelido]] e #tag\n- [x] feito\n> citação *itálico*\n\n```js\nconst a = 1 < 2;\n```\n\n---\n$x^2$ e preço $5 e $6",
    "---\ntitle: A\ntags: [a, b]\n---\n# Corpo\n",
    "linha com & e < e > e \"aspas\"",
    "",
    "\n\n\nfinal\n",
    "windows\r\nquebra\r\n# título\r\n",
  ];
  for (const s of samples) assert.equal(strip(highlightMarkdown(s)), s);
});

test("Destaque: títulos, negrito, código, links e tags", () => {
  assert.match(highlightLine("## Seção"), /hl-h2/);
  assert.match(highlightLine("texto **forte** aqui"), /<span class="hl-bold">\*\*forte\*\*<\/span>/);
  assert.match(highlightLine("use `x < y` já"), /<span class="hl-code">`x &lt; y`<\/span>/);
  assert.match(highlightLine("veja [[Nota#Seção|alias]]"), /hl-wikilink/);
  assert.match(highlightLine("veja ![[Img]]"), /hl-embed/);
  assert.match(highlightLine("[site](https://a.com)"), /hl-link/);
  assert.match(highlightLine("ideia #projeto/alfa"), /hl-tag/);
  assert.doesNotMatch(highlightLine("cor#fff"), /hl-tag/, "tag só depois de espaço");
  assert.match(highlightLine("==marca== e ~~corta~~"), /hl-mark/);
});

test("Destaque: o que está em código não vira outra coisa", () => {
  const html = highlightLine("`[[nao link]] e **nao negrito**`");
  assert.match(html, /hl-code/);
  assert.doesNotMatch(html, /hl-wikilink|hl-bold/);
});

test("Destaque: listas, tarefas, citações e linhas horizontais", () => {
  assert.match(highlightLine("- item"), /hl-list/);
  assert.match(highlightLine("12. passo"), /hl-list/);
  assert.match(highlightLine("- [ ] a fazer"), /hl-task/);
  const done = highlightLine("- [x] pronto");
  assert.match(done, /hl-task-done/);
  assert.match(done, /hl-done-text/);
  assert.match(highlightLine("> dica"), /hl-quote-mark/);
  assert.match(highlightLine("---"), /hl-hr/);
});

test("Destaque: blocos cercados e frontmatter com estado entre linhas", () => {
  const html = highlightMarkdown("```js\n# não é título\n**nem negrito**\n```\n# agora sim");
  assert.equal((html.match(/hl-fence/g) || []).length, 4);
  assert.match(html, /hl-h1/);
  const fm = highlightMarkdown("---\ntitle: Oi\n---\n# T");
  assert.match(fm, /hl-fm-key/);
  assert.equal((fm.match(/hl-fm-mark/g) || []).length, 2);
  assert.match(fm, /hl-h1/);
  assert.doesNotMatch(highlightMarkdown("---\nsem fechar\n# T"), /hl-fm-key/, "sem fechamento não é frontmatter");
});

test("Destaque: fórmula em linha, sem confundir com dinheiro", () => {
  assert.match(highlightLine("vale $x^2$ aqui"), /hl-math/);
  assert.doesNotMatch(highlightLine("custa $5 e depois $6"), /hl-math/);
});

// --- Enter em listas ---------------------------------------------------------------------------------------------------

test("Enter: continua listas, numeradas, tarefas e citações", () => {
  let t = "- item";
  assert.equal(apply(t, onEnter(t, t.length, t.length)).text, "- item\n- ");
  t = "  * aninhado";
  assert.equal(apply(t, onEnter(t, t.length, t.length)).text, "  * aninhado\n  * ");
  t = "3. três";
  assert.equal(apply(t, onEnter(t, t.length, t.length)).text, "3. três\n4. ");
  t = "- [x] feito";
  assert.equal(apply(t, onEnter(t, t.length, t.length)).text, "- [x] feito\n- [ ] ", "a nova tarefa nasce aberta");
  t = "> dica";
  assert.equal(apply(t, onEnter(t, t.length, t.length)).text, "> dica\n> ");
});

test("Enter: item vazio termina a lista; no meio do texto divide o item", () => {
  let t = "- a\n- ";
  const r = apply(t, onEnter(t, t.length, t.length));
  assert.equal(r.text, "- a\n");
  assert.deepEqual(r.sel, [4, 4]);
  t = "- um dois";
  const m = apply(t, onEnter(t, 5, 5));
  assert.equal(m.text, "- um \n- dois", "o item divide e o resto vai para a linha nova");
});

test("Enter: fora de lista, com seleção ou antes do marcador, deixa o navegador agir", () => {
  assert.equal(onEnter("texto", 5, 5), null);
  assert.equal(onEnter("- item", 0, 6), null);
  assert.equal(onEnter("- item", 1, 1), null);
});

// --- Pares e seleção ---------------------------------------------------------------------------------------------------------

test("Caractere: abre pares com o cursor no meio", () => {
  const r = apply("a ", onChar("a ", 2, 2, "("));
  assert.equal(r.text, "a ()");
  assert.deepEqual(r.sel, [3, 3]);
  assert.equal(apply("", onChar("", 0, 0, "[")).text, "[]");
  assert.equal(apply("", onChar("", 0, 0, "`")).text, "``");
});

test("Caractere: aspas e crase não pareiam dentro de palavra", () => {
  assert.equal(onChar("it", 2, 2, '"'), null);
  assert.equal(onChar("5", 1, 1, '"'), null);
  assert.equal(onChar("abc", 0, 0, "("), null, "antes de uma palavra, não abre par");
});

test("Caractere: digitar o fecho que já existe só avança o cursor", () => {
  const e = onChar("()", 1, 1, ")");
  assert.equal(e.insert, "");
  assert.deepEqual(e.sel, [2, 2]);
  assert.equal(onChar("[ab]", 3, 3, "]").skip, true);
});

test("Caractere: com seleção, envolve (inclusive negrito, itálico e marca)", () => {
  const t = "uma palavra aqui";
  const r = apply(t, onChar(t, 4, 11, "*"));
  assert.equal(r.text, "uma *palavra* aqui");
  assert.deepEqual(r.sel, [5, 12]);
  assert.equal(apply(t, onChar(t, 4, 11, "[")).text, "uma [palavra] aqui");
  assert.equal(apply(t, onChar(t, 4, 11, "=")).text, "uma =palavra= aqui");
  assert.equal(onChar(t, 4, 11, "x"), null);
  assert.equal(onChar(t, 4, 11, "Enter"), null);
});

test("Backspace: entre um par vazio apaga os dois", () => {
  const r = apply("a()b", onBackspace("a()b", 2, 2));
  assert.equal(r.text, "ab");
  assert.deepEqual(r.sel, [1, 1]);
  assert.equal(onBackspace("a(x)b", 3, 3), null);
  assert.equal(onBackspace("()", 0, 0), null);
  assert.equal(onBackspace('""', 1, 1).insert, "");
});

// --- Recuo ----------------------------------------------------------------------------------------------------------------

test("Tab: em item de lista recua; em linha comum fica com o navegador", () => {
  const t = "- a\n- b";
  const r = apply(t, indentLines(t, 7, 7));
  assert.equal(r.text, "- a\n  - b");
  assert.equal(indentLines("texto", 2, 2), null);
});

test("Tab: com várias linhas recua todas, e Shift+Tab desfaz", () => {
  const t = "um\ndois\ntrês";
  const a = apply(t, indentLines(t, 0, t.length));
  assert.equal(a.text, "  um\n  dois\n  três");
  const b = apply(a.text, indentLines(a.text, 0, a.text.length, true));
  assert.equal(b.text, t);
  assert.equal(apply("sem recuo", indentLines("sem recuo", 0, 0, true)).text, "sem recuo");
});
