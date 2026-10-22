import test from "node:test";
import assert from "node:assert/strict";
import { NavHistory, ClosedTabs, cycleTab, gotoTab, togglePin, orderTabs } from "../src/nav.js";
import { addAlias, addProperty, clearProperties, propertyKeys } from "../src/frontmatter.js";
import { parseFrontmatter } from "../src/markdown.js";

// --- Histórico ----------------------------------------------------------------------------------------------------

test("Histórico: voltar e avançar andam pelas visitas", () => {
  const h = new NavHistory();
  ["A", "B", "C"].forEach((x) => h.push(x));
  assert.equal(h.current, "C");
  assert.equal(h.back(), "B");
  assert.equal(h.back(), "A");
  assert.equal(h.back(), null);
  assert.equal(h.forward(), "B");
  assert.equal(h.forward(), "C");
  assert.equal(h.forward(), null);
});

test("Histórico: repetir o destino não duplica; visita nova apaga o avançar", () => {
  const h = new NavHistory();
  h.push("A");
  h.push("A");
  h.push("B");
  assert.deepEqual(h.entries, ["A", "B"]);
  h.back();
  h.push("C");
  assert.deepEqual(h.entries, ["A", "C"]);
  assert.equal(h.canForward(), false);
  assert.equal(h.canBack(), true);
});

test("Histórico: pula destinos que não existem mais e respeita o limite", () => {
  const h = new NavHistory(3);
  ["A", "B", "C", "D"].forEach((x) => h.push(x));
  assert.deepEqual(h.entries, ["B", "C", "D"]);
  const exists = (x) => x !== "C";
  assert.equal(h.back(exists), "B");
  assert.equal(h.forward(exists), "D");
  assert.equal(h.canBack((x) => false), false);
});

test("Histórico: renomear e apagar mantêm a posição", () => {
  const h = new NavHistory();
  ["A", "B", "C", "B"].forEach((x) => h.push(x));
  h.rename("B", "Bb");
  assert.deepEqual(h.entries, ["A", "Bb", "C", "Bb"]);
  h.remove("C");
  assert.deepEqual(h.entries, ["A", "Bb"]);
  assert.equal(h.current, "Bb");
  const e = new NavHistory();
  e.push("X");
  e.remove("X");
  assert.equal(e.current, null);
});

test("Abas fechadas: reabre a mais recente que ainda existe e não está aberta", () => {
  const c = new ClosedTabs();
  ["A", "B", "C"].forEach((x) => c.push(x));
  assert.equal(c.pop((x) => x !== "C"), "B");
  assert.equal(c.pop(() => true, ["A"]), null);
  c.push("A");
  c.push("A");
  assert.equal(c.items.length, 1, "sem repetir");
  assert.equal(new ClosedTabs().pop(), null);
});

test("Abas: trocar para a próxima, anterior e ir para a n-ésima", () => {
  const tabs = ["a", "b", "c"];
  assert.equal(cycleTab(tabs, "c", 1), "a");
  assert.equal(cycleTab(tabs, "a", -1), "c");
  assert.equal(cycleTab(tabs, "zz", 1), "a");
  assert.equal(cycleTab([], "a", 1), null);
  assert.equal(gotoTab(tabs, 2), "b");
  assert.equal(gotoTab(tabs, 9), "c");
  assert.equal(gotoTab(tabs, 5), null);
});

test("Abas fixadas: alternar e ordenar à esquerda", () => {
  assert.deepEqual(togglePin([], "b"), ["b"]);
  assert.deepEqual(togglePin(["b"], "b"), []);
  assert.deepEqual(orderTabs(["a", "b", "c", "d"], ["d", "b"]), ["b", "d", "a", "c"]);
});

// --- Frontmatter ---------------------------------------------------------------------------------------------------

test("Apelido: cria o bloco, a lista e acrescenta sem repetir", () => {
  let s = addAlias("# Nota\n", "Outro nome");
  assert.equal(s, "---\naliases:\n  - Outro nome\n---\n# Nota\n");
  assert.deepEqual(parseFrontmatter(s).data.aliases, ["Outro nome"]);
  s = addAlias(s, "Terceiro");
  assert.deepEqual(parseFrontmatter(s).data.aliases, ["Outro nome", "Terceiro"]);
  assert.equal(addAlias(s, "Terceiro"), s);
  assert.equal(addAlias("# x", "  "), "# x");
});

test("Apelido: aproveita aliases em linha, texto simples e frontmatter sem a chave", () => {
  assert.deepEqual(parseFrontmatter(addAlias("---\naliases: [A, B]\n---\nc", "C")).data.aliases, ["A", "B", "C"]);
  assert.deepEqual(parseFrontmatter(addAlias("---\naliases: Um\n---\nc", "Dois")).data.aliases, ["Um", "Dois"]);
  const s = addAlias("---\ntitle: T\n---\ncorpo", "X");
  assert.match(s, /title: T\naliases:\n  - X\n---\ncorpo/);
  assert.equal(addAlias("---\naliases: [A]\n---\nc", "A"), "---\naliases: [A]\n---\nc");
});

test("Propriedade: acrescenta, troca e põe aspas quando o valor precisa", () => {
  assert.equal(addProperty("corpo", "status", "rascunho"), "---\nstatus: rascunho\n---\ncorpo");
  let s = addProperty("---\ntitle: T\n---\nc", "autor", "Ana");
  assert.equal(s, "---\ntitle: T\nautor: Ana\n---\nc");
  s = addProperty(s, "autor", "Bia");
  assert.equal(s, "---\ntitle: T\nautor: Bia\n---\nc");
  assert.equal(addProperty("x", "nota", "12:30"), "---\nnota: 12:30\n---\nx");
  assert.equal(addProperty("x", "nota", "a: b"), "---\nnota: \"a: b\"\n---\nx", "dois-pontos com espaço pede aspas");
  assert.equal(addProperty("x", "ativo", "true"), "---\nativo: true\n---\nx");
  assert.equal(addProperty("x", "n", "7"), "---\nn: 7\n---\nx");
  assert.equal(addProperty("x", "  ", "v"), "x");
  assert.equal(addProperty("---\ntags:\n  - a\n  - b\n---\nc", "tags", "z"), "---\ntags: z\n---\nc", "troca a lista inteira");
});

test("Propriedades: limpar e listar chaves; mantém quebras de linha do Windows", () => {
  assert.equal(clearProperties("---\na: 1\n---\n# Corpo"), "# Corpo");
  assert.equal(clearProperties("sem bloco"), "sem bloco");
  assert.deepEqual(propertyKeys("---\ntitle: T\ntags:\n  - a\n---\nx"), ["title", "tags"]);
  const crlf = addProperty("---\r\na: 1\r\n---\r\ncorpo", "b", "2");
  assert.equal(crlf, "---\r\na: 1\r\nb: 2\r\n---\r\ncorpo");
});
