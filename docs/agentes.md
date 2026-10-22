# Sophyra e agentes

O Sophyra é uma pasta de arquivos de texto, então um agente já consegue **ler** quase tudo diretamente: notas `.md`,
bases `.base` e canvas `.canvas` (veja [formatos.md](formatos.md)). Este documento descreve o que existe hoje para
agentes e o que ainda **não** existe.

## O que existe

### 1. Diagrama de banco de dados (tabelas no canvas)

O canvas tem tabelas e relações. Um agente pode:

**Ler o diagrama**
- No canvas, clique com o botão direito no fundo › **Diagrama** › **Copiar esquema para agentes**. Vai um JSON no
  formato `sophyra.diagram` (descrito em [formatos.md](formatos.md#esquema-do-diagrama-de-tabelas)).
- Ou leia o arquivo `.canvas` direto: as tabelas são nós `type: "table"`.

**Exportar para outras ferramentas**
- **Diagrama › Exportar DBML…** gera um arquivo para o [dbdiagram.io](https://dbdiagram.io).
- **Diagrama › Exportar SQL…** gera `CREATE TABLE` e chaves estrangeiras (`ALTER TABLE … ADD FOREIGN KEY`). Relações
  N:N viram uma tabela de ligação.

**Propor um diagrama novo**
1. O agente gera um JSON `sophyra.diagram` válido.
2. Você salva em um arquivo `.json` e usa **Diagrama › Importar esquema de agente…**.
3. O app valida (formato, versão, tipos, relações). Se algo estiver errado, recusa e mostra o primeiro erro.
4. Se estiver certo, pede **confirmação**: as tabelas e relações do canvas são trocadas pelas novas; os demais cartões
   ficam.

Nada é escrito sem a sua confirmação.

### 2. Arquivos legíveis

- Notas: Markdown com propriedades no começo.
- Bases: JSON com a definição da visão; os dados estão nas propriedades das notas.
- Canvas: JSON.

Um agente com acesso à pasta pode ler e propor mudanças nesses arquivos. O app relê a pasta quando você a recarrega
(**Recarregar pasta do disco**).

## O que ainda não existe

- **Sem API ao vivo.** O app roda no navegador; não há um servidor, uma ferramenta MCP nem uma API que o agente chame
  direto. O caminho de escrita de hoje é por arquivo + importação com confirmação.
- **Sem busca para agentes.** Não existe um índice de busca exposto para fora do app.
- **Sem permissões por área.** A ideia de espaço privado (fora do alcance de agentes) e espaço compartilhado está no
  roteiro, não no código.

Veja o [roteiro](../README.md#roteiro) no README.

## Boas práticas ao gerar arquivos

- Respeite os formatos de [formatos.md](formatos.md): propriedades no começo da nota, links `[[Nota]]` entre aspas
  quando estiverem num valor de propriedade, datas em `AAAA-MM-DD`.
- Não invente tipos: use só os listados.
- Para diagramas, valide o esquema antes: nomes de tabela únicos, cada tabela com uma chave primária, relações
  apontando para campos que existem.
