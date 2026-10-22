// Aplicação: liga a biblioteca, o índice, os plugins e as telas à interface.

import { Vault, baseName, extOf, stripExt, normalizePath } from "./vault.js";
import { MetadataIndex } from "./index.js";
import { renderMarkdown, renderInline, parseFrontmatter, escapeHtml, parseLinkTarget, extractMetadata, diagnoseFrontmatter } from "./markdown.js";
import { importFiles } from "./external.js";
import { highlightMarkdown } from "./highlight.js";
import { findAll, nextMatch, replaceOne, replaceAll } from "./find.js";
import { parsePluginFile, scanRisks, sanitizeImported, addImported, removeImported, hostManifest } from "./pluginimport.js";
import { PERMISSOES } from "./plugins.js";
import { captureLayout, sanitizeLayouts, saveLayout, deleteLayout, resolveLayout } from "./layouts.js";
import { trashAdd, trashRestore, trashRemove, trashPurge, sanitizeTrash, snapshotAdd, snapshotRename, snapshotRemove, sanitizeSnapshots, diffSummary } from "./trash.js";
import { NavHistory, ClosedTabs, cycleTab, gotoTab, togglePin, orderTabs, adjacentDaily } from "./nav.js";
import { addAlias, addProperty, clearProperties, propertyKeys } from "./frontmatter.js";
import { EDITOR_COMMANDS } from "./commands.js";
import { onEnter, onChar, onBackspace, indentLines } from "./editing.js";
import { mountSplitView } from "./splitview.js";
import { splitOpen, splitDelete, splitRename, splitDropMissing, splitClose, splitCloseTab, splitSwap, splitToggleEdit } from "./splitstate.js";
import { commandId, validateCmdKey, findCmdKey, sanitizeCmdKeys, setCmdKey, clearCmdKey } from "./cmdkeys.js";
import { GLOBAL_COMMANDS, effectiveHotkeys, findCommand, keysOf, validateCombo, sanitizeOverrides } from "./hotkeys.js";
import { CORE_FEATURES, isFeatureOn, setFeature, featureOfView, featureOfPath, sanitizeCoreOff } from "./core.js";
import {
  findLinkContext, applySuggestion, suggestNotes, suggestHeadings, linkTargetExists,
  findUnlinkedMentions, linkFirstMention, mentionTitles, linkNameFor,
} from "./wikilinks.js";
import { storage } from "./storage.js";
import { GraphView } from "./graph.js";
import { PluginHost } from "./plugins.js";
import { sampleVault } from "./sample.js";
import { SnippetStore, setSnippetStyle, lintCss, hasErrors } from "./snippets.js";
import { icon, hydrateIcons, registerIcons, hasIcon } from "./icons.js";
import { setIconFor, removeIconFor, renameIcons } from "./iconmap.js";
import { openIconPicker } from "./iconpicker.js";
import { mountCanvas } from "./canvasview.js";
import { mountBlocks } from "./blocksview.js";
import { mountBase } from "./basesview.js";
import { mountNoteProps } from "./noteprops.js";
import { sanitizeComments, forNote as commentsOf, addDiscussion, addReply, setResolved, removeDiscussion, removeComment, renamePath as renameCommentsPath, AUTHOR as COMMENT_AUTHOR } from "./comments.js";
import { showContextMenu, openAtEvent } from "./contextmenu.js";
import { serializeBase, parseBase, collectRows, BASE_TEMPLATES, templateBase } from "./bases.js";
import { wikiHomeText, wikiPageText, wikiIndexBase, isWikiHome, WIKI_HOME } from "./wiki.js";
import { toDBML, toSQL, toAgentSchema, validateDiagram, readAgentSchema, applySchema } from "./dbdiagram.js";
import { serializeCanvas, emptyCanvas, parseCanvas } from "./canvas.js";
import { renderHome, renderTasks, renderCollection, renderTags, renderGraph, renderShortcuts, renderSettings, renderTrash, relativeTime } from "./views.js";
import { setCover, removeCover, renameCovers, folderName } from "./collections.js";
import { planMove, parentOf, nameOf } from "./treeops.js";
import { isSupported, pickFolder, readFolder, hasPermission, ensurePermission, diskHandles, DiskSync } from "./disk.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const els = {
  app: $("#app"),
  tree: $("#tree"),
  results: $("#results"),
  search: $("#search"),
  tabs: $("#tabs"),
  notePane: $("#note-pane"),
  page: $("#page"),
  editor: $("#editor"),
  editorWrap: $("#editor-wrap"),
  editorHl: $("#editor-hl"),
  editorFind: $("#editor-find"),
  findBar: $("#find-bar"),
  preview: $("#preview"),
  blocks: $("#blocks"),
  view: $("#view"),
  crumbs: $("#crumbs"),
  formatBar: $("#format-bar"),
  vaultName: $("#vault-name"),
  ctxScroll: $("#ctx-scroll"),
  diskPill: $("#disk-pill"),
  diskLabel: $("#disk-label"),
  saveState: $("#save-state"),
  statusNote: $("#status-note"),
  statusVault: $("#status-vault"),
  palette: $("#palette"),
  paletteInput: $("#palette-input"),
  paletteList: $("#palette-list"),
  dialog: $("#dialog"),
  dialogTitle: $("#dialog-title"),
  dialogBody: $("#dialog-body"),
  toast: $("#toast"),
  importFile: $("#import-file"),
  ribbonPlugins: $("#ribbon-plugins"),
  badgeTasks: $("#badge-tasks"),
  btnTheme: $("#btn-theme"),
  btnCtx: $("#btn-ctx"),
  suggest: $("#suggest"),
  importCss: $("#import-css"),
};

const VIEWS = {
  "@home": { title: "Início", icon: "home" },
  "@graph": { title: "Grafo", icon: "graph" },
  "@tasks": { title: "Tarefas", icon: "check-square" },
  "@tags": { title: "Tags", icon: "tag" },
  "@settings": { title: "Configurações", icon: "sliders" },
  "@shortcuts": { title: "Atalhos", icon: "keyboard" },
  "@trash": { title: "Lixeira", icon: "trash" },
};

const SHORTCUTS = [
  { group: "Geral", keys: ["Esc"], label: "Fechar paleta, caixas e painéis" },
  { group: "Notas", keys: ["Alt", "clique"], label: "Abrir uma nota da barra lateral ao lado" },
  { group: "Editor", keys: ["Ctrl", "B"], label: "Negrito" },
  { group: "Editor", keys: ["Ctrl", "I"], label: "Itálico" },
  { group: "Editor", keys: ["Tab"], label: "Indentar com dois espaços" },
  { group: "Links", keys: ["[["], label: "Sugerir notas ao digitar um link" },
  { group: "Links", keys: ["[[nota#"], label: "Sugerir seções da nota" },
  { group: "Links", keys: ["↑", "↓"], label: "Escolher a sugestão" },
  { group: "Links", keys: ["Enter"], label: "Aceitar a sugestão (Tab também)" },
];

// Atalhos globais (trocáveis, em hotkeys.js) junto com os fixos, na ordem em que aparecem na tela de atalhos.
function shortcutList() {
  const eff = effectiveHotkeys(state.settings.hotkeys);
  const globals = GLOBAL_COMMANDS.map((c) => ({ id: c.id, group: c.group, label: c.label, keys: keysOf(eff[c.id]), changed: eff[c.id] !== c.combo }));
  const fixed = (group) => SHORTCUTS.filter((x) => x.group === group);
  const groups = ["Geral", "Notas", "Navegação"];
  return [
    ...groups.flatMap((g) => [...globals.filter((x) => x.group === g), ...fixed(g)]),
    ...SHORTCUTS.filter((x) => !groups.includes(x.group)),
  ];
}

const hotkeysNow = () => effectiveHotkeys(state.settings.hotkeys);

function setHotkey(id, combo) {
  const check = validateCombo(combo, id, hotkeysNow());
  if (!check.ok) {
    toast(check.error, "error");
    return check;
  }
  setSetting("hotkeys", sanitizeOverrides({ ...state.settings.hotkeys, [id]: check.combo }), { quiet: true });
  toast(`Atalho alterado para ${check.combo}`, "success");
  if (state.active === "@shortcuts") renderMain();
  return check;
}

function resetHotkey(id) {
  const next = { ...state.settings.hotkeys };
  delete next[id];
  setSetting("hotkeys", sanitizeOverrides(next), { quiet: true });
  if (state.active === "@shortcuts") renderMain();
}

// Atalho próprio para qualquer comando da paleta (guardado em settings.cmdKeys).
function commandHotkeys() {
  return commandList()
    .filter((c) => c.id)
    .map((c) => ({ id: c.id, name: c.name, group: c.group, icon: c.icon, combo: state.settings.cmdKeys[c.id] || null }));
}

function setCommandKey(id, combo) {
  const labels = Object.fromEntries(commandList().map((c) => [c.id, c.name]));
  const check = validateCmdKey(combo, id, state.settings.cmdKeys, state.settings.hotkeys, labels);
  if (!check.ok) {
    toast(check.error, "error");
    return check;
  }
  setSetting("cmdKeys", setCmdKey(state.settings.cmdKeys, id, check.combo), { quiet: true });
  toast(`Atalho do comando: ${check.combo}`, "success");
  if (state.active === "@shortcuts") renderMain();
  return check;
}

function clearCommandKey(id) {
  setSetting("cmdKeys", clearCmdKey(state.settings.cmdKeys, id), { quiet: true });
  if (state.active === "@shortcuts") renderMain();
}

const featureOn = (id) => isFeatureOn(state.settings.coreOff, id);

function setCoreFeature(id, on) {
  setSetting("coreOff", setFeature(state.settings.coreOff, id, on), { quiet: true });
  render();
  toast(`${CORE_FEATURES.find((f) => f.id === id)?.nome || id} ${on ? "ligado" : "desligado"}`, "success");
}

const state = {
  vault: null,
  index: null,
  ws: null,
  settings: null,
  active: null,
  settingsSection: "aparencia",
  saveTimer: null,
  editorTimer: null,
  palette: { mode: "commands", items: [], index: 0 },
  miniCanvas: null,
  graphMini: null,
  bigCanvas: null,
  graphBig: null,
  plugins: null,
  snippets: null, // SnippetStore
  snippetStyle: null, // <style> com o CSS dos snippets ligados
  suggest: { open: false, items: [], index: 0, ctx: null },
  hover: { timer: null, hideTimer: null, card: null },
  canvas: null, // { path, view } do canvas montado
  splitView: null, // segunda folha (painel da direita)
  nav: new NavHistory(), // histórico de visitas (voltar e avançar)
  closed: new ClosedTabs(), // abas fechadas, para reabrir
  navMoving: false,
  trash: [], // notas excluídas (lixeira)
  snaps: {}, // versões anteriores das notas, por caminho
  snapTimer: null,
  layouts: {}, // espaços de trabalho salvos
  imported: [], // plugins importados de arquivo: [{ id, manifest, code }]
  disk: null,
  diskHandle: null,
  pendingHandle: null,
};

let lastBand = null;
// ?safe=1 liga o app sem nenhum snippet de CSS, para o caso de um estilo quebrar a interface
const SAFE_MODE = new URLSearchParams(location.search).has("safe");
// Arquivos de controle (como o .keep que marca uma pasta vazia) não abrem como notas.
const isHidden = (path) => baseName(path).startsWith(".");
const isView = (id) => typeof id === "string" && id.startsWith("@");
const isCanvas = (id) => typeof id === "string" && !isView(id) && extOf(id) === "canvas";
const isBase = (id) => typeof id === "string" && !isView(id) && extOf(id) === "base";
// Nota de texto (Markdown): o que tem editor, backlinks e estrutura. O canvas abre na própria tela.
const isNotePath = (id) => !!id && !isView(id) && !isCanvas(id) && !isBase(id) && !!state.vault?.has(id);

// ---------------------------------------------------------------------------
// Inicialização

function init() {
  hydrateIcons(document);
  state.settings = storage.loadSettings();
  applySettings();
  state.snippets = new SnippetStore(storage);
  state.snippetStyle = Object.assign(document.createElement("style"), { id: "sophyra-snippets" });
  document.head.append(state.snippetStyle);
  applySnippets();

  const data = storage.loadVault();
  state.vault = data ? Vault.fromJSON(data) : sampleVault();
  state.index = new MetadataIndex(state.vault);

  const loaded = storage.loadWorkspaceDetailed();
  state.ws = loaded.ws;
  state.wsRecovered = loaded.recovered;
  state.settings.coreOff = sanitizeCoreOff(state.settings.coreOff);
  state.ws.split = splitDropMissing(state.ws.split, (p) => state.vault.has(p));
  state.trash = trashPurge(sanitizeTrash(storage.get("trash.v1", [])));
  state.snaps = sanitizeSnapshots(storage.get("snapshots.v1", {}));
  state.comments = sanitizeComments(storage.get("comments.v1", {}));
  state.iconMap = storage.get("iconmap.v1", {}) || {};
  state.covers = storage.get("covers.v1", {}) || {};
  state.treeSel = new Map(); // itens selecionados na árvore (Ctrl/Shift)
  state.treeAnchor = null;
  state.dragItems = null;
  // o catálogo de ícones (Lucide, ~390 KB) carrega depois do começo; a árvore é desenhada de novo quando chega
  import("./iconcatalog.js").then((m) => { registerIcons(m.CATALOG); renderTree(); });
  state.layouts = sanitizeLayouts(storage.get("workspaces.v1", {}));
  state.imported = sanitizeImported(storage.get("plugins.importados", []));
  state.ws.pinned = (state.ws.pinned || []).filter((p) => state.ws.tabs.includes(p));
  state.ws.bookmarks = (state.ws.bookmarks || []).filter((p) => state.vault.has(p));
  state.settings.hotkeys = sanitizeOverrides(state.settings.hotkeys);
  state.settings.cmdKeys = sanitizeCmdKeys(state.settings.cmdKeys, state.settings.hotkeys);
  state.ws.collapsed = state.ws.collapsed || {};
  state.ws.canvasViews = state.ws.canvasViews || {}; // viewport de cada .canvas, fora do arquivo
  if (!("panel:unlinked" in state.ws.collapsed)) state.ws.collapsed["panel:unlinked"] = true; // só procura menções quando a pessoa abre o painel
  state.ws.tabs = (state.ws.tabs || []).filter((p) => isView(p) || (state.vault.has(p) && !isHidden(p)));
  if (!state.ws.sideTab) state.ws.sideTab = "files";
  if (state.ws.tabs.length === 0) state.ws.tabs = ["@home"];
  state.active = state.ws.tabs.includes(state.ws.active) ? state.ws.active : state.ws.tabs[0];
  if (!data) storage.saveVault(state.vault.toJSON());

  state.miniCanvas = document.createElement("canvas");
  state.miniCanvas.className = "graph-mini";
  state.graphMini = new GraphView(state.miniCanvas, { onOpen: openNote, wheelZoom: false });
  state.bigCanvas = document.createElement("canvas");
  state.bigCanvas.className = "graph-big";
  state.graphBig = new GraphView(state.bigCanvas, { onOpen: openNote });

  els.vaultName.textContent = state.vault.name;
  applyLayoutDefaults();
  bindVaultEvents();
  bindUi();
  render();
  updateDiskUi();
  restoreDisk();
  initPlugins();
  if (SAFE_MODE) toast("Modo seguro: os snippets de CSS não foram aplicados.", "info");
  if (state.wsRecovered) {
    const r = state.wsRecovered;
    toast(r.source === "ajustado" ? `O espaço de trabalho tinha dados inválidos e foi ajustado (${r.reason}).` : `O espaço de trabalho estava danificado; voltei para ${r.source}.`, "info");
    persistWorkspace();
  }
}

function applyLayoutDefaults() {
  const w = window.innerWidth;
  lastBand = w < 860 ? "s" : w < 1180 ? "m" : "l";
  els.app.dataset.side = w < 860 ? "closed" : state.ws.sideOpen === false ? "closed" : "open";
  els.app.dataset.ctx = w < 1180 ? "closed" : state.ws.ctxOpen === false ? "closed" : "open";
}

// Reconecta a pasta guardada sem gesto do usuário (só funciona com a permissão ainda concedida).
async function restoreDisk() {
  if (!isSupported()) return;
  const handle = await diskHandles.load();
  if (!handle) return;
  state.pendingHandle = handle;
  if (await hasPermission(handle, true)) {
    await connectFolder(handle, { quiet: true });
  } else {
    updateDiskUi();
    toast("Reconecte a pasta para continuar sincronizando", "info");
  }
}

// ---------------------------------------------------------------------------
// Configurações visuais

const LARGURAS = { estreita: "56ch", normal: "68ch", larga: "84ch", total: "none" };

function effectiveTheme() {
  const t = state.settings.theme;
  if (t !== "auto") return t;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applySettings() {
  const root = document.documentElement;
  const t = state.settings.theme;
  if (t === "auto") root.removeAttribute("data-theme");
  else root.dataset.theme = t;
  root.style.setProperty("--note-size", `${state.settings.fontSize}px`);
  root.style.setProperty("--editor-size", `${state.settings.editorSize}px`);
  root.style.setProperty("--text-width", state.settings.larguraTexto === "custom" ? `${state.settings.larguraCh}ch` : LARGURAS[state.settings.larguraTexto] || LARGURAS.normal);
  const FONTES = { sans: "var(--font-ui)", serif: "var(--font-read)", mono: "var(--font-mono)" };
  root.style.setProperty("--bk-font", FONTES[state.settings.fonteEditor] || FONTES.serif);
  root.style.setProperty("--bk-head", state.settings.fonteEditor === "mono" ? "var(--font-mono)" : "var(--font-ui)");
  root.style.setProperty("--bk-size", state.settings.textoPequeno ? "14px" : "17px");
  const dark = effectiveTheme() === "dark";
  els.btnTheme.innerHTML = icon(dark ? "sun" : "moon", 20);
  els.btnTheme.title = dark ? "Usar tema claro" : "Usar tema escuro";
  els.app.dataset.ribbon = state.settings.ribbonOff ? "off" : "on";
  syncHighlight();
}

function setSetting(key, value, { quiet = false } = {}) {
  state.settings = { ...state.settings, [key]: value };
  storage.saveSettings(state.settings);
  applySettings();
  if (key === "theme") state.graphMini.draw();
  if (!quiet) toast("Configuração salva", "success");
}

function toggleTheme() {
  setSetting("theme", effectiveTheme() === "dark" ? "light" : "dark", { quiet: true });
  if (state.active === "@settings") renderMain();
  state.graphBig.draw();
}

// ---------------------------------------------------------------------------
// Eventos da biblioteca

function bindVaultEvents() {
  const v = state.vault;
  v.on("create", () => { scheduleSave(); renderTree(); renderCtx(); renderBadges(); renderStatus(); });
  v.on("delete", (file) => {
    state.trash = trashAdd(state.trash, file);
    state.snaps = snapshotRemove(state.snaps, file.path);
    persistTrash();
    state.nav.remove(file.path);
    state.iconMap = removeIconFor(state.iconMap, file.path);
    persistIconMap();
    state.ws.pinned = state.ws.pinned.filter((p) => p !== file.path);
    state.ws.bookmarks = state.ws.bookmarks.filter((p) => p !== file.path);
    state.ws.split = splitDelete(state.ws.split, file.path);
    state.ws.tabs = state.ws.tabs.filter((p) => p !== file.path);
    if (state.active === file.path) state.active = state.ws.tabs[state.ws.tabs.length - 1] || "@home";
    if (!state.ws.tabs.includes(state.active)) state.ws.tabs.push(state.active);
    scheduleSave();
    render();
  });
  v.on("rename", ({ from, to }) => {
    state.snaps = snapshotRename(state.snaps, from, to);
    if (state.comments?.[from]) {
      state.comments = renameCommentsPath(state.comments, from, to);
      persistComments();
    }
    state.nav.rename(from, to);
    state.iconMap = renameIcons(state.iconMap, from, to);
    persistIconMap();
    state.covers = renameCovers(state.covers, from, to);
    storage.set("covers.v1", state.covers);
    state.ws.pinned = state.ws.pinned.map((p) => (p === from ? to : p));
    state.ws.bookmarks = state.ws.bookmarks.map((p) => (p === from ? to : p));
    state.ws.split = splitRename(state.ws.split, from, to);
    state.ws.tabs = state.ws.tabs.map((p) => (p === from ? to : p));
    if (state.active === from) state.active = to;
    scheduleSave();
    render();
  });
  v.on("modify", (file) => {
    scheduleSave();
    if (/\.(md|canvas)$/i.test(file.path)) takeSnapshot(file.path, file.content);
    state.splitView?.onModify(file);
    if (file.path === state.active && isNotePath(file.path)) {
      if (document.activeElement !== els.editor) setEditor(file.content);
      renderPreview();
      if (state.blocks?.path === file.path) syncBlocksContent(file.content);
    }
    renderCtx();
    renderBadges();
    renderStatus();
  });
}

function scheduleSave() {
  setStatus("Salvando…");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    persistVault();
    if (state.disk) {
      await state.disk.flush();
      setStatus("Salvo no disco");
    } else {
      setStatus("Salvo");
    }
  }, state.settings.atrasoSalvar);
}

function persistVault() {
  const ok = storage.saveVault(state.vault.toJSON());
  if (!ok) setStatus("Não foi possível salvar no navegador", "error");
  persistWorkspace();
}

