// Menção com "@": datas escritas em palavras ("hoje", "amanhã", "sexta", "25/12", "2026-12-25", "+3") viram uma data de
// verdade, gravada como `<time datetime="2026-12-25">25 de dez. de 2026</time>`. Tudo puro (a data de hoje entra por
// parâmetro), para dar para testar.

const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const WEEKDAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
const pad = (n) => String(n).padStart(2, "0");

export const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "2026-12-25" → Date local (meio-dia, para não virar de dia com fuso); null se a data não existe.
export function dateOfIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return isoOf(d) === iso ? d : null;
}

export function formatDate(iso) {
  const d = dateOfIso(iso);
  return d ? d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }) : iso;
}

const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);

// Entende o que foi digitado depois do "@" como data. Devolve { iso, label } ou null.
export function parseDateQuery(query, now = new Date()) {
  const q = fold(query);
  if (!q) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  let d = null;
  let m;
  if (q === "hoje") d = today;
  else if (q === "amanha") d = addDays(today, 1);
  else if (q === "ontem") d = addDays(today, -1);
  else if ((m = /^([+-])(\d{1,3})$/.exec(q))) d = addDays(today, (m[1] === "-" ? -1 : 1) * Number(m[2]));
  else if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(q))) d = dateOfIso(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  else if ((m = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?$/.exec(q))) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
    d = dateOfIso(`${year}-${pad(m[2])}-${pad(m[1])}`);
  } else {
    // dia da semana: o próximo (se for hoje mesmo, a semana que vem)
    const w = WEEKDAYS.findIndex((x) => x.startsWith(q) && q.length >= 3);
    if (w !== -1) {
      const delta = ((w - today.getDay() + 7) % 7) || 7;
      d = addDays(today, delta);
    }
  }
  if (!d) return null;
  const iso = isoOf(d);
  return { iso, label: formatDate(iso) };
}

// Sugestões do menu "@" para o que foi digitado: datas (sempre as três de atalho quando a consulta está vazia).
export function dateSuggestions(query, now = new Date()) {
  const q = fold(query);
  const out = [];
  const seen = new Set();
  const push = (name, iso) => {
    if (!iso || seen.has(iso)) return;
    seen.add(iso);
    out.push({ name, iso, label: formatDate(iso) });
  };
  const direct = parseDateQuery(query, now);
  if (direct) push(direct.label, direct.iso);
  for (const [name, key] of [["Hoje", "hoje"], ["Amanhã", "amanha"], ["Ontem", "ontem"]]) {
    if (!q || fold(name).startsWith(q)) push(name, parseDateQuery(key, now).iso);
  }
  return out;
}

export const dateMarkdown = (iso) => `<time datetime="${iso}">${formatDate(iso)}</time>`;

// `@` só abre o menu no começo do texto ou depois de um espaço.
export function mentionAt(textBeforeCaret) {
  const m = /(^|\s)@([^\s@]{0,24})$/.exec(textBeforeCaret);
  return m ? { query: m[2], length: m[2].length + 1 } : null;
}
