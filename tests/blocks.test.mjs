import test from "node:test";
import assert from "node:assert/strict";
import { parseBlocks, serializeBlocks, flatten, locate, canNest, canHaveChildren } from "../src/blocks.js";

const shape = (blocks) => blocks.map((b) => [b.type, b.text, ...(b.children?.length ? [shape(b.children)] : [])]);

test("Blocos: cada tipo de Markdown vira o bloco certo", () => {
  const md = [
    "# Título", "", "Um parágrafo", "com duas linhas", "", "## Seção", "",
    "- item", "- [ ] tarefa", "- [x] feita", "", "1. um", "2. dois", "",
    "> citação", "", "> [!tip] Dica", "> corpo", "", "---", "", "![foto](a.png)", "",
    "```js", "let a = 1;", "```", "", "$$", "x^2", "$$", "",
  ].join("\n");
  const b = parseBlocks(md);
  assert.deepEqual(b.map((x) => x.type), ["heading", "paragraph", "heading", "bullet", "todo", "todo", "number", "number", "quote", "callout", "divider", "image", "code", "math"]);
  assert.equal(b[0].level, 1);
  assert.equal(b[1].text, "Um parágrafo\ncom duas linhas");
  assert.equal(b[2].level, 2);
  assert.deepEqual([b[4].checked, b[5].checked], [false, true]);
  assert.deepEqual([b[9].kind, b[9].text], ["tip", "Dica\ncorpo"]);
  assert.deepEqual([b[11].src, b[11].text], ["a.png", "foto"]);
  assert.deepEqual([b[12].lang, b[12].text], ["js", "let a = 1;"]);
  assert.equal(b[13].text, "x^2");
});

test("Blocos: um documento já no formato canônico volta idêntico", () => {
  const md = [
    "# Título", "", "Texto com **negrito** e [[Nota]].", "", "- a", "  - filho", "    - neto", "- b", "",
    "1. um", "2. dois", "", "> [!warning] Cuidado", "> mais", "", "```", "código", "```", "", "---", "",
    "<details open>", "<summary>Mais</summary>", "", "dentro", "", "- item", "", "</details>", "",
    "| a | b |", "|---|---|", "| 1 | 2 |", "",
  ].join("\n");
  assert.equal(serializeBlocks(parseBlocks(md)), md);
});

test("Blocos: ler e escrever é estável (escrever de novo não muda nada)", () => {
  const messy = "#   Título   \n\n\n\nparágrafo\nlinha 2\n* um\n*   dois\n\t* aninhado\n3) três\n\n\n- [X] ok\n";
  const once = serializeBlocks(parseBlocks(messy));
  assert.equal(serializeBlocks(parseBlocks(once)), once);
});

test("Blocos: listas aninhadas por recuo, com qualquer largura", () => {
  const b = parseBlocks("- a\n    - b\n        - c\n- d\n\t- e");
  assert.deepEqual(shape(b), [["bullet", "a", [["bullet", "b", [["bullet", "c"]]]]], ["bullet", "d", [["bullet", "e"]]]]);
});

test("Blocos: lista com linhas em branco entre itens continua sendo uma lista; texto recuado continua o item", () => {
  const b = parseBlocks("- a\n\n- b\n  continua\n\nfim");
  assert.deepEqual(shape(b), [["bullet", "a"], ["bullet", "b\ncontinua"], ["paragraph", "fim"]]);
});

test("Blocos: lista numerada é renumerada ao escrever", () => {
  assert.equal(serializeBlocks(parseBlocks("5. a\n9. b\n2. c")), "1. a\n2. b\n3. c\n");
});

test("Blocos: toggle com filhos e toggles aninhados", () => {
  const b = parseBlocks("<details>\n<summary>Fora</summary>\n\n<details>\n<summary>Dentro</summary>\n\ntexto\n\n</details>\n\n</details>");
  assert.equal(b.length, 1);
  assert.equal(b[0].type, "toggle");
  assert.equal(b[0].children[0].type, "toggle");
  assert.equal(b[0].children[0].children[0].text, "texto");
  assert.equal(b[0].open, false);
});

test("Blocos: código não é interpretado e cerca fechada ou não", () => {
  const b = parseBlocks("```\n# não é título\n- nem lista\n");
  assert.deepEqual(shape(b), [["code", "# não é título\n- nem lista"]]);
  const c = parseBlocks("```\na\n```\n\ntexto");
  assert.deepEqual(shape(c), [["code", "a"], ["paragraph", "texto"]]);
});

