import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ICONS, icon } from "../src/icons.js";
import { relativeTime } from "../src/views.js";

const aqui = (p) => fileURLToPath(new URL(p, import.meta.url));
const ler = (p) => readFileSync(aqui(p), "utf8");
const arquivos = [
  ...readdirSync(aqui("../src")).filter((f) => f.endsWith(".js")).map((f) => `../src/${f}`),
  ...readdirSync(aqui("../plugins")).filter((f) => f.endsWith(".js")).map((f) => `../plugins/${f}`),
  "../index.html",
];

const ehNome = (s) => /^[a-z]+(-[a-z]+)*$/.test(s);

// Coleta nomes de ícone citados no código, em todos os formatos usados no projeto.
function iconesUsados() {
  const usados = new Map();
  const marca = (nome, arquivo) => {
    if (!ehNome(nome)) return;
    if (!usados.has(nome)) usados.set(nome, new Set());
    usados.get(nome).add(arquivo);
  };
  for (const f of arquivos) {
    if (f.endsWith("icons.js")) continue; // a própria biblioteca cita nomes em comentários
    const src = ler(f);
    for (const m of src.matchAll(/\bicon\(([^)]*)\)/g)) {
      // só vale o que vem antes do tamanho numérico; depois dele o argumento é uma classe CSS
      const nomes = m[1].split(/,\s*\d/)[0];
      for (const s of nomes.matchAll(/"([^"]+)"/g)) marca(s[1], f);
    }
    for (const m of src.matchAll(/data-icon="([^"]+)"/g)) marca(m[1], f);
    for (const m of src.matchAll(/\bicon(?::| =) "([^"]+)"/g)) marca(m[1], f);
    for (const m of src.matchAll(/\baction\("([^"]+)"/g)) marca(m[1], f);
    for (const m of src.matchAll(/\["[a-z]+", "[^"]+", "([a-z-]+)"\]/g)) marca(m[1], f);
    for (const m of src.matchAll(/\[v, label, ic\]|icon: "([^"]+)"/g)) if (m[1]) marca(m[1], f);
  }
  return usados;
}

describe("biblioteca de ícones", () => {
  test("todo ícone citado no código existe", () => {
    const faltando = [];
    for (const [nome, onde] of iconesUsados()) {
      if (!(nome in ICONS)) faltando.push(`${nome} (${[...onde].join(", ")})`);
    }
    assert.deepEqual(faltando, []);
  });

  test("cada ícone vira um SVG de traço, com o mesmo peso", () => {
    for (const nome of Object.keys(ICONS)) {
      const svg = icon(nome, 20);
      assert.match(svg, /^<svg /, nome);
      assert.match(svg, /stroke-width="1.6"/, nome);
      assert.match(svg, /viewBox="0 0 24 24"/, nome);
      assert.ok(ICONS[nome].length > 0, nome);
    }
  });

  test("ícone desconhecido falha com mensagem clara", () => {
    assert.throws(() => icon("nao-existe"), /Ícone desconhecido/);
  });

  test("a interface não usa emoji nem glifos como ícone", () => {
    const proibidos = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u25A0-\u25FF]/u;
    for (const f of ["../index.html", "../src/app.js", "../src/views.js"]) {
      const texto = ler(f).split("\n").filter((l) => !l.includes("kbd")).join("\n");
      assert.equal(proibidos.test(texto), false, `glifo decorativo em ${f}`);
    }
  });
});

describe("tempo relativo", () => {
  const agora = Date.UTC(2026, 9, 21, 12, 0, 0);
  test("agora, minutos e dias", () => {
    assert.equal(relativeTime(agora - 10_000, agora), "agora");
    assert.match(relativeTime(agora - 5 * 60_000, agora), /5 minutos/);
    assert.match(relativeTime(agora - 3 * 86_400_000, agora), /3 dias/);
  });
});
