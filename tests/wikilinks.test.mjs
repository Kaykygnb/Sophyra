import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Vault } from "../src/vault.js";
import { parseLinkTarget, renderInline } from "../src/markdown.js";
import {
  linkNameFor, findLinkContext, applySuggestion, suggestNotes, suggestHeadings,
  linkTargetExists, maskIgnored, findMentions, findUnlinkedMentions, linkFirstMention,
} from "../src/wikilinks.js";

function sample() {
  const v = new Vault();
  v.create("Projeto Alfa.md", "---\naliases: [Alfa, Projeto A]\n---\n# Projeto Alfa\n## Metas\n## Riscos\nTexto ^bloco1");
  v.create("Ideias.md", "# Ideias\nO Projeto Alfa precisa de mais gente. Veja o alfabeto.\nUm `Projeto Alfa` em código e [[Projeto Alfa]] já linkado.");
  v.create("Diário/Hoje.md", "# Hoje\nConversei sobre alfa com o time.");
  return v;
}

describe("alvo de link", () => {
  test("separa nota, seção e bloco", () => {
    assert.deepEqual(parseLinkTarget("Nota"), { name: "Nota", heading: "", block: "" });
    assert.deepEqual(parseLinkTarget("Nota#Seção um"), { name: "Nota", heading: "Seção um", block: "" });
    assert.deepEqual(parseLinkTarget("Nota#^abc"), { name: "Nota", heading: "", block: "abc" });
    assert.deepEqual(parseLinkTarget("#Só seção"), { name: "", heading: "Só seção", block: "" });
  });

  test("o rótulo mostra nota › seção, e o apelido tem prioridade", () => {
    const html = renderInline("[[Nota#Metas]] e [[Nota#Metas|as metas]]", () => ({ exists: true }));
    assert.match(html, />Nota › Metas</);
    assert.match(html, />as metas</);
    assert.match(html, /data-target="Nota#Metas"/);
  });

  test("link para seção que não existe fica marcado como não resolvido", () => {
    const html = renderInline("[[Nota#Falta]]", () => ({ exists: false }));
    assert.match(html, /wikilink unresolved/);
  });

  test("linkTargetExists confere nota, seção e bloco", () => {
    const v = sample();
    assert.equal(linkTargetExists(v, "Projeto Alfa"), true);
    assert.equal(linkTargetExists(v, "Projeto Alfa#Metas"), true);
    assert.equal(linkTargetExists(v, "projeto alfa#metas"), true);
    assert.equal(linkTargetExists(v, "Projeto Alfa#Nada"), false);
    assert.equal(linkTargetExists(v, "Projeto Alfa#^bloco1"), true);
    assert.equal(linkTargetExists(v, "Projeto Alfa#^outro"), false);
    assert.equal(linkTargetExists(v, "#Riscos", "Projeto Alfa.md"), true, "seção da própria nota");
    assert.equal(linkTargetExists(v, "Sumiu"), false);
  });
});

describe("apelidos", () => {
  test("link para um apelido do frontmatter abre a nota", () => {
    const v = sample();
    assert.equal(v.resolveLink("Alfa"), "Projeto Alfa.md");
    assert.equal(v.resolveLink("projeto a"), "Projeto Alfa.md");
    assert.deepEqual(v.aliasesOf("Projeto Alfa.md"), ["Alfa", "Projeto A"]);
  });

  test("o nome real vence o apelido, e a lista é refeita quando a nota muda", () => {
    const v = sample();
    v.create("Alfa.md", "outra");
    assert.equal(v.resolveLink("Alfa"), "Alfa.md");
    v.write("Projeto Alfa.md", "sem frontmatter");
    v.remove("Alfa.md");
    assert.equal(v.resolveLink("Alfa"), null);
  });

  test("apelido em texto único também vale", () => {
    const v = new Vault();
    v.create("N.md", "---\nalias: Único\n---\n");
    assert.equal(v.resolveLink("único"), "N.md");
  });
});

describe("contexto ao digitar [[", () => {
  test("detecta o início de um link de nota", () => {
    const text = "Veja [[Pro";
    const ctx = findLinkContext(text, text.length);
    assert.equal(ctx.stage, "note");
    assert.equal(ctx.query, "Pro");
    assert.equal(ctx.start, 7);
    assert.equal(ctx.hasClose, false);
  });

  test("reconhece o fechamento já existente", () => {
    const text = "[[Pro]] depois";
    const ctx = findLinkContext(text, 5);
    assert.equal(ctx.hasClose, true);
    assert.equal(ctx.query, "Pro");
  });

  test("detecta a etapa de seção depois do #", () => {
    const text = "[[Projeto Alfa#Me";
    const ctx = findLinkContext(text, text.length);
    assert.equal(ctx.stage, "heading");
    assert.equal(ctx.note, "Projeto Alfa");
    assert.equal(ctx.query, "Me");
    assert.equal(ctx.hashPos, 15);
  });

  test("ignora link fechado, apelido e outra linha", () => {
    assert.equal(findLinkContext("[[Nota]] e mais", 15), null);
    assert.equal(findLinkContext("[[Nota|ape", 10), null);
    assert.equal(findLinkContext("[[Nota\nabc", 10), null);
    assert.equal(findLinkContext("sem link", 4), null);
  });

  test("aplica a sugestão fechando o link ou respeitando o fechamento", () => {
    let text = "Veja [[Pro";
    let ctx = findLinkContext(text, text.length);
    let r = applySuggestion(text, ctx, { insert: "Projeto Alfa" });
    assert.equal(r.text, "Veja [[Projeto Alfa]]");
    assert.equal(r.caret, r.text.length);

    text = "[[Pro]] fim";
    ctx = findLinkContext(text, 5);
    r = applySuggestion(text, ctx, { insert: "Projeto Alfa" });
    assert.equal(r.text, "[[Projeto Alfa]] fim");
    assert.equal(r.text.slice(0, r.caret), "[[Projeto Alfa]]");

    text = "[[Projeto Alfa#Me";
    ctx = findLinkContext(text, text.length);
    r = applySuggestion(text, ctx, { insert: "Metas" });
    assert.equal(r.text, "[[Projeto Alfa#Metas]]");
  });
});

