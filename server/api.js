// API HTTP da biblioteca: o app (rodando no navegador ou no desktop) lê e grava por aqui, outras pessoas se conectam
// por aqui e o MCP também (POST /mcp). Também serve os arquivos estáticos do app.
//
// Dois modos de segurança:
// - requireAuth falso (uso local, ligado só a 127.0.0.1): sem login, mas só aceita Host local e recusa Origin de
//   outro site, para uma página qualquer aberta no navegador não conseguir ler nem gravar suas notas.
// - requireAuth verdadeiro (servindo na rede): todo pedido precisa de token (Bearer); CORS liberado porque não há cookies.

import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { canWrite, isOwner, ROLES } from "./accounts.js";
import { createMcp } from "./mcp.js";

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8",
  ".canvas": "application/json; charset=utf-8",
};
const MAX_BODY = 8_000_000;
const LOCAL_HOSTS = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

// Distribui as mudanças da biblioteca para quem está conectado (Server-Sent Events).
export class Hub {
  constructor() {
    this.clients = new Set();
    this.origin = "";
    this.unsubs = [];
  }

  bind(library) {
    this.unbind();
    const v = library.vault;
    const send = (type, f, extra = {}) => this.broadcast({ type, path: f.path, content: f.content, mtime: f.mtime, ...extra });
    this.unsubs = [
      v.on("create", (f) => send("create", f)),
      v.on("modify", (f) => send("modify", f)),
      v.on("delete", (f) => this.broadcast({ type: "delete", path: f.path })),
      v.on("rename", ({ from, to, file }) => this.broadcast({ type: "rename", from, to, mtime: file.mtime })),
    ];
  }

  unbind() {
    for (const off of this.unsubs) off();
    this.unsubs = [];
  }

  broadcast(event) {
    const data = `data: ${JSON.stringify({ ...event, origin: this.origin })}\n\n`;
    for (const c of this.clients) if (!c.id || c.id !== this.origin) c.res.write(data);
  }

  // Avisa que a biblioteca trocou: os clientes precisam recarregar tudo.
  reset() {
    for (const c of this.clients) c.res.write(`data: ${JSON.stringify({ type: "reset" })}\n\n`);
  }

  add(res, id) {
    const client = { res, id };
    this.clients.add(client);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    res.on("close", () => {
      clearInterval(ping);
      this.clients.delete(client);
    });
  }

