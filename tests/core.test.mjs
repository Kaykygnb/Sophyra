import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, renderMarkdown, extractMetadata, renderInline, slugify } from "../src/markdown.js";
import { Vault, normalizePath } from "../src/vault.js";
import { MetadataIndex } from "../src/index.js";

const resolveAll = () => ({ exists: true, href: "#" });

describe("frontmatter", () => {
  test("lê chaves escalares, listas e booleanos", () => {
    const src = "---\ntitle: Nota X\ntags: [a, b]\ndraft: true\ncount: 3\n---\nCorpo";
    const { data, body } = parseFrontmatter(src);
    assert.equal(data.title, "Nota X");
    assert.deepEqual(data.tags, ["a", "b"]);
    assert.equal(data.draft, true);
    assert.equal(data.count, 3);
    assert.equal(body, "Corpo");
  });

  test("lista em formato de traço", () => {
    const { data } = parseFrontmatter("---\naliases:\n  - Um\n  - Dois\n---\n");
    assert.deepEqual(data.aliases, ["Um", "Dois"]);
  });

  test("sem frontmatter devolve o texto inteiro", () => {
    const { data, body } = parseFrontmatter("# Título");
    assert.deepEqual(data, {});
    assert.equal(body, "# Título");
  });
});

describe("renderInline", () => {
  test("escapa HTML e preserva o conteúdo de código", () => {
    assert.equal(renderInline("<b>x</b> `<i>`"), "&lt;b&gt;x&lt;/b&gt; <code>&lt;i&gt;</code>");
  });

  test("ênfase: negrito, itálico, tachado e destaque", () => {
    const html = renderInline("**n** *i* ~~t~~ ==h==");
    assert.match(html, /<strong>n<\/strong>/);
    assert.match(html, /<em>i<\/em>/);
    assert.match(html, /<del>t<\/del>/);
    assert.match(html, /<mark>h<\/mark>/);
  });

  test("wikilink com alias e marcação de link quebrado", () => {
    const resolve = (t) => ({ exists: t === "Existe" });
    const html = renderInline("[[Existe|vai]] [[Falta]]", resolve);
    assert.match(html, /class="wikilink" data-target="Existe"[^>]*>vai</);
    assert.match(html, /class="wikilink unresolved" data-target="Falta"/);
  });

  test("tags viram spans e não quebram títulos", () => {
    assert.match(renderInline("ler #projeto/alfa agora"), /data-tag="projeto\/alfa"/);
  });
});

describe("renderMarkdown", () => {
  test("títulos recebem id e nível correto", () => {
    const html = renderMarkdown("## Olá Mundo");
    assert.match(html, /<h2 id="ola-mundo">Olá Mundo<\/h2>/);
  });

  test("listas de tarefas marcam concluídas", () => {
    const html = renderMarkdown("- [ ] pendente\n- [x] feito");
    assert.match(html, /<li class="task">/);
    assert.match(html, /<li class="task done">/);
    assert.match(html, /checked/);
  });

  test("bloco de código preserva conteúdo escapado", () => {
    const html = renderMarkdown("```js\nif (a < b) {}\n```");
    assert.match(html, /language-js/);
    assert.match(html, /if \(a &lt; b\) \{\}/);
  });

  test("callout vira bloco com tipo e título", () => {
    const html = renderMarkdown("> [!warning] Cuidado\n> Texto importante");
    assert.match(html, /callout-warning/);
    assert.match(html, /Cuidado/);
    assert.match(html, /Texto importante/);
  });

  test("tabela com cabeçalho e alinhamento", () => {
    const html = renderMarkdown("| a | b |\n|:-|-:|\n| 1 | 2 |");
    assert.match(html, /<th style="text-align:left">a<\/th>/);
    assert.match(html, /<td style="text-align:right">2<\/td>/);
  });

  test("embed de nota aparece como embed", () => {
    assert.match(renderMarkdown("![[Trecho]]", resolveAll), /class="embed"/);
  });
});

describe("extractMetadata", () => {
  test("coleta títulos, links, embeds, tags e tarefas com linha", () => {
    const src = [
      "---",
      "tags: [fm]",
      "---",
      "# Principal",
      "Veja [[Outra]] e ![[Trecho]] #ideia",
      "- [ ] fazer",
      "```",
      "[[Dentro do código]]",
      "```",
    ].join("\n");
    const meta = extractMetadata(src);
    assert.equal(meta.headings[0].text, "Principal");
    assert.deepEqual(meta.links.map((l) => l.target), ["Outra"]);
    assert.deepEqual(meta.embeds.map((e) => e.target), ["Trecho"]);
    assert.ok(meta.tags.includes("ideia") && meta.tags.includes("fm"));
    assert.equal(meta.tasks.length, 1);
    assert.equal(meta.links.some((l) => l.target.includes("código")), false, "código não conta como link");
  });

  test("código inline não gera links, tags nem tarefas", () => {
    const meta = extractMetadata("Use `[[Falso]]` e `#falsa` e `- [ ] nada`\nVeja [[Real]]");
    assert.deepEqual(meta.links.map((l) => l.target), ["Real"]);
    assert.deepEqual(meta.tags, []);
    assert.equal(meta.tasks.length, 0);
  });

  test("slugify remove acentos", () => {
    assert.equal(slugify("Ação Rápida!"), "acao-rapida");
  });
});

