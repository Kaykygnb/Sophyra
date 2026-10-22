import test from "node:test";
import assert from "node:assert/strict";
import { texToMathML, renderMath } from "../src/math.js";
import { parseFlowchart, parseSequence, renderMermaid, diagramType, flowchartSvg } from "../src/mermaid.js";
import { renderMarkdown, extractMetadata } from "../src/markdown.js";

test("TeX: fração, expoente e índice viram MathML", () => {
  const ml = texToMathML(String.raw`x^2 + \frac{a}{b}`);
  assert.match(ml, /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/);
  assert.match(ml, /<mfrac><mi>a<\/mi><mi>b<\/mi><\/mfrac>/);
  assert.match(texToMathML("a_i"), /<msub><mi>a<\/mi><mi>i<\/mi><\/msub>/);
});

test("TeX: somatório com limites, raiz, grego e texto", () => {
  const ml = texToMathML(String.raw`\sum_{i=1}^{n} \sqrt{x} + \alpha \text{ e } \pi`);
  assert.match(ml, /<munderover><mo largeop="true">∑<\/mo>/);
  assert.match(ml, /<msqrt><mi>x<\/mi><\/msqrt>/);
  assert.match(ml, /<mi>α<\/mi>/);
  assert.match(ml, /<mtext>e<\/mtext>/);
  assert.match(ml, /<mi>π<\/mi>/);
});

test("TeX: integral usa índice e expoente, não limites embaixo", () => {
  assert.match(texToMathML(String.raw`\int_0^1 x\,dx`), /<msubsup><mo largeop="true">∫<\/mo>/);
});

test("TeX: matriz e raiz de índice", () => {
  const ml = texToMathML(String.raw`\begin{pmatrix} a & b \\ c & d \end{pmatrix} \sqrt[3]{8}`);
  assert.match(ml, /<mtable>/);
  assert.equal((ml.match(/<mtr>/g) || []).length, 2);
  assert.equal((ml.match(/<mtd>/g) || []).length, 4);
  assert.match(ml, /<mroot>/);
});

test("TeX: bloco leva display e texto acessível, e código estranho não quebra", () => {
  assert.match(renderMath("x", { display: true }), /class="math-block"[^>]*aria-label="x"/);
  assert.doesNotThrow(() => texToMathML(String.raw`\unknowncommand{ {{ ^ _ }`));
  assert.equal(texToMathML("   "), "");
});

test("Markdown: fórmula em linha, sem confundir com dinheiro", () => {
  const html = renderMarkdown(String.raw`Vale $x^2$ mas custa $5 e depois $6.`);
  assert.match(html, /<span class="math"/);
  assert.match(html, /custa \$5 e depois \$6\./);
});

test("Markdown: $$…$$ no meio da frase vira fórmula em linha", () => {
  const html = renderMarkdown(String.raw`Soma: $$\sum_i x_i$$ e fim.`);
  assert.match(html, /<span class="math"/);
  assert.match(html, /<p>Soma: .*e fim\.<\/p>/);
  assert.doesNotMatch(html, /\$\$/);
});

test("Markdown: bloco $$ em uma ou várias linhas e fence math", () => {
  assert.match(renderMarkdown("$$a+b$$"), /class="math-block"/);
  assert.match(renderMarkdown("$$\n\\frac{1}{2}\n$$"), /<mfrac>/);
  assert.match(renderMarkdown("```math\ny=mx+b\n```"), /class="math-block"/);
});

test("Markdown: dentro de fórmula não nasce tag nem link", () => {
  const md = String.raw`Veja $a_{\#x}$ e [[Nota]]`;
  const html = renderMarkdown(md);
  assert.doesNotMatch(html, /class="tag"/);
  assert.match(html, /wikilink/);
  const meta = extractMetadata("$$\n#naotag\n$$\n\n#sim\n");
  assert.deepEqual(meta.tags, ["sim"]);
});

test("Mermaid: lê fluxograma com formas, rótulos e encadeamento", () => {
  const m = parseFlowchart("graph LR\nA[Início] --> B{Ok?}\nB -->|sim| C((Fim))\nB -- não --> D(Rever) --> A");
  assert.equal(m.dir, "LR");
  assert.deepEqual(m.nodes.map((n) => n.id), ["A", "B", "C", "D"]);
  assert.equal(m.nodes.find((n) => n.id === "B").shape, "diamond");
  assert.equal(m.nodes.find((n) => n.id === "C").shape, "circle");
  const labels = m.edges.map((e) => e.label);
  assert.deepEqual(labels, ["", "sim", "não", ""]);
  assert.equal(m.edges.length, 4);
});