function persistWorkspace() {
  storage.saveWorkspace({
    tabs: state.ws.tabs,
    active: state.active,
    collapsed: state.ws.collapsed,
    canvasViews: state.ws.canvasViews,
    split: state.ws.split,
    pinned: state.ws.pinned,
    bookmarks: state.ws.bookmarks,
    sideTab: state.ws.sideTab,
    sideOpen: els.app.dataset.side !== "closed",
    ctxOpen: els.app.dataset.ctx !== "closed",
  });
}

function setStatus(text, kind) {
  const busy = /Salvando/.test(text);
  const error = kind === "error" || /Erro|Não foi/.test(text);
  els.saveState.className = `save-state${busy ? " busy" : ""}`;
  els.saveState.innerHTML = `${icon(error ? "alert" : busy ? "clock" : "check-circle", 14)}<span>${escapeHtml(text)}</span>`;
}

// ---------------------------------------------------------------------------
// Ligações da interface

function bindUi() {
  // Ribbon
  document.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) return navSide(nav.dataset.nav);
    const view = e.target.closest(".ribbon [data-view]");
    if (view) return openView(view.dataset.view);
  });
  $("#btn-palette").addEventListener("click", () => openPalette("commands"));
  els.btnTheme.addEventListener("click", toggleTheme);
  $("#btn-vault").addEventListener("click", () => openView("@home"));
  $("#btn-new-note").addEventListener("click", () => createNote());
  $("#btn-new-folder").addEventListener("click", () => createFolder());
  $("#btn-new-canvas")?.addEventListener("click", () => createCanvas());
  bindFind();
  $("#btn-more")?.addEventListener("click", openMoreMenu);
  state.splitView = mountSplitView($("#leaf2"), {
    vault: state.vault,
    get: () => state.ws.split,
    set: setSplit,
    noteHtml,
    toggleTask,
    openInMain: (path) => openNote(path),
    toast,
  });
  // Arrastar arquivos .md, .txt ou .canvas para a janela importa uma cópia para a biblioteca.
  window.addEventListener("dragover", (e) => {
    if ([...(e.dataTransfer?.types || [])].includes("Files")) e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    importFromFiles([...e.dataTransfer.files]);
  });
  els.diskPill.addEventListener("click", () => openSettings("biblioteca"));

  // Nota

  els.btnCtx.addEventListener("click", toggleCtx);
  for (const b of $$("[data-fmt]")) b.addEventListener("click", () => applyFormat(b.dataset.fmt));

  els.editor.addEventListener("input", onEditorInputEvent);
  els.editor.addEventListener("keydown", onEditorKeys);
  els.editor.addEventListener("keyup", (e) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) updateSuggest(); });
  els.editor.addEventListener("click", updateSuggest);
  els.editor.addEventListener("blur", closeSuggest);
  els.editor.addEventListener("scroll", () => {
    syncHighlightScroll();
    if (state.suggest.open) placeSuggest();
  });
  new ResizeObserver(() => syncHighlight()).observe(els.editor);
  els.suggest.addEventListener("mousedown", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    e.preventDefault();
    acceptSuggest(Number(b.dataset.i));
  });
  els.preview.addEventListener("click", onPreviewClick);
  els.preview.addEventListener("mouseover", onPreviewOver);
  els.preview.addEventListener("mouseout", onPreviewOut);
  els.preview.addEventListener("scroll", hideHover);

  // Barra lateral
  els.tree.addEventListener("click", onTreeClick);
  els.search.addEventListener("input", renderSearch);
  els.results.addEventListener("click", (e) => {
    const r = e.target.closest("[data-path]");
    if (r) openNote(r.dataset.path);
  });
  $("#search-hints").addEventListener("click", (e) => {
    const h = e.target.closest("[data-hint]");
    if (!h) return;
    els.search.value = `${els.search.value}${els.search.value && !els.search.value.endsWith(" ") ? " " : ""}${h.dataset.hint}`;
    els.search.focus();
    renderSearch();
  });

  // Abas
  els.tabs.addEventListener("click", onTabsClick);
  els.ctxScroll.addEventListener("click", (e) => { onCommentsPanel(e); onLayoutPanel(e); });
  els.ctxScroll.addEventListener("change", onLayoutPanel);
  els.ctxScroll.addEventListener("input", onLayoutRange);
  els.ctxScroll.addEventListener("keydown", onCommentsKey);
  els.tree.addEventListener("contextmenu", onTreeContext);
  els.tree.addEventListener("dragstart", onTreeDragStart);
  els.tree.addEventListener("dragover", onTreeDragOver);
  els.tree.addEventListener("drop", onTreeDrop);
  els.tree.addEventListener("dragend", clearDropMarks);
  els.tree.addEventListener("dragleave", (e) => { if (!els.tree.contains(e.relatedTarget)) clearDropMarks(); });
  els.tabs.addEventListener("contextmenu", onTabsContext);
  els.results.addEventListener("contextmenu", onResultsContext);
  els.tabs.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("tab")) {
      e.preventDefault();
      activate(e.target.dataset.id);
    }
  });
  els.tabs.addEventListener("auxclick", (e) => {
    const tab = e.target.closest(".tab");
    if (tab && e.button === 1) closeTab(tab.dataset.id);
  });

  // Paleta
  els.paletteInput.addEventListener("input", renderPalette);
  els.paletteInput.addEventListener("keydown", onPaletteKeys);
  els.palette.addEventListener("mousedown", (e) => { if (e.target === els.palette) closePalette(); });

  els.importFile.addEventListener("change", importVaultFile);
  els.importCss.addEventListener("change", importSnippetFile);
  document.addEventListener("keydown", onGlobalKeys);
  window.addEventListener("beforeunload", () => { state.canvas?.view.flush(); state.blocks?.view.flush(); state.base?.view.flush(); clearTimeout(state.saveTimer); persistVault(); });
  window.addEventListener("resize", debounce(() => { if (!state.ws) return; applyResponsive(); }, 150));
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applySettings());
}

function applyResponsive() {
  const w = window.innerWidth;
  const band = w < 860 ? "s" : w < 1180 ? "m" : "l";
  if (band === lastBand) return;
  if (lastBand !== null) {
    els.app.dataset.side = band === "s" ? "closed" : "open";
    els.app.dataset.ctx = band === "l" ? "open" : "closed";
  }
  lastBand = band;
  renderRibbon();
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function navSide(tab) {
  const open = els.app.dataset.side !== "closed";
  if (open && state.ws.sideTab === tab) {
    els.app.dataset.side = "closed";
  } else {
    state.ws.sideTab = tab;
    els.app.dataset.side = "open";
  }
  renderSide();
  renderRibbon();
  persistWorkspace();
  if (tab === "search" && els.app.dataset.side === "open") els.search.focus();
}

function toggleCtx() {
  els.app.dataset.ctx = els.app.dataset.ctx === "closed" ? "open" : "closed";
  renderRibbon();
  persistWorkspace();
}

function toggleSide() {
  els.app.dataset.side = els.app.dataset.side === "closed" ? "open" : "closed";
  renderRibbon();
  persistWorkspace();
}

// ---------------------------------------------------------------------------
// Renderização

function render() {
  renderRibbon();
  renderTabs();
  renderSide();
  renderMain();
  renderCtx();
  renderBadges();
  renderStatus();
  state.splitView?.render();
  persistWorkspace();
}

function renderRibbon() {
  const sideOpen = els.app.dataset.side !== "closed";
  for (const b of $$("[data-nav]")) b.setAttribute("aria-pressed", String(sideOpen && state.ws.sideTab === b.dataset.nav));
  for (const b of $$(".ribbon [data-view]")) {
    b.classList.toggle("active", b.dataset.view === state.active);
    const feature = featureOfView(b.dataset.view);
    if (feature) b.hidden = !featureOn(feature);
  }
  const newCanvas = $("#btn-new-canvas");
  if (newCanvas) newCanvas.hidden = !featureOn("canvas");
  els.btnCtx.setAttribute("aria-pressed", String(els.app.dataset.ctx !== "closed"));
  els.ribbonPlugins.innerHTML = (state.plugins?.views() || [])
    .map((v) => `<button class="rb${state.active === `@plugin/${v.key}` ? " active" : ""}" data-view="@plugin/${escapeHtml(v.key)}" title="${escapeHtml(v.title)}" aria-label="${escapeHtml(v.title)}">${icon(v.icon || "puzzle", 20)}</button>`)
    .join("");
}

function renderBadges() {
  const open = state.index.tasks().filter((t) => !t.done).length;
  els.badgeTasks.hidden = open === 0;
  els.badgeTasks.textContent = open > 99 ? "99+" : String(open);
}

function viewMeta(id) {
  if (VIEWS[id]) return VIEWS[id];
  if (id.startsWith("@tasks/")) return { title: `Tarefas: ${folderName(id.slice(7))}`, icon: "check-square" };
  if (id.startsWith("@pasta/")) return { title: folderName(id.slice(7)), icon: iconNameOf(id.slice(7)) || "folder" };
  if (id.startsWith("@plugin/")) {
    const v = state.plugins?.views().find((x) => `@plugin/${x.key}` === id);
    return { title: v?.title || "Plugin", icon: v?.icon || "puzzle" };
  }
  return { title: "Tela", icon: "file" };
}

function renderTabs() {
  els.tabs.innerHTML = state.ws.tabs
    .map((id) => {
      const view = isView(id);
      const meta = view ? viewMeta(id) : null;
      const label = view ? meta.title : stripExt(baseName(id));
      const selected = id === state.active;
      return `<div class="tab${selected ? " active" : ""}" role="tab" tabindex="0" aria-selected="${selected}" data-id="${escapeHtml(id)}" title="${escapeHtml(view ? meta.title : id)}">
        ${icon(state.ws.pinned.includes(id) ? "pin" : view ? meta.icon : isCanvas(id) ? "layers" : isBase(id) ? "database" : "file-text", 15)}<span class="label">${escapeHtml(label)}</span>
        <button class="tab-close" data-close="${escapeHtml(id)}" aria-label="Fechar ${escapeHtml(label)}" tabindex="-1">${icon("x", 14)}</button>
      </div>`;
    })
    .join("");
  $(".tab.active", els.tabs)?.scrollIntoView({ inline: "nearest", block: "nearest" });
}

function onTabsClick(e) {
  const close = e.target.closest("[data-close]");
  if (close) return closeTab(close.dataset.close);
  const tab = e.target.closest(".tab");
  if (tab) activate(tab.dataset.id);
}

function activate(id) {
  if (!id) return;
  if (!state.ws.tabs.includes(id)) state.ws.tabs.push(id);
  state.ws.tabs = orderTabs(state.ws.tabs, state.ws.pinned);
  state.active = id;
  if (!state.navMoving) state.nav.push(id);
  render();
  if (window.innerWidth < 860) els.app.dataset.side = "closed";
}

function closeTab(id) {
  if (state.ws.pinned.includes(id)) return toast("Essa aba está fixada. Solte-a antes de fechar.", "info");
  state.closed.push(id);
  const i = state.ws.tabs.indexOf(id);
  state.ws.tabs = state.ws.tabs.filter((p) => p !== id);
  if (state.active === id) state.active = state.ws.tabs[Math.max(0, i - 1)] || null;
  if (!state.active) {
    state.ws.tabs = ["@home"];
    state.active = "@home";
  }
  render();
}

function openNote(path, { heading = "", block = "" } = {}) {
  if (!path || !state.vault.has(path) || isHidden(path)) return;
  activate(path);
  if (heading || block) setTimeout(() => jumpTo({ heading, block }), 0);
}

function openView(id) {
  activate(id);
}

function openSettings(section = "aparencia") {
  state.settingsSection = section;
  if (state.active === "@settings") renderMain();
  else activate("@settings");
}

// Área principal: uma nota ou uma tela.
function teardownCanvas() {
  if (!state.canvas) return;
  state.canvas.view.flush();
  state.canvas.view.destroy();
  state.canvas = null;
  els.page.classList.remove("canvas-page");
}

// Abre a busca lateral filtrada por uma etiqueta (usado pelos cartões do canvas).
function searchTag(tag) {
  state.ws.sideTab = "search";
  els.app.dataset.side = "open";
  els.search.value = `tag:${tag}`;
  renderSide();
  renderRibbon();
}

function teardownBase() {
  if (!state.base) return;
  state.base.view.destroy();
  state.base = null;
  els.page.classList.remove("canvas-page");
}

function renderBasePage(path) {
  els.page.innerHTML = "";
  els.page.classList.add("canvas-page");
  const view = mountBase(els.page, {
    vault: state.vault,
    path,
    openNote: (target) => openNote(target),
    fileMenu: (path, x, y) => showContextMenu(x, y, fileMenuItems(path)),
    getMeta: (f) => state.index.meta(f.path),
    askText: (title, value, placeholder) => askText(title, value, placeholder),
    toast,
  });
  state.base = { path, view };
}

function renderCanvasPage(path) {
  els.page.innerHTML = "";
  els.page.classList.add("canvas-page");
  const view = mountCanvas(els.page, {
    vault: state.vault,
    path,
    viewport: state.ws.canvasViews[path],
    onViewport: (vp) => {
      state.ws.canvasViews[path] = vp;
      persistWorkspace();
    },
    openNote: (target) => openNote(target),
    fileMenu: (p, x, y) => showContextMenu(x, y, fileMenuItems(p)),
    followLink: (raw) => followWikilink(raw, path),
    onTag: (tag) => searchTag(tag),
    fileMenu: (p, x, y) => showContextMenu(x, y, fileMenuItems(p)),
    pickNote: () => pickNoteDialog("all"),
    diagram: (kind, data) => handleDiagram(kind, data),
    toast,
  });
  state.canvas = { path, view };
}

function renderMain() {
  const id = state.active;
  // Mantém o canvas aberto enquanto ele é a tela ativa: recriá-lo a cada atualização perderia a edição em curso.
  if (state.canvas && state.canvas.path === id && isCanvas(id) && state.vault.has(id)) return;
  if (state.base && state.base.path === id && isBase(id) && state.vault.has(id)) return;
  teardownCanvas();
  teardownBase();
  const isNote = isNotePath(id);
  if (!isNote) teardownBlocks();
  els.notePane.hidden = !isNote;
  els.page.hidden = isNote;
  if (isNote) {
    renderNote(id);
    return;
  }
  const off = featureOfView(id) || featureOfPath(id);
  if (off && !featureOn(off)) {
    renderFeatureOff(off);
    return;
  }
  if (isCanvas(id) && state.vault.has(id)) {
    renderCanvasPage(id);
    return;
  }
  if (isBase(id) && state.vault.has(id)) {
    renderBasePage(id);
    return;
  }
  els.page.innerHTML = "";
  els.page.scrollTop = 0;
  const ctx = makeCtx();
  try {
    if (id === "@home") renderHome(els.page, ctx);
    else if (id === "@graph") renderGraph(els.page, ctx);
    else if (id === "@tasks" || id?.startsWith("@tasks/")) renderTasks(els.page, ctx, { filter: "open", q: "", folder: id === "@tasks" ? "" : id.slice(7) });
    else if (id?.startsWith("@pasta/")) renderCollectionPage(id.slice(7));
    else if (id === "@tags") renderTags(els.page, ctx);
    else if (id === "@shortcuts") renderShortcuts(els.page, ctx);
    else if (id === "@trash") renderTrash(els.page, ctx);
    else if (id === "@settings") renderSettings(els.page, ctx, { section: state.settingsSection });
    else if (id?.startsWith("@plugin/")) renderPluginView(id);
    else {
      state.active = "@home";
      renderHome(els.page, ctx);
    }
  } catch (err) {
    els.page.innerHTML = `<div class="page-inner"><div class="welcome-empty">${icon("alert", 28)}<div><strong style="color:var(--text)">Não foi possível abrir esta tela.</strong><p>${escapeHtml(err.message)}</p></div></div></div>`;
  }
}

function renderFeatureOff(featureId) {
  const f = CORE_FEATURES.find((x) => x.id === featureId);
  els.page.innerHTML = `<div class="page-inner"><div class="welcome-empty">${icon(f.icone, 28)}<div><strong style="color:var(--text)">${escapeHtml(f.nome)} está desligado.</strong><p>${escapeHtml(f.descricao)} Ligue o recurso em Configurações › Plugins para usar de novo.</p></div><button class="btn primary" id="turn-on-feature">${icon("check-circle", 16)} Ligar ${escapeHtml(f.nome)}</button></div></div>`;
  $("#turn-on-feature")?.addEventListener("click", () => setCoreFeature(featureId, true));
}

function renderPluginView(id) {
  const view = state.plugins?.views().find((v) => `@plugin/${v.key}` === id);
  if (!view) {
    els.page.innerHTML = `<div class="page-inner"><div class="welcome-empty">${icon("puzzle", 28)}<div><strong style="color:var(--text)">Esta tela é de um plugin que não está ativo.</strong><p>Ative o plugin em Configurações para vê-la de novo.</p></div><button class="btn" id="goto-plugins">${icon("sliders", 16)} Abrir configurações</button></div></div>`;
    $("#goto-plugins")?.addEventListener("click", () => openSettings("plugins"));
    return;
  }
  view.render(els.page);
}

function renderNote(path) {
  if (find.open) closeFind();
  // a primeira vez que a nota é vista fica guardada como ponto de partida do histórico de versões
  if (!state.snaps[path]) takeSnapshot(path, state.vault.read(path), true);
  const parts = path.split("/");
  const name = stripExt(parts.pop());
  els.crumbs.innerHTML = [...parts.map((p) => `<span>${escapeHtml(p)}</span><span class="sep">${icon("chevron-right", 12)}</span>`), `<span class="current">${escapeHtml(name)}</span>`].join("");
  setEditor(state.vault.read(path), true);
  renderPreview();
  syncBlocks();
}

// --- Editor de blocos -------------------------------------------------------------------------------------------------------

// Tipos de propriedade escolhidos pela pessoa (valem para a biblioteca toda): chave -> tipo.
// Ícone e valores (opções com cor) definidos para cada propriedade: chave -> { icon, options }.
const propMetaStore = {
  get: (key) => (storage.get("propmeta.v1", {}) || {})[key] || null,
  set: (key, patch) => {
    const all = { ...(storage.get("propmeta.v1", {}) || {}) };
    if (patch && (patch.icon || (patch.options && patch.options.length))) all[key] = patch;
    else delete all[key];
    storage.set("propmeta.v1", all);
  },
};

const propTypesStore = {
  get: (key) => (storage.get("proptypes.v1", {}) || {})[key] || null,
  set: (key, type) => {
    const all = { ...(storage.get("proptypes.v1", {}) || {}) };
    if (type) all[key] = type;
    else delete all[key];
    storage.set("proptypes.v1", all);
  },
};

function teardownBlocks() {
  if (!state.blocks) return;
  state.blocks.view.destroy();
  state.blocks = null;
}

// Liga ou desliga o editor de blocos conforme o modo e a nota ativa.
function syncBlocks() {
  const path = state.active;
  const want = isNotePath(path) && state.vault.has(path);
  if (!want) return teardownBlocks();
  if (state.blocks?.path === path) return;
  teardownBlocks();
  const source = state.vault.read(path);
  const fm = parseFrontmatter(source);
  state.blocks = {
    path,
    prefix: source.slice(0, fm.bodyOffset),
    view: mountBlocks(els.blocks, {
      markdown: fm.body,
      exists: (target) => !!state.vault.resolveLink(parseLinkTarget(target).name || target, path),
      notes: () => state.vault.markdownFiles().map((f) => ({ name: stripExt(baseName(f.path)), path: f.path })),
      onChange: (body) => {
        const full = state.blocks.prefix + body;
        if (state.vault.has(path)) state.vault.write(path, full);
        renderStatus(full);
      },
      openCanvas: (name) => {
        const target = state.vault.resolveLink(name, path);
        if (target) openNote(target);
      },
      embedCanvas: (el, name) => {
        const cp = state.vault.resolveLink(name, path);
        if (!cp) return null;
        return mountCanvas(el, { vault: state.vault, path: cp, openNote: (t) => openNote(t), toast });
      },
      chooseCanvas: async () => {
        const picked = await pickNoteDialog("canvas");
        return picked ? baseName(picked) : null;
      },
      embedBase: (el, name) => {
        const bp = state.vault.resolveLink(name, path);
        if (!bp) return null;
        return mountBase(el, { vault: state.vault, path: bp, openNote: (t) => openNote(t), fileMenu: (p, x, y) => showContextMenu(x, y, fileMenuItems(p)), getMeta: (f) => state.index.meta(f.path), askText: (t, v, ph) => askText(t, v, ph), toast });
      },
      chooseBase: () => chooseBaseFor(path),
      comments: { list: () => commentsOf(state.comments, path), add: (quote, text) => addCommentFlow(path, quote, text), open: (id) => openCommentThread(id) },
      header: (el) => mountNoteProps(el, { vault: state.vault, path, getMeta: (f) => state.index.meta(f.path), toast, types: propTypesStore, meta: propMetaStore }),
      followLink: (raw) => followWikilink(raw, path),
      onTag: (tag) => searchTag(tag),
      toast,
    }),
  };
}

// A nota mudou em outro lugar (propriedades, outro painel, pasta do disco): o editor de blocos acompanha.
function syncBlocksContent(text) {
  const fm = parseFrontmatter(text);
  state.blocks.prefix = text.slice(0, fm.bodyOffset);
  state.blocks.view.setMarkdown(fm.body);
}

// ---------------------------------------------------------------------------
// Editor e leitura

function setEditor(text, force = false) {
  if (!force && els.editor.value === text) return;
  const { selectionStart, selectionEnd } = els.editor;
  els.editor.value = text;
  if (!force && document.activeElement === els.editor) els.editor.setSelectionRange(selectionStart, selectionEnd);
  syncHighlight();
}

// Camada colorida atrás do textarea: mesmo texto, mesma rolagem. Desligada nas configurações, o textarea fica comum.
function syncHighlight() {
  const on = state.settings.destaque !== false;
  els.editorWrap.dataset.hl = on ? "on" : "off";
  if (!on) return;
  els.editorHl.innerHTML = `${highlightMarkdown(els.editor.value)}\u200b`;
  syncHighlightScroll();
}

function syncHighlightScroll() {
  const ta = els.editor;
  els.editorHl.style.right = `${ta.offsetWidth - ta.clientWidth}px`; // a barra de rolagem do textarea não entra na camada
  els.editorHl.scrollTop = ta.scrollTop;
  els.editorFind.style.right = els.editorHl.style.right;
  els.editorFind.scrollTop = ta.scrollTop;
}

function onEditorInput() {
  if (!isNotePath(state.active)) return;
  clearTimeout(state.editorTimer);
  const text = els.editor.value;
  const path = state.active;
  state.editorTimer = setTimeout(() => {
    if (state.vault.has(path)) state.vault.write(path, text);
  }, 150);
  renderStatus(text);
}

function onEditorKeys(e) {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "h") && !e.shiftKey) {
    e.preventDefault();
    return openFind(e.key.toLowerCase() === "h");
  }
  if (state.suggest.open) {
    if (e.key === "ArrowDown") { e.preventDefault(); return moveSuggest(1); }
    if (e.key === "ArrowUp") { e.preventDefault(); return moveSuggest(-1); }
    if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return acceptSuggest(state.suggest.index); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return closeSuggest(); }
  }
  if (state.settings.ajudasEditor !== false && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
    const el = els.editor;
    const { selectionStart: s, selectionEnd: en, value } = el;
    let edit = null;
    if (e.key === "Enter" && !e.shiftKey) edit = onEnter(value, s, en);
    else if (e.key === "Backspace") edit = onBackspace(value, s, en);
    else if (e.key === "Tab") edit = indentLines(value, s, en, e.shiftKey);
    else if (e.key.length === 1) edit = onChar(value, s, en, e.key);
    if (edit) {
      e.preventDefault();
      applyEdit(edit);
      return;
    }
  }
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    replaceRange(els.editor.selectionStart, els.editor.selectionEnd, "  ");
  } else if (mod && e.key.toLowerCase() === "b") {
    e.preventDefault();
    applyFormat("bold");
  } else if (mod && e.key.toLowerCase() === "i") {
    e.preventDefault();
    applyFormat("italic");
  }
}

