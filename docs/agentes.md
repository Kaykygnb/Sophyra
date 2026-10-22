# Sophyra e agentes

O Sophyra é uma pasta de arquivos de texto, então um agente já consegue **ler** quase tudo diretamente: notas `.md`,
bases `.base` e canvas `.canvas` (veja [formatos.md](formatos.md)). Além disso, há um **servidor MCP** com ferramentas
para ler, buscar e escrever. Este documento descreve o que existe e o que ainda não.

## Servidor MCP

O [MCP](https://modelcontextprotocol.io) deixa um agente (como o Claude) usar as suas notas por ferramentas, sem você
colar texto. O servidor é feito à mão, sem dependências, e usa o mesmo núcleo do app (links, apelidos, etiquetas,
tarefas), então o agente enxerga as notas do mesmo jeito que você.

### Conectar por stdio (um agente na sua máquina)

Aponte o agente para uma pasta de notas. No app desktop, **Configurações › Agentes (MCP)** mostra o trecho pronto para
copiar, já com o caminho da biblioteca aberta. Na mão:

```json
{
  "mcpServers": {
    "sophyra": {
      "command": "node",
      "args": ["bin/sophyra-mcp.mjs", "--pasta", "C:/Notas"]
    }
  }
}
```

Acrescente `"--somente-leitura"` aos argumentos para o agente só poder ler.

### Conectar por HTTP (servidor na rede)

Quando a biblioteca está sendo [servida](servidor.md), o MCP também responde em `POST /api/mcp`, com o cabeçalho
`Authorization: Bearer <token>`. O token é o que a conta recebe ao entrar (`POST /api/login`). As ferramentas
respeitam o papel da conta: **leitores não veem as ferramentas de escrita**.

### Ferramentas

| Ferramenta | O que faz |
|---|---|
| `informacoes` | Nome da biblioteca e quantidade de arquivos e notas |
| `listar_notas` | Notas com título, etiquetas e data; filtro por pasta |
| `ler_nota` | Lê uma nota, `.base` ou `.canvas`; para notas devolve também as propriedades |
| `buscar` | Termos, `"frase exata"`, `tag:`, `path:` e `-excluir` |
| `backlinks` | Notas que apontam para a nota |
| `links_de_saida` | Links `[[…]]` da nota e para onde cada um resolve |
| `vizinhos` | Notas ligadas até uma distância (1 a 4 saltos) |
| `etiquetas` | Lista as etiquetas, ou as notas de uma etiqueta |
| `tarefas` | Tarefas abertas (ou todas) da biblioteca |
| `links_quebrados` | Links que não apontam para nenhuma nota |
| `ler_diagrama` | Tabelas e relações de um canvas, no esquema `sophyra.diagram` |
| `escrever_nota` | Cria, substitui ou anexa; `criar` não sobrescreve |
| `renomear_nota` | Renomeia ou move e atualiza os `[[links]]` |
| `arquivar_nota` | Move para a pasta `Arquivo` (não apaga) |
| `aplicar_diagrama` | Troca as tabelas e relações de um canvas por um esquema válido |

Não há ferramenta que **apague**: apagar fica com você. Escritas fora da pasta (`../`) e de tipos de arquivo não
aceitos (`.md`, `.txt`, `.canvas`, `.base`, `.json`, `.css`) são recusadas. Erros voltam como resultado da ferramenta
(`isError`), com a mensagem em português.

## Diagrama de banco de dados (tabelas no canvas)

O canvas tem tabelas e relações. Um agente pode:

**Ler o diagrama**
- Pelo MCP (`ler_diagrama`), ou no canvas: botão direito no fundo › **Diagrama** › **Copiar esquema para agentes**.
  Vai um JSON no formato `sophyra.diagram` (descrito em [formatos.md](formatos.md#esquema-do-diagrama-de-tabelas)).
- Ou leia o arquivo `.canvas` direto: as tabelas são nós `type: "table"`.

**Exportar para outras ferramentas**
- **Diagrama › Exportar DBML…** gera um arquivo para o [dbdiagram.io](https://dbdiagram.io).
- **Diagrama › Exportar SQL…** gera `CREATE TABLE` e chaves estrangeiras. Relações N:N viram uma tabela de ligação.

**Propor um diagrama novo**
1. Pelo MCP: `aplicar_diagrama` valida o esquema (formato, versão, tipos, relações) e, se estiver certo, grava o
   canvas. Se algo estiver errado, recusa e diz o primeiro erro. As tabelas e relações do canvas são trocadas; os
   demais cartões ficam.
2. Pelo app: salve o JSON num arquivo e use **Diagrama › Importar esquema de agente…**, que pede **confirmação**
   antes de trocar.

## Arquivos legíveis

- Notas: Markdown com propriedades no começo.
- Bases: JSON com a definição da visão; os dados estão nas propriedades das notas.
- Canvas: JSON.

Um agente com acesso à pasta pode ler e propor mudanças nesses arquivos. O app relê a pasta quando ela muda por fora
(no desktop, na hora; no navegador, com **Recarregar pasta do disco**).

## O que ainda não existe

- **Permissões por área.** Hoje o controle é por conta (dono, editor, leitor) e vale para a biblioteca inteira. Um
  espaço privado fora do alcance de agentes e um compartilhado está no [roteiro](../README.md#roteiro).
- **Autenticação do MCP por OAuth.** O acesso remoto usa o token da conta. Não há HTTPS embutido: use uma rede
  confiável ou um proxy com TLS.
- **Busca semântica.** A busca é por texto, etiqueta e caminho; não há índice de significado.
- **Confirmação por escrita.** Quem tem papel de editor escreve direto. Para ter revisão, use a conta de leitor ou
  `--somente-leitura` e aplique as mudanças você mesmo.

## Boas práticas ao gerar arquivos

- Respeite os formatos de [formatos.md](formatos.md): propriedades no começo da nota, links `[[Nota]]` entre aspas
  quando estiverem num valor de propriedade, datas em `AAAA-MM-DD`.
- Não invente tipos: use só os listados.
- Para diagramas, valide o esquema antes: nomes de tabela únicos, cada tabela com uma chave primária, relações
  apontando para campos que existem.
