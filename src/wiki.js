// Wiki: um conjunto de páginas de texto dentro de uma pasta. Diferente de uma base de dados (que organiza registros em
// tabelas e visões), a wiki é escrita como documento: a página "Início" tem o texto de apresentação, o sumário das
// seções e o índice automático de todas as páginas da pasta, com o status de cada uma. Funções puras, sem DOM.

import { makeView } from "./bases.js";

export const WIKI_STATUS = "rascunho verificado desatualizado".split(" ");
export const WIKI_HOME = "Início";

// Página inicial da wiki (um arquivo .md dentro da pasta da wiki).
export function wikiHomeText(name, today) {
  return [
    "---",
    "tipo: wiki",
    "status: rascunho",
    "responsavel:",
    `revisao: ${today}`,
    "---",
    `# ${name}`,
    "",
    "Escreva aqui o que é esta wiki e por onde começar.",
    "",
    "## Sumário",
    "<!-- toc -->",
    "",
    "## Páginas",
    "",
    "![[Páginas.base]]",
    "",
  ].join("\n");
}

// Página nova dentro da wiki: já vem com status, responsável e data de revisão.
export function wikiPageText(title, today) {
  return [
    "---",
    "tipo: wiki",
    "status: rascunho",
    "responsavel:",
    `revisao: ${today}`,
    "---",
    `# ${title}`,
    "",
    "",
  ].join("\n");
}

// Índice das páginas da wiki: uma tabela de documentos (não de registros), com status, responsável e revisão.
export function wikiIndexBase(folder) {
  return {
    source: { folder, tag: "" },
    props: {
      status: { type: "select", options: WIKI_STATUS },
      responsavel: { type: "pessoa" },
      revisao: { type: "date" },
    },
    views: [
      { ...makeView("table", "Páginas"), columns: ["file.name", "status", "responsavel", "revisao"], sort: [{ key: "file.name", dir: "asc" }] },
      { ...makeView("list", "Por status"), groupBy: "status" },
    ],
  };
}

// A pasta é uma wiki quando a página inicial tem `tipo: wiki` no cabeçalho.
export function isWikiHome(source = "") {
  return /^---\r?\n(?:.*\r?\n)*?tipo:\s*wiki\s*\r?\n/.test(source);
}
