#!/usr/bin/env node
// Servidor MCP por stdio: aponte um agente (Claude Desktop, Claude Code etc.) para uma pasta de notas.
//   node bin/sophyra-mcp.mjs --pasta "C:/Notas" [--somente-leitura]
// Cada linha de entrada é uma mensagem JSON-RPC; cada resposta sai em uma linha. Logs vão para stderr.

import { createInterface } from "node:readline";
import { Library } from "../server/library.js";
import { createMcp } from "../server/mcp.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const pasta = value("--pasta") || process.env.SOPHYRA_PASTA;
if (!pasta || flag("--ajuda")) {
  console.error("Uso: node bin/sophyra-mcp.mjs --pasta <pasta> [--somente-leitura]");
  process.exit(pasta ? 0 : 1);
}

const library = new Library(pasta);
await library.load();
library.start();
library.watch();
const mcp = createMcp({ getLibrary: () => library, podeEscrever: () => !flag("--somente-leitura") });
console.error(`Sophyra MCP: ${library.name} (${library.vault.files.size} arquivos)${flag("--somente-leitura") ? ", somente leitura" : ""}`);

const rl = createInterface({ input: process.stdin });
const pending = new Set();
rl.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido." } })}\n`);
    return;
  }
  const job = mcp.handle(message).then((out) => out && process.stdout.write(`${JSON.stringify(out)}\n`));
  pending.add(job);
  job.finally(() => pending.delete(job));
});
rl.on("close", async () => {
  await Promise.all(pending);
  await library.flush();
  process.exit(0);
});
