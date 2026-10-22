import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host } from "../server/host.js";
import { RemoteClient, RemoteSync, probeServer, AuthError } from "../src/remote.js";

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "sophyra-r-"));
  await mkdir(join(dir, "Pasta"));
  await writeFile(join(dir, "Alfa.md"), "# Alfa\n[[Beta]]\n");
  await writeFile(join(dir, "Pasta/Beta.md"), "# Beta\n");
  const host = new Host({ staticRoot: join(import.meta.dirname, ".."), accountsFile: join(dir, "..", `ra-${Date.now()}-${Math.random()}.json`), version: "t" });
  await host.open(dir);
  await host.accounts.load();
  await host.accounts.createUser("Dona", "senha-bem-longa", "dono");
  const info = await host.startNetwork({ host: "127.0.0.1", port: 0 });
  return { host, dir, base: `http://127.0.0.1:${info.port}` };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("Cliente: descobre o servidor, exige login e baixa a biblioteca", async () => {
  const { host, dir, base } = await setup();
  const info = await probeServer(base);
  assert.equal(info.app, "sophyra");
  assert.equal(info.requiresAuth, true);
  assert.equal(await probeServer("http://127.0.0.1:9"), null);
  const client = new RemoteClient({ base });
  await assert.rejects(client.vault(), AuthError);
  await assert.rejects(client.login("Dona", "errada"), /incorretos/);
  await client.login("Dona", "senha-bem-longa");
  const vault = await client.vault();
  assert.deepEqual(vault.list().map((f) => f.path), ["Alfa.md", "Pasta/Beta.md"]);
  await host.close();
  await rm(dir, { recursive: true });
});

test("Sincronização: duas pessoas veem as mudanças uma da outra e a pasta recebe tudo", async () => {
  const { host, dir, base } = await setup();
  const make = async () => {
    const client = new RemoteClient({ base });
    await client.login("Dona", "senha-bem-longa");
    const vault = await client.vault();
    const sync = new RemoteSync(vault, client, { onError: (e) => assert.fail(e.message) });
    sync.listen();
    return { vault, sync };
  };
  const a = await make();
  const b = await make();
  await wait(150);

  a.vault.create("Nova.md", "# Nova");
  a.vault.write("Alfa.md", "# Alfa\n[[Beta]] editado\n");
  await a.sync.flush();
  await wait(200);
  assert.equal(b.vault.read("Nova.md"), "# Nova");
  assert.match(b.vault.read("Alfa.md"), /editado/);

  b.vault.rename("Pasta/Beta.md", "Pasta/Gama.md"); // reescreve [[Beta]] em Alfa.md
  await b.sync.flush();
  await wait(200);
  assert.ok(a.vault.has("Pasta/Gama.md") && !a.vault.has("Pasta/Beta.md"));
  assert.match(a.vault.read("Alfa.md"), /\[\[Gama\]\]/);

  a.vault.remove("Nova.md");
  await a.sync.flush();
  await wait(200);
  assert.equal(b.vault.has("Nova.md"), false);

  await host.library.flush();
  assert.match(await readFile(join(dir, "Alfa.md"), "utf8"), /\[\[Gama\]\]/);
  assert.equal(host.library.vault.has("Pasta/Gama.md"), true);

  a.sync.stop();
  b.sync.stop();
  await host.close();
  await rm(dir, { recursive: true });
});

test("Sincronização: mudança feita na pasta por outro programa chega ao app; trocar de biblioteca manda reset", async () => {
  const { host, dir, base } = await setup();
  const client = new RemoteClient({ base });
  await client.login("Dona", "senha-bem-longa");
  const vault = await client.vault();
  let resets = 0;
  const sync = new RemoteSync(vault, client, { onReset: () => resets++ });
  sync.listen();
  await wait(150);
  await writeFile(join(dir, "Alfa.md"), "# Alfa por fora\n");
  await host.library.syncFromDisk("Alfa.md");
  host.hub.broadcast({ type: "modify", path: "Alfa.md", content: "# Alfa por fora\n", mtime: Date.now() });
  await wait(200);
  assert.equal(vault.read("Alfa.md"), "# Alfa por fora\n");
  const outra = await mkdtemp(join(tmpdir(), "sophyra-r2-"));
  await host.open(outra);
  await wait(200);
  assert.equal(resets, 1);
  sync.stop();
  await host.close();
  await rm(dir, { recursive: true });
  await rm(outra, { recursive: true });
});

test("Sincronização: depois de uma queda, recarrega se não há pendências e avisa se há", async () => {
  const { host, dir, base } = await setup();
  const port = host.servers.get("rede").port;
  const client = new RemoteClient({ base });
  await client.login("Dona", "senha-bem-longa");
  const vault = await client.vault();
  const events = [];
  const sync = new RemoteSync(vault, client, { onReset: () => events.push("reset"), onStatus: (s) => events.push(s) });
  sync.listen();
  await wait(200);
  await host.stop("rede");
  await wait(300);
  await host.startNetwork({ host: "127.0.0.1", port });
  await wait(2200);
  assert.deepEqual(events.filter((e) => e !== "offline"), ["online", "reset"], "sem pendências, recarrega");

  const again = new RemoteSync(await client.vault(), client, { onStatus: (s) => events.push(`2:${s}`), onReset: () => events.push("2:reset"), onError: () => {} });
  again.listen();
  await wait(200);
  again.dirty = true; // uma gravação não chegou
  await host.stop("rede");
  await wait(300);
  await host.startNetwork({ host: "127.0.0.1", port });
  await wait(2200);
  assert.ok(events.includes("2:pendente") && !events.includes("2:reset"), "com pendências, avisa e não recarrega");
  sync.stop();
  again.stop();
  await host.close();
  await rm(dir, { recursive: true });
});
