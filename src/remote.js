// Cliente de um servidor Sophyra: o do desktop (local) ou um servido na rede. Carrega a biblioteca pela API, grava
// cada mudança do Vault e aplica as mudanças dos outros em tempo real. Sem DOM, então roda e testa no Node.

import { Vault, normalizePath } from "./vault.js";

export class AuthError extends Error {}

export class RemoteClient {
  constructor({ base = "", token = "", clientId = Math.random().toString(36).slice(2, 10) } = {}) {
    this.base = base.replace(/\/+$/, "");
    this.token = token;
    this.clientId = clientId;
  }

  headers(extra = {}) {
    const h = { "X-Client-Id": this.clientId, ...extra };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  async request(path, { method = "GET", body, signal } = {}) {
    const res = await fetch(`${this.base}/api${path}`, {
      method,
      signal,
      headers: this.headers(body === undefined ? {} : { "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const message = (await res.json().catch(() => ({}))).error || `Erro ${res.status}`;
      throw res.status === 401 ? new AuthError(message) : new Error(message);
    }
    return res;
  }

  async json(path, options) {
    return (await this.request(path, options)).json();
  }

  info() {
    return this.json("/info");
  }

  async login(name, password) {
    const out = await this.json("/login", { method: "POST", body: { name, password } });
    this.token = out.token;
    return out;
  }

  async vault() {
    return Vault.fromJSON(await this.json("/vault"));
  }
}

// Descobre se esta página foi servida por um servidor Sophyra (desktop ou rede). Devolve a informação ou nulo.
export async function probeServer(base = "") {
  try {
    const res = await fetch(`${base}/api/info`, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const info = await res.json();
    return info?.app === "sophyra" ? info : null;
  } catch {
    return null;
  }
}

// Liga um Vault a um servidor: envia o que muda aqui e aplica o que chega de lá.
export class RemoteSync {
  constructor(vault, client, { onError = () => {}, onReset = () => {}, onStatus = () => {} } = {}) {
    this.vault = vault;
    this.client = client;
    this.onError = onError;
    this.onReset = onReset;
    this.onStatus = onStatus;
    this.queue = Promise.resolve();
    this.dirty = false; // alguma gravação não chegou ao servidor
    this.wasOffline = false;
    this.applying = false;
    this.abort = null;
    this.stopped = false;
    this.unsubs = [
      vault.on("create", (f) => !this.applying && this.enqueue(() => this.put(f.path, f.content))),
      vault.on("modify", (f) => !this.applying && this.enqueue(() => this.put(f.path, f.content))),
      vault.on("delete", (f) => !this.applying && this.enqueue(() => this.client.request(`/files/${encodeURI(f.path)}`, { method: "DELETE" }))),
      vault.on("rename", ({ from, to }) => !this.applying && this.enqueue(() => this.client.request("/rename", { method: "POST", body: { from, to, updateLinks: false } }))),
    ];
  }

  put(path, content) {
    return this.client.request(`/files/${encodeURI(path)}`, { method: "PUT", body: { content } });
  }

  enqueue(task) {
    this.queue = this.queue.then(task).catch((err) => {
      this.dirty = true;
      this.onError(err);
    });
    return this.queue;
  }

  flush() {
    return this.queue;
  }

  stop() {
    this.stopped = true;
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.abort?.abort();
  }

  // Fica ouvindo o servidor; se a conexão cair, tenta de novo com espera crescente.
  async listen() {
    let wait = 1000;
    while (!this.stopped) {
      this.abort = new AbortController();
      try {
        const res = await this.client.request("/events", { signal: this.abort.signal });
        // Voltou depois de uma queda: o que os outros fizeram nesse meio-tempo não foi entregue. Sem alterações
        // pendentes aqui, recarrega a biblioteca; com pendentes, avisa em vez de perder o que você escreveu.
        if (this.wasOffline) {
          this.wasOffline = false;
          if (!this.dirty) return this.onReset();
          this.onStatus("pendente");
        } else this.onStatus("online");
        wait = 1000;
        await this.#read(res.body);
      } catch (err) {
        if (this.stopped) return;
        if (err instanceof AuthError) return this.onError(err);
      }
      if (this.stopped) return;
      this.wasOffline = true;
      this.onStatus("offline");
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 15_000);
    }
  }

  async #read(stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const line = block.split("\n").find((l) => l.startsWith("data: "));
        if (line) this.apply(JSON.parse(line.slice(6)));
      }
    }
  }

  // Aplica um evento recebido no Vault sem devolvê-lo ao servidor.
  apply(e) {
    if (e.type === "reset") return this.onReset();
    const v = this.vault;
    this.applying = true;
    try {
      if (e.type === "delete") v.remove(e.path);
      else if (e.type === "rename") {
        if (v.has(e.from) && !v.has(e.to)) v.rename(e.from, e.to, { updateLinks: false });
      } else if (e.type === "create" || e.type === "modify") {
        const p = normalizePath(e.path);
        if (v.has(p)) v.write(p, e.content);
        else v.create(p, e.content);
        const f = v.get(p);
        if (f && e.mtime) f.mtime = e.mtime;
      }
    } catch (err) {
      this.onError(err);
    } finally {
      this.applying = false;
    }
  }
}