// Roda um comando de edição (commands.js) sobre a seleção do editor. Em modo de leitura, passa para a edição antes.
function runEditorCommand(cmd) {
  if (!isNotePath(state.active)) return;
  const el = els.editor;
  el.focus();
  const edit = cmd.run(el.value, el.selectionStart, el.selectionEnd);
  if (!edit) return toast(`${cmd.name}: nada a fazer aqui.`, "info");
  applyEdit(edit);
  onEditorInput();
}

// Aplica uma edição das ajudas do editor (editing.js), mantendo o histórico de desfazer.
function applyEdit(edit) {
  const el = els.editor;
  if (edit.insert === "" && edit.from === edit.to) {
    el.setSelectionRange(edit.sel[0], edit.sel[1]); // só andar o cursor (pular um fecho já digitado)
    return;
  }
  replaceRange(edit.from, edit.to, edit.insert, edit.sel[0], edit.sel[1]);
}

// Troca um trecho do editor preservando o histórico de desfazer quando o navegador deixa.
function replaceRange(start, end, text, selStart = null, selEnd = null) {
  const el = els.editor;
  el.focus();
  el.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  const s = selStart ?? start + text.length;
  el.setSelectionRange(s, selEnd ?? s);
}

function wrapSelection(before, after = before, placeholder = "texto") {
  const el = els.editor;
  const { selectionStart: s, selectionEnd: e } = el;
  const selected = el.value.slice(s, e) || placeholder;
  replaceRange(s, e, before + selected + after, s + before.length, s + before.length + selected.length);
}

function prefixLines(prefix) {
  const el = els.editor;
  const text = el.value;
  const start = text.lastIndexOf("\n", el.selectionStart - 1) + 1;
  let end = text.indexOf("\n", el.selectionEnd);
  if (end === -1) end = text.length;
  const lines = text.slice(start, end).split("\n");
  const all = lines.every((l) => l.startsWith(prefix));
  const next = lines.map((l) => (all ? l.slice(prefix.length) : l.startsWith(prefix) ? l : prefix + l)).join("\n");
  replaceRange(start, end, next, start, start + next.length);
}

function applyFormat(kind) {
  if (!isNotePath(state.active)) return;
  if (kind === "bold") wrapSelection("**");
  else if (kind === "italic") wrapSelection("*");
  else if (kind === "code") {
    const sel = els.editor.value.slice(els.editor.selectionStart, els.editor.selectionEnd);
    if (sel.includes("\n")) wrapSelection("```\n", "\n```", "");
    else wrapSelection("`");
  } else if (kind === "heading") prefixLines("## ");
  else if (kind === "list") prefixLines("- ");
  else if (kind === "task") prefixLines("- [ ] ");
  else if (kind === "quote") prefixLines("> ");
  else if (kind === "wikilink") {
    const { selectionStart: s, selectionEnd: en } = els.editor;
    if (s === en) replaceRange(s, en, "[[]]", s + 2, s + 2);
    else wrapSelection("[[", "]]");
  }
  else if (kind === "tag") replaceRange(els.editor.selectionStart, els.editor.selectionEnd, "#");
  onEditorInput();
}

// HTML de leitura de uma nota (usado pelo painel principal e pelo da direita).
function noteHtml(path) {
  const html = renderMarkdown(state.vault.read(path), (target) => ({ exists: linkTargetExists(state.vault, target, path) }));
  return `<div class="note-body">${decorateCallouts(expandEmbeds(html, path, 0))}</div>`;
}

// Segunda folha: abre uma nota ao lado da principal, com abas próprias. O estado fica no espaço de trabalho.
function setSplit(next) {
  state.ws.split = next;
  persistWorkspace();
  state.splitView?.render();
}

function openSplit(path = state.active) {
  if (!path || isView(path) || !state.vault.has(path) || isHidden(path)) return;
  if (window.innerWidth < 860) return toast("Abrir ao lado precisa de uma janela mais larga.", "info");
  setSplit(splitOpen(state.ws.split, path));
}

function closeSplit() {
  setSplit(splitClose(state.ws.split));
}

function renderPreview() {
  const path = state.active;
  if (!isNotePath(path)) return;
  els.preview.innerHTML = noteHtml(path);
}

const CALLOUT_ICONS = { note: "info", info: "info", tip: "check-circle", success: "check-circle", warning: "alert", danger: "alert", important: "alert" };

// Coloca um ícone no título de cada callout.
function decorateCallouts(html) {
  const box = document.createElement("div");
  box.innerHTML = html;
  for (const el of $$(".callout", box)) {
    const type = [...el.classList].find((c) => c.startsWith("callout-"))?.slice(8) || "note";
    const title = $(".callout-title", el);
    if (title) title.insertAdjacentHTML("afterbegin", icon(CALLOUT_ICONS[type] || "info", 16));
  }
  return box.innerHTML;
}

// Substitui ![[nota]] e ![[nota#Título]] pelo conteúdo, com profundidade limitada.
function expandEmbeds(html, fromPath, depth) {
  if (depth > 2) return html;
  const box = document.createElement("div");
  box.innerHTML = html;
  for (const span of $$(".embed", box)) {
    const raw = span.dataset.target || "";
    const [name, heading] = raw.split("#");
    const path = state.vault.resolveLink(name, fromPath);
    if (!path) continue;
    let text = state.vault.read(path);
    if (heading) text = extractSection(text, heading.trim());
    const inner = renderMarkdown(text, (t) => ({ exists: linkTargetExists(state.vault, t, path) }));
    const block = document.createElement("div");
    block.className = "embed-block";
    block.innerHTML = `<div class="embed-title">${escapeHtml(raw)}</div>${expandEmbeds(inner, path, depth + 1)}`;
    span.replaceWith(block);
  }
  return box.innerHTML;
}

