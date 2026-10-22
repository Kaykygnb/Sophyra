# Design do Sophyra

Decisões de design do front end e como estendê-lo. É uma interface de **trabalho** (modo Operate): a pessoa está
escrevendo e organizando notas, então a interface serve a tarefa e some quando não é necessária.

## Direção

**Papel e tinta.** Superfícies neutras quentes, texto escuro, um único acento verde-petróleo. A cor aparece onde
há decisão ou estado: ação principal, item selecionado, link, progresso. Nada de gradientes, vidro ou sombras
duras.

- **Interface em sans do sistema.** Familiar, rápida, sem custo de fonte. Escala fixa em `rem`, razão curta.
- **Notas lidas em serifa** (Iowan Old Style, Palatino, Charter, Georgia). A leitura é o momento em que a pessoa
  fica mais tempo; a serifa dá ritmo de texto longo. Títulos ficam em sans para separar estrutura de conteúdo.
- **Duas camadas neutras**: o conteúdo (`--paper`) e as barras (`--layer`, `--rail`), um pouco mais escuras.

## Tokens (`styles.css`, bloco `:root`)

| Grupo | Tokens |
|---|---|
| Superfícies | `--paper`, `--layer`, `--rail`, `--raised`, `--border`, `--border-strong` |
| Texto | `--text`, `--muted`, `--faint` |
| Acento | `--accent`, `--accent-strong`, `--accent-soft`, `--accent-ink`, `--on-accent` |
| Estados | `--danger`, `--warning`, `--success`, `--info` e a versão `-soft` de cada um |
| Tipografia | `--font-ui`, `--font-read`, `--font-mono`, `--fs-xs` a `--fs-3xl` |
| Espaço e forma | `--s1` a `--s7` (4 a 48 px), `--r-sm`, `--r-md`, `--r-lg` |
| Profundidade | `--shadow-sm`, `--shadow-md`, `--shadow-lg` (sempre com deslocamento e desfoque) |
| Movimento | `--ease` (saída exponencial), `--t-fast` 120 ms, `--t-med` 200 ms |

Tema escuro: mesmos nomes de token, valores próprios. Vale pelo sistema (modo `auto`) ou pela escolha em
Configurações. O contraste de texto fica acima de 4,5:1 nas duas paletas.

## Ícones

`src/icons.js`: biblioteca própria de SVG de traço único, grade 24, traço 1.6, pontas arredondadas. Nenhuma tela usa
emoji ou glifo como ícone. Um teste (`tests/ui.test.mjs`) falha se o código citar um ícone que não existe.

Para adicionar: inclua o nome em `ICONS` com os caminhos do traço; use `icon("nome", 18)` em JavaScript ou
`<i data-icon="nome" data-size="18"></i>` no HTML.

## Componentes

Botões (`.btn`, `.primary`, `.danger`, `.ghost`, `.sm`), botão de ícone (`.icon-btn`), campos (`.field`), interruptor
(`.switch`), segmentado (`.segmented` e `.seg`), chip (`.chip`), progresso (`.progress`), linhas (`.rows` e `.row`),
painel recolhível (`.panel`), paleta, diálogo e aviso. Todos têm estados de hover, foco visível, ativo e desabilitado.

Foco por teclado: anel de 2 px no acento (`:focus-visible`). Seleção de texto, barras de rolagem e numerais
tabulares seguem a paleta.

## Navegação

- Tudo que não é nota abre numa **aba**, com id começando por `@` (`@home`, `@graph`, `@tasks`, `@tags`,
  `@settings`, `@shortcuts`, `@plugin/<chave>`). As abas são lembradas entre sessões.
- Configurações são **telas**, não modais. Modal só onde a tarefa exige interrupção:
  nomear, confirmar, paleta de comandos.
- Estados vazios ensinam a próxima ação (por exemplo, o painel de backlinks diz como criar um).

## Responsivo

| Largura | Comportamento |
|---|---|
| 1180 px ou mais | Ribbon, barra lateral, área principal e contexto lado a lado. |
| 860 a 1179 px | Contexto vira gaveta à direita (botão no topo da nota). |
| Menos de 860 px | Barra lateral também vira gaveta; modo dividido mostra só a leitura. |

## Snippets de CSS

Quem quiser mudar a aparência faz isso por snippets, e não editando `styles.css`. Por isso o estilo padrão fala
sempre por tokens (`var(--accent)`, `var(--paper)`…): redefinir um token num snippet muda o app inteiro de forma
consistente. O snippet entra num `<style>` depois do estilo padrão. `?safe=1` liga o app sem eles.

## Sugestões e prévia de links

A lista de sugestões e o cartão de prévia são camadas temporárias sobre o texto, com sombra e borda do sistema.
Aparecem junto ao cursor ou ao link, nunca cobrem o que está sendo digitado, trocam de lado quando falta espaço e
fecham com `Esc`. A prévia usa a mesma serifa da leitura, para mostrar o texto como ele será lido.

## Movimento

Só transmite estado: abrir gaveta, trocar de tema, mover o interruptor, aparecer a paleta ou o aviso. 120 a 200 ms,
saída exponencial. `prefers-reduced-motion` desliga tudo.

## O que evitamos de propósito

Cartões idênticos de ícone, título e texto como estrutura de página; rótulos acima de títulos; borda lateral colorida
em callouts e listas; texto em gradiente; vidro decorativo; sombra dura; emoji como ícone; modal como primeira ideia.

## Como estender

- **Nova tela do app**: crie `renderXxx(el, ctx)` em `src/views.js`, registre o id em `VIEWS` e na cadeia de
  `renderMain` em `src/app.js`, e adicione o botão à ribbon em `index.html`.
- **Nova tela de plugin**: `api.addView({ id, title, icon, render(el) })`. A ribbon ganha o item sozinha.
- **Novo componente**: use os tokens; não escreva cores nem espaçamentos soltos.
