import { test } from "node:test";
import assert from "node:assert/strict";
import { PluginHost } from "../src/plugins.js";
import { Vault } from "../src/vault.js";

const storage = () => {
  const data = new Map();
  return { get: (k, fb) => (data.has(k) ? data.get(k) : fb), set: (k, v) => data.set(k, v) };
};

async function hostWith(onload) {
  const host = new PluginHost({ vault: new Vault(), storage: storage(), importer: async () => ({ onload }) });
  host.register([{ id: "p", nome: "P", main: "p.js" }]);
  await host.enable("p");
  return host;
}

test("API de editor: sem editor, lê vazio e as escritas recusam", async () => {
  let api;
  await hostWith((a) => { api = a; });
  assert.equal(api.editor.available(), false);
  assert.equal(api.editor.getValue(), "");
  assert.equal(api.editor.getSelection(), "");
  assert.equal(api.editor.insertAtCursor("x"), false);
  assert.equal(api.editor.replaceSelection("x"), false);
});

test("API de editor: com editor, lê o texto e escreve no cursor e na seleção", async () => {
  let api;
  const host = await hostWith((a) => { api = a; });
  const log = [];
  host.editorApi = () => ({
    getValue: () => "olá mundo",
    getSelection: () => "mundo",
    insertAtCursor: (t) => log.push(["insert", t]),
    replaceSelection: (t) => log.push(["replace", t]),
  });
  assert.equal(api.editor.available(), true);
  assert.equal(api.editor.getValue(), "olá mundo");
  assert.equal(api.editor.getSelection(), "mundo");
  assert.equal(api.editor.insertAtCursor("!"), true);
  assert.equal(api.editor.replaceSelection("terra"), true);
  assert.deepEqual(log, [["insert", "!"], ["replace", "terra"]]);
});

test("API de editor: texto que não é string é recusado", async () => {
  let api;
  const host = await hostWith((a) => { api = a; });
  host.editorApi = () => ({ getValue: () => "", getSelection: () => "", insertAtCursor: () => assert.fail("não devia chamar"), replaceSelection: () => assert.fail("não devia chamar") });
  assert.equal(api.editor.insertAtCursor(42), false);
  assert.equal(api.editor.replaceSelection(null), false);
});