function extractSection(text, heading) {
  const { body } = parseFrontmatter(text);
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s+/.test(l) && l.replace(/^#+\s+/, "").trim() === heading);
  if (start === -1) return "";
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function onPreviewClick(e) {
  const link = e.target.closest("a.wikilink");
  if (link) {
    e.preventDefault();
    hideHover();
    followWikilink(link.dataset.target);
    return;
  }
  const tag = e.target.closest(".tag");
  if (tag) {
    state.ws.sideTab = "search";
    els.app.dataset.side = "open";
    els.search.value = `tag:${tag.dataset.tag}`;
    renderSide();
    renderRibbon();
    return;
  }
  const box = e.target.closest("input[type=checkbox][data-task]");
  if (box) {
    e.preventDefault();
    toggleTaskNth($$("input[type=checkbox][data-task]", els.preview).indexOf(box));
  }
}

// Marca ou desmarca a k-ésima tarefa da nota aberta.
function toggleTaskNth(k) {
  const source = state.vault.read(state.active);
  const { body, raw } = parseFrontmatter(source);
  const lines = body.split(/\r?\n/);
  let count = -1;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^(```|~~~)/.test(lines[i])) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (/^\s*[-*+]\s+\[([ xX])\]\s/.test(lines[i])) {
      count++;
      if (count === k) {
        lines[i] = lines[i].replace(/\[([ xX])\]/, (m, c) => (c === " " ? "[x]" : "[ ]"));
        break;
      }
    }
  }
  const head = raw !== null ? `---\n${raw}\n---\n` : "";
  state.vault.write(state.active, head + lines.join("\n"));
}

// Marca ou desmarca a tarefa que está na linha `line` do corpo de uma nota (usado pela tela de tarefas).
function toggleTask(path, line) {
  const { body, raw } = parseFrontmatter(state.vault.read(path));
  const lines = body.split(/\r?\n/);
  if (!/^\s*[-*+]\s+\[([ xX])\]/.test(lines[line] || "")) return;
  lines[line] = lines[line].replace(/\[([ xX])\]/, (m, c) => (c === " " ? "[x]" : "[ ]"));
  state.vault.write(path, (raw !== null ? `---\n${raw}\n---\n` : "") + lines.join("\n"));
}

// ---------------------------------------------------------------------------
// Barra lateral: arquivos e busca

function renderSide() {
  $("#pane-files").classList.toggle("active", state.ws.sideTab === "files");
  $("#pane-search").classList.toggle("active", state.ws.sideTab === "search");
  renderTree();
  renderSearch();
}

function renderTree() {
  const root = state.vault.tree();
  const html = treeHtml(root, 0);
  els.tree.innerHTML = html || `<div class="empty-inline"><p>A biblioteca está vazia.</p><button class="btn sm" id="empty-new">${icon("file-plus", 14)} Criar nota</button></div>`;
  $("#empty-new")?.addEventListener("click", () => createNote());
}

// --- Mover, arrastar e soltar na árvore ------------------------------------------------------------------------------

const treeKey = (item) => `${item.dir ? "d" : "f"}:${item.path}`;
const rowItem = (row) => (row.dataset.folder !== undefined ? { path: row.dataset.folder, dir: true } : { path: row.dataset.path, dir: false });
const selCls = (path, dir) => (state.treeSel?.has(treeKey({ path, dir })) ? " sel" : "");

function toggleTreeSelection(row, { range = false, toggle = false }) {
  const item = rowItem(row);
  if (range && state.treeAnchor) {
    const rows = [...els.tree.querySelectorAll("[data-folder],[data-path]")];
    const a = rows.findIndex((r) => treeKey(rowItem(r)) === treeKey(state.treeAnchor));
    const b = rows.indexOf(row);
    if (a !== -1 && b !== -1) {
      for (const r of rows.slice(Math.min(a, b), Math.max(a, b) + 1)) state.treeSel.set(treeKey(rowItem(r)), rowItem(r));
    }
  } else if (toggle) {
    if (state.treeSel.has(treeKey(item))) state.treeSel.delete(treeKey(item));
    else state.treeSel.set(treeKey(item), item);
    state.treeAnchor = item;
  }
  renderTree();
}

// Pasta de destino de um arrastar: a própria pasta, a pasta de um arquivo, ou a raiz (área vazia).
function treeDropDest(target) {
  const row = target?.closest?.("[data-folder],[data-path]");
  if (!row) return "";
  return row.dataset.folder !== undefined ? row.dataset.folder : parentOf(row.dataset.path);
}

function clearDropMarks() {
  for (const el of els.tree.querySelectorAll(".drop-target")) el.classList.remove("drop-target");
}

function onTreeDragStart(e) {
  const row = e.target.closest?.("[data-folder],[data-path]");
  if (!row) return;
  let items = [rowItem(row)];
  if (state.treeSel.has(treeKey(items[0]))) items = [...state.treeSel.values()];
  else {
    state.treeSel.clear();
    state.treeAnchor = items[0];
  }
  state.dragItems = items;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("application/x-sophyra-items", JSON.stringify(items));
}

function onTreeDragOver(e) {
  if (!state.dragItems) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  clearDropMarks();
  const row = e.target.closest?.("[data-folder]");
  if (row) row.classList.add("drop-target");
}

function onTreeDrop(e) {
  const items = state.dragItems;
  clearDropMarks();
  if (!items) return;
  e.preventDefault();
  state.dragItems = null;
  const dest = treeDropDest(e.target);
  const taken = (p, isDir) => state.vault.has(p) || (isDir && state.vault.list().some((f) => f.path.startsWith(`${p}/`)));
  const plan = planMove(items, dest, taken);
  if (!plan.ok) return toast(plan.reason, "error");
  if (!plan.moves.length) return;
  moveItems(plan.moves);
}

// Aplica as mudanças e leva junto o ícone e a capa das pastas movidas.
function moveItems(moves) {
  try {
    state.vault.applyMoves(moves);
  } catch (err) {
    toast(err.message, "error");
    return false;
  }
  for (const m of moves.filter((x) => x.dir)) {
    state.iconMap = renameIcons(state.iconMap, m.from, m.to);
    state.covers = renameCovers(state.covers, m.from, m.to);
  }
  persistIconMap();
  storage.set("covers.v1", state.covers);
  state.treeSel.clear();
  state.treeAnchor = null;
  renderTree();
  toast(`${moves.length} ${moves.length === 1 ? "item movido" : "itens movidos"}`, "success");
  return true;
}

async function renameFolder(dir) {
  const current = folderName(dir);
  const name = await askText("Renomear pasta", current, "Novo nome da pasta");
  if (!name) return;
  const clean = name.trim().replace(/\//g, "");
  if (!clean || clean === current) return;
  const parent = parentOf(dir);
  moveItems([{ from: dir, to: `${parent ? `${parent}/` : ""}${clean}`, dir: true }]);
}

async function deleteFolder(dir) {
  const files = state.vault.list().filter((f) => f.path.startsWith(`${dir}/`));
  const notes = files.filter((f) => nameOf(f.path) !== ".keep").length;
  const ok = await askConfirm(`Excluir a pasta “${folderName(dir)}” com ${notes} ${notes === 1 ? "nota" : "notas"}? Tudo vai para a lixeira e pode ser restaurado por 30 dias.`, "Excluir pasta", "Excluir");
  if (!ok) return;
  for (const f of files) state.vault.remove(f.path);
  state.iconMap = removeIconFor(state.iconMap, dir);
  state.covers = removeCover(state.covers, dir);
  persistIconMap();
  storage.set("covers.v1", state.covers);
  toast("Pasta excluída", "success");
}

// Ícone escolhido pelo usuário para uma pasta ou nota (só vale se o ícone existe no app).
function customIcon(path) {
  const name = state.iconMap?.[path];
  return name && hasIcon(name) ? name : null;
}

function persistIconMap() {
  storage.set("iconmap.v1", state.iconMap);
}

function iconNameOf(path) {
  return customIcon(path);
}

// Carta de abertura da coleção: capa, contagens, bibliotecas, notas recentes e as ações principais.
function openCollectionCard(dir) {
  const ctx = makeCtx();
  const inside = state.vault.list().filter((f) => f.path.startsWith(`${dir}/`));
  const notes = inside.filter((f) => extOf(f.path) === "md" && baseName(f.path) !== ".keep");
  const bases = inside.filter((f) => extOf(f.path) === "base").sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  const openTasks = state.index.tasks().filter((t) => t.path.startsWith(`${dir}/`) && !t.done).length;
  const cover = state.covers?.[dir] || "";
  const safe = /^https?:\/\//i.test(cover) ? cover : "";
  const recent = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 5);
  const close = () => els.dialog.close();
  openPluginDialog({
    title: folderName(dir),
    render: (el) => {
      el.innerHTML = `
        <div class="cc">
          <div class="cc-cover">${safe ? `<img src="${escapeHtml(safe)}" alt="" draggable="false">` : ""}</div>
          <div class="cc-head">${icon(customIcon(dir) || "folder", 30)}<div>
            <h2>${escapeHtml(folderName(dir))}</h2>
            <p class="muted small">${notes.length} nota${notes.length === 1 ? "" : "s"} · ${bases.length} base${bases.length === 1 ? "" : "s"} · ${openTasks} tarefa${openTasks === 1 ? "" : "s"} aberta${openTasks === 1 ? "" : "s"}</p>
          </div></div>
          <div class="cc-actions">
            <button type="button" class="btn primary" data-go="open">${icon("folder-open", 15)} Abrir coleção</button>
            <button type="button" class="btn" data-go="new">${icon("file-plus", 15)} Nova nota</button>
            <button type="button" class="btn" data-go="tasks">${icon("check-square", 15)} Tarefas</button>
          </div>
          ${bases.length ? `<p class="cc-section">Bases</p><div class="cc-list">${bases
            .map((b) => `<button type="button" class="cc-item" data-base="${escapeHtml(b.path)}">${icon("database", 16)}<span>${escapeHtml(stripExt(baseName(b.path)))}</span><small>${ctx.countBaseRows(b.path)} linhas</small></button>`)
            .join("")}</div>` : ""}
          ${recent.length ? `<p class="cc-section">Notas recentes</p><div class="cc-list">${recent
            .map((f) => `<button type="button" class="cc-item" data-open="${escapeHtml(f.path)}">${icon("file-text", 16)}<span>${escapeHtml(stripExt(baseName(f.path)))}</span><small>${relativeTime(f.mtime)}</small></button>`)
            .join("")}</div>` : ""}
        </div>`;
      el.querySelector('[data-go="open"]').addEventListener("click", () => {
        close();
        openView(`@pasta/${dir}`);
      });
      el.querySelector('[data-go="new"]').addEventListener("click", () => {
        close();
        createNote(dir);
      });
      el.querySelector('[data-go="tasks"]').addEventListener("click", () => {
        close();
        openView(`@tasks/${dir}`);
      });
      for (const b of el.querySelectorAll("[data-base], [data-open]")) {
        b.addEventListener("click", () => {
          close();
          openNote(b.dataset.base || b.dataset.open);
        });
      }
    },
  });
}

// Página da coleção: as ações chamam as mesmas funções dos menus.
function renderCollectionPage(dir) {
  renderCollection(els.page, makeCtx(), dir, {
    cover: state.covers?.[dir] || "",
    iconName: iconNameOf(dir) || "folder",
    iconFor: (p) => iconNameOf(p),
    onCover: () => chooseCover(dir),
    onIcon: () => chooseIcon(dir),
    onNewNote: () => createNote(dir),
    openNote: (p) => openNote(p),
    openFolder: (p) => openView(`@pasta/${p}`),
  });
}

async function chooseCover(dir) {
  const current = state.covers?.[dir] || "";
  const url = await askText(`Capa de ${folderName(dir)}`, current, "Endereço https da imagem (deixe vazio para tirar)");
  if (url === null) return;
  try {
    state.covers = setCover(state.covers, dir, url);
    storage.set("covers.v1", state.covers);
    renderMain();
    renderTree();
  } catch (err) {
    toast(err.message, "error");
  }
}

// Abre o seletor de ícones perto da linha da árvore. Espera o catálogo se ele ainda não chegou.
async function chooseIcon(path) {
  const { CATALOG } = await import("./iconcatalog.js");
  registerIcons(CATALOG);
  const row = [...els.tree.querySelectorAll("[data-path], [data-folder]")].find((el) => (el.dataset.path || el.dataset.folder) === path);
  const anchor = row ? row.getBoundingClientRect() : els.tree.getBoundingClientRect();
  openIconPicker(anchor, {
    catalog: CATALOG,
    current: state.iconMap?.[path] || "",
    onPick: (name) => {
      state.iconMap = setIconFor(state.iconMap, path, name);
      persistIconMap();
      renderTree();
    },
    onClear: () => {
      state.iconMap = removeIconFor(state.iconMap, path);
      persistIconMap();
      renderTree();
    },
  });
}

function treeHtml(node, depth) {
  let out = "";
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  for (const f of folders) {
    const collapsed = !!state.ws.collapsed[`dir:${f.path}`];
    const custom = customIcon(f.path);
    out += `<button class="tree-row folder${selCls(f.path, true)}" draggable="true" role="treeitem" aria-expanded="${!collapsed}" data-folder="${escapeHtml(f.path)}" style="padding-left:${6 + depth * 14}px">
      ${icon("chevron-right", 14, "caret")}${custom ? icon(custom, 16) : icon(collapsed ? "folder" : "folder-open", 16)}<span class="name">${escapeHtml(f.name)}</span></button>`;
    if (!collapsed) out += `<div role="group">${treeHtml(f, depth + 1)}</div>`;
  }
  const files = [...node.files].filter((f) => baseName(f.path) !== ".keep").sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), "pt-BR"));
  for (const f of files) {
    const active = f.path === state.active ? " active" : "";
    out += `<button class="tree-row${active}${selCls(f.path, false)}" draggable="true" role="treeitem" data-path="${escapeHtml(f.path)}" style="padding-left:${6 + depth * 14 + 18}px" title="${escapeHtml(f.path)}">
      ${icon(customIcon(f.path) || (extOf(f.path) === "md" ? "file-text" : extOf(f.path) === "canvas" ? "layers" : extOf(f.path) === "base" ? "database" : "file"), 16)}<span class="name">${escapeHtml("md canvas base".split(" ").includes(extOf(f.path)) ? stripExt(baseName(f.path)) : baseName(f.path))}</span></button>`;
  }
  return out;
}

// Menu "⋯" da nota: forma de ver, ações e propriedades.
function openMoreMenu(e) {
  const path = state.active;
  if (!isNotePath(path)) return;
  const r = e.currentTarget.getBoundingClientRect();
  showContextMenu(r.right - 230, r.bottom + 4, [
    { label: els.app.dataset.ctx === "closed" ? "Mostrar propriedades e links" : "Ocultar propriedades e links", icon: "panel-right", run: toggleCtx },
    { sep: true },
    { label: "Abrir ao lado", icon: "columns", run: () => openSplit(path) },
    { label: "Renomear…", icon: "edit", run: () => renameActive(path) },
    { label: "Duplicar", icon: "copy", run: () => duplicateActive(path) },
    { label: state.ws.bookmarks.includes(path) ? "Tirar dos favoritos" : "Adicionar aos favoritos", icon: "star", run: () => toggleBookmark(path) },
    { label: "Copiar caminho", icon: "link", run: () => copyPath(false, path) },
    { sep: true },
    { label: "Baixar como .md", icon: "download", run: downloadNote },
    { label: "Exportar em PDF", icon: "file", run: exportPdf },
    { sep: true },
    { label: "Excluir", icon: "trash", danger: true, run: () => deleteActive(path) },
  ]);
}

// --- Menus de contexto (botão direito) -------------------------------------------------------------------------------------

function fileMenuItems(path) {
  const note = state.vault.has(path) && extOf(path) === "md";
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const marked = state.ws.bookmarks.includes(path);
  return [
    { label: "Abrir", icon: "file-text", run: () => openNote(path) },
    { label: "Abrir ao lado", icon: "columns", hidden: !note, run: () => openSplit(path) },
    { sep: true },
    { label: "Renomear…", icon: "edit", run: () => renameActive(path) },
    { label: "Duplicar", icon: "copy", run: () => duplicateActive(path) },
    { label: marked ? "Tirar dos favoritos" : "Adicionar aos favoritos", icon: "star", run: () => toggleBookmark(path) },
    { sep: true },
    { label: "Nova nota aqui", icon: "file-plus", run: () => createNote(dir) },
    { label: "Mudar ícone…", icon: "tag", run: () => chooseIcon(path) },
    { label: "Copiar caminho", icon: "link", run: () => copyPath(false, path) },
    { sep: true },
    { label: "Excluir", icon: "trash", danger: true, run: () => deleteActive(path) },
  ];
}

function folderMenuItems(dir) {
  return [
    { label: "Nova nota aqui", icon: "file-plus", run: () => createNote(dir) },
    { label: "Novo canvas aqui", icon: "layers", run: () => createCanvas(dir) },
    { label: "Nova base aqui", icon: "database", run: () => createBase(dir) },
    { label: "Nova wiki aqui", icon: "book", run: () => createWiki(dir) },
    { label: "Nova página da wiki", icon: "file-plus", hidden: !isWikiFolder(dir), run: () => createWikiPage(dir) },
    { label: "Nova pasta aqui", icon: "folder-plus", run: () => createFolder(dir) },
    { label: "Mudar ícone…", icon: "tag", hidden: !dir, run: () => chooseIcon(dir) },
    { label: "Abrir coleção", icon: "folder-open", hidden: !dir, run: () => openView(`@pasta/${dir}`) },
    { label: "Capa da coleção…", icon: "image", hidden: !dir, run: () => chooseCover(dir) },
    { label: "Tarefas desta coleção", icon: "check-square", hidden: !dir, run: () => openView(`@tasks/${dir}`) },
    { sep: true },
    { label: "Renomear pasta…", icon: "edit", hidden: !dir, run: () => renameFolder(dir) },
    { label: "Excluir pasta…", icon: "trash", danger: true, hidden: !dir, run: () => deleteFolder(dir) },
    { sep: true },
    { label: "Copiar caminho", icon: "link", hidden: !dir, run: () => copyText(dir, "Caminho copiado") },
  ];
}

function onTreeContext(e) {
  const folder = e.target.closest("[data-folder]");
  if (folder) return openAtEvent(e, folderMenuItems(folder.dataset.folder));
  const file = e.target.closest("[data-path]");
  if (file) return openAtEvent(e, fileMenuItems(file.dataset.path));
  openAtEvent(e, folderMenuItems(""));
}

function onTabsContext(e) {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  const id = tab.dataset.id;
  const pinned = state.ws.pinned.includes(id);
  const real = !isView(id) && state.vault.has(id);
  const idx = state.ws.tabs.indexOf(id);
  openAtEvent(e, [
    { label: "Fechar", icon: "x", run: () => closeTab(id) },
    { label: "Fechar as outras", icon: "x-circle", hidden: state.ws.tabs.length < 2, run: () => closeOtherTabs(id) },
    { label: "Fechar as da direita", icon: "chevron-right", hidden: idx === state.ws.tabs.length - 1, run: () => { for (const t of state.ws.tabs.slice(idx + 1)) if (!state.ws.pinned.includes(t)) closeTab(t); } },
    { sep: true },
    { label: pinned ? "Soltar aba" : "Fixar aba", icon: "pin", run: () => togglePinActive(id) },
    { label: "Abrir ao lado", icon: "columns", hidden: !real || extOf(id) !== "md", run: () => openSplit(id) },
    { label: "Copiar caminho", icon: "link", hidden: !real, run: () => copyPath(false, id) },
  ]);
}

function onResultsContext(e) {
  const hit = e.target.closest("[data-path]");
  if (hit) openAtEvent(e, fileMenuItems(hit.dataset.path));
}

function onTreeClick(e) {
  const row = e.target.closest("[data-folder],[data-path]");
  if (row && (e.ctrlKey || e.metaKey || e.shiftKey)) return toggleTreeSelection(row, { range: e.shiftKey, toggle: e.ctrlKey || e.metaKey });
  if (state.treeSel.size) {
    state.treeSel.clear();
    state.treeAnchor = null;
    renderTree();
  }
  const folder = e.target.closest("[data-folder]");
  if (folder) {
    // a setinha recolhe e expande; o resto da linha abre a coleção (carta de abertura)
    if (e.target.closest(".caret")) {
      const key = `dir:${folder.dataset.folder}`;
      state.ws.collapsed[key] = !state.ws.collapsed[key];
      persistWorkspace();
      renderTree();
      return;
    }
    return openCollectionCard(folder.dataset.folder);
  }
  const file = e.target.closest("[data-path]");
  if (file && (e.altKey || e.ctrlKey || e.metaKey)) return openSplit(file.dataset.path);
  if (file) openNote(file.dataset.path);
}

function renderSearch() {
  const q = els.search.value.trim();
  if (!q) {
    els.results.innerHTML = `<div class="empty-inline"><p>Digite para buscar no texto e nos nomes das notas.</p><p>Use <code>tag:ideia</code>, <code>path:Projetos</code> ou <code>-termo</code> para refinar.</p></div>`;
    return;
  }
  const hits = state.index.search(q);
  els.results.innerHTML = hits.length
    ? hits.slice(0, 100).map((h) => `<button class="result" data-path="${escapeHtml(h.path)}"><div class="title">${escapeHtml(stripExt(baseName(h.path)))}</div><div class="path">${escapeHtml(h.path)}</div><div class="snippet">${escapeHtml(h.snippet)}</div></button>`).join("")
    : `<div class="empty-inline"><p>Nenhum resultado para “${escapeHtml(q)}”.</p></div>`;
}

// ---------------------------------------------------------------------------
// Barra de contexto

function renderCtx() {
  const path = state.active;
  const isNote = isNotePath(path);
  els.ctxScroll.innerHTML = "";
  if (!isNote) {
    els.ctxScroll.innerHTML = isBase(path)
      ? `<div class="empty-inline">${icon("database", 22)}<p>Esta é uma base de dados: tabela, lista, quadro e calendário com as propriedades das notas. Editar uma célula grava no frontmatter da nota.</p></div>`
      : isCanvas(path)
      ? `<div class="empty-inline">${icon("layers", 22)}<p>Este é um canvas: cartões de texto, notas e links ligados por setas. O arquivo guarda só os cartões; a posição da câmera fica à parte.</p></div>`
      : `<div class="empty-inline">${icon("file-text", 22)}<p>Abra uma nota para ver as propriedades, os links recebidos e a estrutura dela aqui.</p></div>`;
    appendPluginPanels();
    return;
  }
  const meta = state.index.meta(path);
  const backlinks = state.index.backlinks(path);
  const outgoing = state.index.outgoing(path);
  const unique = new Map();
  for (const l of outgoing) if (!unique.has(l.target)) unique.set(l.target, l);
  const links = [...unique.values()];
  const fm = Object.entries(meta.frontmatter || {});
  const unlinkedOpen = state.ws.collapsed["panel:unlinked"] === false;
  const mentions = unlinkedOpen ? findUnlinkedMentions(state.vault, path) : [];
  const noteTitle = stripExt(baseName(path));

  const panels = [
    {
      key: "props", title: "Propriedades", icon: "list", count: fm.length || "",
      body: () => {
        const issues = diagnoseFrontmatter(state.vault.read(path));
        const warn = issues.length
          ? `<div class="fm-issues" role="alert">${issues.map((i) => `<p>${icon("alert", 14)}<span><strong>Linha ${i.line}:</strong> ${escapeHtml(i.message)}</span></p>`).join("")}</div>`
          : "";
        const list = fm.length
          ? `<dl class="props">${fm.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(Array.isArray(v) ? v.join(", ") : String(v))}</dd>`).join("")}</dl>`
          : issues.length ? "" : `<p class="muted small">Esta nota ainda não tem propriedades. Use <code>---</code> no começo do arquivo para criar o bloco de propriedades.</p>`;
        return warn + list;
      },
    },
    {
      key: "backlinks", title: "Links recebidos", icon: "link", count: backlinks.length,
      body: () => backlinks.length
        ? backlinks.map((b) => `<button class="link-row" data-path="${escapeHtml(b.source)}">${icon("file-text", 15)}<span class="name">${escapeHtml(stripExt(baseName(b.source)))}</span><span class="meta">${b.lines.length}</span></button>`).join("")
        : `<p class="muted small">Nenhuma nota cita esta. Use <code>[[${escapeHtml(stripExt(baseName(path)))}]]</code> em outra nota.</p>`,
    },
    {
      key: "unlinked", title: "Menções sem link", icon: "search", count: unlinkedOpen ? mentions.length : "",
      body: () => !unlinkedOpen
        ? `<p class="muted small">Abra este painel para procurar o nome desta nota em outras notas.</p>`
        : mentions.length
          ? mentions.map((m) => `<div class="mention-row"><button class="mention-open" data-path="${escapeHtml(m.source)}">${icon("file-text", 15)}<span class="name">${escapeHtml(stripExt(baseName(m.source)))}</span><span class="meta">${m.count}×</span></button><div class="snippet">${escapeHtml(m.snippet)}</div><button class="btn sm" data-link-from="${escapeHtml(m.source)}">${icon("link", 14)} Vincular</button></div>`).join("")
          : `<p class="muted small">Nenhuma outra nota cita “${escapeHtml(noteTitle)}” sem link.</p>`,
    },
    {
      key: "outgoing", title: "Links de saída", icon: "arrow-right", count: links.length,
      body: () => links.length
        ? links.map((l) => l.resolved
            ? `<button class="link-row" data-path="${escapeHtml(l.resolved)}">${icon("file-text", 15)}<span class="name">${escapeHtml(stripExt(baseName(l.resolved)))}</span></button>`
            : `<button class="link-row broken" data-create="${escapeHtml(l.target)}" title="Criar esta nota">${icon("link-broken", 15)}<span class="name">${escapeHtml(l.target)}</span><span class="meta">criar</span></button>`).join("")
        : `<p class="muted small">Esta nota não cita outras.</p>`,
    },
    {
      key: "outline", title: "Estrutura", icon: "outline", count: meta.headings.length || "",
      body: () => meta.headings.length
        ? meta.headings.map((h, i) => `<button class="outline-row l${h.level}" data-line="${h.line}" data-index="${i}">${escapeHtml(h.text)}</button>`).join("")
        : `<p class="muted small">Sem títulos. Comece uma linha com <code>#</code>.</p>`,
    },
    { key: "local-graph", title: "Grafo local", icon: "graph", count: "", body: null },
    { key: "comments", title: "Discussões", icon: "message", count: commentsOf(state.comments, path).filter((d) => !d.resolved).length || "", body: () => commentsHtml(path) },
    { key: "layout", title: "Fonte, tamanho e largura", icon: "type", count: "", body: () => layoutHtml() },
  ];

  // Seções: os painéis ficam agrupados (Propriedades, Links, Estrutura); cada seção e cada painel recolhem sozinhos.
  const GROUPS = [
    { key: "props", title: "Propriedades", icon: "list", panels: ["props"] },
    { key: "comments", title: "Comentários", icon: "message", panels: ["comments"] },
    { key: "links", title: "Links", icon: "link", panels: "backlinks unlinked outgoing".split(" ") },
    { key: "structure", title: "Estrutura", icon: "outline", panels: ["outline", "local-graph"] },
    { key: "layout", title: "Layout do editor", icon: "sliders", panels: ["layout"] },
  ];
  const bar = document.createElement("div");
  bar.className = "ctx-bar";
  bar.innerHTML = `<span>${escapeHtml(noteTitle)}</span><button type="button" class="ctx-all" data-ctx-all="collapse" title="Recolher todas as seções">${icon("chevrons-up", 14)}<span>Recolher tudo</span></button><button type="button" class="ctx-all" data-ctx-all="expand" title="Expandir todas as seções">${icon("chevron-down", 14)}<span>Expandir</span></button>`;
  els.ctxScroll.append(bar);
  for (const g of GROUPS) {
    const gsec = document.createElement("section");
    gsec.className = "ctx-group";
    const gCollapsed = !!state.ws.collapsed[`group:${g.key}`];
    gsec.dataset.collapsed = String(gCollapsed);
    const total = g.panels.reduce((n, k) => n + (Number(panels.find((p) => p.key === k)?.count) || 0), 0);
    gsec.innerHTML = `<button class="ctx-group-head" aria-expanded="${!gCollapsed}">${icon("chevron-down", 14, "caret")}${icon(g.icon, 15)}<span>${g.title}</span>${total ? `<span class="count">${total}</span>` : ""}</button><div class="ctx-group-body"></div>`;
    const gbody = $(".ctx-group-body", gsec);
    for (const key of g.panels) {
      const p = panels.find((x) => x.key === key);
      const sec = document.createElement("section");
      sec.className = "panel";
      sec.dataset.collapsed = String(!!state.ws.collapsed[`panel:${p.key}`]);
      sec.innerHTML = `<button class="panel-head" aria-expanded="${sec.dataset.collapsed !== "true"}">${icon("chevron-down", 14, "caret")}<span>${p.title}</span><span class="count">${p.count}</span></button><div class="panel-body"></div>`;
      const body = $(".panel-body", sec);
      if (p.body) body.innerHTML = p.body();
      else attachLocalGraph(body, path);
      $(".panel-head", sec).addEventListener("click", () => togglePanel(sec, p.key));
      gbody.append(sec);
    }
    $(".ctx-group-head", gsec).addEventListener("click", () => {
      const now = gsec.dataset.collapsed !== "true";
      gsec.dataset.collapsed = String(now);
      $(".ctx-group-head", gsec).setAttribute("aria-expanded", String(!now));
      state.ws.collapsed[`group:${g.key}`] = now;
      persistWorkspace();
    });
    els.ctxScroll.append(gsec);
  }
  for (const b of $$("[data-ctx-all]", bar)) {
    b.addEventListener("click", () => {
      const collapse = b.dataset.ctxAll === "collapse";
      for (const g of GROUPS) state.ws.collapsed[`group:${g.key}`] = collapse;
      persistWorkspace();
      renderCtx();
    });
  }
  appendPluginPanels();

  for (const b of $$("[data-path]", els.ctxScroll)) b.addEventListener("click", () => openNote(b.dataset.path));
  for (const b of $$("[data-create]", els.ctxScroll)) b.addEventListener("click", () => createNoteNamed(b.dataset.create));
  for (const b of $$("[data-link-from]", els.ctxScroll)) b.addEventListener("click", () => linkMention(b.dataset.linkFrom));
  for (const b of $$(".outline-row", els.ctxScroll)) b.addEventListener("click", () => goToHeading(b));
}

function togglePanel(sec, key) {
  const collapsed = sec.dataset.collapsed !== "true";
  sec.dataset.collapsed = String(collapsed);
  $(".panel-head", sec).setAttribute("aria-expanded", String(!collapsed));
  state.ws.collapsed[`panel:${key}`] = collapsed;
  persistWorkspace();
  if (key === "unlinked" && !collapsed) renderCtx();
}

function attachLocalGraph(body, path) {
  const g = state.index.graph();
  const near = new Set([path]);
  for (const e of g.edges) {
    if (e.source === path) near.add(e.target);
    if (e.target === path) near.add(e.source);
  }
  if (near.size < 2) {
    body.innerHTML = `<p class="muted small">Esta nota ainda não se liga a nenhuma outra.</p>`;
    return;
  }
  body.append(state.miniCanvas);
  state.graphMini.setData(
    { nodes: g.nodes.filter((n) => near.has(n.id)), edges: g.edges.filter((e) => near.has(e.source) && near.has(e.target)) },
    path,
  );
}

function appendPluginPanels() {
  for (const p of state.plugins?.panels() || []) {
    const sec = document.createElement("section");
    sec.className = "panel";
    sec.dataset.collapsed = String(!!state.ws.collapsed[`panel:${p.key}`]);
    sec.innerHTML = `<button class="panel-head" aria-expanded="${sec.dataset.collapsed !== "true"}">${icon("chevron-down", 14, "caret")}<span>${escapeHtml(p.title)}</span></button><div class="panel-body"></div>`;
    const body = $(".panel-body", sec);
    try {
      p.render(body);
    } catch (err) {
      body.innerHTML = `<p class="muted small">Erro no painel: ${escapeHtml(err.message)}</p>`;
    }
    $(".panel-head", sec).addEventListener("click", () => togglePanel(sec, p.key));
    els.ctxScroll.append(sec);
  }
}

function goToHeading(button) {
  const source = els.editor.value;
  const { bodyOffset } = parseFrontmatter(source);
  const lines = source.slice(bodyOffset).split(/\r?\n/);
  let pos = bodyOffset;
  for (let i = 0; i < Number(button.dataset.line); i++) pos += lines[i].length + 1;
  els.editor.focus();
  els.editor.setSelectionRange(pos, pos);
  const before = source.slice(0, pos).split("\n").length;
  els.editor.scrollTop = Math.max(0, (before - 3) * 26);
}

function renderStatus(text) {
  const notes = state.vault.markdownFiles().length;
  const links = state.vault.markdownFiles().reduce((n, f) => n + state.index.outgoing(f.path).length, 0);
  els.statusVault.textContent = `${notes} ${notes === 1 ? "nota" : "notas"} · ${links} links`;
  if (isCanvas(state.active) && state.vault.has(state.active)) {
    const data = state.canvas?.view.data() || parseCanvas(state.vault.read(state.active)).data;
    els.statusNote.textContent = `${data.nodes.length} ${data.nodes.length === 1 ? "cartão" : "cartões"} · ${data.edges.length} ${data.edges.length === 1 ? "ligação" : "ligações"}`;
    return;
  }
  if (isBase(state.active) && state.vault.has(state.active)) {
    const st = state.base?.view.stats();
    els.statusNote.textContent = st ? `${st.shown} de ${st.rows} notas · ${st.view}` : "";
    return;
  }
  if (!isNotePath(state.active)) {
    els.statusNote.textContent = "";
    return;
  }
  const src = text ?? state.vault.read(state.active);
  const words = (src.match(/\S+/g) || []).length;
  els.statusNote.textContent = `${words} ${words === 1 ? "palavra" : "palavras"} · ${src.length} caracteres`;
}

