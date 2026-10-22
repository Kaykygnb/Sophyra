import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { lintCss, hasErrors, normalizeName, SnippetStore, combinedCss, setSnippetStyle, STARTER_CSS, SNIPPET_MAX_BYTES } from "../src/snippets.js";

function memoria() {
  const dados = new Map();
  return { get: (k, f) => (dados.has(k) ? dados.get(k) : f), set: (k, v) => dados.set(k, JSON.parse(JSON.stringify(v))) };
}

describe("validação do CSS", () => {
  test("o modelo inicial é válido", () => {
    assert.deepEqual(lintCss(STARTER_CSS), []);
  });

  test("css vazio ou só com comentário é válido", () => {
    assert.deepEqual(lintCss(""), []);
    assert.deepEqual(lintCss("/* nada */"), []);
  });

  test("chaves: faltando e sobrando, com a linha", () => {
    const falta = lintCss("a {\n  color: red;\n");
    assert.equal(falta[0].level, "erro");
    assert.match(falta[0].message, /Falta fechar 1 chave.*linha 1/);
    const sobra = lintCss("a { color: red; }\n}\n");
    assert.match(sobra[0].message, /sobrando na linha 2/);
  });

  test("comentário e texto entre aspas abertos", () => {
    assert.match(lintCss("a { color: red; } /* sem fim")[0].message, /Comentário aberto na linha 1/);
    assert.match(lintCss('a::before { content: "abc; }')[0].message, /aspas/);
  });

  test("chaves dentro de comentários e de textos não contam", () => {
    assert.deepEqual(lintCss('/* { { { */ a::before { content: "}}"; }'), []);
  });

  test("avisa de recursos externos sem tratar como erro", () => {
    const w = lintCss('@import url("https://exemplo.com/x.css");\na { background: url(http://a.com/i.png); }');
    assert.ok(w.some((x) => /@import/.test(x.message)));
    assert.ok(w.some((x) => /externos/.test(x.message)));
    assert.equal(hasErrors(w), false);
  });

  test("avisa quando o estilo esconde a interface inteira", () => {
    assert.ok(lintCss("body { display: none; }").some((x) => /esconde a interface/.test(x.message)));
    assert.ok(lintCss(".preview { display: none; }").length === 0);
  });

  test("passa do limite de tamanho", () => {
    const grande = `a { content: "${"x".repeat(SNIPPET_MAX_BYTES)}"; }`;
    assert.ok(hasErrors(lintCss(grande)));
  });
});

describe("armazenamento", () => {
  test("cria com nome único e começa desligado", () => {
    const s = new SnippetStore(memoria());
    const a = s.create({ name: "Estilo" });
    const b = s.create({ name: "Estilo" });
    const c = s.create({ name: "estilo.css" });
    assert.deepEqual([a.name, b.name, c.name], ["Estilo", "Estilo 2", "estilo 3"]);
    assert.equal(a.enabled, false);
    assert.equal(s.list().length, 3);
    assert.notEqual(a.id, b.id);
  });

  test("atualiza, liga, renomeia sem colidir e remove", () => {
    const s = new SnippetStore(memoria());
    const a = s.create({ name: "A", css: "a{}" });
    const b = s.create({ name: "B" });
    s.setEnabled(a.id, true);
    s.update(a.id, { css: "a{color:red}" });
    assert.equal(s.get(a.id).enabled, true);
    assert.equal(s.get(a.id).css, "a{color:red}");
    assert.equal(s.update(b.id, { name: "A" }).name, "A 2");
    assert.equal(s.update(a.id, { name: "A" }).name, "A", "manter o próprio nome não conta como colisão");
    assert.equal(s.remove(a.id), true);
    assert.equal(s.remove(a.id), false);
    assert.equal(s.list().length, 1);
    assert.equal(s.update("nao-existe", { css: "" }), null);
  });

  test("desligar todos", () => {
    const s = new SnippetStore(memoria());
    s.create({ name: "A", enabled: true });
    s.create({ name: "B", enabled: true });
    s.disableAll();
    assert.deepEqual(s.list().map((x) => x.enabled), [false, false]);
  });

  test("lista corrompida no armazenamento vira lista vazia", () => {
    const m = memoria();
    m.set("snippets.lista", { nao: "uma lista" });
    assert.deepEqual(new SnippetStore(m).list(), []);
    m.set("snippets.lista", [null, 3, { id: "ok", name: "ok", css: "", enabled: false }]);
    assert.equal(new SnippetStore(m).list().length, 1);
  });

  test("normalizeName tira extensão e caracteres de caminho", () => {
    assert.equal(normalizeName("meu/estilo:novo.css"), "meu-estilo-novo");
    assert.equal(normalizeName("   "), "Sem nome");
  });
});

describe("aplicação", () => {
  const lista = [
    { id: "1", name: "Um", css: ".a { color: red; }", enabled: true },
    { id: "2", name: "Desligado", css: ".b {}", enabled: false },
    { id: "3", name: "Quebrado", css: ".c { color: red;", enabled: true },
    { id: "4", name: "Dois", css: ".d { color: blue; }", enabled: true },
  ];

  test("junta só os ligados e válidos, na ordem", () => {
    const css = combinedCss(lista);
    assert.match(css, /snippet: Um \*\/\n\.a/);
    assert.match(css, /snippet: Dois/);
    assert.doesNotMatch(css, /Desligado|Quebrado/);
    assert.ok(css.indexOf("Um") < css.indexOf("Dois"));
  });

  test("setSnippetStyle escreve no elemento e o modo seguro deixa vazio", () => {
    const el = { textContent: "" };
    const n = setSnippetStyle(el, lista);
    assert.ok(n > 0 && el.textContent.includes(".a"));
    assert.equal(setSnippetStyle(el, lista, { safe: true }), 0);
    assert.equal(el.textContent, "");
  });
});
