# Guia de recursos

Tudo o que o Sophyra faz, tela por tela. Para instalar e rodar, veja o [README](../README.md).

## Como a interface se organiza

```
┌ ribbon ┬ barra lateral ┬ abas + área principal ───────────┬ contexto ┐
│ ícones │ arquivos      │ nota (editar, ler, dividido)      │ props    │
│ de     │ ou busca      │ ou uma tela: início, grafo,       │ backlinks│
│ acesso │               │ tarefas, tags, configurações…     │ links    │
└────────┴───────────────┴───────────────────────────────────┴──────────┘
                         barra de status
```

- **Ribbon** (coluna de ícones): Arquivos, Buscar, Início, Grafo, Tarefas (com contador), Tags, telas de plugins,
  e embaixo Comandos, Atalhos, Tema e Configurações.
- **Barra lateral**: árvore de arquivos com pastas recolhíveis, ou busca com os filtros `tag:`, `path:` e `-termo`.
- **Abas**: notas e telas abrem em abas; botão do meio ou o `x` fecha.
- **Contexto da nota** (direita), em três seções recolhíveis (Propriedades, Links e Estrutura), com "Recolher tudo" e "Expandir" no alto: propriedades do frontmatter, backlinks, links de saída (os que ainda não existem
  podem ser criados com um clique), estrutura, grafo local e os painéis dos plugins.
- Em telas médias o contexto vira uma gaveta; em telas pequenas a barra lateral também.

## Telas

| Tela | O que faz |
|---|---|
| **Início** | Resumo da biblioteca, notas recentes e atalhos para as ações mais comuns. |
| **Nota** | Editar, ler ou dividido. Barra de formatação (negrito, itálico, título, lista, tarefa, citação, código, link, tag). |
| **Grafo** | Grafo em tela cheia. Arraste uma nota para movê-la, arraste o fundo para mover a vista, role para aproximar, passe o mouse para destacar as vizinhas e clique para abrir. **Centralizar** (ou duplo clique) enquadra tudo; há filtro por nome, opção de ocultar notas sem links e de mostrar todos os nomes. |
| **Tarefas** | Todas as tarefas da biblioteca, por nota, com filtro (abertas, concluídas, todas) e busca. Marcar atualiza a nota. |
| **Tags** | Lista de tags com contagem, as notas de cada tag e os links que ainda não têm nota. |
| **Configurações** | Aparência, editor, biblioteca e pasta, plugins e sobre. As mudanças valem na hora. |
| **Atalhos** | Tabela de atalhos de teclado, com busca. |

## Markdown

- Títulos, listas, tarefas (marcar no modo leitura altera o arquivo), citações, código, tabelas com alinhamento.
- Ênfase: **negrito**, *itálico*, ~~tachado~~ e ==destaque==.
- Callouts (`> [!tip] Título`) com ícone por tipo.
- Frontmatter YAML simples (`tags`, `aliases`, chaves escalares e listas).
- `[[wikilink]]`, `[[nota|apelido]]`, `[[nota#Seção]]` e embeds `![[nota]]` e `![[nota#Seção]]`.
- Tags `#tag` clicáveis, que filtram a busca.

## Links `[[ ]]`

- **Sugestões ao digitar.** Escreva `[[` e aparece uma lista de notas (e dos apelidos delas). Use as setas e
  `Enter` ou `Tab` para aceitar, `Esc` para fechar. As melhores sugestões vêm primeiro; sem texto, as notas mais
  recentes. Se duas notas têm o mesmo nome, o link usa o caminho para distinguir.
- **Fechamento automático.** O segundo `[` já fecha com `]]` e deixa o cursor no meio.
- **Seções.** `[[Nota#` sugere os títulos da nota. Clicar em `[[Nota#Seção]]` abre a nota e rola até o título;
  se a seção não existir, o link fica marcado e o app avisa. `[[#Seção]]` aponta para a própria nota.
  O formato `[[Nota#^bloco]]` leva até a linha marcada com `^bloco`.
