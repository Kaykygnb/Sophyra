// Gera src/iconcatalog.js a partir do pacote lucide-static (licença ISC). Uso:
//   node tools/gerar-icones.mjs <pasta do pacote lucide-static/package>
// O arquivo gerado é versionado; este script só roda quando o conjunto de ícones muda.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] || "");
const nodes = JSON.parse(readFileSync(join(dir, "icon-nodes.json"), "utf8"));
const tags = JSON.parse(readFileSync(join(dir, "tags.json"), "utf8"));
const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;

const attrOk = (k) => /^[a-zA-Z][a-zA-Z0-9:-]*$/.test(k);
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// Só formas simples: nada de <script>, <use>, <image> ou <foreignObject>.
const SHAPES = new Set(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"]);

const markup = {};
const keywords = {};
for (const [name, list] of Object.entries(nodes)) {
  const parts = [];
  for (const [tag, attrs] of list) {
    if (!SHAPES.has(tag)) throw new Error(`${name}: forma não permitida (${tag})`);
    const pairs = Object.entries(attrs).filter(([k]) => k !== "key" && attrOk(k)).map(([k, v]) => `${k}="${esc(v)}"`);
    parts.push(`<${tag} ${pairs.join(" ")}/>`);
  }
  markup[name] = parts.join("");
  keywords[name] = (tags[name] || []).join(" ");
}

const names = Object.keys(markup).sort();
const body = names.map((n) => `  ${JSON.stringify(n)}: [${JSON.stringify(markup[n])}, ${JSON.stringify(keywords[n])}],`).join("\n");

const out = `// Catálogo de ícones do Lucide ${version} (https://lucide.dev), licença ISC: © Lucide Contributors e, para partes
// herdadas do Feather, © Cole Bemis (MIT). Arquivo gerado por tools/gerar-icones.mjs; não editar à mão.
//
// Cada ícone: [marcação interna do SVG, palavras-chave para a busca]. A grade é 24×24 e o traço vem do \`icon()\`.

export const CATALOG_VERSION = ${JSON.stringify(version)};

export const CATALOG = {
${body}
};
`;

const target = resolve("src/iconcatalog.js");
writeFileSync(target, out, "utf8");
console.log(`${names.length} ícones gravados em ${target}`);
