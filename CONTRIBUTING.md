# Contribuir com o Sophyra

Obrigado por querer ajudar. O projeto é pequeno de propósito: HTML, CSS e módulos ES, sem build e sem dependências.

## Rodar e testar

Precisa de Node.js 22 ou mais novo.

```bash
npm start     # servidor local em http://127.0.0.1:8080
npm test      # todos os testes (node:test)
npm run medir # mede o motor com milhares de notas
```

Os testes rodam no Node, sem navegador. A interface se confere à mão no navegador (telas, edição, tema claro e escuro).

## Regras do código

- **Lógica separada da tela.** Markdown, índice, bases, canvas, tarefas e diagrama ficam em módulos sem DOM, com teste.
  A tela só chama essas funções.
- **Sem dependências** em tempo de execução e sem etapa de build. Se algo parecer pedir uma biblioteca, converse antes.
- **O arquivo é a fonte de verdade.** Tudo que o app mostra deve poder ser refeito lendo a pasta. Se criar um formato
  novo, descreva em [docs/formatos.md](docs/formatos.md) e garanta que lê e escreve sem perda.
- **Texto da interface em português**, no vocabulário do app: *biblioteca* (tudo), *coleções* (pastas da raiz),
  *Bases* (bancos de dados).
- Acompanhe o estilo do arquivo que você está mexendo: nomes, comentários e idiomas. Comentários explicam o porquê,
  não o quê.
- Estilos usam os tokens de `styles.css` (veja [docs/design.md](docs/design.md)); não coloque cores soltas.

## Testes

Toda mudança de comportamento leva um teste em `tests/` (arquivos `*.test.mjs`, com `node:test` e `node:assert/strict`).
Corrija um bug começando por um teste que falha.

## Ícones

`src/iconcatalog.js` é gerado por `tools/gerar-icones.mjs` a partir do pacote `lucide-static`. Não edite à mão.

## Abrir uma mudança

1. Crie uma branch a partir de `main`.
2. Rode `npm test`; tudo deve passar.
3. Descreva o que mudou e por quê, e o que você verificou no navegador.
4. Se mudou algo visível, anexe uma captura.

## Segurança

Não grave endereços, chaves nem dados pessoais em exemplos e testes. Para reportar uma falha de segurança, abra uma
conversa privada com a pessoa mantenedora em vez de uma issue pública.