  closeAll() {
    for (const c of this.clients) c.res.end();
    this.clients.clear();
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function createHandler({ getLibrary, accounts, hub, staticRoot, requireAuth = false, version = "0.1.0", onUsersChanged = () => {} }) {
  const root = staticRoot ? resolve(staticRoot) : null;
  const localOwner = { id: "local", name: "Local", role: "dono" };

  const send = (res, status, body, headers = {}) => {
    const json = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
    res.end(json);
  };

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) throw new HttpError(413, "Corpo grande demais.");
      chunks.push(chunk);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new HttpError(400, "JSON inválido.");
    }
  }

  function who(req) {
    if (!requireAuth) return localOwner;
    const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
    return accounts.authenticate(m?.[1]);
  }

  const need = (user) => {
    if (!user) throw new HttpError(401, "Entre com seu nome e senha.");
    return user;
  };
  const needWrite = (user) => {
    if (!canWrite(need(user))) throw new HttpError(403, "Sua conta só pode ler.");
    return user;
  };

  // Aplica uma operação no Vault marcando quem a fez, para o aviso em tempo real não voltar para o próprio autor.
  function mutate(req, fn) {
    hub.origin = String(req.headers["x-client-id"] || "");
    try {
      return fn(getLibrary());
    } finally {
      hub.origin = "";
    }
  }

  async function api(req, res, url, user) {
    const path = url.pathname.replace(/^\/api/, "") || "/";
    const method = req.method;
    const lib = getLibrary();

    if (path === "/info" && method === "GET") {
      return send(res, 200, { app: "sophyra", version, name: lib.name, requiresAuth: requireAuth, ...lib.summary() });
    }
    if (path === "/login" && method === "POST") {
      if (!requireAuth) return send(res, 200, { token: "", user: localOwner });
      const { name, password, label } = await readJson(req);
      try {
        return send(res, 200, await accounts.login(name, password, label || "conexão"));
      } catch (err) {
        throw new HttpError(401, err.message);
      }
    }
    need(user);
    if (path === "/me" && method === "GET") return send(res, 200, { user });
    if (path === "/logout" && method === "POST") {
      const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
      if (m) await accounts.revoke(m[1]);
      return send(res, 200, { ok: true });
    }
    if (path === "/vault" && method === "GET") return send(res, 200, lib.vault.toJSON());
    if (path === "/events" && method === "GET") {
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write(": conectado\n\n");
      hub.add(res, String(req.headers["x-client-id"] || ""));
      return;
    }
    if (path.startsWith("/files/")) {
      const file = decodeURIComponent(path.slice("/files/".length));
      if (method === "GET") {
        const f = lib.vault.get(file);
        if (!f) throw new HttpError(404, "Arquivo não existe.");
        return send(res, 200, f);
      }
      needWrite(user);
      if (method === "PUT") {
        const { content } = await readJson(req);
        if (typeof content !== "string") throw new HttpError(400, 'Falta o campo "content".');
        const f = mutate(req, (l) => l.put(file, content));
        return send(res, 200, { path: f.path, mtime: f.mtime });
      }
      if (method === "DELETE") {
        mutate(req, (l) => l.vault.remove(file));
        return send(res, 200, { ok: true });
      }
    }
    if (path === "/rename" && method === "POST") {
      needWrite(user);
      const { from, to, updateLinks = true } = await readJson(req);
      mutate(req, (l) => l.vault.rename(from, to, { updateLinks }));
      return send(res, 200, { ok: true });
    }
    if (path === "/moves" && method === "POST") {
      needWrite(user);
      const { moves } = await readJson(req);
      if (!Array.isArray(moves)) throw new HttpError(400, 'Falta a lista "moves".');
      return send(res, 200, { moved: mutate(req, (l) => l.vault.applyMoves(moves)) });
    }
    if (path === "/mcp" && method === "POST") {
      const mcp = createMcp({ getLibrary, podeEscrever: () => canWrite(user), version });
      const out = await mcp.handle(await readJson(req));
      return out ? send(res, 200, out) : send(res, 202, "");
    }
    if (path === "/users") {
      if (!isOwner(user)) throw new HttpError(403, "Só o dono gerencia contas.");
      if (method === "GET") return send(res, 200, { users: accounts.list(), roles: ROLES });
      if (method === "POST") {
        const { name, password, role } = await readJson(req);
        const created = await accounts.createUser(name, password, role || "editor").catch((e) => {
          throw new HttpError(400, e.message);
        });
        onUsersChanged();
        return send(res, 201, created);
      }
    }
    if (path.startsWith("/users/") && isOwner(user)) {
      const id = path.slice("/users/".length);
      if (method === "DELETE") {
        await accounts.removeUser(id).catch((e) => {
          throw new HttpError(400, e.message);
        });
        onUsersChanged();
        return send(res, 200, { ok: true });
      }
      if (method === "PATCH") {
        const { role } = await readJson(req);
        return send(res, 200, await accounts.setRole(id, role).catch((e) => {
          throw new HttpError(400, e.message);
        }));
      }
    }
    throw new HttpError(404, "Rota não encontrada.");
  }

  async function serveStatic(req, res, url) {
    if (!root) throw new HttpError(404, "Não encontrado.");
    let caminho = normalize(decodeURIComponent(url.pathname));
    if (caminho.endsWith(sep) || caminho === "/") caminho = join(caminho, "index.html");
    const arquivo = resolve(join(root, caminho));
    if (arquivo !== root && !arquivo.startsWith(root + sep)) throw new HttpError(403, "Acesso negado.");
    const rel = arquivo.slice(root.length + 1).replace(/\\/g, "/");
    // Só o app em si: nada de servidor, testes, documentos nem pastas ocultas.
    if (!/^(index\.html|styles\.css|src\/|plugins\/|exemplos\/)/.test(rel)) throw new HttpError(404, "Não encontrado.");
    try {
      if (!(await stat(arquivo)).isFile()) throw new Error();
    } catch {
      throw new HttpError(404, "Não encontrado.");
    }
    res.writeHead(200, { "Content-Type": TIPOS[extname(arquivo).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(await readFile(arquivo));
  }

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const isApi = url.pathname.startsWith("/api/");
      if (requireAuth) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Client-Id");
        res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, PATCH, DELETE, OPTIONS");
        if (req.method === "OPTIONS") return send(res, 204, "");
      } else {
        const host = req.headers.host || "";
        if (!LOCAL_HOSTS.test(host)) throw new HttpError(403, "Acesso só pela própria máquina.");
        const origin = req.headers.origin;
        if (origin && origin !== `http://${host}`) throw new HttpError(403, "Origem não permitida.");
        if (isApi && req.method !== "GET" && !req.headers["x-client-id"] && url.pathname !== "/api/mcp") {
          throw new HttpError(403, "Faltou o cabeçalho X-Client-Id.");
        }
      }
      if (isApi) return await api(req, res, url, who(req));
      if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Método não permitido.");
      await serveStatic(req, res, url);
    } catch (err) {
      if (res.headersSent) return res.end();
      const status = err.status || 500;
      send(res, status, { error: status === 500 ? "Erro interno." : err.message });
      if (status === 500) console.error(err);
    }
  };
}
