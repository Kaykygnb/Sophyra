// Snippets de CSS: estilos da própria pessoa, que valem em todo o app depois do estilo padrão.
// Ficam salvos no navegador. Um modo seguro (?safe=1) liga o app sem nenhum snippet, caso um estilo
// esconda ou quebre a interface.

export const SNIPPET_MAX_BYTES = 200_000;

// Variáveis que um snippet pode usar ou redefinir (ver styles.css, bloco :root).
export const CSS_VARIABLES = [
  ["--paper, --layer, --rail, --raised", "superfícies: conteúdo, barras, ribbon e cartões"],
  ["--border, --border-strong", "linhas de divisão"],
  ["--text, --muted, --faint", "cores de texto"],
  ["--accent, --accent-strong, --accent-soft, --accent-ink", "cor de destaque e suas variações"],
  ["--danger, --warning, --success, --info", "cores de estado"],
  ["--font-ui, --font-read, --font-mono", "famílias de fonte da interface, da leitura e do código"],
  ["--ribbon-w, --side-w, --ctx-w", "larguras das colunas"],
  ["--r-sm, --r-md, --r-lg", "arredondamento das bordas"],
];

export const STARTER_CSS = `/* Exemplo: títulos de seção na cor de destaque e citações com a mesma cor.
   Edite à vontade. Use as variáveis do app, como --accent e --paper.
   O tamanho do texto e a largura da coluna ficam em Configurações. */

.preview h2 {
  color: var(--accent-ink);
}

.preview blockquote {
  border-left-color: var(--accent);
}

/* Descomente para trocar a cor de destaque:
:root { --accent: #7c3aed; --accent-ink: #5b21b6; } */
`;

// --- Validação ------------------------------------------------------------------------------

// Confere o CSS sem executá-lo. Devolve [{ level: "erro" | "aviso", message }].
export function lintCss(css) {
  const out = [];
  const text = String(css ?? "");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > SNIPPET_MAX_BYTES) out.push({ level: "erro", message: `O snippet tem ${Math.round(bytes / 1000)} KB; o limite é ${SNIPPET_MAX_BYTES / 1000} KB.` });

  // percorre o texto ignorando comentários e strings
  let depth = 0;
  let line = 1;
  let i = 0;
  let firstUnclosedLine = 0;
  const stack = [];
  while (i < text.length) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (c === "\n") line++;
    if (two === "/*") {
      const end = text.indexOf("*/", i + 2);
      if (end === -1) {
        out.push({ level: "erro", message: `Comentário aberto na linha ${line} e nunca fechado.` });
        break;
      }
      line += (text.slice(i, end).match(/\n/g) || []).length;
      i = end + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== "\n") j += text[j] === "\\" ? 2 : 1;
      if (text[j] !== c) out.push({ level: "erro", message: `Texto entre aspas aberto na linha ${line} e não fechado.` });
      i = j + 1;
      continue;
    }
    if (c === "{") {
      depth++;
      stack.push(line);
    } else if (c === "}") {
      depth--;
      stack.pop();
      if (depth < 0) {
        out.push({ level: "erro", message: `Chave \`}\` sobrando na linha ${line}.` });
        depth = 0;
      }
    }
    i++;
  }
  if (depth > 0) {
    firstUnclosedLine = stack[stack.length - 1];
    out.push({ level: "erro", message: `Falta fechar ${depth} chave${depth > 1 ? "s" : ""}; a última aberta é da linha ${firstUnclosedLine}.` });
  }

  const semComentarios = text.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/@import\s+(?:url\()?\s*["']?(?:https?:)?\/\//i.test(semComentarios)) {
    out.push({ level: "aviso", message: "@import de endereço externo: o estilo depende da internet e pode mudar sem você perceber." });
  }
  if (/url\(\s*["']?https?:/i.test(semComentarios.replace(/@import[^;]*;/gi, ""))) {
    out.push({ level: "aviso", message: "Há recursos carregados de endereços externos (url(http…))." });
  }
  if (/(?:^|})\s*(?:html|body|#app|\.app)\s*\{[^}]*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(semComentarios)) {
    out.push({ level: "aviso", message: "Este estilo esconde a interface inteira. Se acontecer, abra o app com ?safe=1 no fim do endereço." });
  }
  return out;
}

export const hasErrors = (warnings) => warnings.some((w) => w.level === "erro");

// --- Armazenamento ------------------------------------------------------------------------------

export function normalizeName(name, fallback = "Sem nome") {
  const clean = String(name ?? "").replace(/\.css$/i, "").replace(/[\\/:*?"<>|]/g, "-").trim();
  return clean || fallback;
}

// `storage` é o mesmo objeto com get(chave, padrão) e set(chave, valor) usado pelos plugins.
export class SnippetStore {
  constructor(storage, key = "snippets.lista") {
    this.storage = storage;
    this.key = key;
  }

  list() {
    const raw = this.storage.get(this.key, []);
    return Array.isArray(raw) ? raw.filter((s) => s && typeof s.id === "string") : [];
  }

  save(list) {
    this.storage.set(this.key, list);
    return list;
  }

  get(id) {
    return this.list().find((s) => s.id === id) || null;
  }

  // Nome único: "Estilo", "Estilo 2", "Estilo 3"…
  uniqueName(base, ignoreId = "") {
    const taken = new Set(this.list().filter((s) => s.id !== ignoreId).map((s) => s.name.toLowerCase()));
    const name = normalizeName(base);
    if (!taken.has(name.toLowerCase())) return name;
    let n = 2;
    while (taken.has(`${name} ${n}`.toLowerCase())) n++;
    return `${name} ${n}`;
  }

  create({ name = "Novo snippet", css = STARTER_CSS, enabled = false } = {}) {
    const list = this.list();
    const snippet = { id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: this.uniqueName(name), css, enabled };
    this.save([...list, snippet]);
    return snippet;
  }

  update(id, changes) {
    const list = this.list();
    const i = list.findIndex((s) => s.id === id);
    if (i === -1) return null;
    const next = { ...list[i], ...changes };
    if ("name" in changes) next.name = this.uniqueName(changes.name, id);
    list[i] = next;
    this.save(list);
    return next;
  }

  remove(id) {
    const list = this.list();
    this.save(list.filter((s) => s.id !== id));
    return list.length !== this.list().length;
  }

  setEnabled(id, on) {
    return this.update(id, { enabled: !!on });
  }

  disableAll() {
    const list = this.list().map((s) => ({ ...s, enabled: false }));
    this.save(list);
    return list;
  }
}

// --- Aplicação --------------------------------------------------------------------------------------

// Junta o CSS dos snippets ligados, na ordem da lista, com um comentário por snippet.
export function combinedCss(list) {
  return list
    .filter((s) => s.enabled && !hasErrors(lintCss(s.css)))
    .map((s) => `/* snippet: ${normalizeName(s.name)} */\n${s.css}`)
    .join("\n\n");
}

// `styleEl` é um <style>; no modo seguro fica vazio. Snippets com erro de sintaxe não entram.
export function setSnippetStyle(styleEl, list, { safe = false } = {}) {
  styleEl.textContent = safe ? "" : combinedCss(list);
  return styleEl.textContent.length;
}
