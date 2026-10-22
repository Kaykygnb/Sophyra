import test from "node:test";
import assert from "node:assert/strict";
import { buildPattern, findAll, nextMatch, replaceOne, replaceAll } from "../src/find.js";

test("Busca: literal sem diferenciar maiúsculas, com acentos", () => {
  const { matches } = findAll("Ação, ação e AÇÃO.", "ação");
  assert.deepEqual(matches.map((m) => m.start), [0, 6, 13]);
  assert.equal(findAll("a.b a*b", "a.b").matches.length, 1, "o ponto é literal");
  assert.equal(findAll("a.b axb", "a.b", { regex: true }).matches.length, 2, "em regex o ponto casa qualquer coisa");
});

test("Busca: diferencia maiúsculas e palavra inteira", () => {
  assert.equal(findAll("Casa casa CASA", "casa", { caseSensitive: true }).matches.length, 1);
  assert.equal(findAll("casa casamento casas", "casa", { wholeWord: true }).matches.length, 1);
  assert.equal(findAll("ação ações", "ação", { wholeWord: true }).matches.length, 1, "acentuadas contam como letras");
});

test("Busca: consulta vazia não acha nada; regex inválida e vazia dão erro claro", () => {
  assert.deepEqual(findAll("texto", ""), { matches: [] });
  assert.match(findAll("texto", "(", { regex: true }).error, /inválida/);
  assert.match(findAll("texto", "a*", { regex: true }).error, /vazio/);
  assert.equal(buildPattern("").re, null);
});

test("Próxima ocorrência: anda para a frente e para trás dando a volta", () => {
  const { matches } = findAll("a b a b a", "a");
  assert.equal(nextMatch(matches, 0), 0);
  assert.equal(nextMatch(matches, 1), 1);
  assert.equal(nextMatch(matches, 9), 0, "depois da última volta ao começo");
  assert.equal(nextMatch(matches, 5, -1), 1, "para trás, antes do cursor");
  assert.equal(nextMatch(matches, 0, -1), 2, "para trás do começo vai para a última");
  assert.equal(nextMatch([], 0), -1);
});

test("Troca: uma ocorrência devolve uma edição com o cursor depois do texto novo", () => {
  const text = "um dois um";
  const { matches } = findAll(text, "um");
  const edit = replaceOne(text, matches[1], "um", "três");
  assert.deepEqual(edit, { from: 8, to: 10, insert: "três", sel: [12, 12] });
  assert.equal(text.slice(0, edit.from) + edit.insert + text.slice(edit.to), "um dois três");
});

test("Troca: tudo, com contagem, e grupos de captura em modo regex", () => {
  assert.deepEqual(replaceAll("a1 b2 a3", "a", "x"), { text: "x1 b2 x3", count: 2 });
  assert.deepEqual(replaceAll("João Silva", "(\\S+) (\\S+)", "$2, $1", { regex: true }), { text: "Silva, João", count: 1 });
  assert.equal(replaceAll("a.b", ".", "$1").text, "a$1b", "fora do regex o texto de troca é literal");
  assert.equal(replaceAll("abc", "b", "[$&]", { regex: true }).text, "a[b]c");
  assert.deepEqual(replaceAll("abc", "x", "y"), { text: "abc", count: 0 });
  assert.equal(replaceAll("abc", "(", "y", { regex: true }).count, 0);
});

test("Troca de uma ocorrência em regex usa os grupos só daquela ocorrência", () => {
  const text = "a=1, b=2";
  const { matches } = findAll(text, "(\\w)=(\\d)", { regex: true });
  assert.equal(replaceOne(text, matches[1], "(\\w)=(\\d)", "$2=$1", { regex: true }).insert, "2=b");
});

test("Busca: limite de ocorrências protege contra textos enormes", () => {
  const r = findAll("a".repeat(10000), "a");
  assert.equal(r.matches.length, 5000);
  assert.equal(r.capped, true);
});

test("Busca: mensagens de expressão inválida em português", () => {
  assert.match(findAll("x", "(", { regex: true }).error, /falta fechar um parêntese/);
  assert.match(findAll("x", ")", { regex: true }).error, /parêntese fechado sem abrir/);
  assert.match(findAll("x", "[a", { regex: true }).error, /colchete/);
});