- **Apelidos.** `aliases: [Apelido, Outro]` no frontmatter faz `[[Apelido]]` abrir a nota. O nome real vence o apelido.
- **Prévia.** Pare o mouse sobre um link na leitura para ver o começo da nota ou da seção. Clique na prévia para abrir.
- **Menções sem link.** No contexto da nota, o painel **Menções sem link** lista as notas que citam o nome (ou um
  apelido) sem ter o link. **Vincular** troca a primeira menção por `[[link]]`, mantendo o texto original como apelido
  quando ele é diferente. Código, links existentes, frontmatter e partes de palavras não contam.
- **Outro nome no link.** `[[Nota|nome que aparece]]` mostra o texto que você escolher, e funciona junto com a seção:
  `[[Nota#Seção|ver a seção]]`. `![[Nota#Seção]]` traz só aquela seção para dentro da nota.
- **Links comuns.** `[texto](Nota.md#Seção)` também abre a nota (e conta nos backlinks e no grafo). Endereços
  `https://…` abrem em outra aba, e imagens ou PDFs não são tratados como notas.
- **Renomear** uma nota reescreve os links que apontavam para ela, com seção e apelido.

## Atalhos principais

`Ctrl+P` comandos · `Ctrl+O` abrir nota · `Ctrl+Shift+F` buscar · `Ctrl+N` nova nota · 
`Ctrl+W` fechar aba · `Ctrl+,` configurações · `Ctrl+B` e `Ctrl+I` no editor · `Esc` fecha a paleta e os painéis.
A tela **Atalhos** mostra a lista completa.

## Botão direito

