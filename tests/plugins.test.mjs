import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PluginHost } from "../src/plugins.js";
import { Vault } from "../src/vault.js";

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));

function memoryStorage() {
  const data = new Map();
  return {
    get: (k, fb) => (data.has(k) ? data.get(k) : fb),
    set: (k, v) => data.set(k, v),
    data,
  };
}

// Módulos de teste, feitos a partir de objetos em memória.
function makeImporter(modules) {
  return async (path) => {
    if (!modules[path]) throw new Error(`módulo inexistente: ${path}`);
    return modules[path];
  };
}

describe("PluginHost", () => {
  test("registra manifestos e rejeita duplicados ou inválidos", () => {
    const host = new PluginHost({ vault: new Vault(), storage: memoryStorage() });
    host.register([{ id: "a", main: "a.js", nome: "A" }]);
    assert.throws(() => host.register([{ id: "a", main: "a.js" }]), /duplicado/);
    assert.throws(() => host.register([{ id: "b" }]), /inválido/);
    assert.equal(host.list()[0].nome, "A");
    assert.equal(host.list()[0].ativo, false);
  });

  test("ativa, executa onload, registra comando e desativa limpando tudo", async () => {
    const storage = memoryStorage();
    let unloaded = 0;
    const plugin = {
      onload(api) {
        api.addCommand({ id: "oi", name: "Dizer oi", run: () => {} });
        api.addPanel({ id: "p", title: "Painel", render() {} });
      },
      onunload() {
        unloaded++;
      },
    };
    const host = new PluginHost({ vault: new Vault(), storage, importer: makeImporter({ "x.js": { default: plugin } }) });
    host.register([{ id: "x", main: "x.js", nome: "X" }]);
    await host.enable("x");
    assert.equal(host.status("x").ativo, true);
    assert.deepEqual(host.commands().map((c) => c.name), ["Dizer oi"]);
    assert.equal(host.panels().length, 1);
    assert.deepEqual(storage.get("plugins.ativos", null), ["x"]);

    await host.disable("x");
    assert.equal(unloaded, 1);
    assert.equal(host.status("x").ativo, false);
    assert.equal(host.commands().length, 0, "comando removido ao desativar");
    assert.equal(host.panels().length, 0, "painel removido ao desativar");
    assert.deepEqual(storage.get("plugins.ativos", null), []);
  });

  test("erro no onload é registrado e não deixa restos", async () => {
    const plugin = {
      onload(api) {
        api.addCommand({ id: "parcial", name: "Parcial", run() {} });
        throw new Error("falhou");
      },
    };
    const host = new PluginHost({ vault: new Vault(), storage: memoryStorage(), importer: makeImporter({ "e.js": { default: plugin } }) });
    host.register([{ id: "e", main: "e.js" }]);
    await host.enable("e");
    assert.equal(host.status("e").ativo, false);
    assert.match(host.status("e").erro, /falhou/);
    assert.equal(host.commands().length, 0, "comando parcial é removido");
  });

  test("módulo sem onload vira erro claro", async () => {
    const host = new PluginHost({ vault: new Vault(), storage: memoryStorage(), importer: makeImporter({ "s.js": { default: {} } }) });
    host.register([{ id: "s", main: "s.js" }]);
    await host.enable("s");
    assert.match(host.status("s").erro, /onload/);
  });

  test("restore ativa só os plugins salvos; sem configuração ativa todos", async () => {
    const storage = memoryStorage();
    const mods = {
      "a.js": { default: { onload() {} } },
      "b.js": { default: { onload() {} } },
    };
    const host = new PluginHost({ vault: new Vault(), storage, importer: makeImporter(mods) });
    host.register([{ id: "a", main: "a.js" }, { id: "b", main: "b.js" }]);
    await host.restore();
    assert.deepEqual(host.list().map((p) => p.ativo), [true, true]);

    storage.set("plugins.ativos", ["b"]);
    const outro = new PluginHost({ vault: new Vault(), storage, importer: makeImporter(mods) });
    outro.register([{ id: "a", main: "a.js" }, { id: "b", main: "b.js" }]);
    await outro.restore();
    assert.deepEqual(outro.list().map((p) => p.ativo), [false, true]);
  });

  test("api do plugin enxerga o cofre, cria notas e escuta eventos", async () => {
    const vault = new Vault();
    vault.create("a.md", "um dois");
    let seen = null;
    const plugin = {
      onload(api) {
        api.onVault("create", (f) => { seen = f.path; });
        api.addCommand({
          id: "nova",
          name: "Nova",
          run() {
            api.createNote("nova.md", "# nova");
          },
        });
      },
    };
    const host = new PluginHost({ vault, storage: memoryStorage(), importer: makeImporter({ "n.js": { default: plugin } }) });
    host.register([{ id: "n", main: "n.js" }]);
    host.getActiveNote = () => "a.md";
    await host.enable("n");
    host.commands()[0].run();
    assert.equal(seen, "nova.md");
    assert.equal(vault.read("nova.md"), "# nova");
  });

  test("setVault religa plugins ativos ao novo cofre", async () => {
    let onloads = 0;
    const plugin = { onload() { onloads++; } };
    const host = new PluginHost({ vault: new Vault(), storage: memoryStorage(), importer: makeImporter({ "r.js": { default: plugin } }) });
    host.register([{ id: "r", main: "r.js" }]);
    await host.enable("r");
    await host.setVault(new Vault());
    assert.equal(onloads, 2);
    assert.equal(host.status("r").ativo, true);
  });
});

describe("telas de plugin", () => {
  test("addView registra a tela e a limpeza remove ao desativar", async () => {
    const plugin = {
      onload(api) {
        api.addView({ id: "painel", title: "Painel", icon: "clipboard-check", render() {} });
      },
    };
    const host = new PluginHost({ vault: new Vault(), storage: memoryStorage(), importer: makeImporter({ "v.js": { default: plugin } }) });
    host.register([{ id: "v", main: "v.js" }]);
    await host.enable("v");
    assert.deepEqual(host.views().map((v) => [v.key, v.title, v.icon]), [["v:painel", "Painel", "clipboard-check"]]);
    await host.disable("v");
    assert.equal(host.views().length, 0);
  });

  test("openView avisa o app com a chave da tela", async () => {
    const avisos = [];
    const plugin = { onload(api) { api.addCommand({ id: "abrir", name: "Abrir", run: () => api.openView("painel") }); } };
    const host = new PluginHost({ vault: new Vault(), storage: memoryStorage(), importer: makeImporter({ "o.js": { default: plugin } }), onChange: (i) => i && avisos.push(i) });
    host.register([{ id: "o", main: "o.js" }]);
    await host.enable("o");
    host.commands()[0].run();
    assert.deepEqual(avisos.at(-1), { view: "o:painel" });
  });
});
