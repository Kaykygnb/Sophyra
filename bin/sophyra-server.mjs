#!/usr/bin/env node
// Serve uma pasta de notas na rede, com contas. Use em um servidor para outras pessoas se conectarem.
//   node bin/sophyra-server.mjs --pasta /dados/notas --dono Maria            (pede a senha na primeira vez)
//   node bin/sophyra-server.mjs --pasta /dados/notas --porta 8787 --host 0.0.0.0
// As contas ficam em <pasta>/../.sophyra-contas.json (ou no caminho de --contas). Senha: variável SOPHYRA_SENHA ou prompt.

import { createInterface } from "node:readline/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Host } from "../server/host.js";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const pasta = value("--pasta", process.env.SOPHYRA_PASTA);
if (!pasta || args.includes("--ajuda")) {
  console.error("Uso: node bin/sophyra-server.mjs --pasta <pasta> [--porta 8787] [--host 0.0.0.0] [--dono <nome>] [--contas <arquivo>]");
  process.exit(pasta ? 0 : 1);
}

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contas = resolve(value("--contas", resolve(pasta, "..", ".sophyra-contas.json")));
const host = new Host({ staticRoot: raiz, accountsFile: contas, version: "0.1.0-beta.1" });
await host.accounts.load();

if (host.accounts.empty) {
  const nome = value("--dono");
  if (!nome) {
    console.error("Ainda não há contas. Rode de novo com --dono <nome> para criar a conta de dono.");
    process.exit(1);
  }
  let senha = process.env.SOPHYRA_SENHA;
  if (!senha) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    senha = await rl.question(`Senha para ${nome} (mín. 8 caracteres): `);
    rl.close();
  }
  await host.accounts.createUser(nome, senha, "dono");
  console.error(`Conta de dono criada: ${nome}`);
}

await host.open(pasta);
const porta = Number(value("--porta", 8787));
const info = await host.startNetwork({ host: value("--host", "0.0.0.0"), port: porta });
console.log(`Sophyra servindo “${host.library.name}” na porta ${info.port}`);
for (const url of host.status().network.addresses) console.log(`  ${url}`);
console.log("Entre pelo navegador com uma conta, ou use /api/mcp com o token para agentes.");
console.log("Sem HTTPS: use só em rede confiável ou atrás de um proxy com TLS.");

process.on("SIGINT", async () => {
  await host.close();
  process.exit(0);
});