test("Mermaid: setas tracejadas, grossas e sem ponta", () => {
  const m = parseFlowchart("flowchart TD\nA -.-> B\nB ==> C\nC --- D");
  assert.equal(m.edges[0].dashed, true);
  assert.equal(m.edges[1].thick, true);
  assert.equal(m.edges[2].arrow, false);
});

test("Mermaid: o SVG tem um grupo por nó e cabe no desenho", () => {
  const svg = flowchartSvg("graph TD\nA --> B\nA --> C\nB --> D\nC --> D");
  assert.equal((svg.match(/class="m-node"/g) || []).length, 4);
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg).map(Number);
  assert.ok(w > 100 && h > 150);
});

test("Mermaid: ciclo não trava o desenho", () => {
  assert.doesNotThrow(() => flowchartSvg("graph TD\nA --> B\nB --> C\nC --> A\nA --> A"));
});

test("Mermaid: diagrama de sequência", () => {
  const m = parseSequence("sequenceDiagram\nparticipant U as Usuária\nU->>S: pede\nS-->>U: responde\nNote over U,S: fim");
  assert.deepEqual(m.actors.map((a) => a.label), ["Usuária", "S"]);
  assert.equal(m.items.length, 3);
  assert.equal(m.items[1].dashed, true);
  assert.match(renderMermaid("sequenceDiagram\nA->>B: oi"), /class="mermaid" data-type="sequence"/);
});

test("Mermaid: tipo desconhecido e erro viram aviso com o código", () => {
  assert.equal(diagramType("journey\ntitle x"), "journey");
  const html = renderMermaid("journey\ntitle Plano\nsection cão");
  assert.match(html, /mermaid-error/);
  assert.match(html, /não é desenhado offline/);
  assert.match(html, /cão/);
  assert.match(renderMermaid("graph TD\nA[aberto --> B"), /mermaid-error/);
});

test("Markdown: bloco mermaid vira SVG dentro da nota", () => {
  const html = renderMarkdown("```mermaid\ngraph TD\nA --> B\n```\n\ndepois");
  assert.match(html, /<svg class="mermaid-svg"/);
  assert.match(html, /<p>depois<\/p>/);
});

// --- Arquivos externos e frontmatter inválido ------------------------------------------------------------------

import { diagnoseFrontmatter } from "../src/markdown.js";
import { isExternalReference, getExternalFile, canOpenExternalFiles, planImport, importFiles } from "../src/external.js";
import { Vault } from "../src/vault.js";

test("Frontmatter: válido não gera avisos; ausente também não", () => {
  assert.deepEqual(diagnoseFrontmatter("---\ntitle: Oi\ntags: [a, b]\naliases:\n  - X\n---\n# t"), []);
  assert.deepEqual(diagnoseFrontmatter("# sem frontmatter"), []);
});

test("Frontmatter: aponta cada problema com a linha certa, sem alterar a leitura", () => {
  const src = "---\ntitle: A\ntitle: B\ntags: [a, b\nruim sem dois pontos\n- solto\n---\ncorpo";
  const issues = diagnoseFrontmatter(src);
  assert.deepEqual(issues.map((i) => i.line), [3, 4, 5]);
  assert.match(issues[0].message, /aparece de novo/);
  assert.match(issues[1].message, /colchete/);
  assert.match(issues[2].message, /chave: valor/);
});

test("Frontmatter: sem fechamento avisa que não foi lido", () => {
  const [issue] = diagnoseFrontmatter("---\ntitle: A\ncorpo sem fechar");
  assert.equal(issue.line, 1);
  assert.match(issue.message, /não é fechado/);
});

test("Externos: endereços de disco são reconhecidos", () => {
  for (const ref of [String.raw`C:\Users\a\x.md`, "c:/tmp/x.md", "file:///C:/x.md", String.raw`\\servidor\pasta\x.md`, "/etc/passwd", "../fora.md", "a/../../b.md"]) {
    assert.equal(isExternalReference(ref), true, ref);
  }
  for (const ref of ["Nota.md", "Projetos/Alfa.md", "Pasta/sub/arquivo.canvas"]) assert.equal(isExternalReference(ref), false, ref);
});

