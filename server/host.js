// Liga uma biblioteca a servidores HTTP. O desktop usa dois ao mesmo tempo, sobre a mesma biblioteca:
// um só local (127.0.0.1, sem login) para o próprio app, e, quando você escolhe "Servir", outro na rede com contas.

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { Accounts } from "./accounts.js";
import { Hub, createHandler } from "./api.js";
import { Library } from "./library.js";

export class Host {
  constructor({ staticRoot, accountsFile, version }) {
    this.staticRoot = staticRoot;
    this.accountsFile = accountsFile;
    this.version = version;
    this.library = null;
    this.hub = new Hub();
    this.accounts = new Accounts(accountsFile);
    this.servers = new Map(); // "local" | "rede" -> { server, port, host }
  }

  // Abre (ou troca) a biblioteca. Quem está conectado recebe "reset" e recarrega.
  async open(root, { name } = {}) {
    const next = new Library(root, { name });
    await next.load();
    this.library?.stop();
    this.library = next;
    next.start();
    next.watch((path) => this.hub.broadcast(this.#fromDisk(path)));
    this.hub.bind(next);
    this.hub.reset();
    return next;
  }

  // Mudança vinda de fora do app: manda o estado atual do arquivo.
  #fromDisk(path) {
    const f = this.library.vault.get(path);
    return f ? { type: "modify", path, content: f.content, mtime: f.mtime } : { type: "delete", path };
  }

  async #listen(kind, host, port, requireAuth) {
    if (this.servers.has(kind)) throw new Error(`O servidor ${kind} já está ligado.`);
    await this.accounts.load();
    const handler = createHandler({
      getLibrary: () => this.library,
      accounts: this.accounts,
      hub: this.hub,
      staticRoot: this.staticRoot,
      requireAuth,
      version: this.version,
    });
    const server = createServer(handler);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, resolve);
    });
    const info = { server, host, port: server.address().port };
    this.servers.set(kind, info);
    return info;
  }

  // Servidor do próprio app: só 127.0.0.1, porta livre qualquer.
  startLocal(port = 0) {
    return this.#listen("local", "127.0.0.1", port, false);
  }

  // Servir na rede: exige login. Precisa de pelo menos um dono já criado.
  async startNetwork({ host = "0.0.0.0", port = 8787 } = {}) {
    await this.accounts.load();
    if (!this.accounts.data.users.some((u) => u.role === "dono")) throw new Error("Crie uma conta de dono antes de servir na rede.");
    return this.#listen("rede", host, port, true);
  }

  async stop(kind) {
    const info = this.servers.get(kind);
    if (!info) return;
    this.servers.delete(kind);
    if (kind === "rede") this.hub.closeAll();
    await new Promise((resolve) => {
      info.server.close(resolve);
      info.server.closeAllConnections?.();
    });
  }

  async close() {
    for (const kind of [...this.servers.keys()]) await this.stop(kind);
    this.library?.stop();
    await this.library?.flush();
  }

  status() {
    const net = this.servers.get("rede");
    return {
      local: this.servers.has("local") ? `http://127.0.0.1:${this.servers.get("local").port}` : null,
      network: net ? { port: net.port, host: net.host, addresses: (net.host === "0.0.0.0" ? lanAddresses() : [net.host]).map((ip) => `http://${ip}:${net.port}`) } : null,
    };
  }
}

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) if (i.family === "IPv4" && !i.internal) out.push(i.address);
  }
  return out;
}
