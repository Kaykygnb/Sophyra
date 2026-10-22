import test from "node:test";
import assert from "node:assert/strict";
import { propType, parseInput, defaultFor, withNewProperty } from "../src/noteprops.js";

test("Propriedades da nota: o tipo vem do valor", () => {
  assert.equal(propType(true), "checkbox");
  assert.equal(propType(3), "number");
  assert.equal(propType(["a"]), "list");
  assert.equal(propType("2026-10-30"), "date");
  assert.equal(propType("texto"), "text");
  assert.equal(propType(""), "text");
});

test("Propriedades da nota: o que se digita vira o valor do tipo", () => {
  assert.equal(parseInput("number", "3,5"), 3.5);
  assert.equal(parseInput("number", "abc"), "");
  assert.deepEqual(parseInput("list", " a, #b ,, c"), ["a", "b", "c"]);
  assert.equal(parseInput("text", "  oi "), "oi");
  assert.equal(defaultFor("checkbox"), false);
  assert.equal(defaultFor("date", "2026-01-02"), "2026-01-02");
});

test("Propriedades da nota: propriedade nova nasce vazia e fica na nota", () => {
  assert.equal(withNewProperty("corpo", "status", "text"), "---\nstatus:\n---\ncorpo");
  assert.equal(withNewProperty("---\ntags: [x]\n---\ncorpo", "etapa", "text"), "---\ntags: [x]\netapa:\n---\ncorpo");
  assert.equal(withNewProperty("corpo", "tags", "list"), "---\ntags: []\n---\ncorpo");
  assert.equal(withNewProperty("corpo", "feito", "checkbox"), "---\nfeito: false\n---\ncorpo");
  assert.equal(withNewProperty("corpo", "n", "number"), "---\nn: 0\n---\ncorpo");
  assert.equal(withNewProperty("corpo", "  ", "text"), "corpo");
});

import { resolveType, convertValue, optionColor, TYPE_NAMES, TYPE_ICONS } from "../src/noteprops.js";
import { renameProperty } from "../src/frontmatter.js";
import { ICONS } from "../src/icons.js";

test("Propriedades da nota: o tipo escolhido vence; tags é seleção múltipla; texto repetido vira seleção", () => {
  assert.equal(resolveType("status", "feito", { override: "text", uses: 5, distinct: 3 }), "text");
  assert.equal(resolveType("tags", "", {}), "list");
  assert.equal(resolveType("status", "feito", { uses: 4, distinct: 3 }), "select");
  assert.equal(resolveType("status", "feito", { uses: 1, distinct: 1 }), "text");
  assert.equal(resolveType("titulo", "um texto", { uses: 20, distinct: 20 }), "text");
  assert.equal(resolveType("site", "https://exemplo.com"), "url");
  assert.equal(resolveType("x", "valor", { override: "nada" }), "text", "tipo desconhecido é ignorado");
});

test("Propriedades da nota: trocar o tipo aproveita o valor", () => {
  assert.deepEqual(convertValue("list", "a"), ["a"]);
  assert.deepEqual(convertValue("list", ""), []);
  assert.equal(convertValue("select", ["x", "y"]), "x");
  assert.equal(convertValue("text", ["x", "y"]), "x, y");
  assert.equal(convertValue("number", "3,5"), 3.5);
  assert.equal(convertValue("number", "abc"), "");
  assert.equal(convertValue("checkbox", "sim"), true);
  assert.equal(convertValue("checkbox", "false"), false);
  assert.equal(convertValue("date", "2026-10-30"), "2026-10-30");
  assert.equal(convertValue("date", "ontem"), "");
});

test("Propriedades da nota: cor de opção estável e ícones de todos os tipos existem", () => {
  assert.equal(optionColor("feito"), optionColor("feito"));
  assert.ok([0, 1, 2, 3, 4, 5].includes(optionColor("qualquer coisa")));
  for (const t of Object.keys(TYPE_NAMES)) assert.ok(ICONS[TYPE_ICONS[t]], t);
});

test("Frontmatter: renomear mantém valor e posição, e não sobrescreve outra chave", () => {
  const s = "---\na: 1\nstatus: feito\nb: [x]\n---\ncorpo";
  assert.equal(renameProperty(s, "status", "etapa"), "---\na: 1\netapa: feito\nb: [x]\n---\ncorpo");
  assert.equal(renameProperty(s, "status", "a"), s);
  assert.equal(renameProperty(s, "nada", "x"), s);
  assert.equal(renameProperty("sem frontmatter", "a", "b"), "sem frontmatter");
});

import { guessType } from "../src/noteprops.js";

test("Propriedades da nota: o tipo sugerido para um nome novo", () => {
  assert.equal(guessType("Prazo"), "date");
  assert.equal(guessType("data de entrega"), "date");
  assert.equal(guessType("site"), "url");
  assert.equal(guessType("Endereço"), "url");
  assert.equal(guessType("tags"), "list");
  assert.equal(guessType("feito"), "checkbox");
  assert.equal(guessType("Prioridade"), "number");
  assert.equal(guessType("Status"), "select");
  assert.equal(guessType("responsável"), "text");
  assert.equal(guessType(""), "text");
});

import { ICON_CHOICES } from "../src/noteprops.js";

test("Propriedades da nota: todos os ícones oferecidos existem", () => {
  assert.ok(ICON_CHOICES.length >= 16);
  for (const n of ICON_CHOICES) assert.ok(ICONS[n], n);
  assert.equal(new Set(ICON_CHOICES).size, ICON_CHOICES.length, "sem repetidos");
});
