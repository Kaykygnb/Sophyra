// Seletor de ícones: um painel com busca sobre o catálogo, usado para pastas e notas. Quem chama passa o catálogo, o
// ícone atual e o que fazer ao escolher ou remover.

import { icon } from "./icons.js";
import { searchIcons } from "./iconmap.js";
import { escapeHtml } from "./markdown.js";

const PAGE = 120;

export function openIconPicker(anchor, { catalog, current = "", onPick, onClear = null }) {
  document.querySelector(".icon-picker")?.remove();
  const box = document.createElement("div");
  box.className = "icon-picker";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Escolher ícone");
  box.innerHTML = `<div class="ip-head">
      <input type="search" class="ip-search" placeholder="Buscar ícone (ex.: livro, seta, casa)" aria-label="Buscar ícone" autocomplete="off">
      ${onClear && current ? `<button type="button" class="btn sm ip-clear">Remover ícone</button>` : ""}
    </div>
    <div class="ip-grid" role="listbox" aria-label="Ícones"></div>
    <p class="ip-count"></p>`;
  document.body.append(box);
  const input = box.querySelector(".ip-search");
  const grid = box.querySelector(".ip-grid");
  const count = box.querySelector(".ip-count");
  let shown = [];

  const draw = () => {
    shown = searchIcons(catalog, input.value, PAGE);
    grid.innerHTML = shown.length
      ? shown.map((name) => `<button type="button" class="ip-item${name === current ? " on" : ""}" data-name="${escapeHtml(name)}" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">${icon(name, 18)}</button>`).join("")
      : `<p class="ip-empty">Nenhum ícone com esse nome.</p>`;
    count.textContent = shown.length === PAGE ? `Mostrando os primeiros ${PAGE}; refine a busca.` : `${shown.length} ícone${shown.length === 1 ? "" : "s"}`;
  };

  const close = () => {
    box.remove();
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onOutside = (e) => {
    if (!box.contains(e.target)) close();
  };
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".ip-item");
    if (!b) return;
    close();
    onPick(b.dataset.name);
  });
  box.querySelector(".ip-clear")?.addEventListener("click", () => {
    close();
    onClear?.();
  });
  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && shown[0]) {
      e.preventDefault();
      close();
      onPick(shown[0]);
    }
  });

  // Posição: abaixo do ponto de referência, sempre dentro da janela.
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  const w = box.offsetWidth || 320;
  const h = box.offsetHeight || 360;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
  const top = r.bottom + 6 + h > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;

  draw();
  input.focus();
  // ouvir só depois do clique que abriu, para ele não fechar o painel na hora
  setTimeout(() => {
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
  return close;
}
