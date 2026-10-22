// Servidor MCP (Model Context Protocol) da biblioteca: JSON-RPC 2.0 com as ferramentas que um agente usa para ler,
// buscar e escrever notas. Sem dependências: implementa só o que o protocolo exige para servidor de ferramentas
// (initialize, ping, tools/list, tools/call). O transporte (stdio ou HTTP) fica por fora; veja server/api.js e bin/.
//
// Escrever exige permissão (`podeEscrever`). Não há ferramenta que apague: "arquivar" move para a pasta Arquivo,
// o que se desfaz renomeando de volta.

import { parseFrontmatter } from "../src/markdown.js";
import { extOf, normalizePath, stripExt, baseName } from "../src/vault.js";
import { applySchema, readAgentSchema, toAgentSchema, validateDiagram } from "../src/dbdiagram.js";
import { emptyCanvas, parseCanvas, serializeCanvas } from "../src/canvas.js";

export const PROTOCOL_VERSION = "2025-06-18";
const MAX_TEXT = 200_000; // limite do que uma ferramenta devolve de uma vez

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const num = (description) => ({ type: "integer", description, minimum: 1, maximum: 500 });
const obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

const TOOLS = [
  {
    name: "informacoes",
    description: "Nome da biblioteca e quantidade de arquivos e notas.",
    inputSchema: obj({}),
    run: (lib) => lib.summary(),
  },
  {
    name: "listar_notas",
    description: "Lista as notas (.md) com título, etiquetas e data de alteração. Pode filtrar por pasta.",
    inputSchema: obj({ pasta: str("Pasta (e subpastas) a listar. Vazio lista tudo."), limite: num("Máximo de itens (padrão 100).") }),
    run: (lib, { pasta = "", limite = 100 }) => {
      const dir = pasta ? `${normalizePath(pasta)}/` : "";
      const notes = lib.vault.markdownFiles().filter((f) => f.path.startsWith(dir)).slice(0, limite);
      return notes.map((f) => ({ caminho: f.path, titulo: stripExt(baseName(f.path)), etiquetas: [...lib.index.meta(f.path).tags], alterada: new Date(f.mtime).toISOString() }));
    },
  },
  {
    name: "ler_nota",
    description: "Lê um arquivo da biblioteca (nota, .base ou .canvas). Para notas, devolve também as propriedades do começo do arquivo.",
    inputSchema: obj({ caminho: str("Caminho relativo, por exemplo Projetos/Alfa.md.") }, ["caminho"]),
    run: (lib, { caminho }) => {
      const file = need(lib, caminho);
      const out = { caminho: file.path, conteudo: file.content.slice(0, MAX_TEXT), truncado: file.content.length > MAX_TEXT };
      if (extOf(file.path) === "md") out.propriedades = parseFrontmatter(file.content).data;
      return out;
    },
  },
  {
    name: "buscar",
    description: 'Busca no texto e nos nomes. Aceita vários termos (todos precisam aparecer), "frase exata", tag:assunto, path:pasta e -termo para excluir.',
    inputSchema: obj({ consulta: str("Texto da busca."), limite: num("Máximo de resultados (padrão 20).") }, ["consulta"]),
    run: (lib, { consulta, limite = 20 }) => lib.index.search(consulta).slice(0, limite).map((r) => ({ caminho: r.path, trecho: r.snippet })),
  },
  {
    name: "backlinks",
    description: "Notas que apontam para esta nota com [[links]].",
    inputSchema: obj({ caminho: str("Caminho da nota.") }, ["caminho"]),
    run: (lib, { caminho }) => lib.index.backlinks(need(lib, caminho).path).map((b) => ({ origem: b.source, linhas: b.lines })),
  },
  {
    name: "links_de_saida",
    description: "Links [[...]] que a nota contém e para onde cada um resolve (nulo quando a nota não existe).",
    inputSchema: obj({ caminho: str("Caminho da nota.") }, ["caminho"]),
    run: (lib, { caminho }) => lib.index.outgoing(need(lib, caminho).path).map((l) => ({ alvo: l.target, linha: l.line, resolvido: l.resolved })),
  },
  {
    name: "vizinhos",
    description: "Notas ligadas a esta, até uma certa distância no grafo de links (nos dois sentidos).",
    inputSchema: obj({ caminho: str("Caminho da nota."), profundidade: { type: "integer", minimum: 1, maximum: 4, description: "Saltos a seguir (padrão 1)." } }, ["caminho"]),
    run: (lib, { caminho, profundidade = 1 }) => {
      const start = need(lib, caminho).path;
      const { edges } = lib.index.graph();
      const near = new Map([[start, 0]]);
      let frontier = [start];
      for (let d = 1; d <= profundidade; d++) {
        const next = [];
        for (const e of edges) {
          for (const [a, b] of [[e.source, e.target], [e.target, e.source]]) {
            if (frontier.includes(a) && !near.has(b)) {
              near.set(b, d);
              next.push(b);
            }
          }
        }
        frontier = next;
      }
      return [...near].filter(([p]) => p !== start).map(([p, distancia]) => ({ caminho: p, distancia }));
    },
  },
  {
    name: "etiquetas",
    description: "Sem argumento, lista as etiquetas com a contagem de notas. Com `etiqueta`, lista as notas que a usam.",
    inputSchema: obj({ etiqueta: str("Etiqueta sem #.") }),
    run: (lib, { etiqueta }) => {
      const tags = lib.index.tags();
      if (etiqueta) return tags.get(String(etiqueta).replace(/^#/, "")) || [];
      return [...tags].map(([nome, notas]) => ({ etiqueta: nome, notas: notas.length }));
    },
  },
  {
    name: "tarefas",
    description: "Tarefas (- [ ] e - [x]) de toda a biblioteca, com nota de origem. Por padrão só as abertas.",
    inputSchema: obj({ incluir_concluidas: { type: "boolean", description: "Incluir as concluídas." }, limite: num("Máximo (padrão 100).") }),
    run: (lib, { incluir_concluidas = false, limite = 100 }) =>
      lib.index.tasks().filter((t) => incluir_concluidas || !t.done).slice(0, limite).map((t) => ({ caminho: t.path, linha: t.line, texto: t.text, concluida: !!t.done })),
  },
  {
    name: "links_quebrados",
    description: "Links [[...]] que não apontam para nenhuma nota, com a contagem de usos.",
    inputSchema: obj({}),
    run: (lib) => lib.index.unresolved(),
  },
  {
    name: "ler_diagrama",
    description: "Lê as tabelas e relações de um canvas no esquema `sophyra.diagram`, o mesmo usado para propor diagramas.",
    inputSchema: obj({ caminho: str("Caminho do arquivo .canvas.") }, ["caminho"]),
    run: (lib, { caminho }) => {
      const file = need(lib, caminho);
      if (extOf(file.path) !== "canvas") throw new Error("O arquivo precisa ser um .canvas.");
      const { data } = parseCanvas(file.content);
      return { esquema: toAgentSchema(data), problemas: validateDiagram(data) };
    },
  },
  {
    name: "escrever_nota",
    description: "Cria ou altera uma nota. `modo`: criar (falha se já existe), substituir (cria ou troca tudo) ou anexar (acrescenta ao fim).",
    inputSchema: obj(
      { caminho: str("Caminho relativo terminando em .md (ou .base, .canvas, .txt)."), conteudo: str("Texto completo, com propriedades no começo se quiser."), modo: str("criar, substituir ou anexar (padrão criar).", { enum: ["criar", "substituir", "anexar"] }) },
      ["caminho", "conteudo"],
    ),
    escreve: true,
    run: (lib, { caminho, conteudo, modo = "criar" }) => {
      const p = normalizePath(caminho);
      if (modo === "criar" && lib.vault.has(p)) throw new Error(`Já existe: ${p}. Use modo "substituir" ou "anexar".`);
      if (modo === "anexar" && lib.vault.has(p)) {
        const atual = lib.vault.read(p);
        lib.put(p, `${atual}${atual.endsWith("\n") || !atual ? "" : "\n"}${conteudo}`);
      } else {
        lib.put(p, conteudo);
      }
      return { caminho: p, ok: true };
    },
  },
  {
    name: "renomear_nota",
    description: "Renomeia ou move uma nota e atualiza os [[links]] que apontavam para ela.",
    inputSchema: obj({ de: str("Caminho atual."), para: str("Novo caminho.") }, ["de", "para"]),
    escreve: true,
    run: (lib, { de, para }) => {
      lib.vault.rename(need(lib, de).path, para);
      return { caminho: normalizePath(para), ok: true };
    },
  },
  {
    name: "arquivar_nota",
    description: "Move a nota para a pasta Arquivo (não apaga). Para desfazer, renomeie de volta.",
    inputSchema: obj({ caminho: str("Caminho da nota.") }, ["caminho"]),
    escreve: true,
    run: (lib, { caminho }) => {
      const file = need(lib, caminho);
      const destino = `Arquivo/${file.path}`;
      lib.vault.rename(file.path, destino);
      return { caminho: destino, ok: true };
    },
  },
  {
    name: "aplicar_diagrama",
    description: "Troca as tabelas e relações de um canvas (cria o canvas se não existir) por um esquema `sophyra.diagram` válido. Os outros cartões ficam.",
    inputSchema: obj({ caminho: str("Caminho do arquivo .canvas."), esquema: { type: "object", description: "Esquema no formato sophyra.diagram, versão 1." } }, ["caminho", "esquema"]),
    escreve: true,
    run: (lib, { caminho, esquema }) => {
      const p = normalizePath(caminho);
      if (extOf(p) !== "canvas") throw new Error("O arquivo precisa terminar em .canvas.");
      const lido = readAgentSchema(esquema);
      if (!lido.ok) throw new Error(`Esquema inválido: ${lido.errors.join(" ")}`);
      const atual = lib.vault.has(p) ? parseCanvas(lib.vault.read(p)).data : emptyCanvas();
      lib.put(p, serializeCanvas(applySchema(atual, lido.schema)));
      return { caminho: p, tabelas: lido.schema.tables.length, relacoes: lido.schema.relations.length, ok: true };
    },
  },
];

function need(lib, caminho) {
  if (typeof caminho !== "string" || !caminho.trim()) throw new Error('Informe o "caminho".');
  const file = lib.vault.get(caminho) || lib.vault.get(`${caminho}.md`);
  if (!file) {
    const link = lib.vault.resolveLink(caminho);
    if (link) return lib.vault.get(link);
    throw new Error(`Arquivo não existe: ${caminho}`);
  }
  return file;
}

export function toolList({ podeEscrever = true } = {}) {
  return TOOLS.filter((t) => podeEscrever || !t.escreve).map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

// Cria o tratador de mensagens. `getLibrary()` devolve a biblioteca atual a cada chamada (ela pode trocar).
export function createMcp({ getLibrary, podeEscrever = () => true, version = "0.1.0" }) {
  const reply = (id, result) => ({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

  async function call(name, args = {}) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw Object.assign(new Error(`Ferramenta desconhecida: ${name}`), { rpc: -32602 });
    try {
      if (tool.escreve && !podeEscrever()) throw new Error("Esta conexão é somente leitura.");
      const out = await tool.run(getLibrary(), args && typeof args === "object" ? args : {});
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], isError: false };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  }

  // Recebe uma mensagem JSON-RPC (ou lote) e devolve a resposta; notificações não têm resposta (nulo).
  async function handle(message) {
    if (Array.isArray(message)) {
      const out = (await Promise.all(message.map(handle))).filter(Boolean);
      return out.length ? out : null;
    }
    if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return fail(message?.id ?? null, -32600, "Requisição inválida.");
    const { id, method, params } = message;
    const isNotification = id === undefined;
    try {
      switch (method) {
        case "initialize":
          return reply(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "sophyra", version }, instructions: "Biblioteca de notas em Markdown. Leia com ler_nota e buscar; escreva com escrever_nota. Links entre notas usam [[Nome]]." });
        case "ping":
          return reply(id, {});
        case "tools/list":
          return reply(id, { tools: toolList({ podeEscrever: podeEscrever() }) });
        case "tools/call":
          return reply(id, await call(params?.name, params?.arguments));
        default:
          if (isNotification || method.startsWith("notifications/")) return null;
          return fail(id, -32601, `Método não suportado: ${method}`);
      }
    } catch (err) {
      return isNotification ? null : fail(id, err.rpc || -32603, err.message);
    }
  }

  return { handle };
}

