// Menu de contexto (botão direito) do app: um menu flutuante só, com ícones, atalhos, separadores, itens desligados ou
// perigosos e um nível de submenu. Navega pelo teclado (setas, Enter, Esc) e fecha ao clicar fora, rolar ou redimensionar.
// Cada superfície monta a lista de itens e chama `showContextMenu`.
//
// Item: { label, icon?, hint?, danger?, disabled?, hidden?, checked?, run?(), items?: Item[] } ou { sep: true }.

import { icon } from "./icons.js";
import { escapeHtml } from "./markdown.js";

// Tira o que não aparece e arruma os separadores: nenhum no começo, no fim nem dois seguidos.
export function cleanItems(items) {
  const out = [];
  for (const it of items || []) {
    if (!it || it.hidden) continue;
    if (it.sep) {
      if (out.length && !out[out.length - 1].sep) out.push({ sep: true });
      continue;
    }
    out.push(it);
  }
  while (out.length && out[out.length - 1].sep) out.pop();
  return out;
}

// Próximo item que dá para escolher, andando `dir` (+1 ou -1) e dando a volta; -1 se não houver nenhum.
export function nextEnabled(items, from, dir) {
  const n = items.length;
  if (!n) return -1;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (!items[i].sep && !items[i].disabled) return i;
  }
  return -1;
}

// Põe uma caixa de tamanho `w` × `h` perto de (x, y) sem sair da janela (de `vw` × `vh`).
export function placeBox(x, y, w, h, vw, vh, margin = 6) {
  const left = x + w + margin > vw ? Math.max(margin, vw - w - margin) : x;
  const top = y + h + margin > vh ? Math.max(margin, vh - h - margin) : y;
  return { left, top };
}

let current = null; // { el, close }

export function closeContextMenu() {
  current?.close();
}

function itemHtml(it, i) {
  if (it.sep) return `<div class="cm-sep" role="separator"></div>`;
  const cls = ["cm-item", it.danger && "danger", it.disabled && "disabled", it.items && "has-sub"].filter(Boolean).join(" ");
  return `<button type="button" class="${cls}" role="menuitem" data-i="${i}" tabindex="-1"${it.disabled ? " aria-disabled=\"true\"" : ""}${it.items ? " aria-haspopup=\"menu\"" : ""}>${it.icon ? icon(it.icon, 16) : `<span class="cm-gap"></span>`}<span class="cm-label">${escapeHtml(it.label)}</span>${it.checked ? `<span class="cm-check">${icon("check", 14)}</span>` : ""}${it.hint ? `<kbd>${escapeHtml(it.hint)}</kbd>` : ""}${it.items ? `<span class="cm-arrow">${icon("chevron-right", 14)}</span>` : ""}</button>`;
}

