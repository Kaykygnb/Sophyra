// Biblioteca de exemplo, usado na primeira abertura. Mostra links, backlinks, tags, tarefas,
// callouts, tabelas e um link ainda não criado.

import { Vault } from "./vault.js";

export function sampleVault() {
  const v = new Vault("Sophyra de exemplo");
  v.create(
    "Bem-vindo.md",
    `---
tags: [guia, inicio]
---
# Bem-vindo à biblioteca

Este biblioteca é um conjunto de **notas em Markdown**. Cada nota é um arquivo e os links ligam as ideias.

- Crie uma nota com o botão **+** na barra lateral.
- Use \`[[Nome da nota]]\` para criar um link interno.
- Use \`#tag\` para classificar uma nota.

> [!tip] Atalhos
> \`Ctrl+P\` abre os comandos, \`Ctrl+O\` troca de nota e \`Ctrl+E\` alterna edição e leitura.

Projeto em foco: [[Projetos/Alfa]]. Diário de hoje: [[Diário/2026-10-21]].

## Próximos passos

- [ ] Revisar [[Tarefas]]
- [x] Ler [[Leituras/Local-first]]
`,
  );
  v.create(
    "Projetos/Alfa.md",
    `---
tags: [projeto]
status: em andamento
prioridade: 2
prazo: 2026-10-30
---
# Projeto Alfa

Objetivo: montar um protótipo local-first de notas, com índice derivado e grafo.

## Módulos

| Módulo | Estado | Responsável |
|:-|:-:|-:|
| Parser | pronto | eu |
| Índice | pronto | eu |
| Interface | em andamento | eu |

Ideias relacionadas: [[Ideias]], [[Leituras/Local-first]].

- [ ] Escrever testes de busca
- [ ] Ajustar o grafo
`,
  );
  v.create(
    "Diário/2026-10-21.md",
    `# 21/10/2026

Hoje testei o [[Projetos/Alfa]] e revisei as [[Tarefas]].

Também anotei uma ideia para [[Ideias]] #projeto #reflexão

![[Ideias#Atalhos]]
`,
  );
  v.create(
    "Ideias.md",
    `# Ideias

## Atalhos

- Busca com \`tag:\` e \`path:\`
- Modo de leitura com um clique

## Explorar depois

Conectar com [[Nota que ainda não existe]].

#ideia #projeto
`,
  );
  v.create(
    "Tarefas.md",
    `# Tarefas

- [ ] Publicar a primeira versão #projeto
- [ ] Revisar o guia #guia
- [x] Montar a biblioteca de exemplo
`,
  );
  v.create(
    "Leituras/Local-first.md",
    `# Local-first

Software que guarda os dados no próprio aparelho e sincroniza quando pode.

Leituras relacionadas: [[Projetos/Alfa]].

#leitura #guia
`,
  );
  v.create(
    "Projetos/Beta.md",
    `---
tags: [projeto]
status: a fazer
prioridade: 1
prazo: 2026-11-05
---
# Projeto Beta

Pesquisar como [[Projetos/Alfa]] pode exportar relatórios.
`,
  );
  v.create(
    "Projetos/Gama.md",
    `---
tags: [projeto]
status: feito
prioridade: 3
prazo: 2026-10-12
---
# Projeto Gama

Concluído. Aprendizados guardados em [[Ideias]].
`,
  );
  v.create(
    "Projetos/Projetos.base",
    JSON.stringify(
      {
        source: { folder: "Projetos", tag: "" },
        props: { status: { type: "select", options: ["a fazer", "em andamento", "feito"] } },
        views: [
          { id: "tabela", name: "Tabela", type: "table", columns: ["file.name", "status", "prioridade", "prazo"], filters: [], sort: [{ key: "prazo", dir: "asc" }], groupBy: "", dateKey: "" },
          { id: "quadro", name: "Quadro", type: "board", columns: ["file.name", "prioridade", "prazo"], filters: [], sort: [], groupBy: "status", dateKey: "" },
          { id: "agenda", name: "Calendário", type: "calendar", columns: [], filters: [], sort: [], groupBy: "", dateKey: "prazo" },
        ],
      },
      null,
      2,
    ) + "\n",
  );
  return v;
}