test("Blocos: código com cerca de crases dentro usa til ao escrever", () => {
  const md = serializeBlocks(parseBlocks("~~~\n```\ndentro\n```\n~~~"));
  assert.ok(md.startsWith("~~~"));
  assert.equal(parseBlocks(md)[0].text, "```\ndentro\n```");
});

test("Blocos: tabela fica como bloco de texto cru, com as linhas originais", () => {
  const md = "| a | b |\n|:--|--:|\n| 1 | 2 |\n";
  const b = parseBlocks(md);
  assert.equal(b[0].type, "table");
  assert.equal(serializeBlocks(b), md);
});

test("Blocos: parágrafo termina quando outro bloco começa", () => {
  const b = parseBlocks(["texto", "# Título", "mais", "- item", "fim"].join("\n"));
  assert.deepEqual(b.map((x) => x.type), ["paragraph", "heading", "paragraph", "bullet", "paragraph"]);
  assert.equal(b[3].text, "item");
  assert.equal(b[4].text, "fim");
});

test("Blocos: divisor não vira lista; linha só com símbolos de lista seguida de texto é item", () => {
  assert.equal(parseBlocks("- - -")[0].type, "divider");
  assert.equal(parseBlocks("***")[0].type, "divider");
  assert.equal(parseBlocks("- texto")[0].type, "bullet");
});

test("Blocos: tags, links e outros trechos em linha ficam intactos no texto", () => {
  const md = "Veja #tag, [[Nota#Seção|apelido]], $x$ e [site](https://a.com) ^id\n";
  assert.equal(serializeBlocks(parseBlocks(md)), md);
});

test("Blocos: documento vazio e só espaços", () => {
  assert.deepEqual(parseBlocks(""), []);
  assert.deepEqual(parseBlocks("\n\n  \n"), []);
  assert.equal(serializeBlocks([]), "");
});

test("Blocos: consulta em ordem de leitura, com toggles fechados escondendo os filhos", () => {
  const b = parseBlocks("<details>\n<summary>T</summary>\n\nfilho\n\n</details>\n\ndepois");
  assert.deepEqual(flatten(b).map((x) => x.text), ["T", "filho", "depois"]);
  assert.deepEqual(flatten(b, { visibleOnly: true }).map((x) => x.text), ["T", "depois"]);
  const filho = b[0].children[0];
  assert.equal(locate(b, filho.id).parent.id, b[0].id);
  assert.equal(locate(b, "nada"), null);
});

test("Blocos: quem pode ter filhos", () => {
  assert.equal(canHaveChildren("bullet"), true);
  assert.equal(canHaveChildren("toggle"), true);
  assert.equal(canHaveChildren("paragraph"), false);
  assert.equal(canNest("toggle", "paragraph"), true);
  assert.equal(canNest("bullet", "paragraph"), false);
  assert.equal(canNest("todo", "bullet"), true);
});

test("Blocos: título recolhível guarda o nível e volta igual", () => {
  const md = "<details open>\n<summary>## Seção</summary>\n\ndentro\n\n</details>\n";
  const b = parseBlocks(md);
  assert.equal(b[0].type, "toggle");
  assert.equal(b[0].level, 2);
  assert.equal(b[0].text, "Seção");
  assert.equal(b[0].children[0].text, "dentro");
  assert.equal(serializeBlocks(b), md);
  assert.equal(parseBlocks("<details>\n<summary>Sem nível</summary>\n</details>")[0].level, undefined);
});

test("Blocos: índice e favorito são blocos próprios e voltam iguais", () => {
  const md = "<!-- toc -->\n\n<https://exemplo.com/pagina>\n";
  const b = parseBlocks(md);
  assert.deepEqual(b.map((x) => x.type), ["toc", "bookmark"]);
  assert.equal(b[1].src, "https://exemplo.com/pagina");
  assert.equal(serializeBlocks(b), md);
});

test("Blocos: base de dados na nota é um bloco próprio e volta igual", () => {
  const md = "![[Projetos.base]]\n";
  const b = parseBlocks(md);
  assert.equal(b[0].type, "baseembed");
  assert.equal(b[0].src, "Projetos.base");
  assert.equal(serializeBlocks(b), md);
  assert.equal(parseBlocks("![[Nota]]")[0].type, "paragraph", "embed de nota comum não muda");
});