// Abre o menu em (x, y) da tela. Devolve uma função que fecha.
export function showContextMenu(x, y, rawItems) {
  closeContextMenu();
  const items = cleanItems(rawItems);
  if (!items.length) return () => {};
  const previousFocus = document.activeElement;
  const panels = []; // pilha: o menu e os submenus abertos
  const abort = new AbortController();
  const { signal } = abort;

  const build = (list, px, py, parentRect = null) => {
    const el = document.createElement("div");
    el.className = "cm";
    el.setAttribute("role", "menu");
    el.tabIndex = -1;
    el.innerHTML = list.map(itemHtml).join("");
    document.body.appendChild(el);
    const box = el.getBoundingClientRect();
    let { left, top } = placeBox(px, py, box.width, box.height, window.innerWidth, window.innerHeight);
    if (parentRect && px + box.width + 6 > window.innerWidth) left = Math.max(6, parentRect.left - box.width + 2); // abre para o outro lado
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    const panel = { el, list, index: -1 };
    panels.push(panel);
    return panel;
  };

  const highlight = (panel, i) => {
    panel.index = i;
    panel.el.querySelectorAll(".cm-item").forEach((b) => b.classList.toggle("on", Number(b.dataset.i) === i));
  };

  const closeFrom = (depth) => {
    while (panels.length > depth) panels.pop().el.remove();
  };

  const openSub = (panel, i) => {
    const it = panel.list[i];
    closeFrom(panels.indexOf(panel) + 1);
    if (!it?.items || it.disabled) return;
    const row = panel.el.querySelector(`.cm-item[data-i="${i}"]`).getBoundingClientRect();
    const sub = build(cleanItems(it.items), row.right - 4, row.top - 5, row);
    highlight(sub, nextEnabled(sub.list, -1, 1));
  };

  const close = () => {
    abort.abort();
    closeFrom(0);
    current = null;
    if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus({ preventScroll: true });
  };

  const choose = (panel, i) => {
    const it = panel.list[i];
    if (!it || it.sep || it.disabled) return;
    if (it.items) return openSub(panel, i);
    close();
    it.run?.();
  };

  const root = build(items, x, y);
  current = { el: root.el, close };
  highlight(root, nextEnabled(items, -1, 1));
  root.el.focus({ preventScroll: true });

  const panelOf = (target) => panels.find((p) => p.el.contains(target));
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!panelOf(e.target)) close();
    },
    { capture: true, signal },
  );
  document.addEventListener("contextmenu", (e) => {
    if (!panelOf(e.target)) close(); // outro clique direito troca o menu (quem tratou já abriu o novo)
  }, { capture: true, signal });
  document.addEventListener("wheel", (e) => {
    if (!panelOf(e.target)) close();
  }, { capture: true, passive: true, signal });
  window.addEventListener("resize", close, { signal });
  window.addEventListener("blur", close, { signal });

  const onOver = (e) => {
    const b = e.target.closest(".cm-item");
    const panel = panelOf(e.target);
    if (!b || !panel || b.classList.contains("disabled")) return;
    const i = Number(b.dataset.i);
    if (panel.index !== i) {
      closeFrom(panels.indexOf(panel) + 1);
      highlight(panel, i);
      if (panel.list[i].items) openSub(panel, i);
    }
  };
  const onClick = (e) => {
    const b = e.target.closest(".cm-item");
    const panel = panelOf(e.target);
    if (b && panel) {
      e.preventDefault();
      choose(panel, Number(b.dataset.i));
    }
  };
  document.addEventListener("mouseover", onOver, { signal });
  document.addEventListener("click", onClick, { capture: true, signal });

  document.addEventListener(
    "keydown",
    (e) => {
      const panel = panels[panels.length - 1];
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (e.key === "Escape") {
        stop();
        if (panels.length > 1) closeFrom(panels.length - 1);
        else close();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        stop();
        highlight(panel, nextEnabled(panel.list, panel.index, e.key === "ArrowDown" ? 1 : -1));
      } else if (e.key === "Home" || e.key === "End") {
        stop();
        highlight(panel, nextEnabled(panel.list, e.key === "Home" ? -1 : 0, e.key === "Home" ? 1 : -1));
      } else if (e.key === "ArrowRight") {
        stop();
        if (panel.list[panel.index]?.items) openSub(panel, panel.index);
      } else if (e.key === "ArrowLeft") {
        stop();
        if (panels.length > 1) closeFrom(panels.length - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        stop();
        choose(panel, panel.index);
      } else if (e.key === "Tab") {
        stop();
        close();
      }
    },
    { capture: true, signal },
  );
  return close;
}

// Atalho para as superfícies: trata o evento `contextmenu`, abrindo o menu na posição do mouse (ou do foco, pelo teclado).
export function openAtEvent(e, items) {
  e.preventDefault();
  e.stopPropagation();
  let { clientX: x, clientY: y } = e;
  if (x === 0 && y === 0 && e.target?.getBoundingClientRect) {
    const r = e.target.getBoundingClientRect(); // tecla de menu: abre junto do elemento
    x = r.left + 8;
    y = r.bottom;
  }
  return showContextMenu(x, y, items);
}
