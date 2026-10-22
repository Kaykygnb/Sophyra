import test from "node:test";
import assert from "node:assert/strict";
import { inlineToHtml, htmlToInline } from "../src/blockinline.js";

// Mini DOM só para testar a leitura de volta (o Node não tem DOM): converte o HTML gerado em nós simples.
function parseHtml(html) {
  const root = { nodeType: 1, nodeName: "DIV", childNodes: [], getAttribute: () => null, textContent: "" };
  const stack = [root];
  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m;
  const unescape = (t) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      const node = { nodeType: 3, nodeValue: unescape(m[4]), textContent: unescape(m[4]) };
      stack[stack.length - 1].childNodes.push(node);
      stack[stack.length - 1].textContent += node.textContent;
    } else if (m[1]) {
      const done = stack.pop();
      stack[stack.length - 1].textContent += done.textContent;
    } else {
      const attrs = {};
      for (const a of m[3].matchAll(/([a-z-]+)="([^"]*)"/g)) attrs[a[1]] = unescape(a[2]);
      const node = { nodeType: 1, nodeName: m[2].toUpperCase(), childNodes: [], textContent: "", getAttribute: (k) => (k in attrs ? attrs[k] : null) };
      stack[stack.length - 1].childNodes.push(node);
      if (m[2].toLowerCase() === "br") stack[stack.length - 1].textContent += "\n";
      else stack.push(node);
    }
  }
  return root;
}

const round = (md, ctx) => htmlToInline(parseHtml(inlineToHtml(md, ctx)));

test("Em linha: formatação vira HTML de verdade", () => {
  assert.equal(inlineToHtml("**a** *b* ~~c~~ ==d== `e`"), "<strong>a</strong> <em>b</em> <del>c</del> <mark>d</mark> <code>e</code>");
  assert.equal(inlineToHtml("a < b & c"), "a &lt; b &amp; c");
  assert.equal(inlineToHtml("linha 1\nlinha 2"), "linha 1<br>linha 2");
});

test("Em linha: ida e volta devolve o mesmo Markdown", () => {
  const casos = [
    "texto simples",
    "**negrito** e *itálico* e ~~riscado~~ e ==marcado==",
    "**negrito com *itálico* dentro**",
    "código `a * b` no meio",
    "veja [[Nota]], [[Nota#Seção|apelido]] e ![[Outra]]",
    "[site](https://exemplo.com/a?b=1) e ![foto](a.png)",
    "tags #ideia e #a/b no texto",
    "conta $x^2 + 1$ e $$y$$ no meio",
    "duas\nlinhas",
    "a < b & c > d",
    "preço de R$ 5 e R$ 10",
    "snake_case_nome e 2*3*4",
  ];
  for (const c of casos) assert.equal(round(c), c, c);
});

test("Em linha: [[link]] quebrado ganha a marca, e a peça guarda o Markdown original", () => {
  const html = inlineToHtml("ver [[Nada|x]]", { exists: () => false });
  assert.ok(html.includes("unresolved"));
  assert.ok(html.includes('data-md="[[Nada|x]]"'));
  assert.ok(html.includes('contenteditable="false"'));
});

test("Em linha: tag só vale no começo ou depois de espaço", () => {
  assert.ok(inlineToHtml("#a").includes('class="tag"'));
  assert.ok(!inlineToHtml("abc#a").includes('class="tag"'));
  assert.ok(!inlineToHtml("# não").includes('class="tag"'));
});

test("Em linha: asteriscos soltos e sublinhados em palavra não viram ênfase", () => {
  assert.equal(inlineToHtml("2 * 3 * 4"), "2 * 3 * 4");
  assert.equal(inlineToHtml("a_b_c"), "a_b_c");
  assert.equal(inlineToHtml("_itálico_"), "<em>itálico</em>");
});

test("Leitura: o HTML que o navegador cria ao formatar vira Markdown", () => {
  const n = (md) => htmlToInline(parseHtml(md));
  assert.equal(n("a <b>negrito</b> <i>it</i> <strike>x</strike>"), "a **negrito** *it* ~~x~~");
  assert.equal(n("<b> espaço </b>fim"), " **espaço** fim", "espaços de borda saem dos marcadores");
  assert.equal(n("<b></b>vazio"), "vazio");
  assert.equal(n("a&nbsp;b"), "a b".replace(" ", " ") === "a b" ? "a&nbsp;b" : "a b");
  assert.equal(n("linha<br>outra"), "linha\noutra");
  assert.equal(n('<a href="https://x.com">site</a>'), "[site](https://x.com)");
  assert.equal(n('<a href="#">só texto</a>'), "só texto");
  assert.equal(n("<code>a`b</code>"), "``a`b``");
  assert.equal(n("um<div>dois</div>"), "um\ndois");
});

test("Cor: texto e fundo em <span style> viram HTML e voltam como Markdown", () => {
  const md = 'veja <span style="color:#e03131">vermelho</span> e <span style="color:#1971c2;background:#ffd43b66">azul sobre amarelo</span> aqui';
  const html = inlineToHtml(md);
  assert.ok(html.includes('<span style="color:#e03131">vermelho</span>'));
  assert.ok(html.includes('<span style="color:#1971c2;background-color:#ffd43b66">'));
  assert.equal(round(md), md);
  assert.equal(round('**<span style="color:#2f9e44">negrito verde</span>**'), '**<span style="color:#2f9e44">negrito verde</span>**');
});

test("Cor: estilos perigosos ou inválidos ficam como texto", () => {
  const html = inlineToHtml('<span style="color:red;position:fixed">x</span> e <span style="background:url(x)">y</span>');
  assert.ok(!html.includes("<span style"));
  assert.ok(html.includes("&lt;span"));
});

test("Cor: o que o navegador cria (rgb, font) vira hexadecimal", () => {
  const n = (h) => htmlToInline(parseHtml(h));
  assert.equal(n('<span style="color: rgb(224, 49, 49);">a</span>'), '<span style="color:#e03131">a</span>');
  assert.equal(n('<span style="background-color: rgba(255, 212, 59, 0.4);">b</span>'), '<span style="background:#ffd43b66">b</span>');
  assert.equal(n('<font color="#2f9e44">c</font>'), '<span style="color:#2f9e44">c</span>');
  assert.equal(n("<span>sem cor</span>"), "sem cor");
  assert.equal(n('<span style="color: rgb(1, 2, 3);"> espaço </span>x'), ' <span style="color:#010203">espaço</span> x');
});
