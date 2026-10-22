import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, CATALOG_VERSION } from "../src/iconcatalog.js";
import { registerIcons, hasIcon, icon, ICONS } from "../src/icons.js";
import { fold, setIconFor, removeIconFor, renameIcons, searchIcons } from "../src/iconmap.js";

const SHAPES = ["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"];

test("Catálogo: vem do Lucide, com licença ISC e muitos ícones", () => {
  assert.ok(Object.keys(CATALOG).length >= 1500, "ao menos 1500 ícones");
  assert.match(CATALOG_VERSION, /^\d+\.\d+\.\d+$/);
  assert.ok(CATALOG.house && CATALOG["book-open"]);
});

test("Catálogo: só formas simples, sem script, objeto ou link externo", () => {
  for (const [name, [markup]] of Object.entries(CATALOG)) {
    const tags = [...markup.matchAll(/<([a-z]+)\b/g)].map((m) => m[1]);
    for (const t of tags) assert.ok(SHAPES.includes(t), `${name}: ${t}`);
    assert.doesNotMatch(markup, /on[a-z]+=|href|xlink|<script/i, name);
  }
});

test("Catálogo: nome e palavras-chave em texto simples", () => {
  for (const [name, [, keys]] of Object.entries(CATALOG)) {
    assert.match(name, /^[a-z0-9-]+$/, name);
    assert.equal(typeof keys, "string");
  }
});

test("Ícones: o catálogo entra depois e a biblioteca própria continua vencendo", () => {
  assert.equal(hasIcon("book-open"), false, "antes de registrar, não existe");
  registerIcons(CATALOG);
  assert.equal(hasIcon("book-open"), true);
  assert.match(icon("book-open", 16), /<svg[^>]*><path/);
  registerIcons({ home: ["<circle r=\"1\"/>", ""] });
  assert.equal(icon("folder", 16).includes("<path"), true, "os ícones próprios não mudam");
  assert.ok(ICONS.folder);
  registerIcons(CATALOG);
});

test("Busca: texto sem acento, nome que começa com o texto vem antes", () => {
  const top = searchIcons(CATALOG, "arrow up", 5);
  assert.equal(top[0], "arrow-up", "o nome exato vem primeiro");
  assert.equal(fold("Árvore"), "arvore");
  assert.ok(searchIcons(CATALOG, "book", 120).includes("book-open"));
});

test("Busca: sem texto mostra os primeiros, e o limite vale", () => {
  assert.equal(searchIcons(CATALOG, "").length, 120);
  assert.equal(searchIcons(CATALOG, "", 10).length, 10);
  assert.deepEqual(searchIcons(CATALOG, "zzzqqqxxx"), []);
});

test("Mapa de ícones: definir, trocar e remover", () => {
  let m = setIconFor({}, "Projetos", "rocket");
  assert.deepEqual(m, { Projetos: "rocket" });
  m = setIconFor(m, "Projetos", "star");
  assert.equal(m.Projetos, "star");
  assert.equal(setIconFor(m, "Projetos", "").Projetos, undefined, "vazio remove");
  assert.deepEqual(removeIconFor(m, "nada"), m, "remover o que não existe não muda nada");
});

test("Mapa de ícones: renomear leva a nota e a pasta inteira junto", () => {
  const m = { "A": "star", "A/nota.md": "book-open", "AB/x.md": "rocket", "outra.md": "home" };
  const moved = renameIcons(m, "A", "Nova");
  assert.deepEqual(moved, { Nova: "star", "Nova/nota.md": "book-open", "AB/x.md": "rocket", "outra.md": "home" }, "AB não é parte de A");
  assert.equal(renameIcons(m, "x", "y"), m, "caminho que não tem ícone não muda");
  assert.equal(renameIcons(m, "A", "A"), m);
});
