// Atalho próprio para qualquer comando da paleta. Os atalhos globais (hotkeys.js) continuam à parte; aqui o mapa é
// { idDoComando: "Ctrl+Alt+K" } e a validação considera também os globais, para nada se repetir.

import { effectiveHotkeys, normalizeCombo, comboFromEvent, RESERVED } from "./hotkeys.js";

// Id estável de um comando a partir do nome: sem acento, sem o que vem entre parênteses (contagens), em minúsculas e com hífens.
export function commandId(name) {
  return String(name)
    .replace(/\s*\([^)]*\)/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function basicCheck(combo) {
  const norm = normalizeCombo(combo);
  if (!norm) return { ok: false, error: "Essa combinação não é válida." };
  const parts = norm.split("+");
  const hasMod = parts.includes("Ctrl") || parts.includes("Alt");
  if (!hasMod && !/^F\d+$/.test(parts[parts.length - 1])) return { ok: false, error: "Use Ctrl ou Alt junto com a tecla, para não atrapalhar a digitação." };
  if (RESERVED.has(norm)) return { ok: false, error: `${norm} já é usado pelo editor ou pelo navegador.` };
  return { ok: true, combo: norm };
}

// `labels`: { idDoComando: "Nome" } para as mensagens de conflito.
export function validateCmdKey(combo, id, cmdKeys = {}, globalOverrides = {}, labels = {}) {
  const check = basicCheck(combo);
  if (!check.ok) return check;
  const global = Object.entries(effectiveHotkeys(globalOverrides)).find(([, v]) => v === check.combo);
  if (global) return { ok: false, error: `${check.combo} já é o atalho de um comando geral (${global[0]}).` };
  const other = Object.entries(cmdKeys).find(([k, v]) => k !== id && v === check.combo);
  if (other) return { ok: false, error: `${check.combo} já está em uso por “${labels[other[0]] || other[0]}”.` };
  return check;
}

// Qual comando da paleta o evento dispara, ou null.
export function findCmdKey(e, cmdKeys = {}) {
  const combo = comboFromEvent(e);
  if (!combo) return null;
  return Object.keys(cmdKeys).find((id) => cmdKeys[id] === combo) || null;
}

// Aceita só combinações válidas, sem repetir entre si nem com os globais. Protege contra dados salvos estragados.
export function sanitizeCmdKeys(raw, globalOverrides = {}) {
  const clean = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
  for (const [id, combo] of Object.entries(raw)) {
    if (!/^[a-z0-9:-]{1,80}$/.test(id)) continue;
    const check = validateCmdKey(combo, id, clean, globalOverrides);
    if (check.ok) clean[id] = check.combo;
  }
  return clean;
}

export function setCmdKey(cmdKeys, id, combo) {
  return { ...cmdKeys, [id]: combo };
}

export function clearCmdKey(cmdKeys, id) {
  const { [id]: _gone, ...rest } = cmdKeys;
  return rest;
}
