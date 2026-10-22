// Lixeira e versões anteriores das notas. Funções puras sobre listas e objetos simples; o app guarda o resultado no
// armazenamento local. Os dois têm limites de tamanho, para não estourar o espaço do navegador.

export const TRASH_MAX_ITEMS = 100;
export const TRASH_MAX_CHARS = 600_000;
export const TRASH_MAX_DAYS = 30;
export const SNAP_MAX_PER_NOTE = 10;
export const SNAP_MIN_INTERVAL = 2 * 60 * 1000;
export const SNAP_MAX_CHARS = 600_000;

const isStr = (v) => typeof v === "string";

// --- Lixeira ------------------------------------------------------------------------------------------------------------

function trim(items) {
  let kept = items.slice(0, TRASH_MAX_ITEMS);
  let total = 0;
  kept = kept.filter((it) => {
    total += it.content.length;
    return total <= TRASH_MAX_CHARS;
  });
  return kept;
}

// Põe um arquivo na lixeira (o mais novo primeiro). Um caminho repetido substitui o anterior.
export function trashAdd(items, file, now = Date.now()) {
  if (!file || !isStr(file.path) || !isStr(file.content)) return items;
  const rest = items.filter((it) => it.path !== file.path);
  return trim([{ path: file.path, content: file.content, deletedAt: now }, ...rest]);
}

// Tira da lixeira para restaurar. Se o caminho original já existe, o arquivo volta com " (restaurado)" no nome.
export function trashRestore(items, path, exists = () => false) {
  const item = items.find((it) => it.path === path);
  if (!item) return { items, file: null };
  let target = item.path;
  if (exists(target)) {
    const dot = target.lastIndexOf(".");
    const stem = dot > target.lastIndexOf("/") ? target.slice(0, dot) : target;
    const ext = dot > target.lastIndexOf("/") ? target.slice(dot) : "";
    let n = 1;
    do {
      target = `${stem} (restaurado${n > 1 ? ` ${n}` : ""})${ext}`;
      n++;
    } while (exists(target));
  }
  return { items: items.filter((it) => it !== item), file: { path: target, content: item.content } };
}

export const trashRemove = (items, path) => items.filter((it) => it.path !== path);

// Descarta o que passou de `maxDays` dias.
export function trashPurge(items, now = Date.now(), maxDays = TRASH_MAX_DAYS) {
  const limit = now - maxDays * 24 * 3600 * 1000;
  return items.filter((it) => it.deletedAt >= limit);
}

export function sanitizeTrash(raw) {
  if (!Array.isArray(raw)) return [];
  const clean = raw
    .filter((it) => it && isStr(it.path) && it.path && isStr(it.content) && Number.isFinite(it.deletedAt))
    .map((it) => ({ path: it.path, content: it.content, deletedAt: it.deletedAt }));
  const seen = new Set();
  return trim(clean.filter((it) => (seen.has(it.path) ? false : seen.add(it.path))));
}

// --- Versões anteriores ---------------------------------------------------------------------------------------------

// Guarda uma versão da nota se o texto mudou e já passou o intervalo mínimo desde a última (ou se `force`).
export function snapshotAdd(store, path, content, now = Date.now(), { force = false } = {}) {
  if (!isStr(path) || !isStr(content)) return store;
  const list = store[path] || [];
  const last = list[0];
  if (last && last.content === content) return store;
  if (last && !force && now - last.t < SNAP_MIN_INTERVAL) return store;
  const next = { ...store, [path]: [{ t: now, content }, ...list].slice(0, SNAP_MAX_PER_NOTE) };
  return capSnapshots(next);
}

// Mantém o total de texto guardado abaixo do limite, jogando fora as versões mais antigas primeiro.
function capSnapshots(store) {
  let total = Object.values(store).reduce((n, l) => n + l.reduce((m, s) => m + s.content.length, 0), 0);
  if (total <= SNAP_MAX_CHARS) return store;
  const out = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, [...v]]));
  while (total > SNAP_MAX_CHARS) {
    let oldest = null;
    for (const [p, l] of Object.entries(out)) {
      if (l.length > 1 && (!oldest || l[l.length - 1].t < out[oldest][out[oldest].length - 1].t)) oldest = p;
    }
    if (!oldest) break;
    total -= out[oldest].pop().content.length;
  }
  return out;
}

export function snapshotRename(store, from, to) {
  if (!store[from]) return store;
  const { [from]: list, ...rest } = store;
  return { ...rest, [to]: [...(rest[to] || []), ...list].sort((a, b) => b.t - a.t).slice(0, SNAP_MAX_PER_NOTE) };
}

export function snapshotRemove(store, path) {
  const { [path]: _gone, ...rest } = store;
  return rest;
}

export function sanitizeSnapshots(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [path, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const clean = list.filter((s) => s && isStr(s.content) && Number.isFinite(s.t)).sort((a, b) => b.t - a.t).slice(0, SNAP_MAX_PER_NOTE);
    if (clean.length) out[path] = clean.map((s) => ({ t: s.t, content: s.content }));
  }
  return capSnapshots(out);
}

// Resumo da diferença entre duas versões, por linhas: quantas foram acrescentadas e quantas saíram.
export function diffSummary(before, after) {
  const count = (text) => {
    const m = new Map();
    for (const l of text.split("\n")) m.set(l, (m.get(l) || 0) + 1);
    return m;
  };
  const a = count(before);
  const b = count(after);
  let added = 0;
  let removed = 0;
  for (const [l, n] of b) added += Math.max(0, n - (a.get(l) || 0));
  for (const [l, n] of a) removed += Math.max(0, n - (b.get(l) || 0));
  return { added, removed };
}
