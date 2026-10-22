// Comentários de uma nota: discussões presas a um trecho do texto (a "citação"), cada uma com respostas e a opção de resolver.
// Ficam guardados à parte do arquivo da nota (no navegador), por caminho, para não sujar o Markdown. As funções são puras:
// recebem o estado todo e devolvem o novo.

let counter = 0;
const newId = (p) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const AUTHOR = "Você";
let author = AUTHOR;
// Nome do perfil local; vazio volta ao padrão.
export function setAuthor(name) {
  author = String(name || "").trim() || AUTHOR;
}
export const MAX_QUOTE = 200;

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function sanitizeComments(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [path, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const ds = list
      .filter((d) => d && typeof d.id === "string" && typeof d.quote === "string" && Array.isArray(d.comments))
      .map((d) => ({
        id: d.id,
        quote: clean(d.quote).slice(0, MAX_QUOTE),
        resolved: !!d.resolved,
        at: Number(d.at) || 0,
        comments: d.comments
          .filter((c) => c && typeof c.text === "string" && c.text.trim())
          .map((c) => ({ id: String(c.id || newId("c")), author: String(c.author || AUTHOR), text: c.text, at: Number(c.at) || 0 })),
      }))
      .filter((d) => d.comments.length > 0);
    if (ds.length) out[path] = ds;
  }
  return out;
}

export const forNote = (state, path) => state[path] || [];

export function addDiscussion(state, path, quote, text, now = Date.now()) {
  const q = clean(quote).slice(0, MAX_QUOTE);
  const t = String(text ?? "").trim();
  if (!q || !t) return { state, id: null };
  const id = newId("d");
  const d = { id, quote: q, resolved: false, at: now, comments: [{ id: newId("c"), author, text: t, at: now }] };
  return { state: { ...state, [path]: [...forNote(state, path), d] }, id };
}

const mapNote = (state, path, fn) => {
  const list = forNote(state, path);
  const next = fn(list);
  if (next === list) return state;
  const out = { ...state };
  if (next.length) out[path] = next;
  else delete out[path];
  return out;
};

export function addReply(state, path, id, text, now = Date.now()) {
  const t = String(text ?? "").trim();
  if (!t) return state;
  return mapNote(state, path, (list) => (list.some((d) => d.id === id) ? list.map((d) => (d.id === id ? { ...d, comments: [...d.comments, { id: newId("c"), author, text: t, at: now }] } : d)) : list));
}

export const setResolved = (state, path, id, resolved) =>
  mapNote(state, path, (list) => (list.some((d) => d.id === id && d.resolved !== !!resolved) ? list.map((d) => (d.id === id ? { ...d, resolved: !!resolved } : d)) : list));

export const removeDiscussion = (state, path, id) => mapNote(state, path, (list) => (list.some((d) => d.id === id) ? list.filter((d) => d.id !== id) : list));

export function removeComment(state, path, id, commentId) {
  return mapNote(state, path, (list) => {
    const d = list.find((x) => x.id === id);
    if (!d || !d.comments.some((c) => c.id === commentId)) return list;
    const comments = d.comments.filter((c) => c.id !== commentId);
    return comments.length ? list.map((x) => (x.id === id ? { ...x, comments } : x)) : list.filter((x) => x.id !== id); // sem comentários, a discussão some
  });
}

export function renamePath(state, from, to) {
  if (!(from in state) || from === to) return state;
  const { [from]: moved, ...rest } = state;
  return { ...rest, [to]: [...(rest[to] || []), ...moved] };
}

export const countOpen = (state, path) => forNote(state, path).filter((d) => !d.resolved).length;

// Primeira posição, em um texto, onde o trecho comentado aparece (ignorando diferenças de espaço); -1 se não aparece.
export function findQuote(text, quote) {
  const q = clean(quote);
  if (!q) return -1;
  const i = String(text).indexOf(q);
  if (i !== -1) return i;
  return -1;
}
