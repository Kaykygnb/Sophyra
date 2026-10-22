import test from "node:test";
import assert from "node:assert/strict";
import { SLASH_ITEMS, filterSlash, slashAt, shortcutFor, enterShortcutFor } from "../src/blockslash.js";
import { ICONS } from "../src/icons.js";
import { BLOCK_TYPES } from "../src/blocks.js";

test("Menu /: todo item tem ícone que existe, tipo de bloco válido e id único", () => {
  const ids = new Set();
  for (const it of SLASH_ITEMS) {
    assert.ok(ICONS[it.icon], `ícone ${it.icon}`);
    assert.ok(it.make ? BLOCK_TYPES.includes(it.make.type) : "image wikilink date bookmark database columns media button mention canvas".split(" ").includes(it.action), it.id);
    assert.equal(ids.has(it.id), false, it.id);
    ids.add(it.id);
  }
});

test("Menu /: filtro ignora acento e maiúscula, e começo do nome vem primeiro", () => {
  assert.equal(filterSlash("").length, SLASH_ITEMS.length);
  assert.equal(filterSlash("TITULO")[0].id, "h1");
  assert.deepEqual(filterSlash("titulo").map((i) => i.id).slice(0, 3), ["h1", "h2", "h3"]);
  assert.ok(filterSlash("recolh").some((i) => i.id === "th2"));
  assert.equal(filterSlash("tarefa")[0].id, "todo");
  assert.equal(filterSlash("equacao")[0].id, "math");
  assert.equal(filterSlash("calout")[0], undefined, "erro de digitação não casa");
  assert.equal(filterSlash("zzz").length, 0);
});

test("Menu /: só abre no começo do bloco ou depois de espaço", () => {
  assert.deepEqual(slashAt("/"), { query: "", length: 1 });
  assert.deepEqual(slashAt("texto /tit"), { query: "tit", length: 4 });
  assert.equal(slashAt("a/b"), null);
  assert.equal(slashAt("http://x"), null);
  assert.equal(slashAt("texto /tit "), null, "espaço fecha o menu");
});

test("Atalhos: prefixo + espaço escolhe o tipo", () => {
  assert.deepEqual(shortcutFor("##"), { type: "heading", props: { level: 2 } });
  assert.equal(shortcutFor("####"), null);
  assert.equal(shortcutFor("-").type, "bullet");
  assert.equal(shortcutFor("*").type, "bullet");
  assert.equal(shortcutFor("12.").type, "number");
  assert.equal(shortcutFor("1)").type, "number");
  assert.deepEqual(shortcutFor("[]"), { type: "todo", props: { checked: false } });
  assert.deepEqual(shortcutFor("[x]"), { type: "todo", props: { checked: true } });
  assert.equal(shortcutFor(">").type, "quote");
  assert.equal(shortcutFor("texto"), null);
});

test("Atalhos: Enter depois de --- , ``` ou $$", () => {
  assert.equal(enterShortcutFor("---").type, "divider");
  assert.deepEqual(enterShortcutFor("```js"), { type: "code", props: { lang: "js" } });
  assert.equal(enterShortcutFor("```").props.lang, "");
  assert.equal(enterShortcutFor("$$").type, "math");
  assert.equal(enterShortcutFor("--"), null);
});
