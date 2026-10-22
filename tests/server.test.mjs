import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Library } from "../server/library.js";
import { Accounts } from "../server/accounts.js";
import { Registry } from "../server/workspaces.js";
import { createMcp, toolList } from "../server/mcp.js";
import { Host } from "../server/host.js";

async function temp(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), "sophyra-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), content);
  }
  return dir;
}

const SAMPLE = {
  "Alfa.md": "---\ntags: [projeto]\n---\n# Alfa\nVeja [[Beta]]\n- [ ] revisar\n- [x] feito\n",
  "Pasta/Beta.md": "# Beta\nTexto\n",
  ".oculto/segredo.md": "não entra",
  "foto.png": "binário",
};

test("Biblioteca: lê só texto, ignora ocultos e binários", async () => {
  const dir = await temp(SAMPLE);
  const lib = new Library(dir);
  assert.equal(await lib.load(), 2);
  assert.deepEqual(lib.vault.list().map((f) => f.path), ["Alfa.md", "Pasta/Beta.md"]);
  await rm(dir, { recursive: true });
});

test("Biblioteca: grava criar, alterar, renomear (com links) e apagar", async () => {
  const dir = await temp(SAMPLE);
  const lib = new Library(dir);
  await lib.load();
  lib.start();
  lib.put("Nova/Gama.md", "# Gama");
  lib.vault.write("Alfa.md", "# Alfa\n[[Beta]]\n");
  lib.vault.rename("Pasta/Beta.md", "Pasta/Delta.md");
  await lib.flush();
  assert.equal(await readFile(join(dir, "Nova/Gama.md"), "utf8"), "# Gama");
  assert.match(await readFile(join(dir, "Alfa.md"), "utf8"), /\[\[Delta\]\]/);
  assert.deepEqual((await readdir(join(dir, "Pasta"))).sort(), ["Delta.md"]);
  lib.vault.remove("Nova/Gama.md");
  await lib.flush();
  await assert.rejects(readFile(join(dir, "Nova/Gama.md")));
  lib.stop();
  await rm(dir, { recursive: true });
});

test("Biblioteca: recusa caminho fora da pasta e tipo de arquivo estranho", async () => {
  const dir = await temp(SAMPLE);
  const lib = new Library(dir);
  await lib.load();
  assert.throws(() => lib.abs("../fora.md"));
  assert.throws(() => lib.put("script.exe", "x"), /Tipo de arquivo/);
  await rm(dir, { recursive: true });
});

test("Biblioteca: mudança feita por fora entra no Vault sem regravar", async () => {
  const dir = await temp(SAMPLE);
  const lib = new Library(dir);
  await lib.load();
  lib.start();
  const seen = [];
  lib.vault.on("modify", (f) => seen.push(f.path));
  await writeFile(join(dir, "Alfa.md"), "# Alterado por fora\n");
  assert.equal(await lib.syncFromDisk("Alfa.md"), true);
  assert.equal(lib.vault.read("Alfa.md"), "# Alterado por fora\n");
  assert.equal(await lib.syncFromDisk("Alfa.md"), false, "sem mudança não faz nada");
  await rm(join(dir, "Pasta/Beta.md"));
  assert.equal(await lib.syncFromDisk("Pasta/Beta.md"), true);
  assert.equal(lib.vault.has("Pasta/Beta.md"), false);
  assert.deepEqual(seen, ["Alfa.md"]);
  lib.stop();
  await rm(dir, { recursive: true });
});