// ---------------------------------------------------------------------------
// Criar, renomear, excluir

function uniqueName(base) {
  let name = base;
  let n = 2;
  while (state.vault.has(`${name}.md`)) name = `${base} ${n++}`;
  return name;
}

// Pasta onde criar: a que veio do menu de contexto (texto), ou a da nota aberta.
function targetDir(arg) {
  if (typeof arg === "string") return arg;
  const here = state.active && !isView(state.active) ? state.active : "";
  return here.includes("/") ? here.slice(0, here.lastIndexOf("/")) : "";
}

async function createNote(arg) {
  const dir = targetDir(arg);
  const name = await askText("Nova nota", uniqueName("Sem título"), "Nome da nota");
  if (!name) return;
  const path = normalizePath(`${dir ? `${dir}/` : ""}${name.replace(/\.md$/i, "")}.md`);
  createFileAndOpen(path, `# ${stripExt(baseName(path))}\n\n`);
}

// Importa arquivos de fora para dentro da biblioteca (uma cópia): a biblioteca não abre arquivos que não são dele.
async function importFromFiles(files) {
  const here = state.active && !isView(state.active) ? state.active : "";
  const dir = here.includes("/") ? here.slice(0, here.lastIndexOf("/")) : "";
  const read = [];
  for (const f of files) {
    let text = null;
    try {
      text = await f.text();
    } catch {
      text = null;
    }
    read.push({ name: f.name, size: f.size, text });
  }
  const { done, failed } = importFiles(state.vault, read, { dir });
  if (done.length) {
    openNote(done[0]);
    toast(done.length === 1 ? `Importado: ${done[0]}` : `${done.length} arquivos importados`, "success");
  }
  for (const f of failed.slice(0, 3)) toast(`${f.name}: ${f.reason}`, "error");
}

function pickFilesToImport() {
  const input = Object.assign(document.createElement("input"), { type: "file", multiple: true, accept: ".md,.markdown,.txt,.canvas" });
  input.addEventListener("change", () => input.files.length && importFromFiles([...input.files]));
  input.click();
}

