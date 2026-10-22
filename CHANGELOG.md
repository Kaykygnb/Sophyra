# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). O projeto está em beta e ainda não
segue versionamento semântico estrito.

## [0.1.0-beta.1]

Primeira versão publicada.

### Adicionado

- Editor de blocos com menu `/`, colunas, destaques, toggles, mídia, botões, datas e menções; salva como Markdown.
- Links `[[ ]]`, backlinks, tags, grafo e busca.
- Bases com seis visões (tabela, lista, quadro, calendário, galeria, cronograma), totais, relações, pessoas, fórmulas
  e coluna de backlinks; modelos de base e de wiki.
- Coleções (pastas da raiz) com capa, ícone, página e cartões; árvore com arrastar, seleção múltipla e renomear.
- Tela de tarefas por prazo.
- Canvas com cartões, formas, imagens, tabelas e relações (exporta DBML e SQL), grafo de notas automático e esquema
  `sophyra.diagram` para agentes.
- Pasta real do disco (File System Access API) com atualização de links ao renomear.
- Plugins locais com permissões, importação de arquivo com confirmação, snippets de CSS, temas e paleta de comandos.
- Catálogo de ícones Lucide com seletor.
- Servidor local sem dependências (`npm start`) e 473 testes (`npm test`).

### Mudado

- O produto passou a se chamar **Sophyra**. Os dados guardados com o nome antigo (`cofre.*`) são copiados uma vez para
  `sophyra.*` na primeira abertura; nada é apagado.
- "Cofre" virou **biblioteca** em toda a interface.

### Removido

- O plugin de reconstrução e a lógica de modos antigos do editor.