describe("sugestões", () => {
  test("ordem: prefixo antes de trecho, e apelidos aparecem", () => {
    const v = sample();
    const r = suggestNotes(v, "alf");
    assert.equal(r[0].label, "Alfa");
    assert.equal(r[0].kind, "alias");
    assert.ok(r.some((x) => x.label === "Projeto Alfa" && x.kind === "note"));
    assert.deepEqual(suggestNotes(v, "zzzz"), []);
  });

  test("sem texto lista as notas mais recentes e exclui a nota atual", () => {
    const v = sample();
    const r = suggestNotes(v, "", { exclude: "Ideias.md" });
    assert.ok(r.length >= 2);
    assert.ok(!r.some((x) => x.path === "Ideias.md"));
  });

  test("busca por parte do caminho e por letras em sequência", () => {
    const v = sample();
    assert.equal(suggestNotes(v, "diário")[0].path, "Diário/Hoje.md");
    assert.equal(suggestNotes(v, "pjt")[0].path, "Projeto Alfa.md");
  });

  test("títulos da nota citada e da própria nota", () => {
    const v = sample();
    assert.deepEqual(suggestHeadings(v, "Projeto Alfa", "").map((h) => h.label), ["Projeto Alfa", "Metas", "Riscos"]);
    assert.deepEqual(suggestHeadings(v, "Alfa", "ris").map((h) => h.label), ["Riscos"], "via apelido");
    assert.deepEqual(suggestHeadings(v, "", "me", "Projeto Alfa.md").map((h) => h.label), ["Metas"]);
    assert.deepEqual(suggestHeadings(v, "Sumiu", ""), []);
  });

  test("linkNameFor usa o caminho quando o nome se repete", () => {
    const v = new Vault();
    v.create("a/Nota.md", "");
    v.create("b/Nota.md", "");
    v.create("Única.md", "");
    assert.equal(linkNameFor(v, "a/Nota.md"), "a/Nota");
    assert.equal(linkNameFor(v, "Única.md"), "Única");
  });
});

describe("menções sem link", () => {
  test("ignora código, links, frontmatter e partes de palavras", () => {
    const texto = "---\ntitulo: Projeto Alfa\n---\nUm `Projeto Alfa` e [[Projeto Alfa]] e [Projeto Alfa](x). O alfabeto. Projeto Alfa!";
    const achados = findMentions(texto, ["Projeto Alfa", "Alfa"]);
    assert.equal(achados.length, 1);
    assert.equal(texto.slice(achados[0].index, achados[0].index + achados[0].length), "Projeto Alfa");
    assert.ok(achados[0].index > texto.indexOf("O alfabeto"));
  });

  test("maskIgnored mantém posições e quebras de linha", () => {
    const t = "a `b` c\n```\ncódigo\n```\nfim";
    const m = maskIgnored(t);
    assert.equal(m.length, t.length);
    assert.equal(m.split("\n").length, t.split("\n").length);
    assert.ok(!m.includes("código"));
  });

  test("lista as notas que citam sem linkar, com contagem e trecho", () => {
    const v = sample();
    const r = findUnlinkedMentions(v, "Projeto Alfa.md");
    assert.deepEqual(r.map((x) => x.source).sort(), ["Diário/Hoje.md", "Ideias.md"]);
    const ideias = r.find((x) => x.source === "Ideias.md");
    assert.equal(ideias.count, 1);
    assert.match(ideias.snippet, /precisa de mais gente/);
    assert.match(r.find((x) => x.source === "Diário/Hoje.md").snippet, /alfa/);
  });

  test("vincular troca só a primeira menção e preserva o texto original como apelido", () => {
    const t = "Falei do Projeto Alfa e do alfa de novo.";
    const exato = linkFirstMention(t, ["Projeto Alfa", "Alfa"], "Projeto Alfa");
    assert.equal(exato.content, "Falei do [[Projeto Alfa]] e do alfa de novo.");
    const apelido = linkFirstMention("Sobre o alfa.", ["Projeto Alfa", "Alfa"], "Projeto Alfa");
    assert.equal(apelido.content, "Sobre o [[Projeto Alfa|alfa]].");
    assert.equal(linkFirstMention("nada", ["Alfa"], "Alfa").changed, false);
  });

  test("títulos muito curtos não geram menção", () => {
    const v = new Vault();
    v.create("Ab.md", "");
    v.create("Outra.md", "ab ab ab");
    assert.deepEqual(findUnlinkedMentions(v, "Ab.md"), []);
  });
});
