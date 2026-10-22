# Arquitetura

Como o Sophyra é feito, onde cada coisa mora e o que ainda não cobre.

## Módulos

```
index.html        estrutura da página
styles.css        sistema de design (tokens, componentes, telas, responsivo)
src/
  app.js          estado, abas, nota, barra lateral, contexto, paleta, diálogos, pasta
  views.js        telas: início, tarefas, tags, grafo, atalhos, configurações
  icons.js        biblioteca de ícones SVG (traço único)
  markdown.js     parser: frontmatter, inline, blocos, metadados (sem DOM)
  vault.js        biblioteca em memória: arquivos, eventos, renomear com atualização de links
  index.js        índice derivado: backlinks, links, tags, tarefas, grafo, busca
  wikilinks.js    lógica dos [[links]]: sugestões, seções, menções sem link (sem DOM)
  graph.js        desenho e interação do grafo em canvas (arrastar, zoom, destaque)
  layout.js       física do grafo, sem DOM: forças, enquadramento e zoom
  plugins.js      host de plugins: manifesto, ciclo de vida e limpeza
  disk.js         pasta real (File System Access API) e sincronização
  storage.js      localStorage com falhas tratadas
  sample.js       biblioteca de exemplo
  snippets.js     snippets de CSS: armazenamento, validação e aplicação
  canvas.js       modelo do Canvas (JSON Canvas), geometria das setas e câmera, sem DOM
  canvasview.js   tela do Canvas: arrastar, zoom, ligar cartões, editar, desenhar, imagens
  canvasimage.js  reduz e embute imagens do Canvas (data URL)
  blocks.js, blockedit.js, blockinline.js, blockslash.js, blocksview.js  editor de blocos
  bases.js, basesview.js  bases: visões em tabela, lista, quadro, calendário, galeria e cronograma; modelos de base e wiki (wiki.js)
  math.js         fórmulas TeX → MathML
  mermaid.js      fluxogramas e diagramas de sequência em SVG
  external.js     arquivos externos: recusa de endereços de disco e importação
  hotkeys.js      atalhos globais trocáveis
  core.js         recursos internos que se podem desligar
  workspace.js    espaço de trabalho: correção e recuperação de dados estragados
  splitstate.js   estado do painel da direita (abas, aberto, modo), sem DOM
  splitview.js    tela do painel da direita
  highlight.js    destaque de sintaxe do Markdown para o editor
  editing.js      ajudas do editor: pares, listas com Enter, recuo
  commands.js     36 comandos de edição do Markdown
  layouts.js      espaços de trabalho salvos
  find.js         busca e troca dentro da nota
  trash.js        lixeira e versões anteriores das notas
  nav.js          histórico, abas fechadas e fixadas, nota diária vizinha
  frontmatter.js  apelidos e propriedades do frontmatter
plugins/          plugins locais e registry.json
tools/            gerar-icones.mjs (catálogo de ícones) e medir-escala.mjs (desempenho)
tests/            core, plugins, ui, wikilinks, graph, graphview, snippets, rich, canvas, settings e plugineditor, split, editor, commands, nav, daily, trash, mermaid2, mermaid3, layouts, cmdkeys, permissions, pluginimport find, notionblocks e iconlib (473 testes)
docs/design.md    decisões de design e como estender
```

Princípio: **o arquivo é a fonte de verdade**. Índice, grafo, backlinks e busca são derivados e recalculados do conteúdo.

## Desempenho

`node tools/medir-escala.mjs 1000 5000 20000` mede, sem a tela, o tempo de ler os metadados, o índice de links e tarefas, as linhas de uma base, filtro e ordem, e o agrupamento de tarefas. Com 20 mil notas, tudo fica abaixo de 0,4 s. A pintura da tela (tabelas e listas com muitas linhas) não entra na medição e é o limite real.

## Limitações conhecidas

- Sem pasta conectada, os dados ficam só no navegador (limite de alguns MB do `localStorage`).
- A pasta é lida inteira para a memória; pastas muito grandes ficam lentas.
- Se a mesma nota for alterada por fora e pelo app ao mesmo tempo, a última gravação vence.
- O editor é um `textarea` com camada de destaque, sem CodeMirror: sem dobra de trechos nem vários cursores. Há busca e troca na nota (Ctrl+F e Ctrl+H). Fórmulas (`$…$`, `$$…$$`) e Mermaid são um subconjunto desenhado
  localmente: não são MathJax nem Mermaid completos, e diagramas além de fluxograma, sequência, estados, classes, pizza, ER e gantt mostram um aviso.
- O Canvas cobre cartões de texto, nota, link e grupo, ligações por setas entre cartões, formas estilo Excalidraw (retângulo, elipse, losango, triângulo, post-it), imagens (embutidas no .canvas, reduzidas a cerca de 650 KB cada), linha, lápis suave e borracha, com cor, espessura, preenchimento e tracejado, além de desfazer/refazer. Links, [[notas]] e endereços funcionam também dentro das formas. As formas e imagens ficam como campos extras em cartões de texto (outros apps JSON Canvas os mostram como texto). Não tem seleção múltipla.
- Há no máximo duas folhas (principal e painel da direita, aberto com Alt+clique); sem arrastar abas entre elas.
- Plugins sem isolamento real (as permissões limitam a API, não o código); a importação é só de arquivo local, com confirmação.
- Arquivos fora da biblioteca não são abertos; para usá-los, importe uma cópia (arrastar para a janela ou "Importar arquivos…").
- Os testes automatizados cobrem o núcleo, os plugins e a biblioteca de ícones. A interface foi verificada à mão no
  navegador (telas, edição, tema, responsivo), sem testes de interface automatizados.
- O seletor de pasta do sistema não pôde ser automatizado; a sincronização foi testada com uma pasta do OPFS.

Exemplo de canvas: `exemplos/Arquitetura monolítica.canvas` (arraste o arquivo para a janela da biblioteca para importá-lo).
