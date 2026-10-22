// Vista do editor de blocos: desenha a árvore do motor (blockedit.js) em elementos editáveis e traduz teclado, mouse,
// colar e arrastar em chamadas ao motor. Cada bloco de texto é um `contenteditable` próprio; o que a pessoa digita volta
// ao motor como Markdown em linha (blockinline.js), e as operações que mudam a estrutura redesenham a árvore.

import { BlockEditor } from "./blockedit.js";
import { flatten, canHaveChildren, canNest, hasText, isRawType, LIST_TYPES, parseBlocks, makeBlock } from "./blocks.js";
import { inlineToHtml, htmlToInline } from "./blockinline.js";
import { SLASH_ITEMS, filterSlash, slashAt, shortcutFor, enterShortcutFor } from "./blockslash.js";
import { renderMath } from "./math.js";
import { renderMarkdown, escapeHtml } from "./markdown.js";
import { icon } from "./icons.js";
import { openAtEvent } from "./contextmenu.js";
import { parseTable, serializeTable, insertRow, deleteRow, insertCol, deleteCol, setAlign, setCell, tableFromTsv } from "./tables.js";
import { readImage, isImageFile } from "./canvasimage.js";
import { mentionAt, dateSuggestions, dateMarkdown, parseDateQuery } from "./mentions.js";

