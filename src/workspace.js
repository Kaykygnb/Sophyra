// Espaço de trabalho salvo (abas, modo, painéis, câmera dos canvas). Um arquivo de workspace estragado impediu o
// original de abrir; aqui ele nunca derruba o app: o que estiver errado é descartado, e se tudo estiver perdido
// volta-se à última cópia boa. Sem DOM, para poder ser testado.

import { normalizeViewport } from "./canvas.js";
import { sanitizeSplit, emptySplit } from "./splitstate.js";

export const DEFAULT_WORKSPACE = { tabs: [], active: null, panels: {}, collapsed: {}, canvasViews: {}, split: emptySplit(), pinned: [], bookmarks: [] };
const SIDE_TABS = new Set("files search".split(" "));

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// Aceita qualquer coisa e devolve um espaço de trabalho válido, com a lista do que precisou ser corrigido.
export function sanitizeWorkspace(raw) {
  const issues = [];
  if (!isObj(raw)) return { ws: structuredClone(DEFAULT_WORKSPACE), issues: ["o conteúdo não é um objeto"], usable: false };
  const ws = structuredClone(DEFAULT_WORKSPACE);

  if (Array.isArray(raw.tabs)) {
    const tabs = [...new Set(raw.tabs.filter((t) => typeof t === "string" && t.length > 0 && t.length < 500))];
    if (tabs.length !== raw.tabs.length) issues.push("abas inválidas ou repetidas foram removidas");
    ws.tabs = tabs;
  } else if (raw.tabs !== undefined) {
    issues.push("a lista de abas estava danificada");
  }
  ws.active = typeof raw.active === "string" && ws.tabs.includes(raw.active) ? raw.active : ws.tabs[0] || null;
  if (raw.active && raw.active !== ws.active) issues.push("a aba ativa não existia");

  ws.sideTab = SIDE_TABS.has(raw.sideTab) ? raw.sideTab : undefined;
  if (typeof raw.sideOpen === "boolean") ws.sideOpen = raw.sideOpen;
  if (typeof raw.ctxOpen === "boolean") ws.ctxOpen = raw.ctxOpen;

  for (const key of ["panels", "collapsed"]) {
    if (isObj(raw[key])) {
      ws[key] = Object.fromEntries(Object.entries(raw[key]).filter(([, v]) => typeof v === "boolean"));
    } else if (raw[key] !== undefined) {
      issues.push(`“${key}” estava danificado`);
    }
  }
  if (isObj(raw.canvasViews)) {
    ws.canvasViews = Object.fromEntries(Object.entries(raw.canvasViews).filter(([, v]) => isObj(v)).map(([k, v]) => [k, normalizeViewport(v)]));
  } else if (raw.canvasViews !== undefined) {
    issues.push("a câmera dos canvas estava danificada");
  }
  for (const key of ["pinned", "bookmarks"]) {
    if (Array.isArray(raw[key])) {
      ws[key] = [...new Set(raw[key].filter((p) => typeof p === "string" && p.length > 0 && p.length < 500))];
    } else if (raw[key] !== undefined) {
      issues.push(`“${key}” estava danificado`);
    }
  }
  if (raw.split !== undefined) {
    ws.split = sanitizeSplit(raw.split);
    if (!raw.split || typeof raw.split !== "object" || Array.isArray(raw.split)) issues.push("o painel da direita estava danificado");
  }
  return { ws, issues, usable: true };
}

// Lê o texto salvo. Devolve { ws, recovered }: recovered diz de onde veio o estado quando algo precisou ser refeito.
export function recoverWorkspace(primaryText, backupText) {
  const attempt = (text) => {
    if (text == null || text === "") return null;
    try {
      return sanitizeWorkspace(JSON.parse(text));
    } catch {
      return { ws: structuredClone(DEFAULT_WORKSPACE), issues: ["o arquivo não é JSON válido"], usable: false };
    }
  };
  const first = attempt(primaryText);
  if (!first) return { ws: structuredClone(DEFAULT_WORKSPACE), recovered: null };
  if (first.usable && first.issues.length === 0) return { ws: first.ws, recovered: null };
  if (first.usable) return { ws: first.ws, recovered: { source: "ajustado", reason: first.issues.join("; ") } };
  const second = attempt(backupText);
  if (second?.usable) {
    return { ws: second.ws, recovered: { source: "cópia anterior", reason: first.issues.join("; ") } };
  }
  return { ws: structuredClone(DEFAULT_WORKSPACE), recovered: { source: "estado padrão", reason: first.issues.join("; ") } };
}
