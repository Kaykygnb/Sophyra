// Menu "/" e atalhos de Markdown do editor de blocos: o catálogo do que se pode inserir e a leitura do que a pessoa digitou
// (`## ` vira título, `- ` vira lista…). Tudo puro, sem DOM.

import { serializeTable, emptyTable } from "./tables.js";

export const SLASH_ITEMS = [
  { id: "paragraph", name: "Texto", hint: "Parágrafo comum", icon: "type", keys: "texto paragrafo normal", make: { type: "paragraph" } },
  { id: "h1", name: "Título 1", hint: "Título grande", icon: "heading", keys: "titulo heading h1 grande", make: { type: "heading", props: { level: 1 } } },
  { id: "h2", name: "Título 2", hint: "Título médio", icon: "heading", keys: "titulo heading h2 medio", make: { type: "heading", props: { level: 2 } } },
  { id: "h3", name: "Título 3", hint: "Título pequeno", icon: "heading", keys: "titulo heading h3 pequeno", make: { type: "heading", props: { level: 3 } } },
  { id: "bullet", name: "Lista com marcadores", hint: "Itens soltos", icon: "list", keys: "lista bullet marcadores topicos", make: { type: "bullet" } },
  { id: "number", name: "Lista numerada", hint: "Itens em ordem", icon: "list", keys: "lista numerada numero ordem", make: { type: "number" } },
  { id: "todo", name: "Lista de tarefas", hint: "Com caixas de marcar", icon: "check-square", keys: "tarefa todo checkbox fazer", make: { type: "todo" } },
  { id: "toggle", name: "Toggle", hint: "Recolhe e abre o conteúdo", icon: "chevron-right", keys: "toggle recolher sanfona detalhes", make: { type: "toggle" } },
  { id: "th1", name: "Título 1 recolhível", hint: "Título que abre e fecha", icon: "heading", keys: "titulo toggle recolhivel recolher h1", make: { type: "toggle", props: { level: 1 } } },
  { id: "th2", name: "Título 2 recolhível", hint: "Título médio que abre e fecha", icon: "heading", keys: "titulo toggle recolhivel recolher h2", make: { type: "toggle", props: { level: 2 } } },
  { id: "th3", name: "Título 3 recolhível", hint: "Título pequeno que abre e fecha", icon: "heading", keys: "titulo toggle recolhivel recolher h3", make: { type: "toggle", props: { level: 3 } } },
  { id: "quote", name: "Citação", hint: "Destaque de uma frase", icon: "quote", keys: "citacao quote", make: { type: "quote" } },
  { id: "callout", name: "Callout", hint: "Caixa de destaque", icon: "info", keys: "callout aviso destaque caixa nota", make: { type: "callout", props: { kind: "note" } } },
  { id: "tip", name: "Callout: dica", hint: "Caixa verde", icon: "check-circle", keys: "callout dica tip", make: { type: "callout", props: { kind: "tip" } } },
  { id: "warning", name: "Callout: aviso", hint: "Caixa de atenção", icon: "alert", keys: "callout aviso warning atencao", make: { type: "callout", props: { kind: "warning" } } },
  { id: "info", name: "Callout: informação", hint: "Caixa azul", icon: "info", keys: "callout informacao info azul", make: { type: "callout", props: { kind: "info" } } },
  { id: "success", name: "Callout: sucesso", hint: "Caixa verde de confirmação", icon: "check-circle", keys: "callout sucesso success pronto verde", make: { type: "callout", props: { kind: "success" } } },
  { id: "danger", name: "Callout: perigo", hint: "Caixa vermelha", icon: "x-circle", keys: "callout perigo danger erro vermelho", make: { type: "callout", props: { kind: "danger" } } },
  { id: "pullquote", name: "Citação grande", hint: "Frase em destaque, sem caixa", icon: "quote", keys: "citacao grande destaque pull quote frase", make: { type: "callout", props: { kind: "quote" } } },
  { id: "cols2", name: "2 colunas", hint: "Blocos lado a lado", icon: "columns", keys: "colunas duas 2 lado", action: "columns", count: 2 },
  { id: "cols3", name: "3 colunas", hint: "Três blocos lado a lado", icon: "columns", keys: "colunas tres 3 lado", action: "columns", count: 3 },
  { id: "cols4", name: "4 colunas", hint: "Quatro blocos lado a lado", icon: "columns", keys: "colunas quatro 4 lado", action: "columns", count: 4 },
  { id: "video", name: "Vídeo", hint: "Player a partir de um endereço", icon: "play", keys: "video filme mp4 youtube player", action: "media", kind: "video" },
  { id: "audio", name: "Áudio", hint: "Player de som a partir de um endereço", icon: "music", keys: "audio som musica mp3 player", action: "media", kind: "audio" },
  { id: "file", name: "Arquivo", hint: "Cartão que abre um arquivo ou endereço", icon: "paperclip", keys: "arquivo anexo file pdf documento", action: "media", kind: "file" },
  { id: "button", name: "Botão", hint: "Abre um endereço ou uma nota", icon: "mouse-pointer", keys: "botao button link acao", action: "button" },
  { id: "mention", name: "Menção", hint: "Digite @ para nota ou data", icon: "at-sign", keys: "mencao arroba data nota lembrete", action: "mention" },
  { id: "code", name: "Código", hint: "Bloco de código", icon: "code", keys: "codigo code programacao", make: { type: "code" } },
  { id: "math", name: "Fórmula", hint: "Equação em TeX", icon: "hash", keys: "formula equacao math tex latex", make: { type: "math" } },
  { id: "divider", name: "Divisor", hint: "Linha horizontal", icon: "minus", keys: "divisor linha separador hr", make: { type: "divider" } },
  { id: "table", name: "Tabela", hint: "Tabela simples", icon: "columns", keys: "tabela table grade", make: { type: "table", text: serializeTable(emptyTable(3, 2)) } },
  { id: "image", name: "Imagem", hint: "Do computador ou por endereço", icon: "file", keys: "imagem foto image figura", action: "image" },
  { id: "bookmark", name: "Favorito (link)", hint: "Cartão com um endereço da web", icon: "external-link", keys: "favorito bookmark link site url cartao", action: "bookmark" },
  { id: "database", name: "Base de dados", hint: "Tabela, quadro, lista ou calendário na nota", icon: "database", keys: "base banco dados tabela quadro calendario database", action: "database" },
  { id: "canvasembed", name: "Canvas", hint: "Um canvas dentro da nota", icon: "layers", keys: "canvas quadro desenho mapa diagrama", action: "canvas" },
  { id: "toc", name: "Índice", hint: "Lista dos títulos da nota", icon: "outline", keys: "indice sumario toc titulos", make: { type: "toc" } },
  { id: "link", name: "Link para nota", hint: "Digite [[ para buscar uma nota", icon: "link", keys: "link nota wikilink referencia", action: "wikilink" },
  { id: "date", name: "Data de hoje", hint: "Insere a data", icon: "calendar", keys: "data hoje dia", action: "date" },
];

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Itens que combinam com o que foi digitado depois da barra; os que começam pelo texto vêm antes.
export function filterSlash(query, items = SLASH_ITEMS) {
  const q = fold(query).trim();
  if (!q) return [...items];
  const scored = [];
  for (const it of items) {
    const name = fold(it.name);
    const keys = fold(it.keys);
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/[\s:]+/).some((w) => w.startsWith(q))) score = 1;
    else if (keys.split(" ").some((w) => w.startsWith(q))) score = 2;
    else if (name.includes(q) || keys.includes(q)) score = 3;
    if (score >= 0) scored.push([score, it]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

// Acha o `/consulta` logo antes do cursor: só vale no começo do bloco ou depois de um espaço.
export function slashAt(textBeforeCaret) {
  const m = /(^|\s)\/([^\s/]{0,20})$/.exec(textBeforeCaret);
  return m ? { query: m[2], length: m[2].length + 1 } : null;
}

// Atalhos de Markdown ao digitar um espaço: o texto antes do cursor é só o prefixo (`##`, `-`, `1.`, `[]`, `>`).
export function shortcutFor(prefix) {
  let m;
  if ((m = /^(#{1,3})$/.exec(prefix))) return { type: "heading", props: { level: m[1].length } };
  if (/^[-*+]$/.test(prefix)) return { type: "bullet" };
  if (/^\d+[.)]$/.test(prefix)) return { type: "number" };
  if (/^\[\s?\]$/.test(prefix)) return { type: "todo", props: { checked: false } };
  if (/^\[[xX]\]$/.test(prefix)) return { type: "todo", props: { checked: true } };
  if (prefix === ">") return { type: "quote" };
  if (prefix === "|>") return { type: "toggle" };
  return null;
}

// Atalhos que valem ao apertar Enter: `---`, ``` e `$$` sozinhos na linha.
export function enterShortcutFor(text) {
  const t = text.trim();
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) return { type: "divider" };
  let m;
  if ((m = /^```([\w+#-]*)$/.exec(t))) return { type: "code", props: { lang: m[1] } };
  if (t === "$$") return { type: "math" };
  return null;
}
