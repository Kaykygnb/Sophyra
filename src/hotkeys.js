// Atalhos de teclado que a pessoa pode trocar. Sem DOM: trabalha com textos como "Ctrl+Shift+F" e com o
// necessário de um evento de teclado (key, ctrlKey, metaKey, shiftKey, altKey). Cmd (Mac) conta como Ctrl.

export const GLOBAL_COMMANDS = [
  { id: "paleta", group: "Geral", label: "Abrir a paleta de comandos", combo: "Ctrl+P" },
  { id: "abrir", group: "Geral", label: "Abrir uma nota pelo nome", combo: "Ctrl+O" },
  { id: "buscar", group: "Geral", label: "Buscar nas notas", combo: "Ctrl+Shift+F" },
  { id: "config", group: "Geral", label: "Abrir as configurações", combo: "Ctrl+," },
  { id: "nova", group: "Notas", label: "Criar uma nota", combo: "Ctrl+N" },
  { id: "fechar", group: "Notas", label: "Fechar a aba atual", combo: "Ctrl+W" },
  { id: "voltar", group: "Navegação", label: "Voltar para a nota anterior", combo: "Alt+←" },
  { id: "avancar", group: "Navegação", label: "Avançar para a próxima nota", combo: "Alt+→" },
];

// Combinações que o editor ou o sistema já usam: não podem ser tomadas por um comando global.
export const RESERVED = new Set(["Ctrl+B", "Ctrl+I", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+Z", "Ctrl+Y", "Ctrl+A", "Ctrl+S"]);

const MODS = ["Ctrl", "Shift", "Alt"];
const NAMED = { escape: "Esc", esc: "Esc", enter: "Enter", tab: "Tab", " ": "Space", space: "Space", arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", delete: "Del", backspace: "Backspace", pagedown: "PgDn", pageup: "PgUp", home: "Home", end: "End" };

function normKey(k) {
  const lower = String(k).toLowerCase();
  if (NAMED[lower]) return NAMED[lower];
  if (/^f([1-9]|1[0-2])$/.test(lower)) return lower.toUpperCase();
  return k.length === 1 ? k.toUpperCase() : null;
}

// Põe um texto de atalho na forma canônica (Ctrl, Shift, Alt, tecla) ou devolve null se não for válido.
export function normalizeCombo(text) {
  const parts = String(text ?? "").split("+").map((p) => p.trim()).filter((p, i, a) => p || i === a.length - 1);
  // "Ctrl++" e "Ctrl+," : a última parte pode ser o próprio "+" ou ","
  const raw = String(text ?? "");
  if (raw.endsWith("++")) parts.splice(parts.length - 1, 1, "+");
  const mods = new Set();
  let key = null;
  for (const [i, p] of parts.entries()) {
    const m = /^(ctrl|control|cmd|command|meta)$/i.test(p) ? "Ctrl" : /^shift$/i.test(p) ? "Shift" : /^(alt|option)$/i.test(p) ? "Alt" : null;
    if (m && i < parts.length - 1) mods.add(m);
    else if (i === parts.length - 1) key = normKey(p);
    else return null;
  }
  if (!key) return null;
  return [...MODS.filter((m) => mods.has(m)), key].join("+");
}

// Atalho que o evento representa, ou null quando só um modificador foi apertado.
export function comboFromEvent(e) {
  if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(e.key)) return null;
  const key = normKey(e.key);
  if (!key) return null;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");
  return [...mods, key].join("+");
}

export function keysOf(combo) {
  const text = String(combo);
  return text.endsWith("++") ? [...text.slice(0, -2).split("+"), "+"] : text.split("+");
}

// Atalhos em uso: o padrão de cada comando, trocado pelo que a pessoa escolheu.
export function effectiveHotkeys(overrides = {}) {
  const out = {};
  for (const c of GLOBAL_COMMANDS) out[c.id] = normalizeCombo(overrides?.[c.id]) || c.combo;
  return out;
}

export function validateCombo(combo, id, current = effectiveHotkeys()) {
  const norm = normalizeCombo(combo);
  if (!norm) return { ok: false, error: "Essa combinação não é válida." };
  const parts = norm.split("+");
  const hasMod = parts.includes("Ctrl") || parts.includes("Alt");
  const fKey = /^F\d+$/.test(parts[parts.length - 1]);
  if (!hasMod && !fKey) return { ok: false, error: "Use Ctrl ou Alt junto com a tecla, para não atrapalhar a digitação." };
  if (RESERVED.has(norm)) return { ok: false, error: `${norm} já é usado pelo editor ou pelo navegador.` };
  const other = Object.entries(current).find(([k, v]) => k !== id && v === norm);
  if (other) {
    const label = GLOBAL_COMMANDS.find((c) => c.id === other[0])?.label || other[0];
    return { ok: false, error: `${norm} já está em uso por “${label}”.` };
  }
  return { ok: true, combo: norm };
}

// Qual comando global o evento dispara, ou null.
export function findCommand(e, overrides = {}) {
  const combo = comboFromEvent(e);
  if (!combo) return null;
  const map = effectiveHotkeys(overrides);
  return Object.keys(map).find((id) => map[id] === combo) || null;
}

// Aceita só o que é válido: comandos conhecidos, combinações boas e sem repetição. Protege contra dados salvos estragados.
export function sanitizeOverrides(raw) {
  const clean = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return clean;
  const taken = new Map(GLOBAL_COMMANDS.map((c) => [c.id, c.combo]));
  for (const c of GLOBAL_COMMANDS) {
    if (!(c.id in raw)) continue;
    const check = validateCombo(raw[c.id], c.id, Object.fromEntries(taken));
    if (check.ok && check.combo !== c.combo) {
      clean[c.id] = check.combo;
      taken.set(c.id, check.combo);
    }
  }
  return clean;
}