const isColumnType = (t) => t === "column" || t === "columns";
const SAFE_MEDIA = /^(https?:|blob:)/i;
const CALLOUT_NAMES = { note: "Nota", info: "Informação", tip: "Dica", success: "Sucesso", question: "Pergunta", warning: "Aviso", failure: "Falha", danger: "Perigo", bug: "Bug", example: "Exemplo", quote: "Citação grande" };
const EDITABLE = ".bk-text, .bk-code";
const CALLOUT_ICON = { note: "info", info: "info", tip: "check-circle", success: "check-circle", question: "help", warning: "alert", failure: "x-circle", danger: "x-circle", bug: "alert", example: "list", quote: "quote" };
const SAFE_SRC = /^(https?:|blob:|data:image\/(png|jpeg|webp|gif);base64,)/i;
const PLACEHOLDER = { paragraph: "Digite “/” para os comandos", heading: "Título", quote: "Citação", callout: "Escreva o destaque", bullet: "Item da lista", number: "Item da lista", todo: "Tarefa", toggle: "Título do toggle" };
const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function mountBlocks(host, { markdown = "", exists = () => true, notes = () => [], embedBase = null, embedCanvas = null, openCanvas = null, chooseBase = null, chooseCanvas = null, header = null, comments = null, onChange = () => {}, followLink = () => {}, onTag = null, toast = () => {} } = {}) {
  let source = markdown;
  let lastEmitted = null;
  let emitTimer = null;
  let menu = null; // { kind, items, index, id, length }
  let selectedId = null;
  let pickTarget = null;
  let drag = null;
  let destroyed = false;
  const rawTables = new Set(); // tabelas abertas como Markdown em vez de grade
  let embeds = []; // bases abertas dentro da nota (uma por bloco de base)
  let curCell = null; // { id, r, c }: a célula onde o cursor está (0 é o cabeçalho)
  const ed = new BlockEditor(markdown, { onChange: scheduleEmit });
  const ctx = { exists };

  host.innerHTML = `<div class="bk-header"></div><div class="bk-root" tabindex="-1" role="document" aria-label="Editor de blocos"></div>
    <div class="bk-menu" role="listbox" hidden></div>
    <div class="bk-bar" role="toolbar" aria-label="Formatação do texto" hidden>
      <button type="button" data-fmt="bold" title="Negrito (Ctrl+B)" aria-label="Negrito">${icon("bold", 16)}</button>
      <button type="button" data-fmt="italic" title="Itálico (Ctrl+I)" aria-label="Itálico">${icon("italic", 16)}</button>
      <button type="button" data-fmt="strike" title="Riscado (Ctrl+Shift+X)" aria-label="Riscado"><s>S</s></button>
      <button type="button" data-fmt="code" title="Código (Ctrl+E)" aria-label="Código">${icon("code", 16)}</button>
      <button type="button" data-fmt="mark" title="Destacar (Ctrl+Shift+H)" aria-label="Destacar"><mark>A</mark></button>
      <button type="button" data-fmt="color" title="Cor do texto e do fundo" aria-label="Cor do texto e do fundo"><span class="bk-clr-a">A</span></button>
      <span class="bk-bar-sep"></span>
      <button type="button" data-fmt="link" title="Link (Ctrl+K)" aria-label="Link">${icon("link", 16)}</button>
      <button type="button" data-fmt="wiki" title="Link para nota" aria-label="Link para nota">${icon("file-text", 16)}</button>
      <button type="button" data-fmt="comment" title="Comentar o trecho" aria-label="Comentar o trecho">${icon("message", 16)}</button>
    </div>
    <div class="bk-colors" hidden></div>
    <button type="button" class="bk-cmbtn" title="Comentar este bloco" aria-label="Comentar este bloco" hidden>${icon("message", 16)}</button>
    <form class="bk-cmbox" hidden><input type="text" placeholder="Adicionar um comentário…" aria-label="Comentário" autocomplete="off"><button type="submit" class="bk-cmsend" aria-label="Enviar comentário" disabled>${icon("arrow-up", 14)}</button></form>
    <input type="file" class="bk-file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>`;
  const root = host.querySelector(".bk-root");
  const headerEl = host.querySelector(".bk-header");
  const headerHandle = header ? header(headerEl) : null; // ex.: as propriedades da nota, acima dos blocos
  const menuEl = host.querySelector(".bk-menu");
  const barEl = host.querySelector(".bk-bar");
  const colorsEl = host.querySelector(".bk-colors");
  const fileEl = host.querySelector(".bk-file");
  const cmBtn = host.querySelector(".bk-cmbtn");
  const cmBox = host.querySelector(".bk-cmbox");
  const cmInput = cmBox.querySelector("input");
  const cmSend = cmBox.querySelector(".bk-cmsend");
  let cmHover = null; // id do bloco sob o ponteiro; é a ele que o balão da margem se refere
  let cmTarget = null; // { id, quote } enquanto o campo de comentário está aberto

  // --- Gravação ---------------------------------------------------------------------------------------------------------

  function scheduleEmit() {
    clearTimeout(emitTimer);
    emitTimer = setTimeout(emitNow, 150);
  }

  function emitNow() {
    clearTimeout(emitTimer);
    if (destroyed) return;
    const md = ed.markdown();
    if (md === lastEmitted) return;
    lastEmitted = md;
    onChange(md);
  }

  // --- Desenho ----------------------------------------------------------------------------------------------------------

  const ph = (b) => (b.type === "heading" ? `Título ${b.level}` : b.type === "toggle" && b.level ? `Título ${b.level} recolhível` : PLACEHOLDER[b.type] || "");

  function textHtml(b, cls = "bk-text") {
    return `<div class="${cls}" contenteditable="true" spellcheck="true" data-ph="${escapeHtml(ph(b))}">${inlineToHtml(b.text, ctx)}</div>`;
  }

  // Tabela como grade: cada célula é editável e guarda o Markdown em linha; a barra aparece com o cursor dentro da tabela.
  function gridHtml(t) {
    const cell = (tag, text, r, c) => `<${tag} class="bk-cell" contenteditable="true" spellcheck="true" data-r="${r}" data-c="${c}"${t.align[c] ? ` style="text-align:${t.align[c]}"` : ""}>${inlineToHtml(text, ctx)}</${tag}>`;
    const act = (k, ic, label, cls = "") => `<button type="button" class="bk-tbtn ${cls}" data-tact="${k}" title="${label}" aria-label="${label}">${icon(ic, 16)}</button>`;
    const sep = `<span class="bk-bar-sep"></span>`;
    const bar = `<div class="bk-tablebar" role="toolbar" aria-label="Tabela">${act("row-above", "row-above", "Inserir linha acima")}${act("row-below", "row-below", "Inserir linha abaixo")}${act("col-left", "col-left", "Inserir coluna à esquerda")}${act("col-right", "col-right", "Inserir coluna à direita")}${sep}${act("del-row", "row-del", "Apagar a linha")}${act("del-col", "col-del", "Apagar a coluna")}${sep}${act("align-left", "align-left", "Alinhar à esquerda")}${act("align-center", "align-center", "Centralizar")}${act("align-right", "align-right", "Alinhar à direita")}${sep}${act("md", "code", "Editar como Markdown")}${act("del-table", "trash", "Excluir a tabela", "danger")}</div>`;
    return `<div class="bk-tablewrap">${bar}<div class="bk-gridscroll"><table class="bk-grid"><thead><tr>${t.header.map((h, c) => cell("th", h, 0, c)).join("")}</tr></thead><tbody>${t.rows.map((row, i) => `<tr>${row.map((x, c) => cell("td", x, i + 1, c)).join("")}</tr>`).join("")}</tbody></table><button type="button" class="bk-addcol" title="Adicionar coluna" aria-label="Adicionar coluna">${icon("plus", 14)}</button></div><button type="button" class="bk-addrow" title="Adicionar linha" aria-label="Adicionar linha">${icon("plus", 14)}<span>Linha</span></button></div>`;
  }

  function mainHtml(b, num) {
    switch (b.type) {
      case "bullet":
        return `<span class="bk-mark" aria-hidden="true">•</span>${textHtml(b)}`;
      case "number":
        return `<span class="bk-mark bk-num" aria-hidden="true">${num}.</span>${textHtml(b)}`;
      case "todo":
        return `<input type="checkbox" class="bk-check" ${b.checked ? "checked" : ""} aria-label="Tarefa">${textHtml(b)}`;
      case "toggle":
        return `<button type="button" class="bk-fold" tabindex="-1" aria-label="Abrir ou fechar" aria-expanded="${!!b.open}">${icon("chevron-right", 16)}</button>${textHtml(b)}`;
      case "callout":
        return `<button type="button" class="bk-co-ico" tabindex="-1" title="Trocar o tipo do destaque" aria-label="Trocar o tipo do destaque">${icon(CALLOUT_ICON[b.kind] || "info", 18)}</button>${textHtml(b)}`;
      case "video":
      case "audio": {
        const ok = SAFE_MEDIA.test(b.src || "");
        const missing = b.type === "video" ? icon("play", 18) : icon("music", 18);
        const tag = b.type === "video" ? `<video src="${escapeHtml(b.src)}" controls preload="metadata"></video>` : `<audio src="${escapeHtml(b.src)}" controls preload="metadata"></audio>`;
        return `<div class="bk-media bk-media-${b.type}">${ok ? tag : `<div class="bk-imgmiss">${missing}<span>Endereço não carregado: ${escapeHtml((b.src || "").slice(0, 80))}</span></div>`}</div>`;
      }
      case "file":
        return `<div class="bk-bookmark bk-filecard" data-url="${escapeHtml(b.src || "")}" title="Clique para selecionar; Ctrl+clique abre"><span class="bk-bm-ico">${icon("paperclip", 18)}</span><span class="bk-bm-text"><strong>${escapeHtml(b.text || b.src || "Arquivo")}</strong><small>${escapeHtml(b.src || "")}</small></span></div>`;
      case "button":
        return `<div class="bk-btnwrap"><button type="button" class="bk-btnact" data-url="${escapeHtml(b.src || "")}" title="${escapeHtml(b.src || "")}">${escapeHtml(b.text || "Botão")}</button></div>`;
      case "code":
        return `<div class="bk-codewrap"><input class="bk-lang" value="${escapeHtml(b.lang || "")}" placeholder="linguagem" aria-label="Linguagem do código" spellcheck="false"><div class="bk-code" contenteditable="plaintext-only" spellcheck="false" data-ph="Código">${escapeHtml(b.text)}</div></div>`;
      case "math":
        return `<div class="bk-codewrap"><div class="bk-code" contenteditable="plaintext-only" spellcheck="false" data-ph="Fórmula em TeX">${escapeHtml(b.text)}</div><div class="bk-out bk-mathout">${renderMath(b.text, { display: true })}</div></div>`;
      case "table": {
        const t = rawTables.has(b.id) ? null : parseTable(b.text);
        return t ? gridHtml(t) : `<div class="bk-codewrap"><div class="bk-tablehead"><button type="button" class="bk-tbtn" data-tact="grid">Voltar para a grade</button></div><div class="bk-out bk-tableout note-body">${renderMarkdown(b.text)}</div><div class="bk-code" contenteditable="plaintext-only" spellcheck="false" data-ph="Tabela em Markdown">${escapeHtml(b.text)}</div></div>`;
      }
      case "raw":
        return `<div class="bk-codewrap"><div class="bk-code" contenteditable="plaintext-only" spellcheck="false">${escapeHtml(b.text)}</div></div>`;
      case "divider":
        return `<hr class="bk-hr">`;
      case "toc":
        return `<nav class="bk-toc" aria-label="Índice">${tocHtml()}</nav>`;
      case "canvasembed":
        return `<div class="bk-canvasembed"><div class="bk-cvwrap"><div class="bk-cv-bar">${icon("layers", 16)}<strong>${escapeHtml(stripBaseExt(b.src).replace(/\.canvas$/i, ""))}</strong><span class="bk-be-hint">canvas · visualização</span><span class="bk-cv-tools"><button type="button" class="bk-cv-btn" data-cvact="edit" aria-pressed="false">Editar</button><button type="button" class="bk-cv-btn" data-cvact="open">Abrir</button></span></div><div class="bk-canvas-host" data-canvas="${escapeHtml(b.src || "")}"></div></div></div>`;
      case "baseembed":
        return `<div class="bk-baseembed"><div class="bk-be-bar" title="Clique para selecionar o bloco">${icon("database", 16)}<strong>${escapeHtml(stripBaseExt(b.src))}</strong><span class="bk-be-hint">base de dados</span></div><div class="bk-be-host" data-base="${escapeHtml(b.src || "")}"></div></div>`;
      case "bookmark": {
        let host = b.src || "";
        try {
          host = new URL(b.src).hostname;
        } catch {
          /* mantém o texto */
        }
        return `<div class="bk-bookmark" data-url="${escapeHtml(b.src || "")}" title="Clique para selecionar; Ctrl+clique abre"><span class="bk-bm-ico">${icon("external-link", 18)}</span><span class="bk-bm-text"><strong>${escapeHtml(host)}</strong><small>${escapeHtml(b.src || "")}</small></span></div>`;
      }
      case "image":
        return `<figure class="bk-fig">${SAFE_SRC.test(b.src || "") ? `<img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.text)}" draggable="false">` : `<div class="bk-imgmiss">${icon("file", 18)}<span>Imagem não carregada: ${escapeHtml((b.src || "").slice(0, 80))}</span></div>`}<figcaption class="bk-text bk-cap" contenteditable="true" data-ph="Legenda">${escapeHtml(b.text)}</figcaption></figure>`;
      default:
        return textHtml(b);
    }
  }

  // Índice: os títulos (e títulos recolhíveis) da nota, recuados pelo nível; clicar leva até o título.
  function tocHtml() {
    const heads = flatten(ed.blocks).filter((b) => (b.type === "heading" || (b.type === "toggle" && b.level)) && (b.text || "").trim());
    if (!heads.length) return `<em>Sem títulos nesta nota.</em>`;
    const min = Math.min(...heads.map((b) => b.level));
    return heads.map((b) => `<button type="button" class="bk-toc-item" data-goto="${b.id}" style="padding-left:${(b.level - min) * 16 + 8}px">${escapeHtml(b.text.replace(/[*_`~=[\]]/g, ""))}</button>`).join("");
  }

  function refreshTocs() {
    for (const el of root.querySelectorAll(".bk-toc")) el.innerHTML = tocHtml();
  }

  function blockHtml(b, num) {
    if (b.type === "columns") {
      const act = (k, ic, label, cls = "") => `<button type="button" class="bk-tbtn ${cls}" data-cact="${k}" title="${label}" aria-label="${label}">${icon(ic, 16)}</button>`;
      const bar = `<div class="bk-colbar" role="toolbar" aria-label="Colunas">${act("add", "plus", "Adicionar uma coluna")}${act("remove", "x", "Tirar a última coluna")}<span class="bk-bar-sep"></span>${act("unwrap", "layers", "Desfazer as colunas")}${act("del", "trash", "Excluir as colunas", "danger")}</div>`;
      return `<div class="bk bk-columns${b.id === selectedId ? " bk-selected" : ""}" data-id="${b.id}" data-n="${b.children.length}">${bar}<div class="bk-cols">${b.children.map((c) => blockHtml(c)).join("")}</div></div>`;
    }
    if (b.type === "column") return `<div class="bk bk-column" data-id="${b.id}"><div class="bk-children">${listHtml(b.children)}</div></div>`;
    const cls = ["bk", `bk-${b.type}`];
    if (b.type === "heading") cls.push(`bk-h${b.level}`);
    if (b.type === "todo" && b.checked) cls.push("done");
    if (b.type === "toggle" && b.open) cls.push("open");
    if (b.type === "toggle" && b.level) cls.push(`bk-th${b.level}`);
    if (b.type === "callout") cls.push(`bk-co-${b.kind}`);
    if (b.id === selectedId) cls.push("bk-selected");
    const kids = b.children.length || b.type === "toggle" ? `<div class="bk-children"${b.type === "toggle" && !b.open ? " hidden" : ""}>${listHtml(b.children)}</div>` : "";
    return `<div class="${cls.join(" ")}" data-id="${b.id}"><div class="bk-row"><div class="bk-gutter"><button type="button" class="bk-btn bk-add" tabindex="-1" title="Adicionar um bloco abaixo" aria-label="Adicionar um bloco abaixo">${icon("plus", 16)}</button><button type="button" class="bk-btn bk-grip" tabindex="-1" title="Arraste para mover · clique para as ações" aria-label="Arrastar bloco">${icon("grip", 16)}</button></div><div class="bk-main">${mainHtml(b, num)}</div></div>${kids}</div>`;
  }

  function listHtml(blocks) {
    let num = 0;
    let prev = null;
    return blocks
      .map((b) => {
        num = b.type === "number" ? (prev === "number" ? num + 1 : 1) : 0;
        prev = b.type;
        return blockHtml(b, num);
      })
      .join("");
  }

  const stripBaseExt = (s) => String(s || "").replace(/\.base$/i, "");

  function mountEmbeds() {
    for (const h of embeds) h.destroy();
    embeds = [];
    for (const el of root.querySelectorAll(".bk-canvas-host")) {
      const handle = embedCanvas ? embedCanvas(el, el.dataset.canvas) : null;
      if (handle) embeds.push(handle);
      else el.innerHTML = `<p class="bk-be-missing">Canvas não encontrado: ${escapeHtml(el.dataset.canvas)}</p>`;
    }
    for (const el of root.querySelectorAll(".bk-be-host")) {
      const handle = embedBase ? embedBase(el, el.dataset.base) : null;
      if (handle) embeds.push(handle);
      else el.innerHTML = `<p class="bk-be-missing">Base não encontrada: ${escapeHtml(el.dataset.base)}</p>`;
    }
  }

  // Trechos comentados: cada discussão marca a primeira ocorrência do trecho num texto de bloco ou de célula.
  function applyMarks(scope) {
    if (!comments) return;
    const list = comments.list();
    if (!list.length) return;
    const els = scope.matches?.(".bk-text, .bk-cell") ? [scope] : [...scope.querySelectorAll(".bk-text:not(.bk-cap), .bk-cell")];
    for (const d of list) {
      if (!d.quote || els.some((e) => e.querySelector(`[data-cm="${d.id}"]`))) continue;
      for (const el of els) {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let found = false;
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          if (n.parentElement.closest(".bk-chip, .bk-cm")) continue;
          const i = n.nodeValue.indexOf(d.quote);
          if (i === -1) continue;
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + d.quote.length);
          const span = document.createElement("span");
          span.className = `bk-cm${d.resolved ? " resolved" : ""}`;
          span.dataset.cm = d.id;
          r.surroundContents(span);
          found = true;
          break;
        }
        if (found) break;
      }
    }
  }

  function refreshComments() {
    for (const sp of [...root.querySelectorAll(".bk-cm")]) {
      const parent = sp.parentNode;
      while (sp.firstChild) parent.insertBefore(sp.firstChild, sp);
      sp.remove();
      parent.normalize();
    }
    applyMarks(root);
  }

  function render(focus = null) {
    for (const h of embeds) h.destroy();
    embeds = [];
    root.innerHTML = `${listHtml(ed.blocks)}<div class="bk-tail" aria-hidden="true"></div>`;
    mountEmbeds();
    applyMarks(root);
    hideMenu();
    updateBar();
    if (focus) clearSelectedBlock();
    if (focus?.cell) focusCell(focus.id, focus.cell.r, focus.cell.c, focus.cell.offset ?? null);
    else if (focus) focusBlock(focus.id, focus.offset);
  }

  // --- Cursor e foco ---------------------------------------------------------------------------------------------------

  const blockEl = (id) => root.querySelector(`.bk[data-id="${CSS.escape(id)}"]`);
  const editableOf = (id) => blockEl(id)?.querySelector(":scope > .bk-row .bk-text, :scope > .bk-row .bk-code") || null;
  const idOf = (el) => el?.closest(".bk")?.dataset.id || null;
  const editables = () => [...root.querySelectorAll(EDITABLE)].filter((el) => !el.closest(".bk-children[hidden]"));
  const textOfEditable = (el) => (el.matches(".bk-code") ? codeText(el) : el.matches(".bk-cap") ? el.textContent : htmlToInline(el));

  function codeText(el) {
    return el.innerText.replace(/​/g, "").replace(/\n$/, "");
  }

  function caretOffset(el) {
    const sel = getSelection();
    if (!sel.rangeCount) return 0;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.endContainer)) return 0;
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.endContainer, r.endOffset);
    return pre.toString().length;
  }

  function placeCaret(el, offset) {
    el.focus({ preventScroll: false });
    const sel = getSelection();
    const range = document.createRange();
    const total = el.textContent.length;
    if (offset == null || offset >= total) {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let acc = 0;
      let placed = false;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const len = n.nodeValue.length;
        if (acc + len >= offset) {
          const chip = n.parentElement.closest(".bk-chip");
          if (chip) range.setStartAfter(chip);
          else range.setStart(n, offset - acc);
          placed = true;
          break;
        }
        acc += len;
      }
      if (!placed) {
        range.selectNodeContents(el);
        range.collapse(false);
      }
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function focusCell(id, r, c, offset = null) {
    const cell = blockEl(id)?.querySelector(`.bk-cell[data-r="${r}"][data-c="${c}"]`);
    if (!cell) return false;
    if (offset === "all") {
      // seleciona o texto da célula: quem digita troca o marcador "Coluna 1" em vez de emendar nele
      cell.focus();
      const range = document.createRange();
      range.selectNodeContents(cell);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    } else placeCaret(cell, offset);
    cell.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }

  function focusBlock(id, offset) {
    const el = editableOf(id);
    if (el) {
      placeCaret(el, offset);
      el.scrollIntoView({ block: "nearest" });
    } else if (blockEl(id)?.querySelector(".bk-cell")) {
      // bloco de tabela: volta para a célula onde o cursor estava (ou a primeira)
      const at = curCell && curCell.id === id ? curCell : { r: 0, c: 0 };
      if (!focusCell(id, at.r, at.c)) focusCell(id, 0, 0);
    } else if (blockEl(id)) selectBlock(id);
  }

  function selectBlock(id) {
    root.querySelector(".bk-selected")?.classList.remove("bk-selected");
    selectedId = id;
    blockEl(id)?.classList.add("bk-selected");
    getSelection().removeAllRanges();
    root.focus({ preventScroll: true });
  }

  function clearSelectedBlock() {
    selectedId = null;
    root.querySelector(".bk-selected")?.classList.remove("bk-selected");
  }

  function caretRect(el) {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const r = sel.getRangeAt(0).cloneRange();
    r.collapse(false);
    const rect = r.getClientRects()[0] || r.getBoundingClientRect();
    return rect && (rect.height || rect.width || rect.top) ? rect : null;
  }

  function onFirstLine(el) {
    const rect = caretRect(el);
    if (!rect) return true;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    return rect.top - el.getBoundingClientRect().top < lh * 0.9;
  }

  function onLastLine(el) {
    const rect = caretRect(el);
    if (!rect) return true;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 22;
    return el.getBoundingClientRect().bottom - rect.bottom < lh * 0.9;
  }

  const collapsed = () => {
    const s = getSelection();
    return s.rangeCount > 0 && s.isCollapsed;
  };

  // --- Ler o que foi digitado ------------------------------------------------------------------------------------------

  // Lê a grade inteira de volta para o Markdown da tabela (o alinhamento vem do que já estava gravado).
  function syncTable(cell) {
    const id = idOf(cell);
    const loc = id && ed.get(id);
    const tbl = cell.closest(".bk-grid");
    if (!loc || !tbl) return;
    const cur = parseTable(loc.block.text);
    const read = (c) => (c.innerHTML === "<br>" ? "" : htmlToInline(c));
    const header = [...tbl.tHead.rows[0].cells].map(read);
    const rows = [...tbl.tBodies[0].rows].map((tr) => [...tr.cells].map(read));
    ed.setCaret(id, 0);
    ed.setText(id, serializeTable({ header, align: cur?.align || header.map(() => ""), rows }));
  }

  function syncEl(el) {
    if (el.matches(".bk-cell")) return syncTable(el);
    const id = idOf(el);
    if (!id) return;
    if (el.innerHTML === "<br>") el.innerHTML = ""; // o navegador deixa um <br> quando se apaga tudo: o marcador de lugar precisa do vazio
    ed.setCaret(id, caretOffset(el));
    const text = textOfEditable(el);
    ed.setText(id, text);
    const block = blockEl(id);
    if (el.matches(".bk-code")) {
      const type = ed.get(id)?.block.type;
      if (type === "math") block.querySelector(".bk-mathout").innerHTML = renderMath(text, { display: true });
      if (type === "table") block.querySelector(".bk-tableout").innerHTML = renderMarkdown(text);
    }
  }

  // Texto (em Markdown) de um trecho do bloco: do começo até o cursor, ou do cursor até o fim.
  function sliceMd(el, which) {
    const sel = getSelection();
    const r = sel.getRangeAt(0);
    const part = document.createRange();
    part.selectNodeContents(el);
    if (which === "before") part.setEnd(r.startContainer, r.startOffset);
    else part.setStart(r.endContainer, r.endOffset);
    const box = document.createElement("div");
    box.appendChild(part.cloneContents());
    return el.matches(".bk-code") ? box.textContent : htmlToInline(box);
  }

  const plainBefore = (el) => {
    const sel = getSelection();
    if (!sel.rangeCount) return "";
    const r = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(r.startContainer, r.startOffset);
    return pre.toString().replace(/\u00a0/g, " "); // o navegador troca o espaço final por um espaço inseparável
  };

  // --- Menus ----------------------------------------------------------------------------------------------------------------

  function showMenu(kind, items, anchor, extra = {}) {
    if (!items.length) return hideMenu();
    menu = { kind, items, index: 0, ...extra };
    menuEl.innerHTML = items
      .map((it, i) => (it.sep ? `<div class="bk-menu-sep" role="separator"></div>` : `<button type="button" class="bk-menu-item${i === 0 ? " on" : ""}" role="option" data-i="${i}" tabindex="-1">${it.icon ? icon(it.icon, 16) : "<span class=\"bk-menu-gap\"></span>"}<span class="bk-menu-name">${escapeHtml(it.name)}</span>${it.hint ? `<small>${escapeHtml(it.hint)}</small>` : ""}</button>`))
      .join("");
    menu.index = Math.max(0, items.findIndex((it) => !it.sep));
    menuEl.querySelectorAll(".bk-menu-item").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === menu.index));
    menuEl.hidden = false;
    placeFloating(menuEl, anchor);
  }

  function hideMenu() {
    menu = null;
    menuEl.hidden = true;
  }

  function placeFloating(el, rect, above = false) {
    const hostBox = host.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = rect.left - hostBox.left;
    let top = (above ? rect.top - hostBox.top - h - 8 : rect.bottom - hostBox.top + 6);
    left = Math.max(8, Math.min(left, host.clientWidth - w - 8));
    if (!above && top + h > host.clientHeight - 8 && rect.top - hostBox.top - h - 8 > 0) top = rect.top - hostBox.top - h - 8;
    el.style.left = `${left}px`;
    el.style.top = `${top + host.scrollTop}px`;
  }

  function caretAnchor(el) {
    return caretRect(el) || el.getBoundingClientRect();
  }

  function moveMenu(dir) {
    const n = menu.items.length;
    let i = menu.index;
    do i = (i + dir + n) % n;
    while (menu.items[i].sep);
    menu.index = i;
    menuEl.querySelectorAll(".bk-menu-item").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
    menuEl.querySelector(".bk-menu-item.on")?.scrollIntoView({ block: "nearest" });
  }

  function runMenu(i = menu?.index) {
    const m = menu;
    const it = m?.items[i];
    if (!it || it.sep) return;
    hideMenu();
    it.run(m);
  }

  // Abre ou atualiza o menu "/" e o de [[notas]] conforme o texto antes do cursor.
  function updateMenus(el) {
    if (!el.matches(".bk-text") || el.matches(".bk-cap")) return hideMenu();
    const before = plainBefore(el).slice(-60);
    const wiki = /\[\[([^\]\n]*)$/.exec(before);
    if (wiki) {
      const q = fold(wiki[1]);
      const list = notes().filter((n) => fold(n.name).includes(q)).slice(0, 8);
      const items = list.map((n) => ({ name: n.name, hint: n.path.includes("/") ? n.path.replace(/\/[^/]*$/, "") : "", icon: "file-text", run: (m) => insertWikilink(m, n.name) }));
      if (wiki[1].trim() && !list.some((n) => fold(n.name) === q)) items.push({ name: `Criar “${wiki[1].trim()}”`, icon: "plus", run: (m) => insertWikilink(m, wiki[1].trim()) });
      showMenu("wiki", items, caretAnchor(el), { id: idOf(el), length: wiki[1].length + 2 });
      return;
    }
    const at = mentionAt(before);
    if (at) {
      const q = fold(at.query);
      const dates = dateSuggestions(at.query).map((d) => ({ name: d.name, hint: d.label, icon: "calendar", run: (m) => insertInline(m, dateMarkdown(d.iso)) }));
      const found = notes().filter((n) => !q || fold(n.name).includes(q)).slice(0, q ? 6 : 4);
      const items = [...dates, ...found.map((n) => ({ name: n.name, hint: "Nota", icon: "file-text", run: (m) => insertWikilink(m, n.name) }))];
      if (items.length) return void showMenu("mention", items, caretAnchor(el), { id: idOf(el), length: at.length });
    }
    const s = slashAt(before);
    if (s) {
      const items = filterSlash(s.query).map((it) => ({ name: it.name, hint: it.hint, icon: it.icon, run: (m) => runSlash(it, m) }));
      showMenu("slash", items, caretAnchor(el), { id: idOf(el), length: s.length });
      return;
    }
    hideMenu();
  }

  // Apaga `n` caracteres antes do cursor.
  function eraseBack(n) {
    const sel = getSelection();
    for (let i = 0; i < n; i++) sel.modify("extend", "backward", "character");
    document.execCommand("delete");
  }

  // Troca o `@consulta` (ou `[[consulta`) antes do cursor por uma peça em linha: link, data…
  function insertInline(m, md) {
    const el = editableOf(m.id);
    if (!el) return;
    el.focus();
    eraseBack(m.length);
    document.execCommand("insertHTML", false, `${inlineToHtml(md, ctx)}​`);
    syncEl(el);
  }

  const insertWikilink = (m, name) => insertInline(m, `[[${name}]]`);

  // Insere um bloco pronto (mídia, botão…) no lugar do bloco vazio onde o "/" foi digitado.
  function insertReady(id, block) {
    ed.setCaret(id, 0);
    const last = ed.insertBlocks(id, [block]);
    if (last) render({ id: last.id, offset: null });
  }

  // Endereços de mídia e de botão: pergunta (como o favorito) e só aceita http(s) para mídia.
  function askAddress(message, { note = false } = {}) {
    const v = window.prompt(message, note ? "" : "https://");
    const t = (v || "").trim();
    if (!t) return "";
    if (/^https?:\/\/\S+$/i.test(t)) return t;
    if (note && !/^[a-z][a-z0-9+.-]*:/i.test(t)) return t; // nome de nota
    toast("Use um endereço que comece com http:// ou https://.", "info");
    return "";
  }

  const nameFromUrl = (url) => {
    try {
      return decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || new URL(url).hostname);
    } catch {
      return url;
    }
  };

  // Edita o endereço e o rótulo de um botão, arquivo ou mídia.
  function editLinkBlock(id) {
    const b = ed.get(id)?.block;
    if (!b) return;
    const isButton = b.type === "button";
    let text = b.text;
    if (isButton || b.type === "file") {
      const v = window.prompt(isButton ? "Texto do botão" : "Nome do arquivo", b.text || "");
      if (v === null) return;
      text = v.trim() || b.text;
    }
    const src = askAddress(isButton ? "Endereço (https://…) ou nome de uma nota" : "Endereço (https://…)", { note: isButton });
    if (!src) return;
    ed.setProps(id, { src, text }, "editar");
    render({ id, offset: null });
  }

  // Menu para trocar o tipo de um destaque (o ícone da caixa).
  function calloutMenu(id, anchorEl) {
    const items = Object.keys(CALLOUT_NAMES).map((kind) => ({
      name: CALLOUT_NAMES[kind], icon: CALLOUT_ICON[kind] || "info",
      run: () => { ed.setProps(id, { kind }, "destaque"); render({ id, offset: null }); },
    }));
    showMenu("callout", items, anchorEl.getBoundingClientRect(), { id });
  }

  // Ações da barra das colunas.
  function columnAction(kind, id) {
    const loc = ed.get(id);
    if (!loc) return;
    const focus = (nid) => render(nid ? { id: nid, offset: 0 } : null);
    if (kind === "add") {
      const col = ed.addColumn(id);
      return focus(col?.children[0]?.id);
    }
    if (kind === "remove") {
      const last = loc.block.children[loc.block.children.length - 1];
      const target = loc.block.children[0].children[0]?.id;
      return void (ed.removeColumn(last.id) && focus(target));
    }
    if (kind === "unwrap") {
      const first = loc.block.children[0]?.children[0]?.id;
      return void (ed.unwrapColumns(id) && focus(first));
    }
    if (kind === "del") {
      const prev = prevVisible(id);
      ed.remove(id);
      return focus(prev && !isColumnType(prev.type) ? prev.id : null);
    }
  }

  function runSlash(item, m) {
    const el = editableOf(m.id);
    if (!el) return;
    el.focus();
    eraseBack(m.length);
    syncEl(el);
    if (item.action === "canvas") {
      if (!chooseCanvas) return;
      Promise.resolve(chooseCanvas()).then((name) => {
        if (name) insertReady(m.id, makeBlock("canvasembed", { src: name }));
      });
      return;
    }
    if (item.action === "image") {
      pickTarget = m.id;
      fileEl.value = "";
      fileEl.click();
      return;
    }
    if (item.action === "wikilink") return void document.execCommand("insertText", false, "[[");
    if (item.action === "database") {
      if (!chooseBase) return;
      Promise.resolve(chooseBase()).then((name) => {
        if (!name) return;
        const [bb] = parseBlocks(`![[${name}]]`);
        ed.setCaret(m.id, 0);
        const last = ed.insertBlocks(m.id, [bb]);
        if (last) render({ id: last.id, offset: null });
      });
      return;
    }
    if (item.action === "bookmark") {
      const url = window.prompt("Endereço do favorito (https://…)", "https://");
      if (!url || !/^https?:\/\/\S+$/i.test(url.trim())) return;
      const [bm] = parseBlocks(`<${url.trim()}>`);
      ed.setCaret(m.id, 0);
      const last = ed.insertBlocks(m.id, [bm]);
      return void (last && render({ id: last.id, offset: null }));
    }
    if (item.action === "date") return void insertInline({ id: m.id, length: 0 }, dateMarkdown(parseDateQuery("hoje").iso));
    if (item.action === "mention") return void document.execCommand("insertText", false, "@");
    if (item.action === "columns") {
      ed.setCaret(m.id, 0);
      const wrap = ed.wrapInColumns(m.id, item.count);
      return void (wrap && render({ id: wrap.children[0].children[0].id, offset: null }));
    }
    if (item.action === "media") {
      const url = askAddress(item.kind === "file" ? "Endereço do arquivo (https://…)" : `Endereço do ${item.kind === "video" ? "vídeo" : "áudio"} (https://…)`);
      if (!url) return;
      return insertReady(m.id, makeBlock(item.kind, { src: url, text: item.kind === "file" ? nameFromUrl(url) : "" }));
    }
    if (item.action === "button") {
      const label = (window.prompt("Texto do botão", "Abrir") || "").trim();
      if (!label) return;
      const dest = askAddress("Endereço (https://…) ou nome de uma nota", { note: true });
      if (!dest) return;
      return insertReady(m.id, makeBlock("button", { src: dest, text: label }));
    }
    convert(m.id, item.make);
  }

  // Troca o tipo do bloco (mantendo o texto) e põe o cursor no lugar certo.
  function convert(id, make) {
    const { type, props = {}, text } = make;
    ed.setCaret(id, 0);
    ed.setType(id, type, props, text);
    if (type === "divider") {
      const nb = ed.insertAfter(id, makeBlock("paragraph"));
      return render({ id: nb.id, offset: 0 });
    }
    if (type === "table") return render({ id, cell: { r: 0, c: 0, offset: "all" } });
    render({ id, offset: isRawType(type) && text ? 0 : null });
  }

  function blockMenu(id, anchor) {
    const loc = ed.get(id);
    if (!loc) return;
    showMenu("block", blockItems(id), anchor, { id });
  }

  function blockItems(id) {
    const b = ed.get(id)?.block;
    const editable = b && ["button", "file", "video", "audio"].includes(b.type);
    const nestedOk = b && !isColumnType(b.type) && (!ed.get(id).parent || canNest(ed.get(id).parent.type, "columns"));
    return [
      ...(editable ? [{ name: "Editar…", icon: "edit", run: () => editLinkBlock(id) }] : []),
      ...(nestedOk ? [{ name: "Dividir em colunas", icon: "columns", run: () => { const w = ed.wrapInColumns(id, 2); if (w) render({ id: w.children[1].children[0].id, offset: 0 }); } }] : []),
      { name: "Duplicar", icon: "copy", run: () => { const c = ed.duplicate(id); render(c ? { id: c.id, offset: null } : null); } },
      { name: "Excluir", icon: "trash", run: () => { const prev = prevVisible(id); ed.remove(id); render(prev ? { id: prev.id, offset: null } : null); } },
      { name: "Mover para cima", icon: "chevrons-up", run: () => { ed.move(id, -1); render(); selectBlock(id); } },
      { name: "Mover para baixo", icon: "chevron-down", run: () => { ed.move(id, 1); render(); selectBlock(id); } },
      { sep: true },
      ...SLASH_ITEMS.filter((it) => it.make && it.make.type !== "table" && !isColumnType(it.make.type)).map((it) => ({ name: `Virar ${it.name.toLowerCase()}`, icon: it.icon, run: () => convert(id, { ...it.make, text: undefined }) })),
    ];
  }

  // Botão direito: ações do que está sob o mouse (link, célula, texto selecionado) e do bloco.
  function onContextMenu(e) {
    if (e.target.closest?.(".bk-baseembed .bs")) return;
    const bk = e.target.closest?.(".bk");
    if (!bk || e.target.closest?.(".bk-lang, .bk-menu, .bk-bar")) return; // campos de texto simples mantêm o menu do navegador
    const id = bk.dataset.id;
    const sel = getSelection();
    const editableSel = sel.rangeCount && !sel.isCollapsed ? currentEl() : null;
    const saved = editableSel ? sel.getRangeAt(0).cloneRange() : null;
    const keep = (fn) => () => {
      if (saved) {
        sel.removeAllRanges();
        sel.addRange(saved);
      }
      fn();
    };
    const items = [];
    const wl = e.target.closest?.("a.wikilink");
    const link = e.target.closest?.("a.bk-a");
    if (wl) items.push({ label: "Abrir nota", icon: "file-text", run: () => followLink(wl.dataset.target) }, { label: "Copiar link", icon: "link", run: () => navigator.clipboard?.writeText(wl.dataset.md || `[[${wl.dataset.target}]]`) }, { sep: true });
    if (link) items.push({ label: "Abrir link em outra aba", icon: "external-link", run: () => window.open(link.getAttribute("href"), "_blank", "noopener") }, { label: "Copiar endereço", icon: "link", run: () => navigator.clipboard?.writeText(link.getAttribute("href")) }, { sep: true });
    if (editableSel && !editableSel.matches(".bk-code, .bk-cap")) {
      items.push(
        { label: "Negrito", icon: "bold", hint: "Ctrl+B", run: keep(() => format("bold")) },
        { label: "Itálico", icon: "italic", hint: "Ctrl+I", run: keep(() => format("italic")) },
        { label: "Riscado", icon: "minus", run: keep(() => format("strike")) },
        { label: "Código", icon: "code", hint: "Ctrl+E", run: keep(() => format("code")) },
        { label: "Destacar", icon: "pencil", run: keep(() => format("mark")) },
        { label: "Cor do texto", icon: "pencil", items: TEXT_COLORS.map(([name, val]) => ({ label: name, run: keep(() => applyColor("text", val)) })) },
        { label: "Cor de fundo", icon: "square", items: BG_COLORS.map(([name, val]) => ({ label: name, run: keep(() => applyColor("bg", val)) })) },
        { label: "Comentar", icon: "message", run: keep(() => format("comment")) },
        { label: "Link…", icon: "link", hint: "Ctrl+K", run: keep(() => format("link")) },
        { label: "Link para nota", icon: "file-text", run: keep(() => format("wiki")) },
        { sep: true },
      );
    }
    if (editableSel) items.push({ label: "Copiar", icon: "copy", run: keep(() => document.execCommand("copy")) }, { label: "Recortar", icon: "x", run: keep(() => document.execCommand("cut")) });
    const target = e.target.closest?.(EDITABLE + ", .bk-cell");
    if (target) {
      items.push({
        label: "Colar",
        icon: "clipboard-check",
        run: async () => {
          try {
            const text = await navigator.clipboard.readText();
            keep(() => document.execCommand("insertText", false, text))();
          } catch {
            toast("O navegador não deixou colar: use Ctrl+V.", "info");
          }
        },
      });
    }
    const cell = e.target.closest?.(".bk-cell");
    if (cell) {
      curCell = { id, r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
      const t = (k, label, ic, danger) => ({ label, icon: ic, danger, run: () => tableAction(k, id) });
      items.push({ sep: true }, t("row-above", "Inserir linha acima", "row-above"), t("row-below", "Inserir linha abaixo", "row-below"), t("col-left", "Inserir coluna à esquerda", "col-left"), t("col-right", "Inserir coluna à direita", "col-right"), t("del-row", "Apagar linha", "row-del"), t("del-col", "Apagar coluna", "col-del"), { label: "Alinhar", icon: "align-left", items: [t("align-left", "À esquerda", "align-left"), t("align-center", "Centralizar", "align-center"), t("align-right", "À direita", "align-right")] }, t("md", "Editar como Markdown", "code"), t("del-table", "Excluir a tabela", "trash", true));
    } else {
      const all = blockItems(id).map((it) => (it.sep ? it : { label: it.name, icon: it.icon, run: it.run, danger: it.name === "Excluir" }));
      const turn = all.filter((it) => it.label?.startsWith("Virar "));
      const plain = (editableOf(id)?.textContent || "").trim().slice(0, 120);
      if (comments && plain) all.unshift({ label: "Comentar o bloco", icon: "message", run: () => comments.add(plain) });
      items.push({ sep: true }, ...all.filter((it) => !it.label?.startsWith("Virar ") && !it.sep), { label: "Virar…", icon: "refresh", items: turn.map((it) => ({ ...it, label: it.label.slice(6).replace(/^./, (c) => c.toUpperCase()) })) });
    }
    openAtEvent(e, items);
  }

  // --- Blocos vizinhos ---------------------------------------------------------------------------------------------------

  function prevVisible(id) {
    const order = flatten(ed.blocks, { visibleOnly: true });
    const i = order.findIndex((b) => b.id === id);
    return i > 0 ? order[i - 1] : null;
  }

  function neighbor(el, dir) {
    const list = editables();
    const i = list.indexOf(el);
    return list[i + dir] || null;
  }

  // --- Formatação ----------------------------------------------------------------------------------------------------------

  function currentEl() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const n = sel.getRangeAt(0).startContainer;
    const el = (n.nodeType === 1 ? n : n.parentElement)?.closest(`${EDITABLE}, .bk-cell`);
    return el && root.contains(el) ? el : null;
  }

  function toggleWrap(tag, el) {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    let anc = range.commonAncestorContainer;
    anc = anc.nodeType === 1 ? anc : anc.parentElement;
    const existing = anc.closest(tag);
    if (existing && el.contains(existing)) {
      while (existing.firstChild) existing.parentNode.insertBefore(existing.firstChild, existing);
      existing.remove();
      return;
    }
    const w = document.createElement(tag);
    w.appendChild(range.extractContents());
    range.insertNode(w);
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(w);
    sel.addRange(r);
  }

  function format(kind) {
    const el = currentEl();
    if (!el || el.matches(".bk-code, .bk-cap")) return;
    if (kind === "comment") {
      const quote = getSelection().toString();
      if (quote.trim()) comments?.add(quote);
      return;
    }
    if (kind === "bold") document.execCommand("bold");
    else if (kind === "italic") document.execCommand("italic");
    else if (kind === "strike") document.execCommand("strikeThrough");
    else if (kind === "code") toggleWrap("code", el);
    else if (kind === "mark") toggleWrap("mark", el);
    else if (kind === "link") {
      const saved = getSelection().getRangeAt(0).cloneRange();
      const url = window.prompt("Endereço do link (https://…)", "https://");
      if (!url || !/^(https?:\/\/|mailto:)/i.test(url)) return;
      getSelection().removeAllRanges();
      getSelection().addRange(saved);
      document.execCommand("createLink", false, url);
    } else if (kind === "wiki") {
      const t = getSelection().toString();
      if (t) document.execCommand("insertHTML", false, `${inlineToHtml(`[[${t}]]`, ctx)}​`);
    }
    syncEl(el);
    updateBar();
  }

  // Cor do texto e do fundo: paleta ao lado da barra de formatação (e no botão direito).
  const TEXT_COLORS = [["Padrão", ""], ["Vermelho", "#e03131"], ["Laranja", "#e8590c"], ["Amarelo", "#f08c00"], ["Verde", "#2f9e44"], ["Azul", "#1971c2"], ["Roxo", "#7048e8"], ["Cinza", "#868e96"]];
  const BG_COLORS = [["Sem fundo", ""], ["Vermelho", "#ff878766"], ["Laranja", "#ffa94d66"], ["Amarelo", "#ffd43b66"], ["Verde", "#69db7c66"], ["Azul", "#74c0fc66"], ["Roxo", "#b197fc66"], ["Cinza", "#ced4da99"]];

  function colorsHtml() {
    const sw = (kind, [name, val]) => `<button type="button" class="bk-sw ${kind}${val ? "" : " none"}" data-clr="${kind}" data-val="${val}" title="${name}" aria-label="${name}" style="--c:${val || "transparent"}">${kind === "text" ? "A" : ""}</button>`;
    return `<div class="bk-clr-row"><span>Texto</span>${TEXT_COLORS.map((c) => sw("text", c)).join("")}</div><div class="bk-clr-row"><span>Fundo</span>${BG_COLORS.map((c) => sw("bg", c)).join("")}</div>`;
  }

  function toggleColors() {
    if (!colorsEl.hidden) {
      colorsEl.hidden = true;
      return;
    }
    colorsEl.innerHTML = colorsHtml();
    colorsEl.hidden = false;
    const r = barEl.getBoundingClientRect();
    placeFloating(colorsEl, { left: r.left, top: r.top, bottom: r.top }, true); // acima da barra, para não cobrir o texto selecionado
  }

  // Aplica (ou, com valor vazio, tira) a cor do texto ou do fundo na seleção.
  function applyColor(kind, value) {
    const el = currentEl();
    if (!el || el.matches(".bk-code, .bk-cap")) return;
    document.execCommand("styleWithCSS", false, true);
    if (value) document.execCommand(kind === "text" ? "foreColor" : "hiliteColor", false, value);
    else {
      const range = getSelection().getRangeAt(0);
      for (const sp of [...el.querySelectorAll("span[style]")]) {
        if (!range.intersectsNode(sp)) continue;
        if (kind === "text") sp.style.removeProperty("color");
        else {
          sp.style.removeProperty("background");
          sp.style.removeProperty("background-color");
        }
        if (!sp.getAttribute("style")?.trim()) {
          while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
          sp.remove();
        }
      }
    }
    syncEl(el);
  }

  function updateBar() {
    const sel = getSelection();
    const el = sel.rangeCount && !sel.isCollapsed ? currentEl() : null;
    if (!el || el.matches(".bk-code, .bk-cap") || destroyed) {
      barEl.hidden = true;
      colorsEl.hidden = true;
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.width && !rect.height) {
      barEl.hidden = true;
      return;
    }
    barEl.hidden = false;
    placeFloating(barEl, { left: rect.left + rect.width / 2 - barEl.offsetWidth / 2, top: rect.top, bottom: rect.bottom }, true);
  }

  // --- Seleção que atravessa blocos ----------------------------------------------------------------------------------

  function crossSelection() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const hit = editables().filter((el) => range.intersectsNode(el));
    if (hit.length < 2) return null;
    return { range, start: hit[0], end: hit[hit.length - 1] };
  }

  function deleteCross(c, typed, enter) {
    const { range, start, end } = c;
    const part = (el, from) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      if (from === "start") r.setEnd(range.startContainer, range.startOffset);
      else r.setStart(range.endContainer, range.endOffset);
      const box = document.createElement("div");
      box.appendChild(r.cloneContents());
      return box;
    };
    const mdOf = (el, box) => (el.matches(".bk-code") ? box.textContent : htmlToInline(box));
    const headBox = start.contains(range.startContainer) ? part(start, "start") : document.createElement("div");
    const tailBox = end.contains(range.endContainer) ? part(end, "end") : document.createElement("div");
    const a = idOf(start);
    const z = idOf(end);
    const offset = headBox.textContent.length;
    ed.setCaret(a, offset);
    ed.deleteBetween(a, mdOf(start, headBox), z, mdOf(end, tailBox));
    render({ id: a, offset });
    if (typed) document.execCommand("insertText", false, typed);
    else if (enter) splitAtCaret(editableOf(a));
  }

  // --- Teclado ---------------------------------------------------------------------------------------------------------------

  function undo() {
    const r = ed.undo();
    if (r) render(r.caret ? { id: r.caret.id, offset: r.caret.offset } : null);
  }

  function redo() {
    const r = ed.redo();
    if (r) render(r.caret ? { id: r.caret.id, offset: r.caret.offset } : null);
  }

  function splitAtCaret(el) {
    const id = idOf(el);
    const before = sliceMd(el, "before");
    const after = sliceMd(el, "after");
    const b = ed.get(id).block;
    const empty = before === "" && after === "";
    if (empty && b.type !== "paragraph" && hasText(b.type)) {
      // Enter num item vazio: sai da lista (ou vira parágrafo)
      if (LIST_TYPES.includes(b.type) && ed.get(id).parent) {
        ed.setCaret(id, 0);
        ed.outdent(id);
        return render({ id, offset: 0 });
      }
      ed.setCaret(id, 0);
      ed.setType(id, "paragraph");
      return render({ id, offset: 0 });
    }
    if (b.type === "paragraph" && after === "") {
      const sc = enterShortcutFor(before);
      if (sc) {
        ed.setCaret(id, 0);
        ed.setType(id, sc.type, sc.props || {}, "");
        if (sc.type === "divider") {
          const nb = ed.insertAfter(id, makeBlock("paragraph"));
          return render({ id: nb.id, offset: 0 });
        }
        return render({ id, offset: 0 });
      }
    }
    ed.setCaret(id, caretOffset(el));
    const nb = ed.split(id, before, after);
    if (nb) render({ id: nb.id, offset: 0 });
  }

  function onKeydown(e) {
    if (e.isComposing) return;
    if (menu) {
      if (e.key === "ArrowDown") return stop(e, () => moveMenu(1));
      if (e.key === "ArrowUp") return stop(e, () => moveMenu(-1));
      if (e.key === "Enter" || e.key === "Tab") return stop(e, () => runMenu());
      if (e.key === "Escape") return stop(e, hideMenu);
    }
    if (e.target.closest?.(".bk-baseembed .bs")) return; // dentro da base, quem trata é a própria base
    const cellEl = e.target.closest?.(".bk-cell");
    if (cellEl) return cellKey(e, cellEl);
    const el = e.target.closest?.(EDITABLE);
    if (!el) return rootKey(e);
    const id = idOf(el);
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;

    const cross = crossSelection();
    if (cross && !mod && (key === "Backspace" || key === "Delete" || key === "Enter" || (key.length === 1 && !e.altKey))) {
      return stop(e, () => deleteCross(cross, key.length === 1 ? key : null, key === "Enter"));
    }

    if (mod) {
      const k = key.toLowerCase();
      if (k === "z") return stop(e, () => (e.shiftKey ? redo() : undo()));
      if (k === "y") return stop(e, redo);
      if (k === "b" && !e.shiftKey) return stop(e, () => format("bold"));
      if (k === "i" && !e.shiftKey) return stop(e, () => format("italic"));
      if (k === "e" && !e.shiftKey) return stop(e, () => format("code"));
      if (k === "k" && !e.shiftKey) return stop(e, () => format("link"));
      if (k === "x" && e.shiftKey) return stop(e, () => format("strike"));
      if (k === "h" && e.shiftKey) return stop(e, () => format("mark"));
      if (key === "Enter") {
        const t = ed.get(id)?.block.type;
        if (t === "todo") return stop(e, () => { ed.toggleChecked(id); blockEl(id).classList.toggle("done"); blockEl(id).querySelector(".bk-check").checked = ed.get(id).block.checked; });
        if (t === "toggle") return stop(e, () => { ed.toggleOpen(id); render({ id, offset: caretOffset(el) }); });
        return;
      }
      if (e.shiftKey && (key === "ArrowUp" || key === "ArrowDown")) return stop(e, () => { if (ed.move(id, key === "ArrowUp" ? -1 : 1)) render({ id, offset: caretOffset(el) }); });
      if (k === "a" && !e.shiftKey) {
        const full = el.textContent.length > 0 && getSelection().toString().length >= el.textContent.length;
        if (full) return stop(e, () => { const r = document.createRange(); r.selectNodeContents(root); getSelection().removeAllRanges(); getSelection().addRange(r); });
      }
      return;
    }

    const isCode = el.matches(".bk-code");
    if (key === "Enter" && !e.shiftKey) {
      if (isCode) return; // dentro do código, Enter é só uma quebra de linha
      if (el.matches(".bk-cap")) return stop(e, () => { const nb = ed.insertAfter(id, makeBlock("paragraph")); render({ id: nb.id, offset: 0 }); });
      return stop(e, () => splitAtCaret(el));
    }
    if (key === "Enter" && e.shiftKey && !isCode) return stop(e, () => document.execCommand("insertLineBreak"));
    if (key === "Tab") {
      if (isCode) return stop(e, () => document.execCommand("insertText", false, e.shiftKey ? "" : "  "));
      return stop(e, () => {
        ed.setCaret(id, caretOffset(el));
        const ok = e.shiftKey ? ed.outdent(id) : ed.indent(id);
        if (ok) render({ id, offset: ed.caret?.offset ?? null });
      });
    }
    if (key === "Backspace" && collapsed() && caretOffset(el) === 0) {
      if (el.matches(".bk-cap")) return;
      const loc = ed.get(id);
      const b = loc.block;
      if (isCode) return stop(e, () => { if (b.text === "") { ed.setType(id, "paragraph"); render({ id, offset: 0 }); } });
      return stop(e, () => {
        ed.setCaret(id, 0);
        if (b.type !== "paragraph") {
          if (LIST_TYPES.includes(b.type) && loc.parent) ed.outdent(id);
          else ed.setType(id, "paragraph");
          return render({ id, offset: 0 });
        }
        const prev = prevVisible(id);
        const join = prev ? editableOf(prev.id)?.textContent.length ?? 0 : 0;
        const merged = ed.mergeBack(id, join);
        if (merged) render({ id: merged.id, offset: join });
        else if (prev && !hasText(prev.type) && !isColumnType(prev.type)) selectBlock(prev.id);
      });
    }
    if (key === "Delete" && collapsed() && caretOffset(el) === el.textContent.length && !isCode && !el.matches(".bk-cap")) {
      const join = el.textContent.length;
      const merged = ed.get(id) && ed.mergeForward(id, join);
      if (merged) return stop(e, () => render({ id, offset: join }));
    }
    if ((key === "ArrowUp" || key === "ArrowDown") && !e.shiftKey && !e.altKey && collapsed()) {
      const up = key === "ArrowUp";
      if (up ? onFirstLine(el) : onLastLine(el)) {
        const next = neighbor(el, up ? -1 : 1);
        if (next) return stop(e, () => placeCaret(next, up ? null : 0));
        const order = flatten(ed.blocks, { visibleOnly: true });
        const i = order.findIndex((b) => b.id === id);
        const adj = order[i + (up ? -1 : 1)];
        if (adj && !editableOf(adj.id) && !isColumnType(adj.type)) return stop(e, () => selectBlock(adj.id));
      }
    }
    if (key === "ArrowLeft" && !e.shiftKey && !e.altKey && collapsed() && caretOffset(el) === 0) {
      const prev = neighbor(el, -1);
      if (prev) return stop(e, () => placeCaret(prev, null));
    }
    if (key === "ArrowRight" && !e.shiftKey && !e.altKey && collapsed() && caretOffset(el) === el.textContent.length) {
      const next = neighbor(el, 1);
      if (next) return stop(e, () => placeCaret(next, 0));
    }
    if (key === "Escape") return stop(e, () => selectBlock(id));
  }

  // --- Tabelas ---------------------------------------------------------------------------------------------------------------

  function tableOp(id, fn, focus) {
    const loc = ed.get(id);
    const t = loc && parseTable(loc.block.text);
    if (!t) return;
    ed.setCaret(id, 0);
    ed.replaceText(id, serializeTable(fn(t)));
    render({ id, cell: focus || curCell || { r: 0, c: 0 } });
  }

  // Sai da tabela para o bloco de cima ou de baixo (no fim do documento, cria um parágrafo).
  function exitTable(id, dir) {
    const order = flatten(ed.blocks, { visibleOnly: true });
    const adj = order[order.findIndex((b) => b.id === id) + dir];
    if (!adj) {
      if (dir < 0) return;
      const nb = ed.insertAfter(id, makeBlock("paragraph"));
      return render({ id: nb.id, offset: 0 });
    }
    if (editableOf(adj.id)) focusBlock(adj.id, dir < 0 ? null : 0);
    else if (adj.type === "table" && blockEl(adj.id)?.querySelector(".bk-cell")) {
      const rows = blockEl(adj.id).querySelectorAll(".bk-grid tr").length;
      focusCell(adj.id, dir < 0 ? rows - 1 : 0, 0, dir < 0 ? null : 0);
    } else selectBlock(adj.id);
  }

  function cellKey(e, cell) {
    const id = idOf(cell);
    const r = Number(cell.dataset.r);
    const c = Number(cell.dataset.c);
    const tbl = cell.closest(".bk-grid");
    const rows = tbl.rows.length;
    const cols = tbl.rows[0].cells.length;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key;
    if (mod) {
      const k = key.toLowerCase();
      if (k === "z") return stop(e, () => (e.shiftKey ? redo() : undo()));
      if (k === "y") return stop(e, redo);
      if (k === "b" && !e.shiftKey) return stop(e, () => format("bold"));
      if (k === "i" && !e.shiftKey) return stop(e, () => format("italic"));
      if (k === "e" && !e.shiftKey) return stop(e, () => format("code"));
      if (k === "k" && !e.shiftKey) return stop(e, () => format("link"));
      if (k === "x" && e.shiftKey) return stop(e, () => format("strike"));
      if (k === "h" && e.shiftKey) return stop(e, () => format("mark"));
      return;
    }
    if (key === "Tab") {
      return stop(e, () => {
        let nr = r;
        let nc = c + (e.shiftKey ? -1 : 1);
        if (nc >= cols) { nc = 0; nr++; }
        if (nc < 0) { nc = cols - 1; nr--; }
        if (nr < 0) return exitTable(id, -1);
        if (nr >= rows) return tableOp(id, (t) => insertRow(t, t.rows.length), { r: rows, c: 0 });
        focusCell(id, nr, nc, e.shiftKey ? null : 0);
      });
    }
    if (key === "Enter") {
      return stop(e, () => {
        if (e.shiftKey) return void document.execCommand("insertLineBreak");
        if (r + 1 >= rows) tableOp(id, (t) => insertRow(t, t.rows.length), { r: rows, c });
        else focusCell(id, r + 1, c);
      });
    }
    if (key === "Escape") return stop(e, () => selectBlock(id));
    const plain = !e.shiftKey && !e.altKey && collapsed();
    if (plain && key === "ArrowUp" && onFirstLine(cell)) return stop(e, () => (r > 0 ? focusCell(id, r - 1, c) : exitTable(id, -1)));
    if (plain && key === "ArrowDown" && onLastLine(cell)) return stop(e, () => (r + 1 < rows ? focusCell(id, r + 1, c) : exitTable(id, 1)));
    if (plain && key === "ArrowLeft" && caretOffset(cell) === 0 && c > 0) return stop(e, () => focusCell(id, r, c - 1));
    if (plain && key === "ArrowRight" && caretOffset(cell) === cell.textContent.length && c + 1 < cols) return stop(e, () => focusCell(id, r, c + 1, 0));
  }

  // Colar numa célula: texto simples entra na célula; texto de planilha (tabulações e linhas) preenche várias células a partir dela.
  function pasteInCell(e, cell) {
    const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r\n?/g, "\n");
    if (!text) return;
    e.preventDefault();
    const flat = text.replace(/\n+$/, "");
    if (!flat.includes("\t") && !flat.includes("\n")) return void document.execCommand("insertText", false, flat);
    const id = idOf(cell);
    const r0 = Number(cell.dataset.r);
    const c0 = Number(cell.dataset.c);
    const grid = flat.split("\n").map((l) => l.split("\t"));
    tableOp(id, (t) => {
      let out = t;
      grid.forEach((line, i) => {
        while (r0 + i - 1 >= out.rows.length) out = insertRow(out, out.rows.length);
        line.forEach((v, j) => {
          while (c0 + j >= out.header.length) out = insertCol(out, out.header.length);
          out = setCell(out, r0 + i, c0 + j, v.trim());
        });
      });
      return out;
    }, { r: r0, c: c0 });
  }

  function tableAction(act, id) {
    const cur = curCell && curCell.id === id ? curCell : { id, r: 0, c: 0 };
    const { r, c } = cur;
    if (act === "md") {
      rawTables.add(id);
      return render({ id, offset: 0 });
    }
    if (act === "grid") {
      rawTables.delete(id);
      return render({ id, cell: { r: 0, c: 0 } });
    }
    if (act === "del-table") {
      const prev = prevVisible(id);
      ed.remove(id);
      return render(prev ? { id: prev.id, offset: null } : null);
    }
    if (act === "row-above") return tableOp(id, (t) => insertRow(t, Math.max(0, r - 1)), { r: Math.max(1, r), c });
    if (act === "row-below") return tableOp(id, (t) => insertRow(t, r), { r: r + 1, c });
    if (act === "col-left") return tableOp(id, (t) => insertCol(t, c), { r, c });
    if (act === "col-right") return tableOp(id, (t) => insertCol(t, c + 1), { r, c: c + 1 });
    if (act === "del-row") {
      if (r === 0) return toast("O cabeçalho não pode ser apagado.", "info");
      return tableOp(id, (t) => deleteRow(t, r - 1), { r: Math.max(0, r - 1), c });
    }
    if (act === "del-col") return tableOp(id, (t) => deleteCol(t, c), { r, c: Math.max(0, c - 1) });
    if (act.startsWith("align-")) return tableOp(id, (t) => setAlign(t, c, act.slice(6)), { r, c });
  }

  // Teclas com um bloco inteiro selecionado (depois de Esc, ou de clicar num divisor ou imagem).
  function rootKey(e) {
    if (!selectedId || e.target !== root) return;
    const mod = e.ctrlKey || e.metaKey;
    const order = flatten(ed.blocks, { visibleOnly: true });
    const i = order.findIndex((b) => b.id === selectedId);
    if (i === -1) return;
    const go = (j) => {
      const b = order[Math.max(0, Math.min(order.length - 1, j))];
      if (editableOf(b.id) && hasText(b.type)) {
        clearSelectedBlock();
        focusBlock(b.id, null);
      } else selectBlock(b.id);
    };
    if (e.key === "Delete" || e.key === "Backspace") return stop(e, () => { const prev = order[i - 1] || order[i + 1]; ed.remove(selectedId); clearSelectedBlock(); render(prev ? { id: prev.id, offset: null } : null); });
    if (e.key === "Enter") return stop(e, () => { const b = order[i]; if (editableOf(b.id)) { clearSelectedBlock(); focusBlock(b.id, null); } else { const nb = ed.insertAfter(b.id, makeBlock("paragraph")); clearSelectedBlock(); render({ id: nb.id, offset: 0 }); } });
    if (e.key === "ArrowUp") return stop(e, () => go(i - 1));
    if (e.key === "ArrowDown") return stop(e, () => go(i + 1));
    if (e.key === "Escape") return stop(e, clearSelectedBlock);
    if (mod && e.key.toLowerCase() === "d") return stop(e, () => { const c = ed.duplicate(selectedId); clearSelectedBlock(); render(c ? { id: c.id, offset: null } : null); });
    if (mod && e.key.toLowerCase() === "z") return stop(e, () => (e.shiftKey ? redo() : undo()));
    if (mod && e.key.toLowerCase() === "y") return stop(e, redo);
  }

  function stop(e, fn) {
    e.preventDefault();
    e.stopPropagation();
    fn();
  }

  // --- Entrada de texto e atalhos de Markdown -------------------------------------------------------------------

  function onInput(e) {
    const cellEl = e.target.closest?.(".bk-cell");
    if (cellEl) return void syncTable(cellEl);
    const el = e.target.closest?.(EDITABLE);
    if (el) {
      syncEl(el);
      if (e.inputType === "insertText" && e.data && e.data.includes(" ") && !el.matches(".bk-code, .bk-cap")) tryShortcut(el, e.data);
      updateMenus(el);
      return;
    }
    const lang = e.target.closest?.(".bk-lang");
    if (lang) ed.setProps(idOf(lang), { lang: lang.value }, "linguagem");
  }

  // Atalhos de Markdown: o prefixo (`##`, `-`, `1.`, `[]`, `>`) seguido de espaço vira o tipo de bloco. Vale ao digitar o
  // espaço e também quando um texto inteiro com prefixo entra de uma vez num bloco vazio.
  function tryShortcut(el, data) {
    const id = idOf(el);
    const b = ed.get(id)?.block;
    if (!b || (b.type !== "paragraph" && b.type !== "bullet")) return;
    let prefix;
    let after;
    if (data === " ") {
      const before = plainBefore(el);
      if (!before.endsWith(" ")) return;
      prefix = before.slice(0, -1);
      after = sliceMd(el, "after");
    } else {
      const full = el.textContent.replace(/\u00a0/g, " ");
      if (full !== data.replace(/\u00a0/g, " ")) return; // só quando o bloco estava vazio
      const m = /^(\S+) ([\s\S]*)$/.exec(full);
      if (!m) return;
      prefix = m[1];
      after = m[2];
    }
    const sc = shortcutFor(prefix);
    if (!sc || (b.type === "bullet" && sc.type !== "todo")) return;
    ed.setCaret(id, 0);
    ed.setType(id, sc.type, sc.props || {}, after);
    render({ id, offset: data === " " ? 0 : null });
  }

  function onBeforeInput(e) {
    if (e.inputType === "historyUndo") return stop(e, undo);
    if (e.inputType === "historyRedo") return stop(e, redo);
  }

  // --- Colar, copiar e imagens -----------------------------------------------------------------------------------------

  async function addImages(files, afterId) {
    let target = afterId;
    let last = null;
    for (const f of files) {
      try {
        const img = await readImage(f);
        const [block] = parseBlocks(`![${(f.name || "").replace(/\.[^.]+$/, "")}](${img.src})`);
        last = ed.insertBlocks(target, [block]);
        target = last.id;
      } catch (err) {
        toast(`${f.name || "Imagem"}: ${err.message}`, "error");
      }
    }
    if (last) render({ id: last.id, offset: null });
  }

  function onPaste(e) {
    const cellEl = e.target.closest?.(".bk-cell");
    if (cellEl) return pasteInCell(e, cellEl);
    const el = e.target.closest?.(EDITABLE);
    if (!el) return;
    const files = [...(e.clipboardData?.files || [])].filter(isImageFile);
    if (files.length) {
      e.preventDefault();
      return void addImages(files, idOf(el));
    }
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    e.preventDefault();
    const isCode = el.matches(".bk-code");
    if (isCode) return void document.execCommand("insertText", false, text);
    const flat = text.replace(/\r\n?/g, "\n").trim();
    const sheet = tableFromTsv(flat);
    if (sheet) {
      const id = idOf(el);
      const [tb] = parseBlocks(serializeTable(sheet));
      ed.setCaret(id, 0);
      const last = ed.insertBlocks(id, [tb]);
      return void (last && render({ id: last.id, cell: { r: 0, c: 0 } }));
    }
    if (!flat.includes("\n")) {
      const sel = getSelection();
      if (!sel.isCollapsed && /^https?:\/\/\S+$/.test(flat) && !el.matches(".bk-cap")) document.execCommand("createLink", false, flat);
      else document.execCommand("insertText", false, flat);
      return;
    }
    const blocks = parseBlocks(flat);
    if (!blocks.length) return;
    const id = idOf(el);
    ed.setCaret(id, 0);
    const last = ed.insertBlocks(id, blocks);
    if (last) render({ id: last.id, offset: null });
  }

  function onCut(e) {
    const cross = crossSelection();
    if (cross) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", getSelection().toString());
      deleteCross(cross, null, false);
    }
  }

  // --- Mouse ----------------------------------------------------------------------------------------------------------------

  function onClick(e) {
    const t = e.target;
    const cvact = t.closest?.("[data-cvact]");
    if (cvact) {
      const wrap = cvact.closest(".bk-cvwrap");
      if (cvact.dataset.cvact === "open") return openCanvas?.(wrap.querySelector(".bk-canvas-host").dataset.canvas);
      const on = wrap.classList.toggle("editing");
      cvact.setAttribute("aria-pressed", String(on));
      cvact.textContent = on ? "Pronto" : "Editar";
      return;
    }
    const cmk = t.closest?.(".bk-cm");
    if (cmk && comments) comments.open(cmk.dataset.cm);
    const go = t.closest?.("[data-goto]");
    if (go) {
      const b = blockEl(go.dataset.goto);
      b?.scrollIntoView({ block: "center", behavior: "smooth" });
      return focusBlock(go.dataset.goto, null);
    }
    if (t.closest?.(".bk-be-bar")) return selectBlock(idOf(t));
    const bm = t.closest?.(".bk-bookmark");
    if (bm) {
      if (e.ctrlKey || e.metaKey) return void window.open(bm.dataset.url, "_blank", "noopener");
      return selectBlock(idOf(bm));
    }
    const tact = t.closest?.("[data-tact]");
    if (tact) return tableAction(tact.dataset.tact, idOf(tact));
    const cact = t.closest?.("[data-cact]");
    if (cact) return columnAction(cact.dataset.cact, idOf(cact));
    const coIco = t.closest?.(".bk-co-ico");
    if (coIco) return calloutMenu(idOf(coIco), coIco);
    const btn = t.closest?.(".bk-btnact");
    if (btn) {
      const dest = btn.dataset.url || "";
      if (/^https?:\/\//i.test(dest)) window.open(dest, "_blank", "noopener");
      else if (dest) followLink(dest);
      return;
    }
    if (t.closest?.(".bk-btnwrap")) return selectBlock(idOf(t));
    if (t.closest?.(".bk-addrow")) {
      const id = idOf(t);
      const rows = blockEl(id).querySelectorAll(".bk-grid tr").length;
      return tableOp(id, (tb) => insertRow(tb, tb.rows.length), { r: rows, c: 0 });
    }
    if (t.closest?.(".bk-addcol")) {
      const id = idOf(t);
      const cols = blockEl(id).querySelectorAll(".bk-grid tr:first-child th").length;
      return tableOp(id, (tb) => insertCol(tb, tb.header.length), { r: 0, c: cols });
    }
    const wl = t.closest?.("a.wikilink");
    if (wl) {
      e.preventDefault();
      return followLink(wl.dataset.target);
    }
    const a = t.closest?.("a.bk-a");
    if (a) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) window.open(a.getAttribute("href"), "_blank", "noopener");
      return;
    }
    const tag = t.closest?.(".tag");
    if (tag && onTag && (e.ctrlKey || e.metaKey)) return onTag(tag.dataset.tag);
    const fold_ = t.closest?.(".bk-fold");
    if (fold_) {
      const id = idOf(fold_);
      ed.toggleOpen(id);
      const b = blockEl(id);
      const open = ed.get(id).block.open;
      b.classList.toggle("open", open);
      b.querySelector(":scope > .bk-children").hidden = !open;
      fold_.setAttribute("aria-expanded", String(open));
      return;
    }
    const add = t.closest?.(".bk-add");
    if (add) {
      const nb = ed.insertAfter(idOf(add), makeBlock("paragraph"));
      render({ id: nb.id, offset: 0 });
      return void document.execCommand("insertText", false, "/");
    }
    const check = t.closest?.(".bk-check");
    if (check) {
      const id = idOf(check);
      ed.toggleChecked(id);
      blockEl(id).classList.toggle("done", ed.get(id).block.checked);
      return;
    }
    if (t.closest?.(".bk-hr, .bk-fig img, .bk-imgmiss")) return selectBlock(idOf(t));
    if (t.closest?.(".bk-tail") || t === root) {
      const last = ed.blocks[ed.blocks.length - 1];
      if (hasText(last.type) && last.text === "" && editableOf(last.id)) return focusBlock(last.id, null);
      const nb = ed.insertAfter(last.id, makeBlock("paragraph"));
      render({ id: nb.id, offset: 0 });
    }
  }

  function onPointerDown(e) {
    const menuItem = e.target.closest?.(".bk-menu-item");
    if (menuItem) return; // o clique é tratado no click, sem tirar o foco do texto
    const grip = e.target.closest?.(".bk-grip");
    if (grip && e.button === 0) {
      e.preventDefault();
      drag = { id: idOf(grip), x: e.clientX, y: e.clientY, moved: false, target: null, where: null, grip };
      try { grip.setPointerCapture(e.pointerId); } catch { /* sem ponteiro ativo (evento simulado): segue sem captura */ }
    } else if (!e.target.closest?.(".bk-menu, .bk-bar")) {
      if (menu?.kind === "block") hideMenu();
      if (selectedId && !e.target.closest?.(".bk-hr, .bk-fig")) clearSelectedBlock();
    }
  }

  function dropTarget(e, d = drag) {
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".bk:not(.bk-column)");
    if (!under || d.id === under.dataset.id || blockEl(d.id).contains(under)) return null;
    const row = (under.querySelector(":scope > .bk-row") || under).getBoundingClientRect();
    const b = ed.get(under.dataset.id)?.block;
    const mineType = ed.get(d.id)?.block.type;
    let where = e.clientY < row.top + row.height / 2 ? "before" : "after";
    if (where === "after" && b && canHaveChildren(b.type) && canNest(b.type, mineType) && e.clientX > row.left + 70) where = "inside";
    return { el: under, id: under.dataset.id, where, row };
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.moved = true;
    blockEl(drag.id)?.classList.add("bk-dragging");
    root.classList.add("bk-sorting");
    const t = dropTarget(e);
    drag.target = t?.id || null;
    drag.where = t?.where || null;
    let line = root.querySelector(".bk-dropline");
    if (!t) return void line?.remove();
    if (!line) {
      line = document.createElement("div");
      line.className = "bk-dropline";
      root.appendChild(line);
    }
    const base = root.getBoundingClientRect();
    const whole = t.el.getBoundingClientRect();
    const y = t.where === "before" ? t.row.top : t.where === "after" ? whole.bottom : t.row.bottom;
    line.style.top = `${y - base.top + root.scrollTop}px`;
    line.style.left = `${(t.where === "inside" ? t.row.left + 40 : t.row.left) - base.left}px`;
    line.style.width = `${t.row.width - (t.where === "inside" ? 40 : 0)}px`;
  }

  function onPointerUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    // o último movimento pode não ter sido entregue: usa a posição do próprio soltar
    if (!d.moved && e.type === "pointerup" && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 5) {
      d.moved = true;
      const t = dropTarget(e, d);
      d.target = t?.id || null;
      d.where = t?.where || null;
    }
    root.classList.remove("bk-sorting");
    root.querySelector(".bk-dropline")?.remove();
    blockEl(d.id)?.classList.remove("bk-dragging");
    if (!d.moved) {
      const r = d.grip.getBoundingClientRect();
      return blockMenu(d.id, { left: r.left, top: r.top, bottom: r.bottom });
    }
    if (d.target && ed.moveRelative(d.id, d.target, d.where)) render({ id: d.id, offset: null });
  }

  function onMenuClick(e) {
    const item = e.target.closest(".bk-menu-item");
    if (item) runMenu(Number(item.dataset.i));
  }

  function onBarMouseDown(e) {
    const b = e.target.closest("[data-fmt]");
    const c = e.target.closest("[data-clr]");
    e.preventDefault(); // não perde a seleção do texto
    if (c) return applyColor(c.dataset.clr, c.dataset.val);
    if (b?.dataset.fmt === "color") return toggleColors();
    if (b) format(b.dataset.fmt);
  }

  // Imagens soltas no editor entram depois do bloco sob o cursor do mouse.
  function onDragOver(e) {
    if ([...(e.dataTransfer?.types || [])].includes("Files")) {
      e.preventDefault();
      root.classList.add("bk-dropping");
    }
  }

  function onDrop(e) {
    root.classList.remove("bk-dropping");
    const files = [...(e.dataTransfer?.files || [])].filter(isImageFile);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".bk");
    addImages(files, under?.dataset.id || ed.blocks[ed.blocks.length - 1].id);
  }

  function onFileChange() {
    const files = [...fileEl.files].filter(isImageFile);
    const id = pickTarget || ed.blocks[ed.blocks.length - 1].id;
    pickTarget = null;
    if (files.length) addImages(files, id);
  }

  function onSelectionChange() {
    if (!root.isConnected) return;
    updateBar();
  }

  function onFocusOut(e) {
    const cellEl = e.target.closest?.(".bk-cell");
    if (cellEl && cellEl.isConnected && !destroyed) {
      // ao sair da célula, volta a desenhar o texto (negrito, links, tags) a partir do que está gravado
      const id = idOf(cellEl);
      const t = id && ed.get(id) && parseTable(ed.get(id).block.text);
      const r = Number(cellEl.dataset.r);
      const c = Number(cellEl.dataset.c);
      const text = t ? (r === 0 ? t.header[c] : t.rows[r - 1]?.[c]) : null;
      if (text !== null && text !== undefined) cellEl.innerHTML = inlineToHtml(text, ctx);
      return;
    }
    const el = e.target.closest?.(".bk-text:not(.bk-cap)");
    if (!el || !root.contains(el) || destroyed) return;
    // ao sair do bloco, volta a desenhar o texto (links e tags viram peças) sem mexer no cursor
    if (!el.isConnected) return;
    const id = idOf(el);
    const b = id && ed.get(id)?.block;
    if (!b) return;
    if (document.activeElement?.closest?.(".bk-menu")) return;
    el.innerHTML = inlineToHtml(b.text, ctx);
    applyMarks(el);
    if (b.type === "heading" || b.type === "toggle") refreshTocs();
  }

  // --- Comentário rápido na margem: um balão ao lado do bloco sob o ponteiro, que abre o campo ali mesmo ---------------

  const blockQuote = (id) => (editableOf(id)?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120);

  function hideCmBtn() {
    cmHover = null;
    cmBtn.hidden = true;
  }

  function closeCmBox() {
    cmTarget = null;
    cmBox.hidden = true;
    cmInput.value = "";
    cmSend.disabled = true;
    hideCmBtn();
  }

  function showCmBtn(id) {
    if (!comments || cmTarget || !id || !blockQuote(id)) return hideCmBtn();
    cmHover = id;
    const row = blockEl(id).querySelector(":scope > .bk-row") || blockEl(id);
    const hb = host.getBoundingClientRect();
    cmBtn.hidden = false;
    cmBtn.style.left = `${host.clientWidth - cmBtn.offsetWidth - 14}px`;
    cmBtn.style.top = `${row.getBoundingClientRect().top - hb.top + host.scrollTop + 2}px`;
  }

  function openCmBox() {
    const id = cmHover;
    const quote = id && blockQuote(id);
    if (!quote) return;
    cmTarget = { id, quote };
    cmBtn.hidden = true;
    cmBox.hidden = false;
    cmBox.style.left = `${Math.max(8, host.clientWidth - cmBox.offsetWidth - 14)}px`;
    cmBox.style.top = cmBtn.style.top;
    cmInput.focus();
  }

  root.addEventListener("pointermove", (e) => {
    if (drag || cmTarget) return;
    const id = idOf(e.target);
    if (id !== cmHover) showCmBtn(id);
  });
  root.addEventListener("pointerleave", (e) => {
    if (!cmTarget && !cmBtn.contains(e.relatedTarget)) hideCmBtn();
  });
  cmBtn.addEventListener("pointerdown", (e) => e.preventDefault());
  cmBtn.addEventListener("click", openCmBox);
  cmInput.addEventListener("input", () => { cmSend.disabled = !cmInput.value.trim(); });
  cmInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCmBox(); }
  });
  cmBox.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = cmInput.value.trim();
    if (!text || !cmTarget) return;
    const { quote } = cmTarget;
    closeCmBox();
    comments?.add(quote, text);
  });
  const onDocPointerDown = (e) => {
    if (cmTarget && !cmBox.contains(e.target)) closeCmBox();
  };
  document.addEventListener("pointerdown", onDocPointerDown, true);

  root.addEventListener("keydown", onKeydown);
  root.addEventListener("input", onInput);
  root.addEventListener("beforeinput", onBeforeInput);
  root.addEventListener("paste", onPaste);
  root.addEventListener("cut", onCut);
  root.addEventListener("click", onClick);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("dragleave", () => root.classList.remove("bk-dropping"));
  root.addEventListener("drop", onDrop);
  root.addEventListener("focusout", onFocusOut);
  root.addEventListener("contextmenu", onContextMenu);
  root.addEventListener("focusin", (e) => {
    const cell = e.target.closest?.(".bk-cell");
    if (cell) curCell = { id: idOf(cell), r: Number(cell.dataset.r), c: Number(cell.dataset.c) };
  });
  root.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".bk-tablebar, .bk-addrow, .bk-addcol")) e.preventDefault(); // não tira o cursor da célula
  });
  root.addEventListener("change", (e) => {
    if (e.target.matches?.(".bk-lang")) ed.setProps(idOf(e.target), { lang: e.target.value }, "linguagem");
  });
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointercancel", onPointerUp);
  menuEl.addEventListener("pointerdown", (e) => e.preventDefault());
  menuEl.addEventListener("click", onMenuClick);
  barEl.addEventListener("mousedown", onBarMouseDown);
  colorsEl.addEventListener("mousedown", onBarMouseDown);
  fileEl.addEventListener("change", onFileChange);
  document.addEventListener("selectionchange", onSelectionChange);
  host.addEventListener("scroll", () => { barEl.hidden = true; if (!cmTarget) hideCmBtn(); }, { passive: true });

  render();

  return {
    editor: ed,
    markdown: () => ed.markdown(),
    // Texto novo vindo de fora (a nota mudou em outro lugar). O que o próprio editor acabou de gravar é ignorado.
    setMarkdown(md) {
      if (md === lastEmitted || md === source) return;
      source = md;
      ed.load(md);
      render();
    },
    flush: emitNow,
    refreshComments,
    focus() {
      const first = editables()[0];
      if (first) placeCaret(first, null);
    },
    stats: () => ed.stats(),
    destroy() {
      emitNow();
      destroyed = true;
      headerHandle?.destroy?.();
      for (const h of embeds) h.destroy();
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      clearTimeout(emitTimer);
      host.innerHTML = "";
    },
  };
}
