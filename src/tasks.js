// Tarefas: o prazo de uma tarefa é a primeira data escrita no texto dela (`@25/12`, `2026-12-25`, `25/12/2026`).
// Este módulo agrupa as tarefas pelo prazo, para a tela de Tarefas. Funções puras, sem DOM.

import { readDate } from "./bases.js";

const DATE_TOKEN = /(?:^|\s)@?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?=\s|$|[.,;:!?)])/;

// Data (AAAA-MM-DD) escrita no texto da tarefa, ou "" se não houver.
export function dueOf(text, now = new Date()) {
  const m = DATE_TOKEN.exec(String(text ?? ""));
  if (!m) return "";
  let token = m[1];
  // "25/12" sem ano: usa o ano atual, e se já passou, o próximo
  const short = /^(\d{1,2})\/(\d{1,2})$/.exec(token);
  if (short) {
    const [day, month] = [short[1], short[2]];
    const y = now.getFullYear();
    const iso = readDate(`${day}/${month}/${y}`);
    if (iso && iso < todayIso(now)) return readDate(`${day}/${month}/${y + 1}`) || "";
    return iso;
  }
  return readDate(token);
}

const todayIso = (now) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function plusDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return todayIso(d);
}

// Grupos da tela, nesta ordem. `tasks` são { text, path, done, line }.
export const GROUPS = [
  { key: "late", title: "Atrasadas" },
  { key: "today", title: "Hoje" },
  { key: "week", title: "Próximos 7 dias" },
  { key: "later", title: "Depois" },
  { key: "none", title: "Sem prazo" },
];

// Separa as tarefas abertas por prazo e devolve também as concluídas. Dentro de cada grupo: a data mais cedo primeiro.
export function groupTasks(tasks, now = new Date()) {
  const today = todayIso(now);
  const week = plusDays(today, 7);
  const out = Object.fromEntries(GROUPS.map((g) => [g.key, []]));
  out.done = [];
  for (const t of tasks) {
    const due = dueOf(t.text, now);
    const item = { ...t, due };
    if (t.done) out.done.push(item);
    else if (!due) out.none.push(item);
    else if (due < today) out.late.push(item);
    else if (due === today) out.today.push(item);
    else if (due <= week) out.week.push(item);
    else out.later.push(item);
  }
  // comparação simples (sem localeCompare): com muitas tarefas, a ordenação é o que mais pesa
  const byDue = (a, b) => {
    const da = a.due || "9999";
    const db = b.due || "9999";
    if (da !== db) return da < db ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  };
  for (const list of Object.values(out)) list.sort(byDue);
  return out;
}

// Resumo para o cabeçalho da tela.
export function taskSummary(groups) {
  return {
    open: GROUPS.reduce((n, g) => n + groups[g.key].length, 0),
    late: groups.late.length,
    today: groups.today.length,
    done: groups.done.length,
  };
}
