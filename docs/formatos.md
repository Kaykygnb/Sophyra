# Formatos de arquivo

O Sophyra guarda tudo em arquivos de texto simples. Este documento descreve cada formato, para você (ou um agente)
poder ler e escrever esses arquivos sem passar pelo app.

- [Notas `.md`](#notas-md)
- [Bases `.base`](#bases-base)
- [Canvas `.canvas`](#canvas-canvas)
- [Esquema do diagrama de tabelas](#esquema-do-diagrama-de-tabelas)

---

## Notas `.md`

Markdown comum, mais um bloco opcional de **propriedades** no começo (frontmatter).

```markdown
---
tags: [projeto, 2026]
status: fazendo
prazo: 2026-11-05
responsavel: "[[Maria]]"
---
# Título

Texto com [[Outra nota]], [[Nota|apelido]], [[Nota#Seção]] e #etiquetas.
```

**Propriedades.** `chave: valor`. Listas podem ser em linha (`[a, b]`) ou em bloco (`- a`). Números e `true`/`false`
são lidos como número e sim/não. Um link `[[Nota]]` num valor precisa de aspas.

**Extensões de Markdown** (todas voltam como estavam ao salvar):

| Recurso | Escrita |
|---|---|
| Link interno | `[[Nota]]`, `[[Nota\|apelido]]`, `[[Nota#Seção]]`, `[[Nota#^bloco]]` |
| Incorporar nota | `![[Nota]]`, `![[Nota#Seção]]` |
| Incorporar base | `![[Nome.base]]` em linha própria |
| Incorporar canvas | `![[Nome.canvas]]` em linha própria |
| Destaque (callout) | `> [!note] Título` e linhas seguintes com `>` (tipos: note, info, tip, success, question, warning, failure, danger, bug, example, quote) |
| Toggle | `<details>` e `<summary>`; título recolhível: `<summary>## Título</summary>` |
| Sumário | `<!-- toc -->` |
| Favorito | `<https://exemplo.com>` em linha própria |
| Colunas | `<!-- columns -->`, `<!-- column -->`, `<!-- /columns -->` |
| Vídeo e áudio | `<video src="https://…" controls></video>`, `<audio src="https://…" controls></audio>` |
| Arquivo | `<a class="file" href="https://…">Nome</a>` em linha própria |
| Botão | `<a class="button" href="https://… ou Nome da nota">Texto</a>` em linha própria |
| Data | `<time datetime="2026-12-25">25 de dez. de 2026</time>` |
| Cor do texto e do fundo | `<span style="color:#e03131;background:#ffd43b66">texto</span>` |
| Fórmula | `$x^2$` em linha, `$$ … $$` em bloco |
| Tarefa | `- [ ] algo` e `- [x] feito`; um prazo é uma data no texto (`@25/12`, `2026-12-25`) |

---

## Bases `.base`

JSON que descreve uma visão tipo banco de dados sobre as propriedades das notas. A base **não guarda dados**: cada
linha é uma nota, e editar uma célula grava na propriedade da nota.

```json
{
  "source": { "folder": "Projetos", "tag": "" },
  "props": {
    "status": { "type": "select", "options": ["ideia", "fazendo", "pronto"] },
    "prazo": { "type": "date" },
    "total": { "type": "formula", "expr": "valor * quantidade" }
  },
  "views": [
    {
      "id": "v1", "name": "Tabela", "type": "table",
      "columns": ["file.name", "status", "prazo"],
      "filters": [{ "key": "status", "op": "isnot", "value": "pronto" }],
      "sort": [{ "key": "prazo", "dir": "asc" }],
      "groupBy": "", "dateKey": "", "endKey": "",
      "totals": { "total": "soma" }
    }
  ]
}
```

| Campo | Valores |
|---|---|
| `source.folder` / `source.tag` | pasta (com subpastas) e/ou etiqueta que escolhem as notas |
| tipo de propriedade | `text`, `number`, `checkbox`, `date`, `select`, `list`, `pessoa`, `relacao`, `formula` |
| tipo de visão | `table`, `list`, `board`, `calendar`, `gallery`, `timeline` |
| operadores de filtro | `is`, `isnot`, `contains`, `notcontains`, `empty`, `notempty`, `gt`, `lt`, `gte`, `lte` |
| totais | `soma`, `media`, `contagem` |
| chaves do arquivo | `file.name`, `file.folder`, `file.path`, `file.mtime`, `file.backlinks`, `tags` |

- **Quadro** agrupa por `groupBy` (uma seleção). **Calendário** e **cronograma** usam `dateKey` (início) e `endKey` (fim).
- **Datas** aceitam `AAAA-MM-DD` e `DD/MM/AAAA`; a nota não é reescrita.
- **Relação** guarda links internos: `"[[Nota]]"` ou uma lista deles.
- **Fórmula**: `+ - * /`, parênteses, nomes de propriedade (entre aspas se tiverem espaço) e `soma(…)`, `media(…)`,
  `arred(x, casas)`. Operando vazio ou divisão por zero deixa a célula vazia. Nada é executado como código.

---

## Canvas `.canvas`

JSON no formato do JSON Canvas (nós e arestas), com extensões. Quem só conhece o formato básico vê cartões de texto e
ignora os campos extras.

```json
{
  "nodes": [
    { "id": "a1", "type": "text", "x": 0, "y": 0, "width": 260, "height": 120, "text": "Olá" },
    { "id": "a2", "type": "file", "x": 300, "y": 0, "width": 320, "height": 240, "file": "Projetos/Alfa.md" },
    { "id": "a3", "type": "link", "x": 0, "y": 200, "width": 320, "height": 160, "url": "https://exemplo.com" },
    { "id": "a4", "type": "group", "x": -40, "y": -40, "width": 700, "height": 420, "label": "Grupo" },
    { "id": "t1", "type": "table", "x": 0, "y": 400, "width": 260, "height": 140, "name": "Clientes",
      "fields": [{ "name": "id", "type": "inteiro", "pk": true, "nn": true }] }
  ],
  "edges": [
    { "id": "e1", "fromNode": "a1", "toNode": "a2", "fromSide": "right", "toSide": "left", "label": "texto" }
  ]
}
```

- **`type`**: `text`, `file` (nota ou outro `.canvas`), `link`, `group` e `table`.
- **Formas** são nós `text` com `shape` (`rect`, `ellipse`, `diamond`, `triangle`, `sticky`, `line`, `arrow`, `draw`,
  `image`) e campos de estilo (`fill`, `dashed`, `stroke`, `points`, `image`).
- **Tabelas**: `name` e `fields` (`name`, `type`, `pk`, `nn`). Uma **relação** é uma aresta entre duas tabelas com
  `fromField`, `toField` e `cardinality` (`1:1`, `1:N`, `N:N`); a origem é o lado "1". Arestas com `"auto": "link"` são
  do grafo de notas e se atualizam sozinhas.
- Posição e tamanho em pixels do quadro. `fromSide`/`toSide`: `top`, `right`, `bottom`, `left`.

---

## Esquema do diagrama de tabelas

Formato de troca para ler e propor diagramas, usado por agentes. Veja também [agentes.md](agentes.md).

```json
{
  "format": "sophyra.diagram",
  "version": 1,
  "tables": [
    {
      "name": "Clientes",
      "fields": [
        { "name": "id", "type": "inteiro", "primaryKey": true, "required": true },
        { "name": "nome", "type": "texto", "primaryKey": false, "required": true }
      ]
    },
    {
      "name": "Pedidos",
      "fields": [
        { "name": "id", "type": "inteiro", "primaryKey": true, "required": true },
        { "name": "cliente_id", "type": "inteiro", "primaryKey": false, "required": true }
      ]
    }
  ],
  "relations": [
    { "from": { "table": "Clientes", "field": "id" }, "to": { "table": "Pedidos", "field": "cliente_id" }, "cardinality": "1:N" }
  ]
}
```

- **`type`** do campo: `texto`, `inteiro`, `decimal`, `data`, `logico`, `longo`.
- **`cardinality`**: `1:1`, `1:N`, `N:N`. O lado `from` é o "1".
- O app **valida** na importação: formato, versão, nomes de tabela e campo, tipos, cardinalidade e se os campos das
  relações existem. Qualquer problema recusa o arquivo inteiro, com a mensagem do primeiro erro.