describe("Vault", () => {
  test("normalizePath bloqueia saída do cofre", () => {
    assert.equal(normalizePath("pasta\\nota.md"), "pasta/nota.md");
    assert.throws(() => normalizePath("../fora.md"));
  });

  test("create, write, remove e eventos", () => {
    const v = new Vault();
    const events = [];
    v.on("create", () => events.push("create"));
    v.on("modify", () => events.push("modify"));
    v.on("delete", () => events.push("delete"));
    v.create("a.md", "x");
    v.write("a.md", "y");
    assert.equal(v.read("a.md"), "y");
    v.remove("a.md");
    assert.deepEqual(events, ["create", "modify", "delete"]);
    assert.throws(() => v.create("b.md", "") && v.create("b.md", ""));
  });

  test("resolveLink por caminho e por nome sem diferenciar maiúsculas", () => {
    const v = new Vault();
    v.create("Projetos/Alfa.md", "");
    assert.equal(v.resolveLink("alfa"), "Projetos/Alfa.md");
    assert.equal(v.resolveLink("Projetos/Alfa"), "Projetos/Alfa.md");
    assert.equal(v.resolveLink("Nada"), null);
  });

  test("rename reescreve wikilinks que apontavam para o nome antigo", () => {
    const v = new Vault();
    v.create("Antiga.md", "conteúdo");
    v.create("Ref.md", "veja [[Antiga]] e [[Antiga|apelido]]");
    v.rename("Antiga.md", "Nova.md");
    assert.equal(v.read("Ref.md"), "veja [[Nova]] e [[Nova|apelido]]");
  });

  test("tree agrupa pastas", () => {
    const v = new Vault();
    v.create("a/b/c.md", "");
    v.create("raiz.md", "");
    const t = v.tree();
    assert.ok(t.folders.get("a").folders.get("b").files.some((f) => f.path === "a/b/c.md"));
    assert.equal(t.files[0].path, "raiz.md");
  });

  test("toJSON e fromJSON preservam o conteúdo", () => {
    const v = new Vault("X");
    v.create("n.md", "# oi");
    const copia = Vault.fromJSON(JSON.parse(JSON.stringify(v.toJSON())));
    assert.equal(copia.name, "X");
    assert.equal(copia.read("n.md"), "# oi");
  });
});

describe("MetadataIndex", () => {
  function sample() {
    const v = new Vault();
    v.create("Inicio.md", "# Início\nLinks: [[Projeto]] e [[Falta]] #hub\n- [ ] revisar");
    v.create("Projeto.md", "Volta para [[Inicio]]. #projeto");
    v.create("Diario.md", "Hoje falei de [[Projeto]] #projeto");
    return { v, idx: new MetadataIndex(v) };
  }

  test("backlinks apontam para as notas que linkam", () => {
    const { idx } = sample();
    const bl = idx.backlinks("Projeto.md").map((b) => b.source).sort();
    assert.deepEqual(bl, ["Diario.md", "Inicio.md"]);
  });

  test("links não resolvidos são listados com contagem", () => {
    const { idx } = sample();
    assert.deepEqual(idx.unresolved(), [{ target: "Falta", count: 1 }]);
  });

  test("tags agrupam notas", () => {
    const { idx } = sample();
    const tags = idx.tags();
    assert.deepEqual(tags.get("projeto").sort(), ["Diario.md", "Projeto.md"]);
    assert.deepEqual(tags.get("hub"), ["Inicio.md"]);
  });

  test("grafo tem arestas únicas e graus", () => {
    const { idx } = sample();
    const g = idx.graph();
    assert.equal(g.nodes.length, 3);
    const inicio = g.nodes.find((n) => n.id === "Inicio.md");
    assert.equal(inicio.degree, 2);
    assert.equal(g.edges.length, 3);
  });

  test("busca com termos, tag, exclusão e frase", () => {
    const { idx } = sample();
    assert.deepEqual(idx.search("projeto").map((r) => r.path).sort(), ["Diario.md", "Inicio.md", "Projeto.md"]);
    assert.deepEqual(idx.search("tag:hub").map((r) => r.path), ["Inicio.md"]);
    assert.deepEqual(idx.search("projeto -Hoje").map((r) => r.path).sort(), ["Inicio.md", "Projeto.md"]);
    assert.deepEqual(idx.search('"volta para"').map((r) => r.path), ["Projeto.md"]);
  });

  test("tarefas listam o arquivo de origem", () => {
    const { idx } = sample();
    assert.equal(idx.tasks()[0].path, "Inicio.md");
  });

  test("cache recalcula quando o conteúdo muda", () => {
    const { v, idx } = sample();
    assert.equal(idx.backlinks("Projeto.md").length, 2);
    v.write("Diario.md", "sem links");
    assert.equal(idx.backlinks("Projeto.md").length, 1);
  });
});