test("Contas: senha curta, nome repetido, login, token e papéis", async () => {
  const dir = await temp();
  const acc = await new Accounts(join(dir, "contas.json")).load();
  await assert.rejects(acc.createUser("Ana", "curta", "dono"), /8 caracteres/);
  const ana = await acc.createUser("Ana", "senha-bem-longa", "dono");
  await assert.rejects(acc.createUser("ana", "outra-senha-longa"), /Já existe/);
  await assert.rejects(acc.login("Ana", "errada"), /incorretos/);
  await assert.rejects(acc.login("Quem", "qualquer-senha"), /incorretos/);
  const { token } = await acc.login("ANA", "senha-bem-longa");
  assert.match(token, /^sph_/);
  assert.equal(acc.authenticate(token).id, ana.id);
  assert.equal(acc.authenticate("sph_falso"), null);
  const raw = await readFile(join(dir, "contas.json"), "utf8");
  assert.ok(!raw.includes(token) && !raw.includes("senha-bem-longa"), "nada em claro no arquivo");
  await assert.rejects(acc.removeUser(ana.id), /pelo menos um dono/);
  await assert.rejects(acc.setRole(ana.id, "leitor"), /pelo menos um dono/);
  const again = await new Accounts(join(dir, "contas.json")).load();
  assert.equal(again.authenticate(token).name, "Ana", "tokens sobrevivem ao reinício");
  await again.revoke(token);
  assert.equal(again.authenticate(token), null);
  await rm(dir, { recursive: true });
});

test("Workspaces: cadastra pastas, troca a ativa, evita repetida e guarda perfil", async () => {
  const a = await temp();
  const b = await temp();
  const reg = await new Registry(join(a, "..", `reg-${Date.now()}.json`)).load();
  const la = await reg.add(a, "Pessoal");
  const lb = await reg.add(b);
  assert.equal((await reg.add(a)).id, la.id, "mesma pasta não entra duas vezes");
  assert.equal(reg.active.id, la.id);
  await reg.setActive(lb.id);
  await assert.rejects(reg.add(join(a, "nao-existe")), /não encontrada/);
  await assert.rejects(reg.setActive("x"), /não encontrada/);
  await reg.setProfile({ name: "  Kayky ", bio: "x".repeat(500) });
  await reg.setServe({ port: 9000 });
  await assert.rejects(reg.setServe({ port: 80 }), /porta/);
  const again = await new Registry(reg.file).load();
  assert.equal(again.active.id, lb.id);
  assert.equal(again.data.profile.name, "Kayky");
  assert.equal(again.data.profile.bio.length, 280);
  await again.remove(lb.id);
  assert.equal(again.active.id, la.id, "ao remover a ativa, passa para outra");
  await rm(a, { recursive: true });
  await rm(b, { recursive: true });
});

async function mcpOn(files, podeEscrever = true) {
  const dir = await temp(files);
  const lib = new Library(dir);
  await lib.load();
  lib.start();
  const mcp = createMcp({ getLibrary: () => lib, podeEscrever: () => podeEscrever });
  const call = async (name, args) => {
    const r = await mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
    const text = r.result.content[0].text;
    return { isError: r.result.isError, data: r.result.isError ? text : JSON.parse(text) };
  };
  return { dir, lib, mcp, call };
}

