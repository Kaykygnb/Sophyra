// Contas e tokens de quem se conecta a uma biblioteca servida. Tudo em um arquivo JSON; senhas e tokens nunca são
// guardados em claro (senha com scrypt e sal próprio, token só pelo hash SHA-256).

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ROLES = ["dono", "editor", "leitor"];
const CAN_WRITE = new Set(["dono", "editor"]);

export const canWrite = (user) => !!user && CAN_WRITE.has(user.role);
export const isOwner = (user) => user?.role === "dono";

const sha = (text) => createHash("sha256").update(text).digest("hex");

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(password, salt, 32).toString("hex") };
}

function samePassword(password, user) {
  const a = Buffer.from(hashPassword(password, user.salt).hash, "hex");
  const b = Buffer.from(user.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, created: u.created });

export class Accounts {
  constructor(file) {
    this.file = file;
    this.data = { users: [], tokens: [] };
  }

  async load() {
    try {
      const raw = JSON.parse(await readFile(this.file, "utf8"));
      this.data = { users: Array.isArray(raw.users) ? raw.users : [], tokens: Array.isArray(raw.tokens) ? raw.tokens : [] };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    return this;
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    await rename(tmp, this.file);
  }

  list() {
    return this.data.users.map(publicUser);
  }

  find(name) {
    const wanted = String(name).trim().toLowerCase();
    return this.data.users.find((u) => u.name.toLowerCase() === wanted) || null;
  }

  async createUser(name, password, role = "editor") {
    name = String(name || "").trim();
    if (!name) throw new Error("Informe um nome.");
    if (!ROLES.includes(role)) throw new Error(`Papel inválido: ${role}. Use ${ROLES.join(", ")}.`);
    if (String(password || "").length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
    if (this.find(name)) throw new Error(`Já existe uma conta chamada “${name}”.`);
    const user = { id: randomBytes(6).toString("hex"), name, role, created: new Date().toISOString(), ...hashPassword(password) };
    this.data.users.push(user);
    await this.save();
    return publicUser(user);
  }

  async setRole(id, role) {
    const user = this.data.users.find((u) => u.id === id);
    if (!user) throw new Error("Conta não encontrada.");
    if (!ROLES.includes(role)) throw new Error(`Papel inválido: ${role}.`);
    if (user.role === "dono" && role !== "dono" && this.data.users.filter((u) => u.role === "dono").length === 1) {
      throw new Error("Precisa existir pelo menos um dono.");
    }
    user.role = role;
    await this.save();
    return publicUser(user);
  }

  async removeUser(id) {
    const user = this.data.users.find((u) => u.id === id);
    if (!user) throw new Error("Conta não encontrada.");
    if (user.role === "dono" && this.data.users.filter((u) => u.role === "dono").length === 1) {
      throw new Error("Precisa existir pelo menos um dono.");
    }
    this.data.users = this.data.users.filter((u) => u.id !== id);
    this.data.tokens = this.data.tokens.filter((t) => t.userId !== id);
    await this.save();
  }

  // Confere nome e senha e devolve um token novo (mostrado uma única vez).
  async login(name, password, label = "") {
    const user = this.find(name);
    // Mesmo custo de cálculo quando a conta não existe, para não revelar quais nomes existem.
    const ok = user ? samePassword(String(password), user) : (hashPassword(String(password)), false);
    if (!ok) throw new Error("Nome ou senha incorretos.");
    return { token: await this.issueToken(user.id, label), user: publicUser(user) };
  }

  async issueToken(userId, label = "") {
    const token = `sph_${randomBytes(24).toString("base64url")}`;
    this.data.tokens.push({ hash: sha(token), userId, label: String(label).slice(0, 60), created: new Date().toISOString() });
    await this.save();
    return token;
  }

  async revoke(token) {
    const before = this.data.tokens.length;
    this.data.tokens = this.data.tokens.filter((t) => t.hash !== sha(String(token)));
    if (this.data.tokens.length !== before) await this.save();
  }

  authenticate(token) {
    if (!token) return null;
    const hash = sha(String(token));
    const entry = this.data.tokens.find((t) => t.hash === hash);
    const user = entry && this.data.users.find((u) => u.id === entry.userId);
    return user ? publicUser(user) : null;
  }

  get empty() {
    return this.data.users.length === 0;
  }
}