Menu de contexto próprio (\`contextmenu.js\`: ícones, atalhos, submenu, setas e Esc), em vários lugares. Campos de texto simples
mantêm o menu do navegador.

- **Árvore de arquivos, abas e resultados da busca:** abrir, abrir ao lado, renomear, duplicar, favoritar, nova nota, copiar caminho,
  excluir; em pastas, nova nota, canvas, base e pasta; nas abas, fechar, fechar as outras ou as da direita, fixar.
- **Editor de blocos:** ações do bloco (duplicar, excluir, mover, virar outro tipo), formatação do texto selecionado, copiar, recortar
  e colar, abrir ou copiar um link, e as ações da tabela quando o clique é numa célula.
- **Canvas:** no cartão (editar, cor, duplicar, ordem, excluir), na seta (rótulo, cor, excluir) e no fundo (novo cartão, nota, link,
  grupo, forma, imagem, enquadrar).
- **Bases:** numa nota (o mesmo menu da árvore) e numa aba de visão.

## Bases (banco de dados sobre as notas)

Arquivo `.base` (JSON) que mostra as notas de uma pasta e/ou etiqueta como banco de dados. As propriedades são o frontmatter das notas; nada é copiado: **editar uma célula grava na nota**.

- **Visões** (abas): tabela, lista, quadro, calendário, **galeria** (cartões com a capa: propriedade `capa` ou `cover`, com endereço de imagem) e **cronograma** (uma barra por nota, do início à data de fim), cada uma com seus filtros, ordem, agrupamento e colunas. Nova visão no `+`;
  o botão ao lado renomeia, troca o tipo, duplica e exclui.
- **Fonte:** pasta e/ou etiqueta (`#tag`). **Filtros:** é, não é, contém, não contém, vazio, não vazio, maior/menor. **Ordenar:** várias chaves.
- **Tipos** inferidos dos valores (texto, número, caixa de marcar, data, seleção, lista) e trocáveis em **Propriedades**.
- **Tabela:** clique no cabeçalho para ordenar e numa célula para editar (seleção sugere os valores já usados). **Quadro:** colunas por
  uma propriedade; arraste um cartão para mudar o valor. **Calendário:** mês por uma propriedade de data; arraste uma nota para outro
  dia. `+` em uma coluna ou dia cria a nota já com aquele valor.
- **Nova base:** paleta de comandos, "Nova base". A biblioteca de exemplo traz `Projetos/Projetos.base`.
- **Datas:** `AAAA-MM-DD` e `DD/MM/AAAA` (ou `DD/MM/AA`) valem como data no calendário, no cronograma e na ordenação. A nota não é reescrita.
- **Totais:** no menu da visão, escolha soma, média ou contagem por coluna. O rodapé da tabela mostra o total das linhas visíveis.
- **Pessoa:** tipo de texto com sugestões das pessoas já usadas na coluna.
- **Relação:** tipo que guarda links internos (`"[[Nota]]"` ou uma lista). Mostra chips clicáveis. Escreva `Alfa, [[Beta]]` na célula.
- **Ligações de entrada:** coluna automática com quantas notas apontam para cada nota (`[[...]]` em toda a biblioteca). Com uma base de tarefas que aponta para projetos, a base de projetos mostra quantas tarefas cada um recebe.
- **Fórmulas:** tipo com expressão, como `preco * quantidade`. Aceita `+ - * /`, parênteses, nomes de propriedade (entre aspas se tiverem espaço) e as funções `soma(…)`, `media(…)` e `arred(x, casas)`. Não executa código. Vazio ou divisão por zero dá célula vazia.
- Módulos: `bases.js` (modelo, filtros, grade do calendário, cronograma, modelos de base, escrita), `basesview.js` (tela) e `frontmatter.js` (definir e remover propriedades).

Limites: sem fórmulas, relações nem rollups; listas agrupam pelo primeiro item; propriedades do arquivo (nome, pasta, data) são só de leitura;
renomear a nota é pelo menu da nota, não pela célula.

## Canvas: diagrama de tabelas, grafo, links e agentes

- **Link entre canvas:** no canvas, a ferramenta **Nota da biblioteca** aceita também outros canvas. O cartão mostra o canvas e o botão **Abrir canvas**.
- **Tabela:** ferramenta **Tabela** (ou **Nova tabela** no menu do fundo). Clique duplo na tabela abre o editor: nome, campos (nome, tipo, chave, obrigatório) e relações (um campo desta tabela liga-se a um campo de outra, com cardinalidade 1:1, 1:N ou N:N). Não é preciso digitar código.
- **Exportar:** no menu do fundo, em **Diagrama**: **DBML** (dbdiagram.io), **SQL** (CREATE TABLE e chaves estrangeiras) e **Copiar esquema para agentes** (JSON com `format: "sophyra.diagram"` e `version: 1`).
- **Importar esquema de agente:** o agente gera o JSON no formato acima. Você importa pelo menu, o app valida (formato, versão, tipos, relações) e pede confirmação antes de trocar as tabelas do canvas. Os outros cartões ficam.
- **Grafo no canvas:** no menu do fundo, **Montar grafo desta pasta** põe um cartão para cada nota da pasta (até 200) e liga as notas que se citam por `[[link]]`. O rótulo da seta é o apelido do link (`[[Nota|apelido]]`). Os cartões contornam os que já estão no canvas. **Organizar notas por links** reposiciona as notas que já estão no canvas. Depois de montado, as setas acompanham os links: ao criar, editar ou apagar notas, as setas do grafo são atualizadas sozinhas, sem mexer nas posições nem nas setas feitas à mão. Pastas com mais de 200 notas: monte o grafo de uma subpasta.
- O núcleo fica em `src/dbdiagram.js` (sem DOM) e o editor em `src/tableeditor.js`.

## Wiki e base de dados

São coisas diferentes, e o app trata cada uma de um jeito:

- **Base de dados** organiza **registros** em tabela, quadro, lista, calendário, galeria ou cronograma. É para dados: gastos, leituras, contatos, projetos. Ao criar (**Nova base aqui**), você escolhe um modelo pronto: **Leituras**, **Contatos**, **Despesas**, **Projetos** ou **Em branco**. Cada modelo já traz colunas com tipo, opções e visões. O modelo Despesas soma os valores no rodapé.
- **Wiki** é um conjunto de **páginas de texto** numa pasta. A página **Início** tem o texto de apresentação, um sumário das seções e o índice automático das páginas, com status, responsável e data de revisão. Use **Nova wiki aqui** para criar, e **Nova página da wiki** dentro dela para acrescentar páginas (já nascem como rascunho).

## Tarefas

A tela **Tarefas** organiza as tarefas por prazo: atrasadas, hoje, próximos 7 dias, depois e sem prazo. O prazo é a primeira data escrita no texto da tarefa (`@25/12`, `2026-12-25` ou `25/12/2026`). Há cartões de resumo no topo, busca, e as concluídas ficam recolhidas no fim. Marcar uma tarefa grava na nota de origem.

## Coleções e bases

- **Na árvore**, clicar no nome de uma pasta abre a carta da coleção; a setinha só recolhe e expande.
- **Cada pasta da raiz é uma coleção.** O início mostra um cartão por coleção, com capa, ícone e a contagem de notas e bases.
  Clicar abre uma carta com a capa, as bases, as notas recentes e as ações (abrir coleção, nova nota, tarefas).
- **Dentro de uma coleção**, a página mostra as subcoleções, as **bases** (arquivos `.base` dentro dela, com quantas
  linhas cada uma tem), as notas diretas e as tarefas abertas.
- **Base = tabela de registros:** uma base é um conjunto de notas definido por pasta e/ou etiqueta. Abrindo a base, você vê as
  visões (tabela, galeria, cronograma etc.).

## Mover e organizar a árvore

- **Arrastar e soltar:** arraste uma nota, base, canvas ou pasta para outra pasta (ou para a área vazia, que é a raiz). Soltar
  sobre um arquivo põe o item na pasta dele. Pasta não entra nela mesma nem em uma subpasta; colisão de nome é recusada.
- **Vários itens:** Ctrl/Cmd+clique marca ou desmarca; Shift+clique marca um intervalo. Arrastar um item marcado leva todos.
- **Renomear e excluir pasta:** no menu da pasta. Renomear leva as notas, subpastas, ícone e capa junto. Excluir manda tudo
  para a lixeira, com confirmação.
- A mudança de caminho não reescreve `[[links]]` (mover não altera o nome das notas, então os links continuam válidos).

## Coleções, tarefas e canvas na nota

- **Coleções:** as pastas da biblioteca. Cada uma tem ícone e capa (menu da pasta › **Capa da coleção…**, endereço `https://`). A
  página da coleção (**Abrir coleção**) mostra a capa, as subcoleções, as notas diretas e as tarefas abertas, com botões para
  nova nota e tarefas. As capas e os ícones acompanham renomeações.
- **Tarefas:** a tela Tarefas é uma tabela (concluída, tarefa, nota, coleção). **Tarefas desta coleção** (no menu da pasta
  ou na página da coleção) mostra só as tarefas dessa coleção e das subcoleções. Marcar uma tarefa grava na nota de origem.
- **Canvas na nota:** `/canvas` escolhe um canvas existente da biblioteca e o mostra dentro da nota só para visualizar. **Editar** libera os toques no canvas (botão **Pronto** volta a visualizar) e **Abrir** leva ao canvas inteiro. Grava como
  `![[Nome.canvas]]` numa linha própria. Não verificado: os atalhos do canvas enquanto ele está em modo de edição dentro de uma nota.

## Ícones

Pastas e notas podem ter um ícone: clique com o botão direito e escolha **Mudar ícone…**. O seletor tem busca em
inglês (ex.: `book`, `arrow up`) sobre o catálogo do **Lucide** (1.539 ícones, licença ISC). O catálogo
(`src/iconcatalog.js`) é gerado por `node tools/gerar-icones.mjs <pasta do lucide-static/package>` e carrega depois do
início do app. Os ícones escolhidos ficam em `iconmap.v1` e acompanham renomeações e exclusões. Emoji não é usado como
ícone na interface.

## Editor de blocos

É o editor padrão das notas (os modos antigos Markdown em texto, Leitura e lado a lado foram retirados; só a impressão em PDF ainda usa a pré-visualização por dentro). A nota continua sendo um arquivo Markdown: o editor lê o texto como blocos e grava Markdown de volta,
sem formato novo. O que ele não entende fica como bloco de texto cru, com as linhas originais.

- **Blocos:** parágrafo, títulos 1 a 3, listas (com itens aninhados), tarefas, citação, callout, toggle (`<details>`),
  código, fórmula, tabela, divisor e imagem.
- **Colunas:** `/2 colunas`, `/3 colunas` ou `/4 colunas` (ou **Dividir em colunas** no menu do bloco). Cada coluna aceita qualquer bloco;
  uma barra aparece ao passar o mouse para acrescentar, tirar (o conteúdo vai para a vizinha), desfazer ou excluir. Grava como
  `<!-- columns -->`, `<!-- column -->` e `<!-- /columns -->`, que outros editores ignoram.
- **Destaques (callouts):** clique no ícone da caixa para trocar o tipo (nota, informação, dica, sucesso, pergunta, aviso, falha, perigo, bug,
  exemplo) e `/citação grande` para a frase em destaque sem caixa.
- **Mídia, arquivo e botão:** `/vídeo`, `/áudio` e `/arquivo` por endereço `https://…` (sem copiar o arquivo para a nota) e `/botão`, que abre um endereço
  ou uma nota. Gravam como `<video>`, `<audio>`, `<a class="file">` e `<a class="button">`; **Editar…** no menu do bloco muda texto e endereço.
- **Menção com `@`:** `@hoje`, `@amanhã`, `@sexta`, `@25/12`, `@+3` ou `@2026-12-25` viram uma data (`<time datetime="…">`); o mesmo menu lista notas, que
  entram como `[[link]]`.
- **Cor do texto e do fundo:** botão **A** na barra de formatação (ou no botão direito) com 7 cores e 'sem cor'. Grava como
  `<span style="color:#e03131;background:#ffd43b66">…</span>` (só cores hexadecimais; o resto é ignorado) e aparece também no modo Ler.
- **Adicionar propriedade:** clique em **Adicionar propriedade**, digite o nome (o tipo é sugerido pelo nome e pode ser trocado pelos botões), e Enter cria. Nomes já usados na biblioteca aparecem como sugestões. Ícone e opções ficam no editor da propriedade.
- **Propriedades dentro da nota:** cada propriedade tem o ícone do tipo, o nome e um editor próprio — texto, número, **seleção** e **seleção múltipla** com chips coloridos e lista de opções (busca e criação), data, caixa de marcar e endereço (com botão para abrir). Clicar no nome abre o menu: renomear, trocar o tipo (o valor é convertido) ou remover. O tipo é deduzido do valor e do uso na biblioteca (texto que se repete vira seleção) e pode ser escolhido por você; "Adicionar propriedade" abre uma busca com os nomes já usados na biblioteca (com o ícone do tipo) ou, para um nome novo, a lista de tipos com um sugerido pelo nome (Prazo → Data, Site → Endereço, Status → Seleção…). **Personalizar ícone e valores** (na criação ou em "Editar propriedade…" no menu do nome): nome, tipo, ícone (24 opções) e, para seleção e seleção múltipla, os valores com cor. O ícone e os valores valem para a biblioteca todo; o valor em si grava no frontmatter da nota.
- **Base de dados na nota:** `/` › "Base de dados" escolhe uma base existente (ou cria uma na pasta da nota) e mostra a base ao vivo no meio do texto,
  com todas as visões, filtros e edição de células. No arquivo fica `![[Projetos.base]]`.
- **Layout do editor** (painel da direita › Layout do editor): fonte (Padrão, Serifada ou Mono), texto pequeno e largura da coluna (Estreita, Normal, Larga, Total ou um controle deslizante de 40 a 120 caracteres). Vale na hora e fica salvo.
- **Comentários:** passe o mouse sobre um bloco e clique no balão que aparece na margem direita: o campo "Adicionar um comentário…" abre ali mesmo (Enter envia, Esc fecha). Também dá para selecionar um trecho e usar o balão da barra de formatação (ou botão direito › Comentar, ou Comentar o bloco). O trecho fica sublinhado em âmbar; clicar nele abre a discussão no painel da direita, onde dá para responder, resolver, reabrir e excluir. Os comentários ficam guardados à parte do arquivo (no navegador), por nota, e acompanham a nota quando ela é renomeada; não vão junto com o `.md` nem para a pasta do disco.
- **Títulos recolhíveis** (1 a 3): título que abre e fecha o conteúdo abaixo; grava como `<details><summary>## Título</summary>`. **Índice** (`<!-- toc -->`):
  lista os títulos da nota e leva até eles. **Favorito:** cartão com um endereço da web (`<https://…>`). Os três aparecem também no modo Ler.
- **Menu `/`:** digite `/` para inserir qualquer bloco (busca sem acento). `[[` abre a lista de notas.
- **Atalhos de Markdown:** `#`, `##`, `###`, `-`, `1.`, `[]`, `>` seguidos de espaço; `---`, ``` e `$$` seguidos de Enter.
- **Teclado:** Enter divide, Backspace no começo junta ou volta a parágrafo, Tab e Shift+Tab aninham, setas passam de um
  bloco a outro, Esc seleciona o bloco (Delete apaga), Ctrl+Shift+setas movem, Ctrl+Z e Ctrl+Y desfazem e refazem,
  Ctrl+B, I, E, K e Ctrl+Shift+X e H formatam.
- **Mouse:** alça à esquerda de cada bloco: `+` insere abaixo, arrastar move (inclusive para dentro de listas e toggles),
  clicar abre as ações (duplicar, excluir, mover, virar outro tipo). Barra de formatação ao selecionar texto.
- **Tabelas:** grade com células editáveis (negrito, links e `[[notas]]` dentro). Tab e Shift+Tab andam pelas células (no fim, criam
  uma linha), Enter desce, setas saem da tabela nas bordas. A barra sobre a tabela insere e apaga linhas e colunas, alinha a coluna
  (esquerda, centro, direita), abre o Markdown cru ou exclui a tabela; `+ Linha` e `+` à direita acrescentam. Colar texto de planilha
  vira tabela, e colar numa célula preenche várias células. O Markdown sai com as colunas alinhadas e `|` escapado (`\|`).
- **Seleção que atravessa blocos** apaga, recorta e substitui como num editor de texto. Colar texto com várias linhas
  vira vários blocos; colar ou soltar imagem cria um bloco de imagem (reduzida e embutida como data URL, até cerca de 650 KB).
- Módulos: `blocks.js` (modelo, leitura e escrita do Markdown), `blockedit.js` (motor: operações e histórico),
  `blockinline.js` (texto em linha ⇄ HTML), `blockslash.js` (menu e atalhos), `tables.js` (tabelas como dados) e `blocksview.js` (tela).

Limites: a leitura (modo Ler) agora mostra listas aninhadas e toggles; código aparece como texto cru dentro do
editor; sem comentários, bancos de dados, cursores de várias pessoas ou sincronização.

## Snippets de CSS

**Configurações → Snippets de CSS.** São estilos seus, aplicados em todo o app depois do estilo padrão.

- **Novo snippet** abre um editor com um exemplo. Cada mudança vale na hora, se o snippet estiver ligado.
- A validação roda enquanto você digita: chaves ou comentários abertos e textos entre aspas sem fim são
  **erros** (o snippet com erro não é aplicado); `@import` e `url(http…)` de endereços externos e regras que
  escondem a interface inteira são **avisos**.
- **Importar .css** traz um ou vários arquivos (chegam desligados). **Baixar .css** exporta o snippet.
- A paleta de comandos liga e desliga snippets pelo nome, e tem "Desligar todos".
- As variáveis de CSS disponíveis (`--accent`, `--paper`, `--font-read`…) estão listadas na própria tela. O tamanho do
  texto e a largura da coluna ficam em Configurações e não podem ser trocados por snippet.

**Modo seguro:** se um estilo estragar a tela, abra o app com `?safe=1` no fim do endereço
(`http://127.0.0.1:8080/index.html?safe=1`). Nenhum snippet é aplicado; eles continuam salvos.

Os snippets ficam no navegador. Ficam só no navegador.

## Pasta real do disco

**Configurações → Biblioteca e pasta → Abrir pasta** (ou o botão da barra lateral). A biblioteca lê os arquivos de texto da
pasta (`.md`, `.txt`, `.canvas`, `.json`, `.css`) e grava cada mudança de volta: criar, editar, renomear (com
atualização dos `[[links]]`), excluir e marcar tarefas. **Recarregar** lê a pasta de novo; **Desconectar** para de
sincronizar.

Ao reabrir o navegador, o app reconecta sozinho se a permissão ainda valer; senão, mostra **Reconectar**.
Precisa de Chrome ou Edge. Pastas e arquivos que começam com `.` e arquivos binários são ignorados. Pastas vazias
não aparecem depois de recarregar.

## Plugins

Plugins são arquivos JavaScript locais listados em `plugins/registry.json`. Cada um tem um manifesto
(`id`, `nome`, `versao`, `descricao`, `main`, `permissoes`) e exporta um objeto com `onload(api)` e, opcionalmente, `onunload()`.

API entregue ao plugin:

- `addCommand({ id, name, run })`: comando na paleta;
- `addPanel({ id, title, icon, render(el) })`: painel na barra de contexto;
- `addView({ id, title, icon, render(el) })`: tela própria, com item na ribbon e aba;
- `openView(id)`, `openNote(caminho)`, `openDialog({ title, render(el) })`, `notify(texto)`;
- `onVault(evento, fn)`: eventos da biblioteca (`create`, `modify`, `delete`, `rename`);
- `activeNote()`, `readNote(caminho)`, `listNotes()`, `createNote(caminho, texto)`;
- `settings.get(chave, padrão)` e `settings.set(chave, valor)`: armazenamento por plugin.

Ao desativar um plugin, o host remove os comandos, painéis, telas e assinaturas que ele registrou.

**Permissões.** O manifesto declara `permissoes`: `notas:ler` (activeNote, readNote, listNotes, onVault), `notas:escrever` (createNote), `editor`, `painel` (addPanel, addView, openView, openDialog), `comandos` (addCommand) e `navegar` (openNote). Sem a permissão, a chamada lança um erro que diz o que faltou. Um manifesto sem `permissoes` mantém acesso total (compatibilidade).

**Importar um plugin.** Em Configurações › Plugins há "Importar plugin de um arquivo…". O arquivo `.js` leva o manifesto num comentário no começo (`/* sophyra-plugin` + JSON com `id`, `nome`, `permissoes` + `*/`). Antes de ativar, o app mostra as permissões, avisos de risco e o código inteiro; o código fica guardado no navegador e é carregado de um Blob, nunca de um endereço remoto.

**Plugins da comunidade.** Há uma chave em Configurações › Plugins, desligada por padrão: plugins importados só carregam com ela ligada, e aceitar uma importação a liga. Desligar desativa os importados.

**Aviso:** as permissões limitam só a API do app. Plugins não têm sandbox: rodam com os mesmos privilégios da página e podem usar a rede por conta própria. Ative só código que você conhece.

Incluídos: `estatisticas` (painel) e `nota-diaria` (comando).

