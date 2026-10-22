// Servidor estático mínimo para rodar o Sophyra localmente, sem dependências. Uso: node tools/servir.mjs [porta]
// O app é só arquivos estáticos (HTML, CSS e módulos JavaScript), então qualquer servidor de arquivos serve; este existe
// para o projeto não exigir Python nem pacotes.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(fileURLToPath(new URL("..", import.meta.url)));
const porta = Number(process.argv[2]) || Number(process.env.PORT) || 8080;

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

const servidor = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let caminho = normalize(decodeURIComponent(url.pathname));
    if (caminho.endsWith(sep) || caminho === "/") caminho = join(caminho, "index.html");
    const arquivo = resolve(join(raiz, caminho));
    if (arquivo !== raiz && !arquivo.startsWith(raiz + sep)) {
      res.writeHead(403).end("Acesso negado");
      return;
    }
    if (!(await stat(arquivo)).isFile()) throw new Error("não é arquivo");
    res.writeHead(200, { "Content-Type": TIPOS[extname(arquivo).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(await readFile(arquivo));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Não encontrado");
  }
});

servidor.listen(porta, "127.0.0.1", () => console.log(`Sophyra em http://127.0.0.1:${porta}`));
