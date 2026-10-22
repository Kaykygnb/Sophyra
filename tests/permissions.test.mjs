import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PluginHost, PERMISSOES, permissionsOf, validatePermissions } from "../src/plugins.js";
import { Vault } from "../src/vault.js";

const storage = () => {
  const data = new Map();
  return { get: (k, fb) => (data.has(k) ? data.get(k) : fb), set: (k, v) => data.set(k, v) };
};

async function load(manifest, onload) {
  const vault = new Vault();
  vault.create("A.md", "texto");
  const host = new PluginHost({ vault, storage: storage(), importer: async () => ({ onload }) });
  host.register([{ id: "p", nome: "Plugin P", main: "p.js", ...manifest }]);
  await host.enable("p");
  return host;
}

test("Permissões: o manifesto só aceita nomes conhecidos e uma lista", () => {
  assert.doesNotThrow(() => validatePermissions({ id: "x" }));
  assert.doesNotThrow(() => validatePermissions({ permissoes: ["painel", "editor"] }));
  assert.throws(() => validatePermissions({ permissoes: ["rede"] }), /Permissão desconhecida: rede/);
  assert.throws(() => validatePermissions({ permissoes: "painel" }), /lista/);
  assert.equal(permissionsOf({}), null);
  assert.deepEqual([...permissionsOf({ permissoes: ["painel"] })], ["painel"]);
  assert.ok(Object.keys(PERMISSOES).length >= 6);
});

test("Permissões: registrar um manifesto com permissão inválida falha", () => {
  const host = new PluginHost({ vault: new Vault(), storage: storage() });
  assert.throws(() => host.register([{ id: "a", main: "a.js", permissoes: ["tudo"] }]), /desconhecida/);
});

test("Permissões: sem declaração, o plugin tem acesso total (compatibilidade)", async () => {
  let api;
  await load({}, (a) => { api = a; });
  assert.equal(api.readNote("A.md"), "texto");
  assert.doesNotThrow(() => api.addCommand({ id: "c", name: "C", run() {} }));
});

test("Permissões: com declaração, só passa o que foi pedido", async () => {
  let api;
  await load({ permissoes: ["notas:ler", "comandos"] }, (a) => { api = a; });
  assert.equal(api.readNote("A.md"), "texto");
  assert.doesNotThrow(() => api.addCommand({ id: "c", name: "C", run() {} }));
  assert.throws(() => api.createNote("B.md", "x"), /não tem a permissão “notas:escrever”.*createNote/);
  assert.throws(() => api.addPanel({ id: "p", title: "P", render() {} }), /“painel”/);
  assert.throws(() => api.openNote("A.md"), /“navegar”/);
  assert.throws(() => api.editor.getValue(), /“editor”.*editor\.getValue/);
  assert.throws(() => api.editor.insertAtCursor("x"), /“editor”/);
});

test("Permissões: o que não depende de permissão continua valendo (aviso e configurações próprias)", async () => {
  let api;
  await load({ permissoes: [] }, (a) => { api = a; });
  assert.doesNotThrow(() => api.notify("oi"));
  api.settings.set("k", 1);
  assert.equal(api.settings.get("k"), 1);
  assert.throws(() => api.listNotes(), /não tem a permissão/);
});

test("Permissões: o erro aparece no estado do plugin quando o onload usa o que não pediu", async () => {
  const host = await load({ permissoes: ["comandos"] }, (a) => { a.createNote("Z.md", "x"); });
  const status = host.status("p");
  assert.equal(status.ativo, false);
  assert.match(status.erro, /notas:escrever/);
  assert.deepEqual(status.permissoes, ["comandos"]);
});

test("Plugins do projeto declaram permissões e só usam o que declararam", () => {
  const registry = JSON.parse(readFileSync(fileURLToPath(new URL("../plugins/registry.json", import.meta.url)), "utf8"));
  const usos = { notas_ler: /api\.(activeNote|listNotes|readNote|onVault)\b/, notas_escrever: /api\.createNote\b/, painel: /api\.(addPanel|addView|openView|openDialog)\b/, comandos: /api\.addCommand\b/, navegar: /api\.openNote\b/, editor: /api\.editor\b/ };
  const perm = { notas_ler: "notas:ler", notas_escrever: "notas:escrever", painel: "painel", comandos: "comandos", navegar: "navegar", editor: "editor" };
  for (const m of registry) {
    assert.ok(Array.isArray(m.permissoes), `${m.id} sem permissoes`);
    const src = readFileSync(fileURLToPath(new URL(`../${m.main}`, import.meta.url)), "utf8");
    for (const [k, re] of Object.entries(usos)) {
      if (re.test(src)) assert.ok(m.permissoes.includes(perm[k]), `${m.id} usa ${perm[k]} sem declarar`);
    }
    for (const p of m.permissoes) {
      const k = Object.keys(perm).find((x) => perm[x] === p);
      assert.ok(usos[k].test(src), `${m.id} declara ${p} mas não usa`);
    }
  }
});

test("Remover do host: desativa, limpa comandos e tira da lista", async () => {
  const vault = new Vault();
  const host = new PluginHost({ vault, storage: storage(), importer: async () => ({ onload(a) { a.addCommand({ id: "c", name: "C", run() {} }); } }) });
  host.register([{ id: "p", nome: "P", main: "local:p", importado: true, permissoes: ["comandos"] }]);
  await host.enable("p");
  assert.equal(host.commands().length, 1);
  assert.equal(host.status("p").importado, true);
  await host.unregister("p");
  assert.equal(host.commands().length, 0);
  assert.equal(host.list().length, 0);
});

test("Restaurar: plugin importado não liga sozinho quando nunca houve escolha salva", async () => {
  const vault = new Vault();
  const host = new PluginHost({ vault, storage: storage(), importer: async () => ({ onload() {} }) });
  host.register([{ id: "a", nome: "A", main: "a.js" }, { id: "b", nome: "B", main: "local:b", importado: true, permissoes: [] }]);
  await host.restore();
  assert.equal(host.status("a").ativo, true);
  assert.equal(host.status("b").ativo, false);
});

test("Porta de consentimento: plugin importado só carrega quando a porta deixa, e o motivo aparece", async () => {
  let permitido = false;
  const vault = new Vault();
  const host = new PluginHost({ vault, storage: storage(), importer: async () => ({ onload() {} }) });
  host.gate = (m) => (m.importado && !permitido ? "Plugins da comunidade desligados." : null);
  host.register([{ id: "a", nome: "A", main: "a.js" }, { id: "b", nome: "B", main: "local:b", importado: true, permissoes: [] }]);
  await host.enable("a");
  await host.enable("b");
  assert.equal(host.status("a").ativo, true, "plugin do projeto não passa pela porta");
  assert.equal(host.status("b").ativo, false);
  assert.match(host.status("b").erro, /desligados/);
  await host.disable("b");
  permitido = true;
  await host.enable("b");
  assert.equal(host.status("b").ativo, true);
});
