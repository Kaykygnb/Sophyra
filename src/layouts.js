// Espaços de trabalho salvos: um conjunto de abas, painel da direita, modo e painéis que a pessoa guarda com um
// nome e carrega depois (workspaces:save e workspaces:load do original). Funções puras sobre um objeto nome → layout.

import { sanitizeSplit } from "./splitstate.js";

export const MAX_LAYOUTS = 20;
const isPath = (p) => typeof p === "string" && p.length > 0 && p.length < 500;

// Tira de um espaço de trabalho vivo só o que vale guardar.
export function captureLayout(ws, active) {
  return {
    tabs: (ws.tabs || []).filter(isPath),
    active: isPath(active) ? active : null,
    pinned: (ws.pinned || []).filter(isPath),
    split: sanitizeSplit(ws.split),
    sideOpen: ws.sideOpen !== false,
    ctxOpen: ws.ctxOpen !== false,
    savedAt: Date.now(),
  };
}

export function sanitizeLayouts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [name, l] of Object.entries(raw)) {
    if (!name.trim() || name.length > 80 || !l || typeof l !== "object" || !Array.isArray(l.tabs)) continue;
    const tabs = [...new Set(l.tabs.filter(isPath))];
    out[name] = {
      tabs,
      active: tabs.includes(l.active) ? l.active : tabs[0] || null,
      pinned: [...new Set((Array.isArray(l.pinned) ? l.pinned : []).filter((p) => tabs.includes(p)))],
      split: sanitizeSplit(l.split),
      sideOpen: l.sideOpen !== false,
      ctxOpen: l.ctxOpen !== false,
      savedAt: Number.isFinite(l.savedAt) ? l.savedAt : 0,
    };
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_LAYOUTS));
}

// Salva com um nome; o mesmo nome substitui o anterior.
export function saveLayout(layouts, name, layout) {
  const clean = String(name ?? "").trim();
  if (!clean || clean.length > 80) return layouts;
  return sanitizeLayouts({ ...layouts, [clean]: layout });
}

export function deleteLayout(layouts, name) {
  const { [name]: _gone, ...rest } = layouts;
  return rest;
}

// Resolve um layout salvo contra a biblioteca de agora: abas de notas que sumiram ficam de fora. Telas do app (@…) ficam.
export function resolveLayout(layout, exists) {
  const keep = (p) => p.startsWith("@") || exists(p);
  const tabs = layout.tabs.filter(keep);
  const missing = layout.tabs.length - tabs.length;
  const split = sanitizeSplit({ ...layout.split, tabs: layout.split.tabs.filter(exists), active: layout.split.active });
  return {
    tabs: tabs.length ? tabs : ["@home"],
    active: tabs.includes(layout.active) ? layout.active : tabs[0] || "@home",
    pinned: layout.pinned.filter((p) => tabs.includes(p)),
    split,
    sideOpen: layout.sideOpen,
    ctxOpen: layout.ctxOpen,
    missing,
  };
}
