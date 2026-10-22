// Estado da segunda folha (o painel da direita). Funções puras: recebem o estado e devolvem um novo.
// Forma: { open, tabs: [caminhos], active, edit }. Fica no espaço de trabalho e volta na recarga.

export const emptySplit = () => ({ open: false, tabs: [], active: null, edit: false });

const isPath = (p) => typeof p === "string" && p.length > 0 && p.length < 500 && !p.startsWith("@");

export function sanitizeSplit(raw) {
  const out = emptySplit();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  out.tabs = [...new Set((Array.isArray(raw.tabs) ? raw.tabs : []).filter(isPath))];
  out.active = out.tabs.includes(raw.active) ? raw.active : out.tabs[0] || null;
  out.open = raw.open === true && out.tabs.length > 0;
  out.edit = raw.edit === true;
  return out;
}

// Abre um caminho na segunda folha: abre o painel se estiver fechado e deixa a aba ativa.
export function splitOpen(split, path) {
  if (!isPath(path)) return split;
  const s = sanitizeSplit(split);
  if (!s.tabs.includes(path)) s.tabs.push(path);
  return { ...s, open: true, active: path };
}

export function splitActivate(split, path) {
  const s = sanitizeSplit(split);
  return s.tabs.includes(path) ? { ...s, active: path } : s;
}

// Fecha uma aba; sem abas, o painel inteiro fecha.
export function splitCloseTab(split, path) {
  const s = sanitizeSplit(split);
  const i = s.tabs.indexOf(path);
  if (i === -1) return s;
  const tabs = s.tabs.filter((p) => p !== path);
  if (tabs.length === 0) return emptySplit();
  return { ...s, tabs, active: s.active === path ? tabs[Math.max(0, i - 1)] : s.active };
}

export const splitClose = (split) => ({ ...sanitizeSplit(split), open: false });

export function splitRename(split, from, to) {
  const s = sanitizeSplit(split);
  if (!s.tabs.includes(from)) return s;
  const tabs = [...new Set(s.tabs.map((p) => (p === from ? to : p)))];
  return { ...s, tabs, active: s.active === from ? to : s.active };
}

export const splitDelete = (split, path) => splitCloseTab(split, path);

// Tira as abas cujo arquivo não existe mais (ao carregar uma biblioteca diferente, por exemplo).
export function splitDropMissing(split, exists) {
  let s = sanitizeSplit(split);
  for (const p of [...s.tabs]) if (!exists(p)) s = splitCloseTab(s, p);
  return s;
}

// Troca as notas ativas dos dois painéis: a do painel da direita vai para o principal e a do principal para a direita.
// Devolve { main, split } ou null se não houver painel da direita aberto com uma nota ativa, ou se as duas forem iguais.
export function splitSwap(split, mainPath) {
  const s = sanitizeSplit(split);
  if (!s.open || !s.active || !mainPath || s.active === mainPath) return null;
  return { main: s.active, split: splitOpen(s, mainPath) };
}

// Alterna o painel da direita entre leitura e edição.
export function splitToggleEdit(split) {
  const s = sanitizeSplit(split);
  return { ...s, edit: !s.edit };
}