test("Externos: getExternalFile recusa com null, sem lançar, e abre só o que é do cofre", () => {
  const v = new Vault("t");
  v.create("Nota.md", "oi");
  assert.equal(getExternalFile(v, String.raw`C:\Windows\x.txt`), null);
  assert.equal(getExternalFile(v, "file:///tmp/x.md"), null);
  assert.equal(getExternalFile(v, "../x.md"), null);
  assert.equal(getExternalFile(v, "Nao existe.md"), null);
  assert.equal(getExternalFile(v, "Nota.md").content, "oi");
  assert.equal(canOpenExternalFiles(), false);
});

test("Externos: importar traz uma cópia para dentro do cofre, sem sobrescrever", () => {
  const v = new Vault("t");
  v.create("Ideias.md", "meu");
  const r = importFiles(v, [
    { name: "Ideias.md", size: 5, text: "de fora" },
    { name: String.raw`C:\pasta\Lista.txt`, size: 3, text: "abc" },
    { name: "mapa.canvas", size: 20, text: "{\"nodes\":[],\"edges\":[]}" },
    { name: "foto.png", size: 10, text: "x" },
    { name: "enorme.md", size: 3 * 1024 * 1024, text: "x" },
    { name: "bin.md", size: 4, text: "a\u0000b" },
  ], { dir: "Importados" });
  assert.deepEqual(r.done, ["Importados/Ideias.md", "Importados/Lista.md", "Importados/mapa.canvas"]);
  assert.equal(v.read("Ideias.md"), "meu");
  assert.equal(r.failed.length, 3);
  assert.match(r.failed[0].reason, /png/);
  const again = planImport(v, { name: "Ideias.md", size: 1, text: "z" }, { dir: "Importados" });
  assert.equal(again.path, "Importados/Ideias 2.md");
});

test("Markdown: link para arquivo de disco vira texto sem endereço, e link de nota segue normal", () => {
  const html = renderMarkdown(String.raw`[doc](C:\x\a.md) e [outro](file:///tmp/a.md) e [site](https://exemplo.com) e [[Nota]]`);
  assert.equal((html.match(/external-blocked/g) || []).length, 2);
  assert.doesNotMatch(html, /href="file:/);
  assert.match(html, /href="https:\/\/exemplo.com"/);
  assert.match(html, /wikilink/);
});

test("TeX: ambientes alinhados, operador com nome, negrito de símbolo e chaves", () => {
  const al = texToMathML(String.raw`\begin{aligned} a &= b \\ c &= d \end{aligned}`);
  assert.match(al, /columnalign="right left"/);
  assert.equal((al.match(/<mtr>/g) || []).length, 2);
  assert.match(texToMathML(String.raw`\operatorname{sen}(x)`), /<mi mathvariant="normal">sen<\/mi>/);
  assert.match(texToMathML(String.raw`\boldsymbol{x}`), /mathvariant="bold-italic"/);
  assert.match(texToMathML(String.raw`\begin{array}{cc} 1 & 2 \end{array}`), /<mtable>/);
  assert.match(texToMathML(String.raw`\begin{Bmatrix} a \end{Bmatrix}`), /<mo stretchy="true">\{<\/mo>/);
  assert.match(texToMathML(String.raw`\begin{pmatrix} 1 \end{pmatrix}`), /<mo stretchy="true">\(<\/mo>.*<mo stretchy="true">\)<\/mo>/, "pmatrix leva parênteses");
  const sub = texToMathML(String.raw`\sum_{\substack{i \in I \\ i > 0}} x_i`);
  assert.match(sub, /<munderover>|<munder>/);
  assert.equal((sub.match(/<mtr>/g) || []).length, 2, "substack empilha duas linhas");
  assert.match(texToMathML(String.raw`A \xrightarrow{f} B`), /<mover><mo stretchy="true">→<\/mo>/);
  assert.match(texToMathML(String.raw`A \xrightarrow[g]{f} B`), /<munderover><mo stretchy="true">→<\/mo>/);
  assert.match(texToMathML(String.raw`a \not= b \not\in S`), /<mo>≠<\/mo>.*<mo>∉<\/mo>/);
  assert.doesNotThrow(() => texToMathML(String.raw`\not`));
  assert.doesNotThrow(() => texToMathML(String.raw`\substack{a`));
  assert.match(texToMathML(String.raw`\begin{vmatrix} 1 \end{vmatrix}`), /<mo stretchy="true">\|<\/mo>/);
  assert.match(texToMathML(String.raw`\overbrace{x+y}`), /<mover>/);
});
