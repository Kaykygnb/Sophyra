// Tela da segunda folha: abas próprias, leitura da nota e um modo de edição simples.
// O app entrega o estado (get/set) e as funções de renderização; aqui só se cuida do desenho e dos cliques.

import { icon } from "./icons.js";
import { escapeHtml } from "./markdown.js";
import { stripExt, baseName, extOf } from "./vault.js";
import { splitOpen, splitCloseTab } from "./splitstate.js";

export function mountSplitView(host, { vault, get, set, noteHtml, toggleTask, openInMain, toast = () => {} }) {
  let editTimer = null;

  host.innerHTML = `
    <div class="tabbar" data-tabs role="tablist" aria-label="Abas do painel da direita"></div>
    <div class="toolbar leaf-bar">
      <div class="crumbs" data-title></div>
      <div class="toolbar-actions">
        <div class="segmented" role="group" aria-label="Modo no painel da direita">
          <button class="seg" data-leaf-mode="read" title="Ler"><i data-icon="book" data-size="15"></i><span>Ler</span></button>
          <button class="seg" data-leaf-mode="edit" title="Editar"><i data-icon="edit" data-size="15"></i><span>Editar</span></button>
        </div>
        <button class="icon-btn" data-leaf-main title="Abrir no painel principal" aria-label="Abrir no painel principal">${icon("arrow-right", 17)}</button>
        <button class="icon-btn" data-leaf-close title="Fechar o painel da direita" aria-label="Fechar o painel da direita">${icon("x", 17)}</button>
      </div>
    </div>
    <div class="leaf-body" data-body></div>`;
  const tabs = host.querySelector("[data-tabs]");
  const title = host.querySelector("[data-title]");
  const body = host.querySelector("[data-body]");

  const iconsDone = () => {
    for (const el of host.querySelectorAll("i[data-icon]")) el.outerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 16);
  };
  iconsDone();

  function render() {
    const s = get();
    host.hidden = !s.open;
    if (!s.open) return;
    tabs.innerHTML = s.tabs
      .map((p) => {
        const on = p === s.active;
        const label = stripExt(baseName(p));
        return `<div class="tab${on ? " active" : ""}" role="tab" tabindex="0" aria-selected="${on}" data-path="${escapeHtml(p)}" title="${escapeHtml(p)}">${icon(extOf(p) === "canvas" ? "layers" : "file-text", 15)}<span class="label">${escapeHtml(label)}</span><button class="tab-close" data-close="${escapeHtml(p)}" aria-label="Fechar ${escapeHtml(label)}" tabindex="-1">${icon("x", 14)}</button></div>`;
      })
      .join("");
    for (const b of host.querySelectorAll("[data-leaf-mode]")) b.setAttribute("aria-pressed", String(b.dataset.leafMode === (s.edit ? "edit" : "read")));
    const path = s.active;
    title.textContent = path ? path.replace(/\.md$/i, "").split("/").join(" › ") : "";
    drawBody(s);
  }

  function drawBody(s) {
    const path = s.active;
    if (!path || !vault.has(path)) {
      body.innerHTML = `<div class="empty-inline">${icon("file-text", 22)}<p>Essa nota não existe mais.</p></div>`;
      return;
    }
    if (extOf(path) !== "md") {
      body.innerHTML = `<div class="empty-inline">${icon("layers", 22)}<p>Canvas abrem no painel principal.</p><button class="btn sm" data-leaf-main>Abrir no painel principal</button></div>`;
      return;
    }
    if (s.edit) {
      if (body.querySelector("textarea")?.dataset.path === path) return; // não recria enquanto se digita
      body.innerHTML = `<textarea class="editor leaf-editor" spellcheck="false" aria-label="Texto da nota" data-path="${escapeHtml(path)}"></textarea>`;
      const ta = body.querySelector("textarea");
      ta.value = vault.read(path);
      ta.addEventListener("input", () => {
        clearTimeout(editTimer);
        editTimer = setTimeout(() => vault.has(path) && vault.write(path, ta.value), 150);
      });
      return;
    }
    body.innerHTML = `<article class="preview leaf-preview" aria-label="Nota renderizada">${noteHtml(path)}</article>`;
  }

  // Quando a biblioteca muda, desenha de novo, menos se a pessoa estiver digitando aqui.
  function onModify(file) {
    const s = get();
    if (!s.open || file.path !== s.active) return;
    const ta = body.querySelector("textarea");
    if (ta) {
      if (document.activeElement !== ta && ta.value !== file.content) ta.value = file.content;
      return;
    }
    drawBody(s);
  }

  host.addEventListener("click", (e) => {
    const s = get();
    if (e.target.closest("[data-leaf-close]")) return set({ ...s, open: false });
    if (e.target.closest("[data-leaf-main]")) return s.active && openInMain(s.active);
    const mode = e.target.closest("[data-leaf-mode]");
    if (mode) {
      const edit = mode.dataset.leafMode === "edit";
      body.innerHTML = "";
      return set({ ...s, edit });
    }
    const close = e.target.closest("[data-close]");
    if (close) return set(splitCloseTab(s, close.dataset.close));
    const tab = e.target.closest(".tab[data-path]");
    if (tab) return set({ ...s, active: tab.dataset.path });
    const link = e.target.closest("a.wikilink");
    if (link) {
      e.preventDefault();
      const target = vault.resolveLink(link.dataset.target, s.active);
      if (target) set(splitOpen(s, target));
      else toast("Essa nota ainda não existe.", "info");
      return;
    }
    const box = e.target.closest("input[type=checkbox][data-task]");
    if (box) {
      e.preventDefault();
      toggleTask(s.active, Number(box.dataset.task));
    }
  });

  return { render, onModify, destroy: () => clearTimeout(editTimer) };
}
