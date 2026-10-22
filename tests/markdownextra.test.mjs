import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/markdown.js";

test("Leitura: listas aninhadas pelo recuo, com tarefas e numeradas dentro", () => {
  const html = renderMarkdown("- a\n  - b\n    - c\n- d\n  1. um\n  2. dois\n");
  assert.equal(html, "<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d<ol><li>um</li><li>dois</li></ol></li></ul>");
  const t = renderMarkdown("- [ ] pai\n  - [x] filho");
  assert.ok(t.includes('data-task="0"') && t.includes('data-task="1"'));
  assert.ok(t.includes('<li class="task done">'));
});

test("Leitura: lista simples continua igual e tipos diferentes no mesmo nível viram listas separadas", () => {
  assert.equal(renderMarkdown("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(renderMarkdown("- a\n1. b"), "<ul><li>a</li></ul><ol><li>b</li></ol>");
});

test("Leitura: <details> vira toggle com o conteúdo em Markdown", () => {
  const html = renderMarkdown("<details open>\n<summary>**Mais**</summary>\n\ntexto\n\n- item\n\n</details>\n\ndepois");
  assert.ok(html.startsWith("<details open><summary><strong>Mais</strong></summary>"));
  assert.ok(html.includes("<p>texto</p>") && html.includes("<ul><li>item</li></ul></details>"));
  assert.ok(html.endsWith("<p>depois</p>"));
  assert.ok(renderMarkdown("<details>\n<summary>A</summary>\n</details>").includes("<details><summary>A</summary></details>"));
});

test("Leitura: <details> sem fechar não engole o resto da nota", () => {
  const html = renderMarkdown("<details>\n<summary>A</summary>\n\ntexto");
  assert.ok(!html.includes("<details"), "sem </details> cai no parágrafo");
});

test("Leitura: título recolhível, índice e favorito", () => {
  const html = renderMarkdown("# Um\n\n<!-- toc -->\n\n<details>\n<summary>## Dois</summary>\n\ntexto\n\n</details>\n\n<https://exemplo.com/a>\n");
  assert.ok(html.includes('<summary class="sum-h2">Dois</summary>'));
  assert.ok(html.includes('<nav class="toc"><a class="toc-l0" href="#um">Um</a><a class="toc-l1" href="#dois">Dois</a></nav>'));
  assert.ok(html.includes('<a class="bookmark" href="https://exemplo.com/a"'));
  assert.ok(html.includes("<strong>exemplo.com</strong>"));
});

test("Leitura: cor do texto e do fundo só com valores seguros", () => {
  const ok = renderMarkdown('um <span style="color:#e03131;background:#ffd43b66">destaque</span>');
  assert.ok(ok.includes('<span style="color:#e03131;background-color:#ffd43b66">destaque</span>'));
  const bad = renderMarkdown('<span style="color:red;background:url(x)">x</span>');
  assert.ok(!bad.includes("<span style"));
});