test("MCP: initialize, ping, lista de ferramentas e métodos desconhecidos", async () => {
  const { mcp, dir } = await mcpOn(SAMPLE);
  const init = await mcp.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(init.result.serverInfo.name, "sophyra");
  assert.ok(init.result.capabilities.tools);
  assert.equal(await mcp.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.deepEqual((await mcp.handle({ jsonrpc: "2.0", id: 2, method: "ping" })).result, {});
  const list = (await mcp.handle({ jsonrpc: "2.0", id: 3, method: "tools/list" })).result.tools;
  assert.ok(list.length >= 12 && list.every((t) => /^[a-z_]+$/.test(t.name) && t.inputSchema.type === "object"));
  assert.equal((await mcp.handle({ jsonrpc: "2.0", id: 4, method: "nada" })).error.code, -32601);
  assert.equal((await mcp.handle({ foo: 1 })).error.code, -32600);
  await rm(dir, { recursive: true });
});

test("MCP: leitura (listar, ler, buscar, links, etiquetas, tarefas)", async () => {
  const { call, dir } = await mcpOn(SAMPLE);
  assert.equal((await call("informacoes", {})).data.notes, 2);
  const lista = (await call("listar_notas", { pasta: "Pasta" })).data;
  assert.deepEqual(lista.map((n) => n.caminho), ["Pasta/Beta.md"]);
  const nota = (await call("ler_nota", { caminho: "Alfa" })).data;
  assert.deepEqual(nota.propriedades.tags, ["projeto"]);
  assert.equal((await call("buscar", { consulta: "tag:projeto" })).data[0].caminho, "Alfa.md");
  assert.equal((await call("backlinks", { caminho: "Pasta/Beta.md" })).data[0].origem, "Alfa.md");
  assert.equal((await call("links_de_saida", { caminho: "Alfa.md" })).data[0].resolvido, "Pasta/Beta.md");
  assert.deepEqual((await call("vizinhos", { caminho: "Pasta/Beta.md" })).data.map((n) => n.caminho), ["Alfa.md"]);
  assert.equal((await call("etiquetas", {})).data[0].etiqueta, "projeto");
  assert.equal((await call("tarefas", {})).data.length, 1);
  assert.equal((await call("tarefas", { incluir_concluidas: true })).data.length, 2);
  assert.match((await call("ler_nota", { caminho: "nao-existe" })).data, /não existe/);
  await rm(dir, { recursive: true });
});

test("MCP: escrever, anexar, renomear, arquivar e proteger contra sobrescrita", async () => {
  const { call, lib, dir } = await mcpOn(SAMPLE);
  assert.equal((await call("escrever_nota", { caminho: "Ideias/Nova.md", conteudo: "# Nova" })).data.ok, true);
  assert.equal((await call("escrever_nota", { caminho: "Ideias/Nova.md", conteudo: "outra" })).isError, true, "criar não sobrescreve");
  await call("escrever_nota", { caminho: "Ideias/Nova.md", conteudo: "mais", modo: "anexar" });
  assert.equal(lib.vault.read("Ideias/Nova.md"), "# Nova\nmais");
  await call("renomear_nota", { de: "Pasta/Beta.md", para: "Pasta/Omega.md" });
  assert.match(lib.vault.read("Alfa.md"), /\[\[Omega\]\]/);
  assert.equal((await call("arquivar_nota", { caminho: "Ideias/Nova.md" })).data.caminho, "Arquivo/Ideias/Nova.md");
  assert.equal(lib.vault.has("Ideias/Nova.md"), false);
  assert.equal((await call("escrever_nota", { caminho: "../fora.md", conteudo: "x" })).isError, true);
  await lib.flush();
  await rm(dir, { recursive: true });
});

test("MCP: somente leitura esconde e bloqueia as ferramentas de escrita", async () => {
  const { call, mcp, dir } = await mcpOn(SAMPLE, false);
  assert.ok(!toolList({ podeEscrever: false }).some((t) => t.name === "escrever_nota"));
  const tools = (await mcp.handle({ jsonrpc: "2.0", id: 1, method: "tools/list" })).result.tools;
  assert.ok(!tools.some((t) => t.name === "escrever_nota"));
  const r = await call("escrever_nota", { caminho: "X.md", conteudo: "x" });
  assert.equal(r.isError, true);
  assert.match(r.data, /somente leitura/);
  await rm(dir, { recursive: true });
});

test("MCP: diagrama — aplica esquema válido, recusa inválido e lê de volta", async () => {
  const { call, dir } = await mcpOn(SAMPLE);
  const esquema = {
    format: "sophyra.diagram",
    version: 1,
    tables: [
      { name: "Clientes", fields: [{ name: "id", type: "inteiro", primaryKey: true, required: true }] },
      { name: "Pedidos", fields: [{ name: "id", type: "inteiro", primaryKey: true }, { name: "cliente_id", type: "inteiro" }] },
    ],
    relations: [{ from: { table: "Clientes", field: "id" }, to: { table: "Pedidos", field: "cliente_id" }, cardinality: "1:N" }],
  };
  const ok = await call("aplicar_diagrama", { caminho: "Banco.canvas", esquema });
  assert.equal(ok.data.tabelas, 2);
  const lido = (await call("ler_diagrama", { caminho: "Banco.canvas" })).data;
  assert.equal(lido.esquema.relations[0].cardinality, "1:N");
  const ruim = await call("aplicar_diagrama", { caminho: "Banco.canvas", esquema: { ...esquema, version: 9 } });
  assert.equal(ruim.isError, true);
  assert.match(ruim.data, /Esquema inválido/);
  await rm(dir, { recursive: true });
});

// --- API HTTP ---------------------------------------------------------------

async function serve({ auth }) {
  const dir = await temp(SAMPLE);
  const accountsFile = join(dir, "..", `contas-${Date.now()}-${Math.random()}.json`);
  const host = new Host({ staticRoot: join(import.meta.dirname, ".."), accountsFile, version: "t" });
  await host.open(dir);
  let owner = null;
  if (auth) {
    await host.accounts.load();
    await host.accounts.createUser("Dona", "senha-bem-longa", "dono");
    await host.accounts.createUser("Leitora", "outra-senha-longa", "leitor");
    owner = await host.accounts.login("Dona", "senha-bem-longa");
  }
  const info = auth ? await host.startNetwork({ host: "127.0.0.1", port: 0 }) : await host.startLocal();
  return { host, dir, base: `http://127.0.0.1:${info.port}`, owner };
}

test("API local: lê, grava, renomeia e rejeita origem estranha", async () => {
  const { host, dir, base } = await serve({ auth: false });
  const id = { "X-Client-Id": "a" };
  const vault = await (await fetch(`${base}/api/vault`)).json();
  assert.equal(vault.files.length, 2);
  const put = await fetch(`${base}/api/files/Novo/Nota.md`, { method: "PUT", headers: { ...id, "Content-Type": "application/json" }, body: JSON.stringify({ content: "# oi" }) });
  assert.equal(put.status, 200);
  await host.library.flush();
  assert.equal(await readFile(join(dir, "Novo/Nota.md"), "utf8"), "# oi");
  const sem = await fetch(`${base}/api/files/Y.md`, { method: "PUT", body: JSON.stringify({ content: "x" }) });
  assert.equal(sem.status, 403, "sem X-Client-Id não grava");
  const outra = await fetch(`${base}/api/vault`, { headers: { Origin: "https://site-qualquer.com" } });
  assert.equal(outra.status, 403);
  const rebind = await new Promise((resolve) => {
    const req = http.request(base + "/api/vault", { headers: { Host: "evil.example" } }, (r) => { r.resume(); resolve(r.statusCode); });
    req.end();
  });
  assert.equal(rebind, 403, "Host de outro nome (rebinding) é recusado");
  const ren = await fetch(`${base}/api/rename`, { method: "POST", headers: { ...id, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Pasta/Beta.md", to: "Pasta/Z.md" }) });
  assert.equal(ren.status, 200);
  assert.match(host.library.vault.read("Alfa.md"), /\[\[Z\]\]/);
  const fora = await fetch(`${base}/api/files/..%2Ffora.md`, { method: "PUT", headers: { ...id }, body: JSON.stringify({ content: "x" }) });
  assert.ok(fora.status >= 400);
  await host.close();
  await rm(dir, { recursive: true });
});

test("API local: serve o app mas não o servidor, os testes nem os documentos", async () => {
  const { host, dir, base } = await serve({ auth: false });
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/src/vault.js`)).status, 200);
  for (const p of ["/server/accounts.js", "/tests/server.test.mjs", "/package.json", "/.git/config", "/docs/guia.md"]) {
    assert.equal((await fetch(`${base}${p}`)).status, 404, p);
  }
  assert.equal((await fetch(`${base}/src/..%2Fserver%2Faccounts.js`)).status, 404);
  await host.close();
  await rm(dir, { recursive: true });
});

test("API na rede: exige login, respeita papéis e entrega MCP com o mesmo token", async () => {
  const { host, dir, base, owner } = await serve({ auth: true });
  assert.equal((await fetch(`${base}/api/vault`)).status, 401);
  assert.equal((await fetch(`${base}/api/info`)).status, 200, "info é pública e não vaza notas");
  const bad = await fetch(`${base}/api/login`, { method: "POST", body: JSON.stringify({ name: "Dona", password: "errada" }) });
  assert.equal(bad.status, 401);
  const auth = { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" };
  assert.equal((await (await fetch(`${base}/api/vault`, { headers: auth })).json()).files.length, 2);
  const leitora = await (await fetch(`${base}/api/login`, { method: "POST", body: JSON.stringify({ name: "Leitora", password: "outra-senha-longa" }) })).json();
  const lh = { Authorization: `Bearer ${leitora.token}`, "Content-Type": "application/json" };
  assert.equal((await fetch(`${base}/api/vault`, { headers: lh })).status, 200);
  assert.equal((await fetch(`${base}/api/files/L.md`, { method: "PUT", headers: lh, body: JSON.stringify({ content: "x" }) })).status, 403);
  assert.equal((await fetch(`${base}/api/users`, { headers: lh })).status, 403);
  const users = await (await fetch(`${base}/api/users`, { headers: auth })).json();
  assert.equal(users.users.length, 2);
  assert.ok(!JSON.stringify(users).includes("hash"));
  const rpc = (headers, name, args) => fetch(`${base}/api/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }).then((r) => r.json());
  assert.equal((await rpc(auth, "escrever_nota", { caminho: "Via/Mcp.md", conteudo: "oi" })).result.isError, false);
  assert.equal((await rpc(lh, "escrever_nota", { caminho: "Via/Outra.md", conteudo: "oi" })).result.isError, true);
  assert.equal((await fetch(`${base}/api/mcp`, { method: "POST", body: "{}" })).status, 401);
  await host.close();
  await rm(dir, { recursive: true });
});

test("API: mudanças chegam em tempo real para os outros, não para o autor", async () => {
  const { host, dir, base, owner } = await serve({ auth: true });
  const headers = { Authorization: `Bearer ${owner.token}`, "Content-Type": "application/json" };
  const listen = async (clientId) => {
    const res = await fetch(`${base}/api/events`, { headers: { ...headers, "X-Client-Id": clientId } });
    const reader = res.body.getReader();
    const events = [];
    (async () => {
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        for (const line of dec.decode(value).split("\n")) if (line.startsWith("data: ")) events.push(JSON.parse(line.slice(6)));
      }
    })().catch(() => {});
    return { events, stop: () => reader.cancel() };
  };
  const a = await listen("a");
  const b = await listen("b");
  await new Promise((r) => setTimeout(r, 100));
  await fetch(`${base}/api/files/Tempo.md`, { method: "PUT", headers: { ...headers, "X-Client-Id": "a" }, body: JSON.stringify({ content: "oi" }) });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(b.events.filter((e) => e.type === "create").length, 1);
  assert.equal(a.events.filter((e) => e.type === "create").length, 0, "o autor não recebe o próprio eco");
  a.stop();
  b.stop();
  await host.close();
  await rm(dir, { recursive: true });
});

test("Host: não serve na rede sem conta de dono", async () => {
  const dir = await temp(SAMPLE);
  const host = new Host({ staticRoot: dir, accountsFile: join(dir, "..", `c-${Date.now()}.json`), version: "t" });
  await host.open(dir);
  await assert.rejects(host.startNetwork({ host: "127.0.0.1", port: 0 }), /conta de dono/);
  await host.close();
  await rm(dir, { recursive: true });
});