async function createCanvas(arg) {
  const dir = targetDir(arg);
  let base = "Canvas sem título";
  let n = 2;
  while (state.vault.has(`${dir ? `${dir}/` : ""}${base}.canvas`)) base = `Canvas sem título ${n++}`;
  const name = await askText("Novo canvas", base, "Nome do canvas");
  if (!name) return;
  const path = normalizePath(`${dir ? `${dir}/` : ""}${name.replace(/\.canvas$/i, "")}.canvas`);
  try {
    state.vault.create(path, serializeCanvas(emptyCanvas()));
    openNote(path);
    toast(`Canvas criado: ${path}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

// Base de dados: escolhe um modelo (leituras, contatos, despesas, projetos ou em branco) e depois o nome.
function createBase(arg) {
  const dir = targetDir(arg);
  openPluginDialog({
    title: "Nova base de dados",
    render: (el) => {
      el.innerHTML = `
        <p class="muted small">Uma base organiza registros em tabela, quadro, lista ou calendário. Escolha um modelo para começar:</p>
        <div class="tpl-grid">${BASE_TEMPLATES.map((t) => `
          <button type="button" class="tpl-card" data-tpl="${t.id}">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="muted small">${escapeHtml(t.hint)}</span>
          </button>`).join("")}</div>`;
      for (const b of el.querySelectorAll("[data-tpl]")) {
        b.addEventListener("click", async () => {
          els.dialog.close();
          await makeBase(dir, b.dataset.tpl);
        });
      }
    },
  });
}

async function makeBase(dir, templateId) {
  const tpl = BASE_TEMPLATES.find((t) => t.id === templateId) || BASE_TEMPLATES[0];
  let name = tpl.name;
  let n = 2;
  while (state.vault.has(`${dir ? `${dir}/` : ""}${name}.base`)) name = `${tpl.name} ${n++}`;
  const chosen = await askText("Nome da base", name, "Como você quer chamar esta base?");
  if (!chosen) return;
  const path = normalizePath(`${dir ? `${dir}/` : ""}${chosen.replace(/\.base$/i, "")}.base`);
  try {
    state.vault.create(path, serializeBase(templateBase(tpl.id, { folder: dir })));
    openNote(path);
    toast(`Base criada: ${path}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

// Wiki: uma pasta com a página "Início" (texto, sumário e índice automático das páginas).
async function createWiki(arg) {
  const dir = targetDir(arg);
  let name = "Wiki";
  let n = 2;
  while (state.vault.has(`${dir ? `${dir}/` : ""}${name}/${WIKI_HOME}.md`)) name = `Wiki ${n++}`;
  const chosen = await askText("Nova wiki", name, "Nome da wiki");
  if (!chosen) return;
  const folder = normalizePath(`${dir ? `${dir}/` : ""}${chosen.trim()}`);
  const home = `${folder}/${WIKI_HOME}.md`;
  try {
    state.vault.create(home, wikiHomeText(chosen.trim(), todayIsoLocal()));
    state.vault.create(`${folder}/Páginas.base`, serializeBase(wikiIndexBase(folder)));
    openNote(home);
    toast(`Wiki criada: ${folder}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

function isWikiFolder(dir) {
  return !!dir && state.vault.has(`${dir}/${WIKI_HOME}.md`) && isWikiHome(state.vault.read(`${dir}/${WIKI_HOME}.md`));
}

// Página nova dentro da wiki: já nasce como rascunho, com responsável vazio e a data de hoje.
async function createWikiPage(dir) {
  const title = await askText("Nova página", "Nova página", "Título da página");
  if (!title) return;
  const path = normalizePath(`${dir}/${title.trim().replace(/\.md$/i, "")}.md`);
  try {
    state.vault.create(path, wikiPageText(title.trim(), todayIsoLocal()));
    openNote(path);
  } catch (err) {
    toast(err.message, "error");
  }
}

const todayIsoLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Escolhe uma nota da biblioteca numa caixa com filtro; devolve o caminho ou null.
function pickNoteDialog(kind = "notes") {
  return new Promise((resolve) => {
    const bases = kind === "bases";
    const canvases = kind === "canvas";
    const all = kind === "all";
    els.dialogTitle.textContent = bases ? "Escolher uma base de dados" : canvases ? "Escolher um canvas" : all ? "Escolher uma nota ou canvas" : "Escolher uma nota";
    els.dialogBody.innerHTML = `<label class="sr-only" for="pick-q">Filtrar notas</label><input id="pick-q" class="field" placeholder="Filtrar notas" autocomplete="off"><div class="pick-list" id="pick-list" role="listbox"></div><div class="dialog-actions">${bases ? `<button class="btn primary" data-new-base>${icon("plus", 15)} Criar uma base nova</button>` : ""}<button class="btn" data-cancel>Cancelar</button></div>`;
    const input = $("#pick-q", els.dialogBody);
    const list = $("#pick-list", els.dialogBody);
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      els.dialog.close();
      resolve(v);
    };
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const pool = bases ? state.vault.list().filter((f) => extOf(f.path) === "base") : canvases ? state.vault.list().filter((f) => extOf(f.path) === "canvas") : all ? state.vault.list().filter((f) => ["md", "canvas"].includes(extOf(f.path))) : state.vault.markdownFiles();
      const hits = pool.filter((f) => !q || f.path.toLowerCase().includes(q)).slice(0, 50);
      list.innerHTML = hits.length
        ? hits.map((f) => `<button class="pick-item" role="option" data-path="${escapeHtml(f.path)}">${icon(bases ? "database" : canvases ? "layers" : "file-text", 15)}<span>${escapeHtml(stripExt(baseName(f.path)))}</span><small>${escapeHtml(f.path)}</small></button>`).join("")
        : `<p class="muted small">${bases ? "Nenhuma base ainda: crie uma nova." : canvases ? "Nenhum canvas ainda." : "Nenhuma nota encontrada."}</p>`;
    };
    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish($(".pick-item", list)?.dataset.path || null);
    });
    els.dialogBody.onclick = (e) => {
      const it = e.target.closest("[data-path]");
      if (it) finish(it.dataset.path);
      if (e.target.closest("[data-cancel]")) finish(null);
      if (e.target.closest("[data-new-base]")) finish("@new");
    };
    els.dialog.addEventListener("close", () => finish(null), { once: true });
    draw();
    els.dialog.showModal();
    input.focus();
  });
}

// Escolhe (ou cria, na pasta da nota) a base que entra num bloco de base de dados; devolve o nome do arquivo.
async function chooseBaseFor(notePath) {
  const picked = await pickNoteDialog("bases");
  if (!picked) return null;
  if (picked !== "@new") return baseName(picked);
  const dir = notePath.includes("/") ? notePath.slice(0, notePath.lastIndexOf("/")) : "";
  const title = stripExt(baseName(notePath));
  let name = `${title} - base`;
  let n = 2;
  while (state.vault.has(`${dir ? `${dir}/` : ""}${name}.base`)) name = `${title} - base ${n++}`;
  const path = normalizePath(`${dir ? `${dir}/` : ""}${name}.base`);
  state.vault.create(path, serializeBase(defaultBase({ folder: dir })));
  toast(`Base criada: ${path}`, "success");
  return `${name}.base`;
}

function createNoteNamed(target) {
  const clean = target.replace(/[\\/:*?"<>|]/g, "-").trim() || "Sem título";
  createFileAndOpen(`${clean}.md`, `# ${clean}\n\n`);
}

function createFileAndOpen(path, content) {
  try {
    state.vault.create(path, content);
    openNote(path);
    toast(`Nota criada: ${path}`, "success");
    setTimeout(() => els.editor.focus(), 0);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function createFolder(arg) {
  const parent = typeof arg === "string" ? arg : "";
  const name = await askText("Nova pasta", "Pasta", "Nome da pasta");
  if (!name) return;
  try {
    state.vault.create(normalizePath(`${parent ? `${parent}/` : ""}${name}/.keep`), "");
    toast(`Pasta criada: ${name}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

// Funções abaixo: o argumento opcional é um caminho (menu de contexto); sem ele valem para a nota aberta.
const pathArg = (a) => (typeof a === "string" ? a : state.active);

async function renameActive(arg) {
  const path = pathArg(arg);
  if (!path || isView(path)) return;
  const current = stripExt(baseName(path));
  const ext = extOf(path) || "md";
  const name = await askText(isCanvas(path) ? "Renomear canvas" : isBase(path) ? "Renomear base" : "Renomear nota", current, "Novo nome");
  if (!name || name === current) return;
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  try {
    state.vault.rename(path, `${dir}${name.replace(new RegExp(`\\.${ext}$`, "i"), "")}.${ext}`);
    toast("Nota renomeada e links atualizados", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function deleteActive(arg) {
  const path = pathArg(arg);
  if (!path || isView(path)) return;
  const ok = await askConfirm(`Excluir “${stripExt(baseName(path))}”? Ela vai para a lixeira e pode ser restaurada por 30 dias.`, "Excluir nota", "Excluir");
  if (!ok) return;
  state.vault.remove(path);
  toast("Nota excluída", "success");
}

function downloadNote() {
  if (!state.active || isView(state.active)) return;
  download(baseName(state.active), state.vault.read(state.active), "text/markdown");
}

// ---------------------------------------------------------------------------
// Pasta do disco

function replaceVault(vault, { keepTabs = false } = {}) {
  state.disk?.stop();
  state.disk = null;
  state.vault = vault;
  state.plugins?.setVault(vault);
  state.index = new MetadataIndex(vault);
  state.ws.tabs = keepTabs ? state.ws.tabs.filter((p) => isView(p) || vault.has(p)) : ["@home"];
  if (state.ws.tabs.length === 0) state.ws.tabs = ["@home"];
  if (!state.ws.tabs.includes(state.active)) state.active = state.ws.tabs[0];
  els.vaultName.textContent = vault.name;
  bindVaultEvents();
  persistVault();
  render();
}

function attachDisk(handle) {
  state.disk = new DiskSync(state.vault, handle, {
    onError: (err) => {
      setStatus("Erro ao gravar no disco", "error");
      toast(`Não foi possível gravar: ${err.message}`, "error");
    },
  });
  state.diskHandle = handle;
  state.pendingHandle = null;
}

async function connectFolder(handle, { quiet = false } = {}) {
  if (!(await ensurePermission(handle, true))) {
    toast("Permissão negada para gravar nesta pasta", "error");
    return false;
  }
  const { vault, skipped } = await readFolder(handle);
  replaceVault(vault);
  attachDisk(handle);
  await diskHandles.save(handle);
  updateDiskUi();
  if (!quiet) {
    const extra = skipped.binary ? `, ${skipped.binary} binários ignorados` : "";
    toast(`Pasta conectada: ${handle.name} (${state.vault.files.size} arquivos${extra})`, "success");
  }
  setStatus("Sincronizado com o disco");
  return true;
}

async function chooseFolder() {
  if (!isSupported()) {
    toast("Este navegador não tem acesso a pastas. Use o Chrome ou o Edge.", "error");
    return;
  }
  try {
    await connectFolder(await pickFolder());
  } catch (err) {
    if (err?.name !== "AbortError") toast(`Não foi possível abrir a pasta: ${err.message}`, "error");
  }
}

async function reconnectFolder() {
  if (!state.pendingHandle) return;
  try {
    await connectFolder(state.pendingHandle);
  } catch (err) {
    toast(`Não foi possível reconectar: ${err.message}`, "error");
  }
}

async function reloadFolder() {
  if (!state.diskHandle) return;
  await state.disk?.flush();
  try {
    const handle = state.diskHandle;
    const { vault } = await readFolder(handle);
    replaceVault(vault, { keepTabs: true });
    attachDisk(handle);
    updateDiskUi();
    toast("Sophyra recarregada do disco", "success");
  } catch (err) {
    toast(`Não foi possível recarregar: ${err.message}`, "error");
  }
}

async function disconnectFolder() {
  await state.disk?.flush();
  state.disk?.stop();
  state.disk = null;
  state.diskHandle = null;
  state.pendingHandle = null;
  await diskHandles.clear();
  updateDiskUi();
  setStatus("Salvo");
  toast("Pasta desconectada. A biblioteca continua no navegador.", "info");
}

function diskInfo() {
  const handle = state.diskHandle || state.pendingHandle;
  return { supported: isSupported(), connected: !!state.disk, waiting: !state.disk && !!state.pendingHandle, name: handle?.name || "" };
}

function updateDiskUi() {
  const d = diskInfo();
  els.diskPill.classList.toggle("on", d.connected);
  els.diskPill.classList.toggle("wait", d.waiting);
  els.diskLabel.textContent = d.connected ? `Pasta: ${d.name}` : d.waiting ? `Reconectar: ${d.name}` : d.supported ? "Só no navegador" : "Sem acesso a pastas";
}

// ---------------------------------------------------------------------------
// Exportar, importar, restaurar, apagar

function exportVault() {
  download(`${state.vault.name}.json`, JSON.stringify(state.vault.toJSON(), null, 2), "application/json");
}

function importVault() {
  if (state.disk) return toast("Desconecte a pasta antes de importar uma biblioteca.", "error");
  els.importFile.click();
}

async function importVaultFile(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const ok = await askConfirm("Importar substitui a biblioteca atual neste navegador. Continuar?", "Importar biblioteca", "Importar");
  if (!ok) return;
  try {
    replaceVault(Vault.fromJSON(JSON.parse(await file.text())));
    toast("Biblioteca importada", "success");
  } catch (err) {
    toast(`Arquivo inválido: ${err.message}`, "error");
  }
}

async function restoreSample() {
  if (state.disk) return toast("Desconecte a pasta antes de restaurar o exemplo.", "error");
  const ok = await askConfirm("Substituir a biblioteca atual pelo exemplo?", "Restaurar exemplo", "Restaurar");
  if (ok) replaceVault(sampleVault());
}

async function wipeData() {
  const ok = await askConfirm("Apagar a biblioteca, as abas e as configurações salvos neste navegador? Arquivos de uma pasta conectada não são tocados.", "Apagar dados locais", "Apagar");
  if (!ok) return;
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("sophyra.")).forEach((k) => localStorage.removeItem(k));
  } catch {
    // sem armazenamento: nada a apagar
  }
  await disconnectFolder();
  location.reload();
}

// Ações do diagrama de tabelas no canvas: exporta DBML e SQL, copia o esquema para agentes e importa um esquema revisado.
async function handleDiagram(kind, data) {
  if (kind === "dbml" || kind === "sql") {
    const issues = validateDiagram(data);
    if (issues.length) toast(`${issues[0]}${issues.length > 1 ? ` (mais ${issues.length - 1})` : ""}`, "info");
    if (kind === "dbml") download("diagrama.dbml", toDBML(data), "text/plain");
    else download("diagrama.sql", toSQL(data), "text/plain");
    return null;
  }
  if (kind === "agent") {
    const json = `${JSON.stringify(toAgentSchema(data), null, 2)}
`;
    try {
      await navigator.clipboard.writeText(json);
      toast("Esquema copiado. Cole no agente.", "success");
    } catch {
      download("diagrama-esquema.json", json, "application/json");
      toast("Não consegui copiar; baixei o esquema como arquivo.", "info");
    }
    return null;
  }
  if (kind === "import") {
    const text = await pickTextFile(".json,application/json");
    if (text === null) return null;
    const read = readAgentSchema(text);
    if (!read.ok) {
      toast(read.errors[0], "error");
      return null;
    }
    const { tables, relations } = read.schema;
    const ok = await askConfirm(`Importar ${tables.length} tabela(s) e ${relations.length} relação(ões)? As tabelas e relações deste canvas são trocadas pelas novas. Os outros cartões ficam como estão.`, "Importar esquema", "Importar");
    return ok ? applySchema(data, read.schema) : null;
  }
  return null;
}

function pickTextFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      resolve(file ? await file.text() : null);
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Plugins

async function initPlugins() {
  state.plugins = new PluginHost({
    vault: state.vault,
    storage,
    importer: (path) => (path.startsWith("local:") ? importLocalPlugin(path.slice(6)) : import(new URL(path, document.baseURI).href)),
    onChange: (info) => onPluginChange(info),
    dialog: (opts) => openPluginDialog(opts),
  });
  state.plugins.gate = (m) =>
    m.importado && !state.settings.pluginsComunidade ? "Os plugins da comunidade estão desligados. Ligue em Configurações › Plugins para carregar código importado." : null;
  state.plugins.getActiveNote = () => (isNotePath(state.active) ? state.active : null);
  // API de editor para plugins: só existe com uma nota aberta fora do modo de leitura.
  state.plugins.editorApi = () => {
    if (!isNotePath(state.active)) return null;
    const el = els.editor;
    return {
      getValue: () => el.value,
      getSelection: () => el.value.slice(el.selectionStart, el.selectionEnd),
      insertAtCursor: (text) => {
        replaceRange(el.selectionStart, el.selectionStart, text);
        onEditorInput();
      },
      replaceSelection: (text) => {
        replaceRange(el.selectionStart, el.selectionEnd, text);
        onEditorInput();
      },
    };
  };
  try {
    const res = await fetch(new URL("plugins/registry.json", document.baseURI));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.plugins.register(await res.json());
    for (const p of state.imported) {
      try {
        state.plugins.register([hostManifest(p)]);
      } catch (err) {
        toast(`Plugin importado ignorado (${p.id}): ${err.message}`, "error");
      }
    }
  } catch (err) {
    toast(`Não consegui ler os plugins: ${err.message}`, "error");
    return;
  }
  await state.plugins.restore();
  render();
}

function onPluginChange(info = {}) {
  if (info.notice) toast(info.notice, "info");
  if (info.open) openNote(info.open);
  if (info.view) return openView(`@plugin/${info.view}`);
  renderRibbon();
  renderCtx();
  if (state.active === "@home") renderMain();
}

function openPluginDialog({ title, render }) {
  els.dialogTitle.textContent = title || "Plugin";
  els.dialogBody.innerHTML = "";
  try {
    render(els.dialogBody);
  } catch (err) {
    els.dialogBody.innerHTML = `<p>Erro: ${escapeHtml(err.message)}</p>`;
  }
  els.dialogBody.insertAdjacentHTML("beforeend", `<div class="dialog-actions"><button class="btn" data-close>Fechar</button></div>`);
  els.dialogBody.querySelector("[data-close]").addEventListener("click", () => els.dialog.close());
  els.dialog.showModal();
}

// ---------------------------------------------------------------------------
// Caixas de diálogo

function askText(title, initial = "", label = "") {
  return new Promise((resolve) => {
    els.dialogTitle.textContent = title;
    els.dialogBody.innerHTML = `<label class="sr-only" for="dialog-input">${escapeHtml(label || title)}</label><input id="dialog-input" class="field" value="${escapeHtml(initial)}" autocomplete="off"><div class="dialog-actions"><button class="btn" data-cancel>Cancelar</button><button class="btn primary" data-ok>OK</button></div>`;
    const input = $("#dialog-input", els.dialogBody);
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      els.dialog.close();
      resolve(v);
    };
    els.dialogBody.onclick = (e) => {
      if (e.target.closest("[data-cancel]")) finish(null);
      if (e.target.closest("[data-ok]")) finish(input.value.trim() || null);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(input.value.trim() || null);
    });
    els.dialog.addEventListener("close", () => finish(null), { once: true });
    els.dialog.showModal();
    input.focus();
    input.select();
  });
}

function askConfirm(message, title = "Confirmar", action = "Confirmar") {
  return new Promise((resolve) => {
    els.dialogTitle.textContent = title;
    els.dialogBody.innerHTML = `<p>${escapeHtml(message)}</p><div class="dialog-actions"><button class="btn" data-cancel>Cancelar</button><button class="btn danger solid" data-ok>${escapeHtml(action)}</button></div>`;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      els.dialog.close();
      resolve(v);
    };
    els.dialogBody.onclick = (e) => {
      if (e.target.closest("[data-cancel]")) finish(false);
      if (e.target.closest("[data-ok]")) finish(true);
    };
    els.dialog.addEventListener("close", () => finish(false), { once: true });
    els.dialog.showModal();
    $("[data-cancel]", els.dialogBody).focus();
  });
}

// ---------------------------------------------------------------------------
// Paleta de comandos e troca rápida

// ---------------------------------------------------------------------------
// Navegação, abas e arquivo (comandos equivalentes a app:*, workspace:* e file-explorer:*)

const tabExists = (id) => (isView(id) ? !(featureOfView(id) && !featureOn(featureOfView(id))) : state.vault.has(id));

function goHistory(dir) {
  const id = dir < 0 ? state.nav.back(tabExists) : state.nav.forward(tabExists);
  if (!id) return toast(dir < 0 ? "Não há nota anterior." : "Não há próxima nota.", "info");
  state.navMoving = true;
  try {
    activate(id);
  } finally {
    state.navMoving = false;
  }
}

function switchTab(id) {
  if (id) activate(id);
}

function reopenClosedTab() {
  const id = state.closed.pop(tabExists, state.ws.tabs);
  if (!id) return toast("Nenhuma aba fechada para reabrir.", "info");
  activate(id);
}

function closeOtherTabs(arg) {
  const only = pathArg(arg);
  if (!only) return;
  const keep = new Set([only, ...state.ws.pinned]);
  for (const id of state.ws.tabs) if (!keep.has(id)) state.closed.push(id);
  state.ws.tabs = state.ws.tabs.filter((id) => keep.has(id));
  render();
}

function togglePinActive(arg) {
  const path = pathArg(arg);
  if (!path) return;
  state.ws.pinned = togglePin(state.ws.pinned, path);
  state.ws.tabs = orderTabs(state.ws.tabs, state.ws.pinned);
  render();
  toast(state.ws.pinned.includes(path) ? "Aba fixada" : "Aba solta", "success");
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage, "success");
  } catch {
    toast("O navegador não deixou copiar.", "error");
  }
}

function copyPath(full, arg) {
  const path = pathArg(arg);
  if (!state.vault.has(path || "") || isView(path)) return;
  copyText(full ? `${state.vault.name}/${path}` : path, full ? "Caminho completo copiado" : "Caminho copiado");
}

function randomNote() {
  const notes = state.vault.markdownFiles().filter((f) => !isHidden(f.path) && f.path !== state.active);
  if (!notes.length) return toast("Não há outra nota para abrir.", "info");
  openNote(notes[Math.floor(Math.random() * notes.length)].path);
}

function gotoDaily(step) {
  const today = new Date().toISOString().slice(0, 10);
  const target = adjacentDaily(state.vault.markdownFiles().map((f) => f.path), state.active, step, today);
  if (!target) return toast(step < 0 ? "Não há nota diária anterior." : "Não há nota diária seguinte.", "info");
  openNote(target);
}

function duplicateActive(arg) {
  const path = pathArg(arg);
  if (!path || isView(path) || !state.vault.has(path)) return;
  const ext = extOf(path);
  const base = path.slice(0, path.length - ext.length - 1);
  let n = 1;
  let copy = `${base} cópia.${ext}`;
  while (state.vault.has(copy)) copy = `${base} cópia ${++n}.${ext}`;
  state.vault.create(copy, state.vault.read(path));
  openNote(copy);
  toast(`Duplicado: ${copy}`, "success");
}

async function moveActive() {
  const path = state.active;
  if (!path || isView(path) || !state.vault.has(path)) return;
  const current = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  const dest = await askText("Mover para a pasta", current, "Pasta de destino (vazio = raiz da biblioteca)");
  if (dest === null) return;
  const folder = normalizePath(dest.replace(/^\/+|\/+$/g, ""));
  const target = normalizePath(`${folder ? `${folder}/` : ""}${baseName(path)}`);
  if (target === path) return;
  try {
    state.vault.rename(path, target, { updateLinks: false });
    toast(`Movido para ${folder || "a raiz da biblioteca"}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

function revealActive() {
  const path = state.active;
  if (!path || isView(path)) return;
  const parts = path.split("/");
  let acc = "";
  for (const part of parts.slice(0, -1)) {
    acc = acc ? `${acc}/${part}` : part;
    state.ws.collapsed[`dir:${acc}`] = false;
  }
  state.ws.sideTab = "files";
  els.app.dataset.side = "open";
  renderSide();
  renderRibbon();
  persistWorkspace();
  setTimeout(() => $(`#tree [data-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "center" }), 0);
}

function toggleBookmark(arg) {
  const path = pathArg(arg);
  if (!path || isView(path) || !state.vault.has(path)) return;
  const on = state.ws.bookmarks.includes(path);
  state.ws.bookmarks = on ? state.ws.bookmarks.filter((p) => p !== path) : [...state.ws.bookmarks, path];
  persistWorkspace();
  if (state.active === "@home") renderMain();
  toast(on ? "Removido dos favoritos" : "Adicionado aos favoritos", "success");
}

async function frontmatterCommand(kind) {
  const path = state.active;
  if (!isNotePath(path)) return;
  const text = state.vault.read(path);
  let next = text;
  if (kind === "alias") {
    const alias = await askText("Adicionar apelido", "", "Apelido da nota");
    if (!alias) return;
    next = addAlias(text, alias);
  } else if (kind === "property") {
    const entry = await askText("Adicionar propriedade", "", "nome: valor");
    if (!entry) return;
    const [key, ...rest] = entry.split(":");
    next = addProperty(text, key, rest.join(":").trim());
  } else if (kind === "clear") {
    if (!propertyKeys(text).length) return toast("Esta nota não tem propriedades.", "info");
    if (!(await askConfirm("Remover todas as propriedades desta nota?", "Limpar propriedades", "Remover"))) return;
    next = clearProperties(text);
  }
  if (next === text) return toast("Nada mudou.", "info");
  state.vault.write(path, next);
  setEditor(next, true);
  renderPreview();
}

function cycleTextWidth() {
  const keys = Object.keys(LARGURAS);
  const next = keys[(keys.indexOf(state.settings.larguraTexto) + 1) % keys.length];
  setSetting("larguraTexto", next, { quiet: true });
  toast(`Largura do texto: ${next}`, "info");
}

function jumpEditor(where) {
  const el = els.editor;
  el.focus();
  const at = where === "start" ? 0 : el.value.length;
  el.setSelectionRange(at, at);
  el.scrollTop = where === "start" ? 0 : el.scrollHeight;
  syncHighlightScroll();
}

function toggleSpellcheck() {
  els.editor.spellcheck = !els.editor.spellcheck;
  toast(els.editor.spellcheck ? "Corretor ortográfico ligado" : "Corretor ortográfico desligado", "info");
}

function bookmarkAllTabs() {
  const notes = state.ws.tabs.filter((id) => !isView(id) && state.vault.has(id));
  const novos = notes.filter((p) => !state.ws.bookmarks.includes(p));
  if (!novos.length) return toast("Todas as abas já estão nos favoritos.", "info");
  state.ws.bookmarks = [...state.ws.bookmarks, ...novos];
  persistWorkspace();
  if (state.active === "@home") renderMain();
  toast(`${novos.length} ${novos.length === 1 ? "aba adicionada" : "abas adicionadas"} aos favoritos`, "success");
}

function changeFontSize(delta) {
  const read = Math.min(22, Math.max(14, state.settings.fontSize + delta));
  const edit = Math.min(20, Math.max(12, state.settings.editorSize + delta));
  setSetting("fontSize", read, { quiet: true });
  setSetting("editorSize", edit, { quiet: true });
  toast(`Texto: ${read}px na leitura, ${edit}px no editor`, "info");
}

function toggleRibbon() {
  setSetting("ribbonOff", !state.settings.ribbonOff, { quiet: true });
}

function exportPdf() {
  if (!isNotePath(state.active)) return toast("Abra uma nota para exportar.", "info");
  document.body.dataset.printing = "1";
  setTimeout(() => {
    window.print();
    delete document.body.dataset.printing;
  }, 50);
}

function showDebugInfo() {
  const notes = state.vault.markdownFiles().length;
  const rows = [
    ["Sophyra", state.vault.name],
    ["Arquivos", String(state.vault.list().length)],
    ["Notas", String(notes)],
    ["Abas abertas", String(state.ws.tabs.length)],
    ["Pasta do disco", state.disk ? "conectada" : "não"],
    ["Plugins ativos", String((state.plugins?.list() || []).filter((p) => p.ativo).length)],
    ["Recursos desligados", state.settings.coreOff.join(", ") || "nenhum"],
    ["Janela", `${window.innerWidth}×${window.innerHeight}`],
    ["Navegador", navigator.userAgent],
  ];
  openPluginDialog({ title: "Informações de depuração", render: (el) => { el.innerHTML = `<dl class="props">${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>`; } });
}

function showCtxPanel() {
  if (els.app.dataset.ctx === "closed") toggleCtx();
}

// ---------------------------------------------------------------------------
// Lixeira e versões anteriores

function persistTrash() {
  storage.set("trash.v1", state.trash);
}

function persistComments() {
  storage.set("comments.v1", state.comments);
}

// Comentários: cria uma discussão presa a um trecho da nota aberta (pergunta o texto do comentário).
async function addCommentFlow(path, quote, given = "") {
  const text = given || (await askText("Comentar", "", "Escreva o comentário"));
  if (!text) return;
  const r = addDiscussion(state.comments, path, quote, text);
  if (!r.id) return;
  state.comments = r.state;
  persistComments();
  state.blocks?.view.refreshComments();
  renderCtx();
  openCommentThread(r.id);
}

// Abre o painel de comentários e destaca a discussão pedida.
function openCommentThread(id) {
  if (els.app.dataset.ctx === "closed") toggleCtx();
  state.ws.collapsed["group:comments"] = false;
  state.ws.collapsed["panel:comments"] = false;
  renderCtx();
  const th = els.ctxScroll.querySelector(`[data-cm-id="${CSS.escape(id)}"]`);
  th?.scrollIntoView({ block: "center", behavior: "smooth" });
  th?.classList.add("pulse");
  setTimeout(() => th?.classList.remove("pulse"), 1600);
}

function commentsHtml(path) {
  const list = commentsOf(state.comments, path);
  if (!list.length) return `<p class="muted small">Selecione um trecho no editor e use o balão de comentário.</p>`;
  const when = (t) => (t ? new Date(t).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");
  const thread = (d) => `<div class="cm-thread${d.resolved ? " resolved" : ""}" data-cm-id="${escapeHtml(d.id)}"><button type="button" class="cm-quote" data-cm-goto title="Ir até o trecho">“${escapeHtml(d.quote)}”</button>${d.comments
    .map((c) => `<div class="cm-msg"><div class="cm-meta"><strong>${escapeHtml(c.author || COMMENT_AUTHOR)}</strong><time>${escapeHtml(when(c.at))}</time><button type="button" class="cm-x" data-cm-delmsg="${escapeHtml(c.id)}" title="Apagar o comentário" aria-label="Apagar o comentário">${icon("x", 12)}</button></div><p>${escapeHtml(c.text)}</p></div>`)
    .join("")}<input class="cm-reply" data-cm-reply placeholder="Responder…" autocomplete="off"><div class="cm-actions"><button type="button" class="btn sm" data-cm-resolve>${d.resolved ? "Reabrir" : "Resolver"}</button><button type="button" class="btn sm" data-cm-del>Excluir</button></div></div>`;
  const open = list.filter((d) => !d.resolved);
  const done = list.filter((d) => d.resolved);
  return `${open.map(thread).join("")}${done.length ? `<details class="cm-done"><summary>Resolvidos (${done.length})</summary>${done.map(thread).join("")}</details>` : ""}`;
}

// Eventos do painel de comentários (delegados no contexto).
function onCommentsPanel(e) {
  const th = e.target.closest("[data-cm-id]");
  const path = state.active;
  if (!th || !isNotePath(path)) return;
  const id = th.dataset.cmId;
  const done = (next) => {
    state.comments = next;
    persistComments();
    state.blocks?.view.refreshComments();
    renderCtx();
  };
  if (e.target.closest("[data-cm-goto]")) {
    const mark = els.notePane.querySelector(`.bk-cm[data-cm="${CSS.escape(id)}"]`);
    if (mark) {
      mark.scrollIntoView({ block: "center", behavior: "smooth" });
      mark.classList.add("pulse");
      setTimeout(() => mark.classList.remove("pulse"), 1600);
    } else toast("O trecho comentado não está mais no texto.", "info");
  } else if (e.target.closest("[data-cm-resolve]")) {
    const d = commentsOf(state.comments, path).find((x) => x.id === id);
    done(setResolved(state.comments, path, id, !d?.resolved));
  } else if (e.target.closest("[data-cm-del]")) done(removeDiscussion(state.comments, path, id));
  else if (e.target.closest("[data-cm-delmsg]")) done(removeComment(state.comments, path, id, e.target.closest("[data-cm-delmsg]").dataset.cmDelmsg));
}

function onCommentsKey(e) {
  if (e.key !== "Enter" || !e.target.matches("[data-cm-reply]")) return;
  const th = e.target.closest("[data-cm-id]");
  const text = e.target.value.trim();
  if (!th || !text) return;
  state.comments = addReply(state.comments, state.active, th.dataset.cmId, text);
  persistComments();
  renderCtx();
}

// Layout do editor (painel da direita): fonte, tamanho e largura.
function layoutHtml() {
  const s = state.settings;
  const seg = (key, opts, cur) => `<div class="lay-seg" role="group">${opts.map(([v, l]) => `<button type="button" class="lay-btn${String(cur) === v ? " on" : ""}" data-layout="${key}" data-value="${v}" aria-pressed="${String(cur) === v}">${l}</button>`).join("")}</div>`;
  const width = s.larguraTexto === "custom" ? `${s.larguraCh}ch` : s.larguraTexto === "total" ? "Total" : LARGURAS[s.larguraTexto] || LARGURAS.normal;
  return `<div class="lay"><div class="lay-lbl">Fonte</div>${seg("fonteEditor", [["sans", "Padrão"], ["serif", "Serifada"], ["mono", "Mono"]], s.fonteEditor)}
    <label class="lay-row"><span>Texto pequeno</span><input type="checkbox" class="lay-switch" data-layout-toggle="textoPequeno" ${s.textoPequeno ? "checked" : ""}></label>
    <div class="lay-lbl">Largura do editor <small>${escapeHtml(width)}</small></div>${seg("larguraTexto", [["estreita", "Estreita"], ["normal", "Normal"], ["larga", "Larga"], ["total", "Total"]], s.larguraTexto)}
    <input type="range" class="lay-range" min="40" max="120" step="2" value="${s.larguraTexto === "custom" ? s.larguraCh : parseInt(LARGURAS[s.larguraTexto]) || 68}" data-layout-range aria-label="Largura em caracteres"></div>`;
}

function onLayoutPanel(e) {
  const b = e.target.closest("[data-layout]");
  if (b) {
    setSetting(b.dataset.layout, b.dataset.value, { quiet: true });
    return renderCtx();
  }
  const sw = e.target.closest("[data-layout-toggle]");
  if (sw) setSetting(sw.dataset.layoutToggle, sw.checked, { quiet: true });
}

function onLayoutRange(e) {
  const r = e.target.closest("[data-layout-range]");
  if (!r) return;
  state.settings = { ...state.settings, larguraTexto: "custom", larguraCh: Number(r.value) };
  storage.saveSettings(state.settings);
  applySettings();
}

function persistSnaps() {
  storage.set("snapshots.v1", state.snaps);
}

// Guarda uma versão da nota (no máximo uma a cada 2 minutos, e só se o texto mudou); a gravação é adiada um pouco.
function takeSnapshot(path, content, force = false) {
  const next = snapshotAdd(state.snaps, path, content, Date.now(), { force });
  if (next === state.snaps) return;
  state.snaps = next;
  clearTimeout(state.snapTimer);
  state.snapTimer = setTimeout(persistSnaps, 1500);
}

function restoreTrash(path) {
  const { items, file } = trashRestore(state.trash, path, (p) => state.vault.has(p));
  if (!file) return;
  state.trash = items;
  persistTrash();
  try {
    state.vault.create(file.path, file.content);
    openNote(file.path);
    toast(`Restaurada: ${file.path}`, "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

async function removeTrash(path) {
  const ok = await askConfirm(`Excluir “${stripExt(baseName(path))}” de vez? Não dá para desfazer.`, "Excluir definitivamente", "Excluir");
  if (!ok) return false;
  state.trash = trashRemove(state.trash, path);
  persistTrash();
  return true;
}

async function emptyTrash() {
  if (!state.trash.length) return toast("A lixeira já está vazia.", "info");
  const ok = await askConfirm(`Apagar de vez ${state.trash.length} ${state.trash.length === 1 ? "item" : "itens"} da lixeira? Não dá para desfazer.`, "Esvaziar a lixeira", "Esvaziar");
  if (!ok) return false;
  state.trash = [];
  persistTrash();
  if (state.active === "@trash") renderMain();
  return true;
}

// Lista as versões anteriores da nota aberta, com a diferença para o texto atual, e restaura a escolhida.
function showVersions() {
  const path = state.active;
  if (!isNotePath(path)) return;
  takeSnapshot(path, state.vault.read(path), false);
  const list = state.snaps[path] || [];
  openPluginDialog({
    title: `Versões de ${stripExt(baseName(path))}`,
    render: (el) => {
      const current = state.vault.read(path);
      el.innerHTML = list.length
        ? `<div class="rows">${list
            .map((v, i) => {
              const d = diffSummary(v.content, current);
              return `<div class="row"><span class="grow"><span class="title">${new Date(v.t).toLocaleString("pt-BR")}</span><span class="sub" style="display:block">${v.content === current ? "igual ao texto atual" : `${d.removed} ${d.removed === 1 ? "linha só nesta versão" : "linhas só nesta versão"}, ${d.added} só no texto atual · ${v.content.length} caracteres`}</span></span><button class="btn sm" data-ver-restore="${i}"${v.content === current ? " disabled" : ""}>${icon("refresh", 14)} Restaurar</button></div>`;
            })
            .join("")}</div>`
        : `<p class="muted">Ainda não há versões anteriores desta nota.</p>`;
      el.onclick = (e) => {
        const b = e.target.closest("[data-ver-restore]");
        if (!b) return;
        const v = list[Number(b.dataset.verRestore)];
        if (!v || !state.vault.has(path)) return;
        takeSnapshot(path, state.vault.read(path), true); // a versão de agora também fica guardada
        state.vault.write(path, v.content);
        setEditor(v.content, true);
        renderPreview();
        els.dialog.close();
        toast("Versão restaurada", "success");
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Espaços de trabalho salvos

async function saveWorkspaceLayout() {
  const name = await askText("Salvar espaço de trabalho", "", "Nome do espaço de trabalho");
  if (!name) return;
  const had = !!state.layouts[name.trim()];
  if (had && !(await askConfirm(`Já existe um espaço de trabalho chamado “${name.trim()}”. Substituir?`, "Substituir", "Substituir"))) return;
  state.layouts = saveLayout(state.layouts, name, captureLayout({ ...state.ws, sideOpen: els.app.dataset.side !== "closed", ctxOpen: els.app.dataset.ctx !== "closed" }, state.active));
  storage.set("workspaces.v1", state.layouts);
  toast(`Espaço de trabalho salvo: ${name.trim()}`, "success");
}

// Lista os espaços salvos numa caixa e chama `onPick(nome)` com o escolhido.
function chooseLayout(title, actionLabel, onPick) {
  const names = Object.keys(state.layouts);
  openPluginDialog({
    title,
    render: (el) => {
      el.innerHTML = names.length
        ? `<div class="rows">${names.map((n) => `<button class="row" data-layout="${escapeHtml(n)}"><span class="grow"><span class="title">${escapeHtml(n)}</span><span class="sub" style="display:block">${state.layouts[n].tabs.length} ${state.layouts[n].tabs.length === 1 ? "aba" : "abas"}${state.layouts[n].split.open ? " · painel da direita" : ""}</span></span><span class="end">${escapeHtml(actionLabel)}</span></button>`).join("")}</div>`
        : `<p class="muted">Nenhum espaço de trabalho salvo ainda. Use “Salvar espaço de trabalho…”.</p>`;
      el.onclick = (e) => {
        const b = e.target.closest("[data-layout]");
        if (!b) return;
        els.dialog.close();
        onPick(b.dataset.layout);
      };
    },
  });
}

function loadWorkspaceLayout(name) {
  const saved = state.layouts[name];
  if (!saved) return;
  const r = resolveLayout(saved, (p) => state.vault.has(p));
  state.ws.tabs = r.tabs;
  state.ws.pinned = r.pinned;
  state.ws.split = r.split;
  els.app.dataset.side = window.innerWidth < 860 ? "closed" : r.sideOpen ? "open" : "closed";
  els.app.dataset.ctx = window.innerWidth < 1180 ? "closed" : r.ctxOpen ? "open" : "closed";
  state.active = r.active;
  state.nav.push(r.active);
  render();
  toast(r.missing ? `Espaço “${name}” carregado; ${r.missing} ${r.missing === 1 ? "nota não existe mais" : "notas não existem mais"}.` : `Espaço de trabalho carregado: ${name}`, r.missing ? "info" : "success");
}

function deleteWorkspaceLayout(name) {
  state.layouts = deleteLayout(state.layouts, name);
  storage.set("workspaces.v1", state.layouts);
  toast(`Espaço de trabalho excluído: ${name}`, "success");
}

// Comandos de painel (equivalentes a workspace:*): foco, trocar de lado, mover aba, fechar tudo.
function focusPane(side) {
  if (side === "right") {
    if (!state.ws.split?.open) return toast("O painel da direita não está aberto.", "info");
    const target = $("#leaf2 textarea") || $("#leaf2 .tab.active") || $("#leaf2 [data-leaf-main]");
    target?.focus();
    return;
  }
  if (isNotePath(state.active)) els.editor.focus();
  else $("#tabs .tab.active")?.focus();
}

function swapPanes() {
  const r = splitSwap(state.ws.split, isNotePath(state.active) ? state.active : null);
  if (!r) return toast("Abra uma nota em cada painel para trocá-los.", "info");
  setSplit(r.split);
  activate(r.main);
}

function moveTabRight() {
  const path = state.active;
  if (!isNotePath(path)) return toast("Só notas podem ir para o painel da direita.", "info");
  if (state.ws.pinned.includes(path)) return toast("Essa aba está fixada. Solte-a antes de movê-la.", "info");
  openSplit(path);
  if (state.ws.split.tabs.includes(path)) closeTab(path);
}

function moveTabMain() {
  const s = state.ws.split;
  if (!s?.open || !s.active) return toast("O painel da direita não tem nenhuma nota.", "info");
  const path = s.active;
  setSplit(splitCloseTab(s, path));
  openNote(path);
}

function closeAllTabs() {
  const keep = state.ws.tabs.filter((id) => state.ws.pinned.includes(id));
  for (const id of state.ws.tabs) if (!keep.includes(id)) state.closed.push(id);
  state.ws.tabs = keep.length ? keep : ["@home"];
  state.active = state.ws.tabs.includes(state.active) ? state.active : state.ws.tabs[0];
  render();
}

// ---------------------------------------------------------------------------
// Plugins importados de um arquivo local

// Carrega o código guardado de um plugin importado, por um módulo temporário (Blob). Nada vem de endereço remoto.
async function importLocalPlugin(id) {
  const p = state.imported.find((x) => x.id === id);
  if (!p) throw new Error("plugin importado não encontrado");
  const url = URL.createObjectURL(new Blob([p.code], { type: "text/javascript" }));
  try {
    return await import(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Mostra o que o plugin pede e o código inteiro; só segue com o "sim" explícito.
function confirmPluginImport(parsed) {
  const { manifest, code } = parsed;
  const risks = scanRisks(code);
  return new Promise((resolve) => {
    els.dialogTitle.textContent = `Importar “${manifest.nome}”?`;
    els.dialogBody.innerHTML = `
      <p class="muted small">Versão ${escapeHtml(manifest.versao)} · id <code>${escapeHtml(manifest.id)}</code>${manifest.descricao ? `<br>${escapeHtml(manifest.descricao)}` : ""}</p>
      <h3 style="margin:var(--s3) 0 var(--s1);font-size:var(--fs-md)">Permissões que ele pede</h3>
      ${manifest.permissoes.length ? `<ul class="plugin-perms">${manifest.permissoes.map((p) => `<li>${escapeHtml(PERMISSOES[p])}</li>`).join("")}</ul>` : `<p class="muted small">Nenhuma.</p>`}
      ${risks.length ? `<div class="callout-inline" style="margin:var(--s3) 0">${icon("alert", 16)}<span><strong>Atenção ao ler o código:</strong><br>${risks.map((r) => escapeHtml(r)).join("<br>")}</span></div>` : ""}
      <div class="callout-inline" style="margin:var(--s3) 0">${icon("info", 16)}<span>O plugin roda na página, com os mesmos privilégios dela. As permissões limitam só a API do app; leia o código antes de aceitar.</span></div>
      <details open><summary>Código (${code.length} caracteres)</summary><pre class="plugin-code" tabindex="0">${escapeHtml(code)}</pre></details>
      <div class="dialog-actions"><button class="btn" data-cancel>Cancelar</button><button class="btn primary" data-ok>Importar e ativar</button></div>`;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      els.dialog.close();
      resolve(v);
    };
    els.dialogBody.onclick = (e) => {
      if (e.target.closest("[data-cancel]")) finish(false);
      if (e.target.closest("[data-ok]")) finish(true);
    };
    els.dialog.addEventListener("close", () => finish(false), { once: true });
    els.dialog.showModal();
    $("[data-cancel]", els.dialogBody).focus();
  });
}

function importPluginFromFile() {
  const input = Object.assign(document.createElement("input"), { type: "file", accept: ".js,.mjs,text/javascript" });
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const parsed = parsePluginFile(await file.text());
    if (!parsed.ok) return toast(`${file.name}: ${parsed.error}`, "error");
    const taken = [...state.plugins.registry.values()].filter((m) => !m.importado).map((m) => m.id);
    const added = addImported(state.imported, parsed, taken);
    if (!added.ok) return toast(added.error, "error");
    if (!(await confirmPluginImport(parsed))) return;
    state.imported = added.list;
    storage.set("plugins.importados", state.imported);
    setSetting("pluginsComunidade", true, { quiet: true }); // aceitar a importação é o consentimento
    try {
      state.plugins.register([hostManifest(state.imported[state.imported.length - 1])]);
      await state.plugins.enable(parsed.manifest.id);
      toast(`Plugin importado: ${parsed.manifest.nome}`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
    if (state.active === "@settings") renderMain();
  });
  input.click();
}

// Liga ou desliga os plugins da comunidade (código importado). Desligar desativa os importados que estavam ativos.
async function setCommunityPlugins(on) {
  setSetting("pluginsComunidade", on, { quiet: true });
  if (!on) for (const p of state.imported) await state.plugins.disable(p.id);
  toast(on ? "Plugins da comunidade ligados. Ative cada plugin importado na lista." : "Plugins da comunidade desligados.", "info");
}

async function removeImportedPlugin(id) {
  const name = state.imported.find((p) => p.id === id)?.manifest.nome || id;
  if (!(await askConfirm(`Remover o plugin “${name}”? O código importado é apagado deste navegador.`, "Remover plugin", "Remover"))) return false;
  await state.plugins.unregister(id);
  state.imported = removeImported(state.imported, id);
  storage.set("plugins.importados", state.imported);
  toast(`Plugin removido: ${name}`, "success");
  return true;
}

// ---------------------------------------------------------------------------
// Busca e troca dentro da nota (editor:open-search e editor:open-search-replace)

const find = { open: false, replace: false, matches: [], index: -1, opts: { caseSensitive: false, regex: false, wholeWord: false } };

function openFind(replace = false) {
  if (!isNotePath(state.active)) return;
  find.open = true;
  find.replace = replace || find.replace;
  els.findBar.hidden = false;
  $("#find-replace-row").hidden = !find.replace;
  $("#find-toggle-replace").setAttribute("aria-expanded", String(find.replace));
  const sel = els.editor.value.slice(els.editor.selectionStart, els.editor.selectionEnd);
  const q = $("#find-q");
  if (sel && !sel.includes("\n")) q.value = sel;
  q.focus();
  q.select();
  runFind();
}

function closeFind() {
  if (!find.open) return;
  find.open = false;
  find.matches = [];
  els.findBar.hidden = true;
  els.editorFind.innerHTML = "";
  els.editor.focus();
}

// Procura de novo. `keep`: o texto mudou, então fica perto de onde estava em vez de saltar para o cursor.
function runFind(keep = false) {
  const q = $("#find-q").value;
  const r = findAll(els.editor.value, q, find.opts);
  find.matches = r.matches;
  const err = $("#find-error");
  err.hidden = !r.error;
  err.textContent = r.error || "";
  const from = keep && find.index >= 0 ? find.matches[Math.min(find.index, find.matches.length - 1)]?.start ?? 0 : els.editor.selectionStart;
  find.index = nextMatch(find.matches, from, 1);
  renderFindLayer();
}

function renderFindLayer() {
  const text = els.editor.value;
  const count = $("#find-count");
  if (!find.matches.length) {
    els.editorFind.innerHTML = "";
    count.textContent = $("#find-q").value ? "nada encontrado" : "";
    return;
  }
  let html = "";
  let pos = 0;
  const esc = (t) => escapeHtml(t);
  find.matches.forEach((m, i) => {
    html += `${esc(text.slice(pos, m.start))}<mark class="find-hit${i === find.index ? " current" : ""}">${esc(text.slice(m.start, m.end))}</mark>`;
    pos = m.end;
  });
  els.editorFind.innerHTML = `${html}${esc(text.slice(pos))}​`;
  count.textContent = `${find.index + 1} de ${find.matches.length}${find.matches.length >= 5000 ? "+" : ""}`;
  syncHighlightScroll();
}

// Vai até a ocorrência: seleciona no editor e rola até ela (a posição vem da própria camada, que tem o mesmo desenho).
function gotoMatch(i, { focus = false } = {}) {
  const m = find.matches[i];
  if (!m) return;
  find.index = i;
  renderFindLayer();
  els.editor.setSelectionRange(m.start, m.end);
  const hit = els.editorFind.querySelector("mark.current");
  if (hit) {
    const top = hit.offsetTop;
    if (top < els.editor.scrollTop || top > els.editor.scrollTop + els.editor.clientHeight - 60) els.editor.scrollTop = Math.max(0, top - els.editor.clientHeight / 3);
    syncHighlightScroll();
  }
  if (focus) els.editor.focus();
}

function stepFind(dir) {
  if (!find.matches.length) return;
  const cur = find.index;
  const next = dir > 0 ? (cur + 1) % find.matches.length : (cur - 1 + find.matches.length) % find.matches.length;
  gotoMatch(next);
}

function replaceCurrent() {
  const m = find.matches[find.index];
  if (!m) return;
  const edit = replaceOne(els.editor.value, m, $("#find-q").value, $("#find-r").value, find.opts);
  applyEdit(edit);
  onEditorInput();
  syncHighlight();
  runFind();
  if (find.matches.length) gotoMatch(find.index);
}

function replaceEverything() {
  const q = $("#find-q").value;
  const { text, count, error } = replaceAll(els.editor.value, q, $("#find-r").value, find.opts);
  if (error || !count) return toast(error || "Nada para trocar.", "info");
  applyEdit({ from: 0, to: els.editor.value.length, insert: text, sel: [0, 0] });
  onEditorInput();
  syncHighlight();
  runFind();
  toast(`${count} ${count === 1 ? "troca feita" : "trocas feitas"}`, "success");
}

function bindFind() {
  const q = $("#find-q");
  q.addEventListener("input", () => runFind());
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (find.index >= 0 && els.editor.selectionStart === find.matches[find.index]?.start && els.editor.selectionEnd === find.matches[find.index]?.end) stepFind(e.shiftKey ? -1 : 1);
      else if (find.matches.length) gotoMatch(find.index);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeFind();
    }
  });
  $("#find-r").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      replaceCurrent();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeFind();
    }
  });
  $("#find-next").addEventListener("click", () => stepFind(1));
  $("#find-prev").addEventListener("click", () => stepFind(-1));
  $("#find-close").addEventListener("click", closeFind);
  $("#find-replace-one").addEventListener("click", replaceCurrent);
  $("#find-replace-all").addEventListener("click", replaceEverything);
  $("#find-toggle-replace").addEventListener("click", () => {
    find.replace = !find.replace;
    $("#find-replace-row").hidden = !find.replace;
    $("#find-toggle-replace").setAttribute("aria-expanded", String(find.replace));
    if (find.replace) $("#find-r").focus();
  });
  for (const [id, key] of [["find-case", "caseSensitive"], ["find-word", "wholeWord"], ["find-regex", "regex"]]) {
    $(`#${id}`).addEventListener("click", (e) => {
      find.opts[key] = !find.opts[key];
      e.currentTarget.setAttribute("aria-pressed", String(find.opts[key]));
      runFind();
    });
  }
}

// Comandos de navegação, abas e arquivo para a paleta. Os ids de origem estão em NAV_ORIGINAIS (README).
function navCommands() {
  const active = state.active;
  const note = isNotePath(active);
  const file = !!active && !isView(active) && state.vault.has(active);
  const hk = (id) => keysOf(hotkeysNow()[id]);
  const bookmarked = file && state.ws.bookmarks.includes(active);
  return [
    { group: "Navegação", name: "Voltar", icon: "arrow-right", keys: hk("voltar"), run: () => goHistory(-1) },
    { group: "Navegação", name: "Avançar", icon: "arrow-right", keys: hk("avancar"), run: () => goHistory(1) },
    { group: "Abas", name: "Próxima aba", icon: "chevron-right", run: () => switchTab(cycleTab(state.ws.tabs, active, 1)) },
    { group: "Abas", name: "Aba anterior", icon: "chevron-right", run: () => switchTab(cycleTab(state.ws.tabs, active, -1)) },
    { group: "Abas", name: "Ir para a última aba", icon: "chevron-right", run: () => switchTab(gotoTab(state.ws.tabs, 9)) },
    { group: "Abas", name: "Reabrir a última aba fechada", icon: "refresh", run: () => reopenClosedTab() },
    { group: "Abas", name: "Fechar as outras abas", icon: "x", run: () => closeOtherTabs() },
    { group: "Abas", name: "Fechar todas as abas", icon: "x", run: () => closeAllTabs() },
    { group: "Painéis", name: "Focar o painel principal", icon: "panel-left", run: () => setTimeout(() => focusPane("main"), 0) },
    ...(state.ws.split?.open
      ? [
          { group: "Painéis", name: "Focar o painel da direita", icon: "panel-right", run: () => setTimeout(() => focusPane("right"), 0) },
          { group: "Painéis", name: "Trocar os painéis de lado", icon: "columns", run: () => swapPanes() },
          { group: "Painéis", name: "Mover a nota da direita para o painel principal", icon: "arrow-right", run: () => moveTabMain() },
          { group: "Painéis", name: "Alternar ler e editar no painel da direita", icon: "edit", run: () => setSplit(splitToggleEdit(state.ws.split)) },
        ]
      : []),
    ...(isNotePath(state.active) ? [{ group: "Painéis", name: "Mover esta aba para o painel da direita", icon: "panel-right", run: () => moveTabRight() }] : []),
    ...(active ? [{ group: "Abas", name: state.ws.pinned.includes(active) ? "Soltar a aba" : "Fixar a aba", icon: "pin", run: () => togglePinActive() }] : []),
    { group: "Abas", name: "Nova aba", icon: "plus", run: () => setTimeout(() => openPalette("files"), 0) },
    { group: "Espaços", name: "Salvar espaço de trabalho…", icon: "layers", run: () => saveWorkspaceLayout() },
    { group: "Espaços", name: "Carregar espaço de trabalho…", icon: "layers", run: () => setTimeout(() => chooseLayout("Carregar espaço de trabalho", "Carregar", loadWorkspaceLayout), 0) },
    ...(Object.keys(state.layouts).length ? [{ group: "Espaços", name: "Excluir espaço de trabalho…", icon: "trash", run: () => setTimeout(() => chooseLayout("Excluir espaço de trabalho", "Excluir", deleteWorkspaceLayout), 0) }] : []),
    ...(file
      ? [
          { group: "Nota atual", name: "Copiar o caminho", icon: "copy", run: () => copyPath(false) },
          { group: "Nota atual", name: "Copiar o caminho completo", icon: "copy", run: () => copyPath(true) },
          { group: "Nota atual", name: "Duplicar", icon: "copy", run: () => duplicateActive() },
          { group: "Nota atual", name: "Mover para outra pasta…", icon: "folder", run: () => moveActive() },
          { group: "Nota atual", name: "Mostrar na barra lateral", icon: "folder-open", run: () => revealActive() },
          { group: "Nota atual", name: bookmarked ? "Remover dos favoritos" : "Adicionar aos favoritos", icon: "star", run: () => toggleBookmark() },
        ]
      : []),
    ...(note
      ? [
          { group: "Nota atual", name: "Adicionar outro nome…", icon: "link", run: () => frontmatterCommand("alias") },
          { group: "Nota atual", name: "Adicionar propriedade…", icon: "list", run: () => frontmatterCommand("property") },
          { group: "Nota atual", name: "Limpar propriedades", icon: "trash", run: () => frontmatterCommand("clear") },
          { group: "Nota atual", name: "Exportar para PDF (imprimir)", icon: "download", run: () => exportPdf() },
          { group: "Painéis", name: "Mostrar a estrutura da nota", icon: "outline", run: () => showCtxPanel() },
          { group: "Painéis", name: "Mostrar os links recebidos", icon: "link", run: () => showCtxPanel() },
        ]
      : []),
    { group: "Notas", name: "Nota aleatória", icon: "refresh", run: () => randomNote() },
    { group: "Aparência", name: "Alternar a largura do texto", icon: "maximize", run: () => cycleTextWidth() },
    ...(note
      ? [
          { group: "Editor", name: "Ir para o início da nota", icon: "chevrons-up", run: () => jumpEditor("start") },
          { group: "Editor", name: "Ir para o fim da nota", icon: "chevron-down", run: () => jumpEditor("end") },
          { group: "Editor", name: "Alternar o corretor ortográfico", icon: "check", run: () => toggleSpellcheck() },
          { group: "Nota atual", name: "Copiar o link da nota ([[ ]])", icon: "copy", run: () => copyText(`[[${stripExt(baseName(active))}]]`, "Link copiado") },
        ]
      : []),
    { group: "Biblioteca", name: "Adicionar todas as abas aos favoritos", icon: "star", run: () => bookmarkAllTabs() },
    { group: "Notas", name: "Nota diária anterior", icon: "calendar", run: () => gotoDaily(-1) },
    { group: "Notas", name: "Nota diária seguinte", icon: "calendar", run: () => gotoDaily(1) },
    { group: "Notas", name: "Nova nota ao lado", icon: "columns", run: async () => { await createNote(); openSplit(); } },
    { group: "Aparência", name: "Aumentar o tamanho do texto", icon: "plus", run: () => changeFontSize(1) },
    { group: "Aparência", name: "Diminuir o tamanho do texto", icon: "plus", run: () => changeFontSize(-1) },
    { group: "Painéis", name: state.settings.ribbonOff ? "Mostrar a faixa de ícones" : "Ocultar a faixa de ícones", icon: "panel-left", run: () => toggleRibbon() },
    { group: "Biblioteca", name: "Favoritos", icon: "star", run: () => openView("@home") },
    { group: "Biblioteca", name: "Importar plugin de um arquivo…", icon: "puzzle", run: () => importPluginFromFile() },
    { group: "Biblioteca", name: state.settings.pluginsComunidade ? "Desligar os plugins da comunidade" : "Ligar os plugins da comunidade", icon: "puzzle", run: () => setCommunityPlugins(!state.settings.pluginsComunidade) },
    { group: "Biblioteca", name: `Lixeira${state.trash.length ? ` (${state.trash.length})` : ""}`, icon: "trash", run: () => openView("@trash") },
    { group: "Biblioteca", name: "Esvaziar a lixeira", icon: "trash", run: () => emptyTrash() },
    ...(note ? [{ group: "Nota atual", name: "Histórico de versões…", icon: "clock", run: () => showVersions() }] : []),
    { group: "Biblioteca", name: "Informações de depuração", icon: "info", run: () => showDebugInfo() },
    { group: "Biblioteca", name: "Recarregar o aplicativo", icon: "refresh", run: () => location.reload() },
    { group: "Navegação", name: "Ajuda", icon: "help", run: () => openView("@shortcuts") },
  ];
}

function commandList() {
  const noteOpen = !!state.active && !isView(state.active);
  const hk = (id) => keysOf(hotkeysNow()[id]);
  const list = [
    { group: "Notas", name: "Nova nota", icon: "file-plus", keys: hk("nova"), run: () => createNote() },
    { group: "Notas", name: "Nova pasta", icon: "folder-plus", run: () => createFolder() },
    { group: "Notas", name: "Novo canvas", icon: "layers", run: () => createCanvas() },
    { group: "Notas", name: "Nova base (tabela, quadro, calendário)", icon: "database", run: () => createBase() },
    { group: "Notas", name: "Importar arquivos…", icon: "upload", run: () => pickFilesToImport() },
    { group: "Notas", name: "Abrir nota…", icon: "search", keys: hk("abrir"), run: () => setTimeout(() => openPalette("files"), 0) },
    ...(isNotePath(state.active)
      ? [
          { group: "Editor", name: "Buscar na nota", icon: "search", keys: ["Ctrl", "F"], run: () => setTimeout(() => openFind(false), 0) },
          { group: "Editor", name: "Buscar e trocar na nota", icon: "search", keys: ["Ctrl", "H"], run: () => setTimeout(() => openFind(true), 0) },
        ]
      : []),
    ...navCommands(),
    ...(isNotePath(state.active) ? EDITOR_COMMANDS.map((c) => ({ group: "Editor", name: c.name, icon: c.icon, run: () => setTimeout(() => runEditorCommand(c), 0) })) : []),
    ...(noteOpen && isNotePath(state.active) ? [{ group: "Painéis", name: "Abrir esta nota ao lado", icon: "columns", run: () => openSplit() }] : []),
    ...(state.ws.split?.open ? [{ group: "Painéis", name: "Fechar o painel da direita", icon: "x", run: () => closeSplit() }] : []),
    ...(noteOpen
      ? [
          { group: "Nota atual", name: "Renomear nota", icon: "edit", run: () => renameActive() },
          { group: "Nota atual", name: "Baixar como .md", icon: "download", run: () => downloadNote() },
          { group: "Nota atual", name: "Excluir nota", icon: "trash", run: () => deleteActive() },
        ]
      : []),
    { group: "Navegação", name: "Início", icon: "home", run: () => openView("@home") },
    { group: "Navegação", name: "Grafo", icon: "graph", run: () => openView("@graph") },
    { group: "Navegação", name: "Tarefas", icon: "check-square", run: () => openView("@tasks") },
    { group: "Navegação", name: "Tags", icon: "tag", run: () => openView("@tags") },
    { group: "Navegação", name: "Buscar nas notas", icon: "search", keys: hk("buscar"), run: () => navSide("search") },
    { group: "Navegação", name: "Atalhos de teclado", icon: "keyboard", run: () => openView("@shortcuts") },
    { group: "Navegação", name: "Configurações", icon: "sliders", keys: hk("config"), run: () => openSettings() },
    { group: "Navegação", name: "Fechar aba atual", icon: "x", keys: hk("fechar"), run: () => state.active && closeTab(state.active) },
    { group: "Painéis", name: "Mostrar ou ocultar a barra lateral", icon: "panel-left", run: () => toggleSide() },
    { group: "Painéis", name: "Mostrar ou ocultar o contexto da nota", icon: "panel-right", run: () => toggleCtx() },
    { group: "Biblioteca", name: "Abrir pasta do disco", icon: "folder-open", run: () => chooseFolder() },
    ...(state.disk ? [{ group: "Biblioteca", name: "Recarregar pasta do disco", icon: "refresh", run: () => reloadFolder() }] : []),
    { group: "Biblioteca", name: "Exportar biblioteca (JSON)", icon: "download", run: () => exportVault() },
    { group: "Biblioteca", name: "Importar biblioteca (JSON)", icon: "upload", run: () => importVault() },
    { group: "Biblioteca", name: "Restaurar biblioteca de exemplo", icon: "refresh", run: () => restoreSample() },
    { group: "Aparência", name: "Alternar tema claro e escuro", icon: "moon", run: () => toggleTheme() },
  ];
  list.push({ group: "Aparência", name: "Estilos personalizados", icon: "code", run: () => openSettings("snippets") });
  const gone = { Grafo: "graph", Tarefas: "tasks", Tags: "tags", "Novo canvas": "canvas" };
  for (let k = list.length - 1; k >= 0; k--) {
    const feature = gone[list[k].name];
    if (feature && !featureOn(feature) && ["Navegação", "Notas"].includes(list[k].group)) list.splice(k, 1);
  }
  if (state.snippets.list().some((s) => s.enabled)) list.push({ group: "Aparência", name: "Desligar todos os estilos personalizados", icon: "code", run: () => disableAllSnippets() });
  for (const s of state.snippets.list()) list.push({ group: "Aparência", name: `${s.enabled ? "Desligar" : "Ligar"} snippet: ${s.name}`, icon: "code", run: () => { toggleSnippet(s.id, !s.enabled); if (state.active === "@settings") renderMain(); } });
  for (const c of state.plugins?.commands() || []) list.push({ group: "Plugins", name: c.name, icon: "puzzle", run: c.run });
  // todo comando tem um id estável (pelo nome) e mostra o atalho próprio que a pessoa tenha dado a ele
  const seenIds = new Set();
  for (const c of list) {
    c.id = c.id || commandId(c.name);
    for (let n = 2; seenIds.has(c.id); n++) c.id = `${commandId(c.name)}-${n}`; // nomes iguais não podem dividir o mesmo atalho
    seenIds.add(c.id);
    const own = state.settings.cmdKeys?.[c.id];
    if (own) c.keys = keysOf(own);
  }
  return list;
}

function openPalette(mode) {
  state.palette.mode = mode;
  els.paletteInput.value = "";
  els.paletteInput.placeholder = mode === "files" ? "Abrir nota pelo nome…" : "Digite um comando…";
  els.palette.hidden = false;
  renderPalette();
  els.paletteInput.focus();
}

function closePalette() {
  els.palette.hidden = true;
}

function renderPalette() {
  const q = els.paletteInput.value.trim().toLowerCase();
  const source =
    state.palette.mode === "files"
      ? state.vault.list().filter((f) => "md canvas base".split(" ").includes(extOf(f.path)) && !isHidden(f.path)).map((f) => ({ group: extOf(f.path) === "canvas" ? "Canvas" : extOf(f.path) === "base" ? "Bases" : "Notas", name: stripExt(baseName(f.path)), icon: extOf(f.path) === "canvas" ? "layers" : extOf(f.path) === "base" ? "database" : "file-text", sub: f.path, run: () => openNote(f.path) }))
      : commandList();
  state.palette.items = source.filter((i) => !q || `${i.name} ${i.sub || ""} ${i.group}`.toLowerCase().includes(q)).slice(0, 60);
  state.palette.index = 0;
  let last = null;
  let html = "";
  state.palette.items.forEach((it, i) => {
    if (it.group !== last) {
      html += `<div class="palette-group">${escapeHtml(it.group)}</div>`;
      last = it.group;
    }
    html += `<button class="palette-item${i === 0 ? " selected" : ""}" role="option" data-i="${i}">${icon(it.icon || "file", 18)}<span>${escapeHtml(it.name)}</span>${it.keys ? `<span class="keys" style="margin-left:auto">${it.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("")}</span>` : it.sub ? `<span class="sub">${escapeHtml(it.sub)}</span>` : ""}</button>`;
  });
  els.paletteList.innerHTML = html || `<div class="empty-inline"><p>Nada encontrado para “${escapeHtml(els.paletteInput.value)}”.</p></div>`;
  for (const row of $$(".palette-item", els.paletteList)) row.addEventListener("click", () => runPalette(Number(row.dataset.i)));
}

function runPalette(i) {
  const item = state.palette.items[i];
  if (!item) return;
  closePalette();
  item.run();
}

function movePalette(delta) {
  const rows = $$(".palette-item", els.paletteList);
  if (!rows.length) return;
  rows[state.palette.index]?.classList.remove("selected");
  state.palette.index = (state.palette.index + delta + rows.length) % rows.length;
  rows[state.palette.index].classList.add("selected");
  rows[state.palette.index].scrollIntoView({ block: "nearest" });
}

function onPaletteKeys(e) {
  if (e.key === "ArrowDown") { e.preventDefault(); movePalette(1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); movePalette(-1); }
  else if (e.key === "Enter") { e.preventDefault(); runPalette(state.palette.index); }
}

function onGlobalKeys(e) {
  if (e.key === "Escape") {
    if (!els.palette.hidden) return closePalette();
    if (window.innerWidth < 1180 && els.app.dataset.ctx === "open") return toggleCtx();
    if (window.innerWidth < 860 && els.app.dataset.side === "open") return toggleSide();
    return;
  }
  if (document.body.dataset.capturingHotkey) return; // a tela de atalhos está ouvindo a próxima combinação
  const cmd = findCommand(e, state.settings.hotkeys);
  if (!cmd) {
    const own = findCmdKey(e, state.settings.cmdKeys);
    const command = own && commandList().find((c) => c.id === own);
    if (command) {
      e.preventDefault();
      command.run();
    }
    return;
  }
  e.preventDefault();
  if (cmd === "paleta") openPalette("commands");
  else if (cmd === "abrir") openPalette("files");
  else if (cmd === "nova") createNote();
  else if (cmd === "fechar") {
    if (state.active) closeTab(state.active);
  } else if (cmd === "config") openSettings();
  else if (cmd === "buscar") navSide("search");
  else if (cmd === "voltar") goHistory(-1);
  else if (cmd === "avancar") goHistory(1);
}

// ---------------------------------------------------------------------------
// Wikilinks: sugestões ao digitar, ir à seção, prévia ao passar o mouse e menções sem link

const SUGGEST_ICONS = { note: "file-text", alias: "link", heading: "hash" };

// Mostra as sugestões quando o cursor está dentro de um `[[` aberto.
function updateSuggest() {
  const el = els.editor;
  if (document.activeElement !== el || !state.active || isView(state.active)) return closeSuggest();
  if (el.selectionStart !== el.selectionEnd) return closeSuggest();
  const ctx = findLinkContext(el.value, el.selectionStart);
  if (!ctx) return closeSuggest();
  const items =
    ctx.stage === "heading"
      ? suggestHeadings(state.vault, ctx.note, ctx.query, state.active)
      : suggestNotes(state.vault, ctx.query, { exclude: state.active });
  if (!items.length) return closeSuggest();
  state.suggest = { open: true, items, index: 0, ctx };
  renderSuggest();
}

function renderSuggest() {
  const { items, index, ctx } = state.suggest;
  els.suggest.innerHTML =
    `<div class="suggest-head">${ctx.stage === "heading" ? "Seções" : "Notas"}</div>` +
    items
      .map((it, i) => {
        const dir = it.path.includes("/") ? it.path.slice(0, it.path.lastIndexOf("/")) : "";
        const sub = it.kind === "alias" ? `apelido de ${escapeHtml(it.note)}` : it.kind === "heading" ? `título ${it.level}` : escapeHtml(dir);
        return `<button class="suggest-item${i === index ? " selected" : ""}" role="option" aria-selected="${i === index}" data-i="${i}" tabindex="-1">${icon(SUGGEST_ICONS[it.kind], 15)}<span class="name">${escapeHtml(it.label)}</span><span class="sub">${sub}</span></button>`;
      })
      .join("");
  els.suggest.hidden = false;
  placeSuggest();
  els.suggest.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
}

function closeSuggest() {
  if (!state.suggest.open) return;
  state.suggest = { open: false, items: [], index: 0, ctx: null };
  els.suggest.hidden = true;
}

function moveSuggest(delta) {
  const n = state.suggest.items.length;
  state.suggest.index = (state.suggest.index + delta + n) % n;
  renderSuggest();
}

function acceptSuggest(i) {
  const { items, ctx } = state.suggest;
  const item = items[i];
  if (!item || !ctx) return;
  const r = applySuggestion(els.editor.value, ctx, item);
  closeSuggest();
  replaceRange(r.from, r.to, r.insert, r.caret, r.caret);
  onEditorInput();
}

// Posição do cursor na tela, medida com uma cópia invisível do texto.
function caretCoords(el, pos) {
  const cs = getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const p of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "textIndent", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "tabSize"]) {
    mirror.style[p] = cs[p];
  }
  Object.assign(mirror.style, { position: "absolute", top: "0", left: "0", visibility: "hidden", boxSizing: "border-box", whiteSpace: "pre-wrap", overflowWrap: "break-word", width: `${el.clientWidth}px` });
  mirror.textContent = el.value.slice(0, pos);
  const marker = document.createElement("span");
  marker.textContent = "​";
  mirror.append(marker);
  document.body.append(mirror);
  const rect = el.getBoundingClientRect();
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
  const out = { x: rect.left + marker.offsetLeft - el.scrollLeft, y: rect.top + marker.offsetTop - el.scrollTop, lh };
  mirror.remove();
  return out;
}

function placeSuggest() {
  const { x, y, lh } = caretCoords(els.editor, els.editor.selectionStart);
  const box = els.suggest;
  const w = Math.min(340, window.innerWidth - 16);
  box.style.width = `${w}px`;
  const h = box.offsetHeight;
  let top = y + lh + 4;
  if (top + h > window.innerHeight - 8) top = Math.max(8, y - h - 4);
  box.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
  box.style.top = `${top}px`;
}

// Ao digitar o segundo `[`, já fecha com `]]` e deixa o cursor no meio.
function onEditorInputEvent(e) {
  if (e.inputType === "insertText" && e.data === "[") {
    const el = els.editor;
    const c = el.selectionStart;
    if (el.value.slice(c - 2, c) === "[[" && !el.value.slice(c).startsWith("]")) replaceRange(c, c, "]]", c, c);
  }
  syncHighlight();
  if (find.open) runFind(true);
  onEditorInput();
  updateSuggest();
}

// Segue um link: abre a nota (ou cria, se não existir) e vai até a seção.
function followWikilink(raw, fromPath = state.active) {
  const { name, heading, block } = parseLinkTarget(raw);
  const path = name ? state.vault.resolveLink(name, fromPath) : fromPath;
  if (!path) return createNoteNamed(name || raw);
  openNote(path, { heading, block });
  if ((heading || block) && !linkTargetExists(state.vault, raw, fromPath)) {
    toast(heading ? `A seção “${heading}” não existe nesta nota.` : "Esse bloco não existe nesta nota.", "info");
  }
}

function placeCaretAtOffset(pos) {
  const el = els.editor;
  el.focus();
  el.setSelectionRange(pos, pos);
  const line = el.value.slice(0, pos).split("\n").length;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 26;
  el.scrollTop = Math.max(0, (line - 4) * lh);
}

function jumpTo({ heading, block }) {
  if (heading) {
    const wanted = heading.trim().toLowerCase();
    const found = extractMetadata(els.editor.value).headings.find((x) => x.text.trim().toLowerCase() === wanted);
    if (found) placeCaretAtOffset(found.offset);
  } else if (block) {
    const i = els.editor.value.search(new RegExp(`\\^${block.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"));
    if (i >= 0) placeCaretAtOffset(i);
  }
}

// Prévia: ao parar o mouse sobre um link que existe, mostra o começo da nota ou a seção.
function onPreviewOver(e) {
  const link = e.target.closest("a.wikilink:not(.unresolved)");
  clearTimeout(state.hover.hideTimer);
  if (!link || state.hover.current === link) return;
  clearTimeout(state.hover.timer);
  state.hover.timer = setTimeout(() => showHover(link), 380);
}

function onPreviewOut(e) {
  clearTimeout(state.hover.timer);
  if (e.target.closest("a.wikilink")) scheduleHideHover();
}

function scheduleHideHover() {
  clearTimeout(state.hover.hideTimer);
  state.hover.hideTimer = setTimeout(hideHover, 180);
}

function hideHover() {
  clearTimeout(state.hover.timer);
  state.hover.card?.remove();
  state.hover.card = null;
  state.hover.current = null;
}

function showHover(link) {
  const { name, heading } = parseLinkTarget(link.dataset.target);
  const path = name ? state.vault.resolveLink(name, state.active) : state.active;
  if (!path || !state.vault.has(path)) return;
  const full = state.vault.read(path);
  const source = heading ? extractSection(full, heading) : parseFrontmatter(full).body;
  const excerpt = source.split(/\r?\n/).slice(0, 18).join("\n");
  const card = document.createElement("div");
  card.className = "hover-card";
  card.setAttribute("role", "tooltip");
  const title = `${escapeHtml(stripExt(baseName(path)))}${heading ? ` › ${escapeHtml(heading)}` : ""}`;
  card.innerHTML = `<div class="hover-title">${icon("file-text", 14)}<span>${title}</span></div><div class="hover-body">${decorateCallouts(renderMarkdown(excerpt, (t) => ({ exists: linkTargetExists(state.vault, t, path) })))}</div>`;
  card.addEventListener("mouseenter", () => clearTimeout(state.hover.hideTimer));
  card.addEventListener("mouseleave", scheduleHideHover);
  card.addEventListener("click", (ev) => {
    const a = ev.target.closest("a.wikilink");
    ev.preventDefault();
    hideHover();
    if (a) followWikilink(a.dataset.target, path);
    else openNote(path, { heading });
  });
  state.hover.card?.remove();
  document.body.append(card);
  const r = link.getBoundingClientRect();
  const h = card.offsetHeight;
  const w = card.offsetWidth;
  const below = r.bottom + 8 + h <= window.innerHeight - 8;
  card.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  card.style.top = `${below ? r.bottom + 8 : Math.max(8, r.top - h - 8)}px`;
  state.hover.card = card;
  state.hover.current = link;
}

// Cria o link na primeira menção sem link que a nota `source` faz à nota aberta.
function linkMention(source) {
  if (!state.active || isView(state.active)) return;
  const result = linkFirstMention(state.vault.read(source), mentionTitles(state.vault, state.active), linkNameFor(state.vault, state.active));
  if (!result.changed) return toast("Não encontrei a menção. A nota pode ter mudado.", "info");
  state.vault.write(source, result.content);
  toast(`Link criado em ${stripExt(baseName(source))}`, "success");
}

// ---------------------------------------------------------------------------
// Snippets de CSS

function applySnippets() {
  setSnippetStyle(state.snippetStyle, state.snippets.list(), { safe: SAFE_MODE });
}

function newSnippet() {
  const sn = state.snippets.create({ name: "Novo estilo" });
  applySnippets();
  return sn;
}

function toggleSnippet(id, on) {
  const sn = state.snippets.setEnabled(id, on);
  applySnippets();
  if (sn && on && hasErrors(lintCss(sn.css))) toast("Este estilo tem um erro e não foi aplicado.", "error");
  else if (sn && SAFE_MODE) toast("Modo seguro: o snippet só vale sem ?safe=1.", "info");
}

function renameSnippet(id, name) {
  state.snippets.update(id, { name });
  applySnippets();
}

function saveSnippetCss(id, css) {
  if (!state.snippets.get(id)) return;
  state.snippets.update(id, { css });
  applySnippets();
}

async function deleteSnippet(id) {
  const sn = state.snippets.get(id);
  if (!sn) return false;
  const ok = await askConfirm(`Excluir o estilo “${sn.name}”? Esta ação não pode ser desfeita.`, "Excluir estilo", "Excluir");
  if (!ok) return false;
  state.snippets.remove(id);
  applySnippets();
  toast("Snippet excluído", "success");
  return true;
}

function downloadSnippet(id) {
  const sn = state.snippets.get(id);
  if (sn) download(`${sn.name}.css`, sn.css, "text/css");
}

function disableAllSnippets() {
  state.snippets.disableAll();
  applySnippets();
  toast("Todos os snippets foram desligados", "success");
}

function importSnippet() {
  els.importCss.click();
}

async function importSnippetFile(e) {
  const files = [...e.target.files];
  e.target.value = "";
  let ok = 0;
  for (const file of files) {
    try {
      const sn = state.snippets.create({ name: file.name, css: await file.text(), enabled: false });
      if (sn) ok++;
    } catch (err) {
      toast(`Não consegui ler ${file.name}: ${err.message}`, "error");
    }
  }
  if (!ok) return;
  applySnippets();
  toast(ok === 1 ? "Snippet importado (desligado)" : `${ok} snippets importados (desligados)`, "success");
  state.settingsSection = "snippets";
  if (state.active === "@settings") renderMain();
}

// ---------------------------------------------------------------------------
// Aviso e contexto das telas

let toastTimer = null;
function toast(text, kind = "info") {
  const ic = kind === "success" ? "check-circle" : kind === "error" ? "alert" : "info";
  els.toast.innerHTML = `${icon(ic, 16)}<span>${escapeHtml(text)}</span>`;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 3000);
}

function makeCtx() {
  return {
    vault: () => state.vault,
    index: () => state.index,
    settings: () => state.settings,
    plugins: () => state.plugins,
    pluginCommands: () => state.plugins?.commands() || [],
    pluginViews: () => state.plugins?.views() || [],
    shortcuts: shortcutList(),
    bookmarks: () => state.ws.bookmarks.filter((p) => state.vault.has(p)),
    trashItems: () => state.trash,
    restoreTrash,
    removeTrash,
    emptyTrash,
    setHotkey,
    resetHotkey,
    importPlugin: importPluginFromFile,
    removePlugin: removeImportedPlugin,
    setCommunityPlugins,
    communityPlugins: () => !!state.settings.pluginsComunidade,
    commandHotkeys,
    setCommandKey,
    clearCommandKey,
    coreFeatures: () => CORE_FEATURES.map((f) => ({ ...f, on: featureOn(f.id) })),
    setCoreFeature,
    disk: diskInfo,
    activePath: () => (isView(state.active) ? null : state.active),
    graphView: () => state.graphBig,
    openNote,
    openView,
    openCollectionCard,
    coverOf: (p) => state.covers?.[p] || "",
    iconOf: (p) => customIcon(p) || "folder",
    countBaseRows: (path) => {
      try {
        const { base: def } = parseBase(state.vault.read(path));
        return collectRows(state.vault.list(), def.source, (f) => state.index.meta(f.path)).length;
      } catch {
        return 0;
      }
    },
    openSettings,
    openPalette,
    createNote,
    createNoteNamed,
    toggleTask,
    snippets: () => state.snippets.list(),
    safeMode: () => SAFE_MODE,
    newSnippet,
    toggleSnippet,
    renameSnippet,
    saveSnippetCss,
    deleteSnippet,
    downloadSnippet,
    importSnippet,
    disableAllSnippets,
    setSetting,
    chooseFolder,
    reconnectFolder,
    reloadFolder,
    disconnectFolder,
    exportVault,
    importVault,
    restoreSample,
    wipeData,
    toast,
  };
}

init();
