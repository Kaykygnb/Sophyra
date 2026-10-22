// Telas do app (tudo o que abre numa aba e não é uma nota).
// Cada função recebe o elemento da página e um contexto `ctx` com as ações do app.

import { icon } from "./icons.js";
import { escapeHtml, renderInline } from "./markdown.js";
import { baseName, stripExt, extOf } from "./vault.js";
import { lintCss, CSS_VARIABLES } from "./snippets.js";
import { comboFromEvent } from "./hotkeys.js";
import { PERMISSOES } from "./plugins.js";
import { tasksInFolder, childFolders, folderName, folderOf } from "./collections.js";
import { groupTasks, taskSummary } from "./tasks.js";
import { renderConta, renderBibliotecas, renderServidor, renderAgentes } from "./settingsnet.js";

const RTF = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" }) : null;

// "há 3 minutos", "ontem", "há 2 dias".
export function relativeTime(ms, now = Date.now()) {
  const diff = Math.round((ms - now) / 1000);
  const abs = Math.abs(diff);
  const steps = [
    [60, "second", 1],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [2592000, "day", 86400],
    [31536000, "month", 2592000],
    [Infinity, "year", 31536000],
  ];
  for (const [limit, unit, size] of steps) {
    if (abs < limit) {
      if (unit === "second") return "agora";
      return RTF ? RTF.format(Math.round(diff / size), unit) : `${Math.round(abs / size)} ${unit}`;
    }
  }
  return "";
}

const pageHead = (title, subtitle = "", actions = "") => `
  <div class="page-head">
    <div><h1>${escapeHtml(title)}</h1>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
    ${actions ? `<div class="toolbar-actions">${actions}</div>` : ""}
  </div>`;

function bindOpen(root, ctx) {
  for (const el of root.querySelectorAll("[data-open]")) el.addEventListener("click", () => ctx.openNote(el.dataset.open));
  for (const el of root.querySelectorAll("[data-view]")) el.addEventListener("click", () => ctx.openView(el.dataset.view));
}

// --- Início ---------------------------------------------------------------

// Cada pasta da raiz é uma coleção (uma mini biblioteca): capa, ícone, notas e bases dentro dela.
function collectionsGridHtml(ctx) {
  const roots = childFolders(ctx.vault().tree(), "");
  if (!roots.length) return "";
  const files = ctx.vault().list();
  const cards = roots.map((f) => {
    const inside = files.filter((x) => x.path.startsWith(`${f.path}/`));
    const notes = inside.filter((x) => extOf(x.path) === "md" && baseName(x.path) !== ".keep").length;
    const bases = inside.filter((x) => extOf(x.path) === "base").length;
    const cover = ctx.coverOf?.(f.path) || "";
    const safe = /^https?:\/\//i.test(cover) ? cover : "";
    return `<button class="coll-card" data-coll="${escapeHtml(f.path)}">
      <span class="coll-card-cover">${safe ? `<img src="${escapeHtml(safe)}" alt="" loading="lazy" draggable="false">` : ""}</span>
      <span class="coll-card-body">
        <span class="coll-card-title">${icon(ctx.iconOf?.(f.path) || "folder", 18)}<span>${escapeHtml(f.name)}</span></span>
        <span class="muted small">${notes} nota${notes === 1 ? "" : "s"} · ${bases} base${bases === 1 ? "" : "s"}</span>
      </span>
    </button>`;
  });
  return `<h2>Coleções</h2><div class="coll-cards">${cards.join("")}</div>`;
}

export function renderHome(el, ctx) {
  const vault = ctx.vault();
  const index = ctx.index();
  const notes = vault.markdownFiles();
  const links = notes.reduce((n, f) => n + index.outgoing(f.path).length, 0);
  const tasks = index.tasks();
  const open = tasks.filter((t) => !t.done).length;
  const recents = [...notes].sort((a, b) => b.mtime - a.mtime).slice(0, 8);
  const disk = ctx.disk();
  const pluginCommands = ctx.pluginCommands();
  const daily = pluginCommands.find((c) => /diária/i.test(c.name));

  const action = (iconName, title, sub, end, attrs) => `
    <button class="row" ${attrs}>
      ${icon(iconName, 18)}
      <span class="grow"><span class="title">${title}</span>${sub ? `<span class="sub" style="display:block">${sub}</span>` : ""}</span>
      ${end ? `<span class="end">${end}</span>` : ""}
    </button>`;

  el.innerHTML = `
  <div class="page-inner">
    ${pageHead(vault.name, disk.connected ? `Sincronizado com a pasta “${escapeHtml(disk.name)}”.` : "Biblioteca guardada neste navegador.")}
    <div class="home-stats" aria-label="Resumo da biblioteca">
      <span><strong>${notes.length}</strong> notas</span>
      <span><strong>${links}</strong> links</span>
      <span><strong>${index.tags().size}</strong> tags</span>
      <span><strong>${open}</strong> tarefas abertas</span>
    </div>
    ${collectionsGridHtml(ctx)}
    <div class="home-grid section">
      <div>
        ${
          (ctx.bookmarks?.() || []).length
            ? `<h2>Favoritos</h2><div class="rows" style="margin-bottom:var(--s5)">${ctx
                .bookmarks()
                .map(
                  (p) => `<button class="row" data-open="${escapeHtml(p)}">${icon("star", 18)}<span class="grow"><span class="title">${escapeHtml(stripExt(baseName(p)))}</span><span class="sub" style="display:block">${escapeHtml(p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "Raiz da biblioteca")}</span></span></button>`,
                )
                .join("")}</div>`
            : ""
        }
        <h2>Recentes</h2>
        ${
          recents.length
            ? `<div class="rows">${recents
                .map(
                  (f) => `<button class="row" data-open="${escapeHtml(f.path)}">
                    ${icon("file-text", 18)}
                    <span class="grow"><span class="title">${escapeHtml(stripExt(baseName(f.path)))}</span><span class="sub" style="display:block">${escapeHtml(f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "Raiz da biblioteca")}</span></span>
                    <span class="end">${relativeTime(f.mtime)}</span>
                  </button>`,
                )
                .join("")}</div>`
            : `<div class="welcome-empty">
                 ${icon("inbox", 28)}
                 <div><strong style="color:var(--text)">A biblioteca está vazia.</strong><p>Crie a primeira nota ou conecte uma pasta que já tenha arquivos Markdown.</p></div>
                 <div class="toolbar-actions"><button class="btn primary" data-act="new">${icon("file-plus", 16)} Nova nota</button><button class="btn" data-act="folder">${icon("folder-open", 16)} Abrir pasta</button></div>
               </div>`
        }
      </div>
      <div>
        <h2>Começar</h2>
        <div class="rows">
          ${action("file-plus", "Nova nota", "Em branco, na pasta da nota atual", "<kbd>Ctrl</kbd><kbd>N</kbd>", 'data-act="new"')}
          ${daily ? action("calendar", "Nota diária", "Abre a nota de hoje, criando se preciso", "", 'data-act="daily"') : ""}
          ${action("folder-open", disk.connected ? "Pasta do disco" : "Abrir pasta do disco", disk.connected ? "Gerenciar a pasta conectada" : "Ler e gravar arquivos reais", "", 'data-act="folder"')}
          ${action("graph", "Grafo", "Veja como as notas se ligam", "", 'data-view="@graph"')}
          ${action("check-square", "Tarefas", open ? `${open} abertas em toda a biblioteca` : "Nenhuma tarefa aberta", "", 'data-view="@tasks"')}
          ${action("terminal", "Comandos", "Pesquise qualquer ação", "<kbd>Ctrl</kbd><kbd>P</kbd>", 'data-act="palette"')}
          ${action("sliders", "Configurações", "Aparência, editor, pasta e plugins", "", 'data-view="@settings"')}
        </div>
      </div>
    </div>
  </div>`;

  bindOpen(el, ctx);
  for (const b of el.querySelectorAll("[data-coll]")) b.addEventListener("click", () => ctx.openCollectionCard(b.dataset.coll));
  for (const b of el.querySelectorAll("[data-act]")) {
    b.addEventListener("click", () => {
      const a = b.dataset.act;
      if (a === "new") ctx.createNote();
      if (a === "folder") (disk.connected ? ctx.openSettings("biblioteca") : ctx.chooseFolder());
      if (a === "palette") ctx.openPalette("commands");
      if (a === "daily" && daily) daily.run();
    });
  }
}

// --- Tarefas --------------------------------------------------------------

export function renderTasks(el, ctx, ui = { q: "", folder: "" }) {
  const scoped = tasksInFolder(ctx.index().tasks(), ui.folder || "");
  const q = (ui.q || "").trim().toLowerCase();
  const matches = (t) => !q || `${t.text} ${t.path}`.toLowerCase().includes(q);
  const all = groupTasks(scoped);
  const summary = taskSummary(all);
  const groups = q ? groupTasks(scoped.filter(matches)) : all;
  const title = ui.folder ? `Tarefas de ${folderName(ui.folder)}` : "Tarefas";
  const sub = ui.folder ? "As tarefas desta coleção e das subcoleções." : "Todas as suas tarefas, por prazo. Marque uma tarefa aqui e a nota de origem é atualizada.";

  const row = (t) => `
    <li class="tk-row${t.done ? " done" : ""}">
      <input type="checkbox" class="tk-check" data-path="${escapeHtml(t.path)}" data-line="${t.line}" ${t.done ? "checked" : ""} aria-label="Concluir: ${escapeHtml(t.text)}">
      <div class="tk-body">
        <div class="tk-text">${renderInline(t.text, () => ({ exists: true }))}</div>
        <div class="tk-meta">
          <button class="tk-note" data-open="${escapeHtml(t.path)}">${icon("file-text", 13)}<span>${escapeHtml(stripExt(baseName(t.path)))}</span></button>
          ${folderOf(t.path) ? `<button class="tk-coll" data-collection="${escapeHtml(folderOf(t.path))}">${icon("folder", 13)}<span>${escapeHtml(folderName(folderOf(t.path)))}</span></button>` : ""}
          ${t.due ? `<span class="tk-due${t.due < todayIsoLocal() && !t.done ? " late" : ""}">${icon("calendar", 13)}<span>${escapeHtml(fmtDueDate(t.due))}</span></span>` : ""}
        </div>
      </div>
    </li>`;

  const section = (key, label, list, tone = "") => {
    if (!list.length) return "";
    return `<section class="tk-group${tone ? ` ${tone}` : ""}">
      <h2 class="tk-group-head">${escapeHtml(label)}<span class="tk-count">${list.length}</span></h2>
      <ul class="tk-list">${list.map(row).join("")}</ul>
    </section>`;
  };

  const openTotal = summary.open;
  const body = openTotal || summary.done
    ? `
      <div class="tk-summary" role="list">
        <div class="tk-card" role="listitem"><strong>${summary.open}</strong><span>abertas</span></div>
        <div class="tk-card warn" role="listitem"><strong>${summary.late}</strong><span>atrasadas</span></div>
        <div class="tk-card" role="listitem"><strong>${summary.today}</strong><span>para hoje</span></div>
        <div class="tk-card done" role="listitem"><strong>${summary.done}</strong><span>concluídas</span></div>
      </div>
      ${section("late", "Atrasadas", groups.late, "late")}
      ${section("today", "Hoje", groups.today)}
      ${section("week", "Próximos 7 dias", groups.week)}
      ${section("later", "Depois", groups.later)}
      ${section("none", "Sem prazo", groups.none)}
      ${groups.done.length ? `<details class="tk-done"><summary>Concluídas <span class="tk-count">${groups.done.length}</span></summary><ul class="tk-list">${groups.done.map(row).join("")}</ul></details>` : ""}
      ${Object.values(groups).every((l) => l.length === 0) && q ? `<p class="tk-empty">Nenhuma tarefa com “${escapeHtml(ui.q.trim())}”.</p>` : ""}`
    : `<div class="welcome-empty">${icon("check-circle", 28)}<div><strong style="color:var(--text)">Nenhuma tarefa ainda.</strong><p>Escreva <code>- [ ] algo a fazer</code> em qualquer nota e ela aparece aqui. Coloque uma data no texto (por exemplo <code>@25/12</code>) para ela entrar no prazo.</p></div></div>`;

  el.innerHTML = `
  <div class="page-inner tasks-page">
    ${pageHead(title, sub)}
    ${openTotal || summary.done ? `<div class="tk-toolbar"><div class="input-icon tk-search">${icon("search", 16)}<input class="field" data-q placeholder="Buscar tarefa ou nota" value="${escapeHtml(ui.q || "")}" aria-label="Buscar tarefa"></div></div>` : ""}
    ${body}
  </div>`;

  bindOpen(el, ctx);
  for (const b of el.querySelectorAll("[data-collection]")) b.addEventListener("click", () => ctx.openCollectionCard(b.dataset.collection));
  const input = el.querySelector("[data-q]");
  input?.addEventListener("input", () => {
    renderTasks(el, ctx, { ...ui, q: input.value });
    const next = el.querySelector("[data-q]");
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
  });
  for (const box of el.querySelectorAll("input.tk-check")) {
    box.addEventListener("change", () => {
      ctx.toggleTask(box.dataset.path, Number(box.dataset.line));
      renderTasks(el, ctx, ui);
    });
  }
}

const todayIsoLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDueDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Página de uma coleção: capa, ícone, ações (nova nota, tarefas, capa, ícone), subcoleções e notas diretas.
// `actions` traz o que o app faz: { cover, iconName, onCover, onIcon, onNewNote, openNote, openFolder }.
export function renderCollection(el, ctx, dir, actions) {
  const root = ctx.vault().tree();
  let node = root;
  for (const part of dir ? dir.split("/") : []) node = [...(node.folders?.values() || [])].find((f) => f.name === part) || node;
  const subs = childFolders(root, dir);
  const notes = [...(node.files || [])]
    .filter((f) => baseName(f.path) !== ".keep" && f.path.endsWith(".md"))
    .sort((a, b) => baseName(a.path).localeCompare(baseName(b.path), "pt-BR"));
  const openTasks = tasksInFolder(ctx.index().tasks(), dir).filter((t) => !t.done).length;
  const bases = ctx.vault().list().filter((x) => x.path.startsWith(`${dir}/`) && extOf(x.path) === "base").sort((a, b) => a.path.localeCompare(b.path, "pt-BR"));
  const safeCover = /^https?:\/\//i.test(actions.cover || "") ? actions.cover : "";

  el.innerHTML = `
  <div class="page-inner collection">
    <div class="coll-cover${safeCover ? "" : " plain"}">${safeCover ? `<img src="${escapeHtml(safeCover)}" alt="" draggable="false">` : ""}
      <button type="button" class="btn sm coll-cover-btn" data-act="cover">${icon("image", 14)} ${safeCover ? "Trocar capa" : "Adicionar capa"}</button>
    </div>
    <header class="coll-head">
      <button type="button" class="coll-icon" data-act="icon" title="Mudar ícone" aria-label="Mudar ícone">${icon(actions.iconName || "folder", 30)}</button>
      <div>
        <h1>${escapeHtml(folderName(dir))}</h1>
        <p class="muted small">${notes.length} nota${notes.length === 1 ? "" : "s"} · ${subs.length} subcoleç${subs.length === 1 ? "ão" : "ões"} · ${openTasks} tarefa${openTasks === 1 ? "" : "s"} aberta${openTasks === 1 ? "" : "s"}</p>
      </div>
    </header>
    <div class="toolbar-inline">
      <button type="button" class="btn sm" data-act="new">${icon("file-plus", 14)} Nova nota</button>
      <button type="button" class="btn sm" data-act="tasks">${icon("check-square", 14)} Tarefas desta coleção</button>
    </div>
    ${subs.length ? `<h2 class="coll-h">Subcoleções</h2><div class="coll-list">${subs.map((s) => `<button type="button" class="coll-chip" data-folder="${escapeHtml(s.path)}">${icon(actions.iconFor?.(s.path) || "folder", 16)}<span>${escapeHtml(s.name)}</span></button>`).join("")}</div>` : ""}
    ${bases.length ? `<h2 class="coll-h">Bases</h2><div class="coll-list">${bases
       .map((b) => `<button type="button" class="coll-chip" data-base="${escapeHtml(b.path)}">${icon("database", 16)}<span>${escapeHtml(stripExt(baseName(b.path)))}</span><small class="muted">${ctx.countBaseRows?.(b.path) ?? 0} linha${(ctx.countBaseRows?.(b.path) ?? 0) === 1 ? "" : "s"}</small></button>`)
       .join("")}</div>` : ""}
    <h2 class="coll-h">Notas</h2>
    ${notes.length ? `<div class="coll-list">${notes.map((f) => `<button type="button" class="coll-chip" data-open="${escapeHtml(f.path)}">${icon(actions.iconFor?.(f.path) || "file-text", 16)}<span>${escapeHtml(stripExt(baseName(f.path)))}</span></button>`).join("")}</div>` : `<p class="muted small">Esta coleção ainda não tem notas.</p>`}
  </div>`;

  el.querySelector('[data-act="cover"]').addEventListener("click", () => actions.onCover?.());
  el.querySelector('[data-act="icon"]').addEventListener("click", (e) => actions.onIcon?.(e.currentTarget));
  el.querySelector('[data-act="new"]').addEventListener("click", () => actions.onNewNote?.());
  el.querySelector('[data-act="tasks"]').addEventListener("click", () => ctx.openView(`@tasks/${dir}`));
  for (const b of el.querySelectorAll("[data-folder]")) b.addEventListener("click", () => actions.openFolder?.(b.dataset.folder));
  for (const b of el.querySelectorAll("[data-open]")) b.addEventListener("click", () => actions.openNote?.(b.dataset.open));
  for (const b of el.querySelectorAll("[data-base]")) b.addEventListener("click", () => actions.openNote?.(b.dataset.base));
}

// --- Tags -----------------------------------------------------------------

export function renderTags(el, ctx, ui = { tag: null }) {
  const tags = ctx.index().tags();
  const names = [...tags.keys()];
  const current = ui.tag && tags.has(ui.tag) ? ui.tag : names[0] || null;
  const unresolved = ctx.index().unresolved();

  el.innerHTML = `
  <div class="page-inner">
    ${pageHead("Tags", "Agrupe notas por assunto com <code>#tag</code> no texto ou <code>tags:</code> no frontmatter.")}
    ${
      names.length
        ? `<div class="two-pane">
            <div class="tag-list" role="list">
              ${names.map((t) => `<button class="tag-item" data-tag="${escapeHtml(t)}" aria-pressed="${t === current}">${icon("hash", 15)}<span>${escapeHtml(t)}</span><span class="count">${tags.get(t).length}</span></button>`).join("")}
            </div>
            <div>
              <h2 style="font-size:var(--fs-lg);margin-bottom:var(--s3)">#${escapeHtml(current)}</h2>
              <div class="rows">${tags
                .get(current)
                .map(
                  (p) => `<button class="row" data-open="${escapeHtml(p)}">${icon("file-text", 18)}<span class="grow"><span class="title">${escapeHtml(stripExt(baseName(p)))}</span><span class="sub" style="display:block">${escapeHtml(p)}</span></span></button>`,
                )
                .join("")}</div>
            </div>
          </div>`
        : `<div class="welcome-empty">${icon("tag", 28)}<div><strong style="color:var(--text)">Nenhuma tag na biblioteca.</strong><p>Escreva <code>#ideia</code> em qualquer nota para criar a primeira.</p></div></div>`
    }
    <section class="section">
      <h2>Links que ainda não existem</h2>
      ${
        unresolved.length
          ? `<div class="rows">${unresolved
              .map(
                (u) => `<div class="row">${icon("link-broken", 18)}<span class="grow"><span class="title">${escapeHtml(u.target)}</span><span class="sub">citado ${u.count} ${u.count === 1 ? "vez" : "vezes"}</span></span><button class="btn sm" data-create="${escapeHtml(u.target)}">${icon("file-plus", 14)} Criar nota</button></div>`,
              )
              .join("")}</div>`
          : `<p class="muted">Todos os links apontam para notas que existem.</p>`
      }
    </section>
  </div>`;

  bindOpen(el, ctx);
  for (const b of el.querySelectorAll("[data-tag]")) b.addEventListener("click", () => renderTags(el, ctx, { tag: b.dataset.tag }));
  for (const b of el.querySelectorAll("[data-create]")) {
    b.addEventListener("click", () => {
      ctx.createNoteNamed(b.dataset.create);
    });
  }
}

// --- Grafo ----------------------------------------------------------------

export function renderGraph(el, ctx, ui = { q: "", orphans: true, labels: false }) {
  const g = ctx.index().graph();
  const q = ui.q.trim().toLowerCase();
  const keep = new Set(
    g.nodes.filter((n) => (ui.orphans || n.degree > 0) && (!q || n.label.toLowerCase().includes(q))).map((n) => n.id),
  );
  const data = {
    nodes: g.nodes.filter((n) => keep.has(n.id)),
    edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };

  el.innerHTML = `
  <div class="graph-page">
    <div class="graph-toolbar">
      <div class="input-icon" style="width:260px">${icon("search", 16)}<input class="field" data-q placeholder="Filtrar notas" value="${escapeHtml(ui.q)}" aria-label="Filtrar notas no grafo"></div>
      <label><input type="checkbox" class="switch" data-orphans ${ui.orphans ? "checked" : ""}> Notas sem links</label>
      <label><input type="checkbox" class="switch" data-labels ${ui.labels ? "checked" : ""}> Todos os nomes</label>
      <button class="btn sm" data-fit title="Enquadrar tudo (ou clique duas vezes no fundo)">${icon("maximize", 14)} Centralizar</button>
      <span class="graph-legend">${data.nodes.length} notas · ${data.edges.length} ligações. Arraste para mover, role para aproximar, clique numa nota para abrir.</span>
    </div>
    <div class="graph-host" style="flex:1;min-height:0;display:flex"></div>
  </div>`;

  const host = el.querySelector(".graph-host");
  const view = ctx.graphView();
  view.canvas.className = "graph-big";
  host.append(view.canvas);
  view.setData(data, ctx.activePath());
  view.setShowAllLabels(!!ui.labels);
  el.querySelector("[data-fit]").addEventListener("click", () => view.fit());
  el.querySelector("[data-labels]").addEventListener("change", (e) => {
    ui.labels = e.target.checked;
    view.setShowAllLabels(ui.labels);
  });

  el.querySelector("[data-orphans]").addEventListener("change", (e) => renderGraph(el, ctx, { ...ui, orphans: e.target.checked }));
  const input = el.querySelector("[data-q]");
  input.addEventListener("input", () => {
    renderGraph(el, ctx, { ...ui, q: input.value });
    const next = el.querySelector("[data-q]");
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
  });
}

// --- Atalhos --------------------------------------------------------------

// Tabela de todos os comandos da paleta, cada um com atalho próprio opcional. Só mostra os que casam com a busca.
function commandKeysSection(ctx, q) {
  if (!ctx.commandHotkeys) return "";
  const all = ctx.commandHotkeys().filter((c) => !q || `${c.name} ${c.group} ${c.combo || ""}`.toLowerCase().includes(q));
  if (!all.length) return "";
  const shown = q ? all : all.filter((c) => c.combo).concat(all.filter((c) => !c.combo).slice(0, 12));
  return `<section class="section" style="margin-top:var(--s6)">
    <h2>Atalho para qualquer comando</h2>
    <p class="muted small">${q ? `${all.length} ${all.length === 1 ? "comando" : "comandos"} encontrados.` : "Busque um comando acima para dar a ele um atalho. Aqui aparecem os que já têm e alguns exemplos."}</p>
    <div class="rows"><table class="shortcut-table"><tbody>${shown
      .map(
        (c) => `<tr><td>${escapeHtml(c.name)} <span class="muted small">${escapeHtml(c.group)}</span></td><td><span class="keys">${c.combo ? c.combo.split("+").map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("") : `<span class="muted small">sem atalho</span>`}</span></td><td class="hk-actions"><button class="btn sm ghost" data-ck-edit="${escapeHtml(c.id)}" aria-label="Definir o atalho de ${escapeHtml(c.name)}">${c.combo ? "Alterar" : "Definir"}</button>${c.combo ? `<button class="btn sm ghost" data-ck-clear="${escapeHtml(c.id)}" aria-label="Remover o atalho de ${escapeHtml(c.name)}">Remover</button>` : ""}</td></tr>`,
      )
      .join("")}</tbody></table></div>
  </section>`;
}

export function renderShortcuts(el, ctx, ui = { q: "" }) {
  const q = ui.q.trim().toLowerCase();
  const groups = new Map();
  for (const s of ctx.shortcuts) {
    if (q && !`${s.label} ${s.keys.join(" ")} ${s.group}`.toLowerCase().includes(q)) continue;
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  el.innerHTML = `
  <div class="page-inner">
    ${pageHead("Atalhos de teclado", "Em Mac, use Cmd no lugar de Ctrl.")}
    <div class="toolbar-inline"><div class="input-icon" style="flex:1;max-width:360px">${icon("search", 16)}<input class="field" data-q placeholder="Buscar atalho" value="${escapeHtml(ui.q)}" aria-label="Buscar atalho"></div></div>
    ${
      groups.size
        ? [...groups.entries()]
            .map(
              ([group, list]) => `<section class="section" style="margin-top:var(--s5)">
                <h2>${escapeHtml(group)}</h2>
                <div class="rows"><table class="shortcut-table"><tbody>${list
                  .map((s) => `<tr><td>${escapeHtml(s.label)}${s.changed ? ` <span class="muted small">(alterado)</span>` : ""}</td><td><span class="keys">${s.keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join("")}</span></td>${
                    s.id
                      ? `<td class="hk-actions"><button class="btn sm ghost" data-hk-edit="${s.id}" aria-label="Alterar o atalho de ${escapeHtml(s.label)}">Alterar</button>${s.changed ? `<button class="btn sm ghost" data-hk-reset="${s.id}" aria-label="Restaurar o atalho de ${escapeHtml(s.label)}">Restaurar</button>` : ""}</td>`
                      : "<td></td>"
                  }</tr>`)
                  .join("")}</tbody></table></div>
              </section>`,
            )
            .join("")
        : `<p class="muted">Nenhum atalho com esse texto.</p>`
    }
    ${commandKeysSection(ctx, q)}
  </div>`;
  const input = el.querySelector("[data-q]");
  input.addEventListener("input", () => {
    renderShortcuts(el, ctx, { q: input.value });
    const next = el.querySelector("[data-q]");
    next.focus();
    next.setSelectionRange(next.value.length, next.value.length);
  });
  for (const b of el.querySelectorAll("[data-hk-reset]")) b.addEventListener("click", () => ctx.resetHotkey(b.dataset.hkReset));
  for (const b of el.querySelectorAll("[data-ck-clear]")) b.addEventListener("click", () => ctx.clearCommandKey(b.dataset.ckClear));
  for (const b of el.querySelectorAll("[data-ck-edit]")) {
    b.addEventListener("click", () => {
      const id = b.dataset.ckEdit;
      const cell = b.closest("tr").querySelector(".keys");
      const before = cell.innerHTML;
      cell.innerHTML = `<span class="hk-capture" role="status">Pressione a combinação… (Esc cancela)</span>`;
      document.body.dataset.capturingHotkey = "1";
      const done = () => {
        delete document.body.dataset.capturingHotkey;
        document.removeEventListener("keydown", onKey, true);
      };
      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          done();
          cell.innerHTML = before;
          return;
        }
        const combo = comboFromEvent(e);
        if (!combo) return;
        done();
        const result = ctx.setCommandKey(id, combo);
        if (!result.ok) cell.innerHTML = before;
      };
      document.addEventListener("keydown", onKey, true);
    });
  }
  for (const b of el.querySelectorAll("[data-hk-edit]")) {
    b.addEventListener("click", () => {
      // a próxima combinação digitada vira o atalho; Esc cancela
      const id = b.dataset.hkEdit;
      const cell = b.closest("tr").querySelector(".keys");
      const before = cell.innerHTML;
      cell.innerHTML = `<span class="hk-capture" role="status">Pressione a nova combinação… (Esc cancela)</span>`;
      document.body.dataset.capturingHotkey = "1";
      const done = () => {
        delete document.body.dataset.capturingHotkey;
        document.removeEventListener("keydown", onKey, true);
      };
      const onKey = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") {
          done();
          cell.innerHTML = before;
          return;
        }
        const combo = comboFromEvent(e);
        if (!combo) return; // só um modificador: continua ouvindo
        done();
        const result = ctx.setHotkey(id, combo);
        if (!result.ok) cell.innerHTML = before;
      };
      document.addEventListener("keydown", onKey, true);
    });
  }
}

// --- Configurações ----------------------------------------------------------

const SECTIONS = [
  ["conta", "Conta", "at-sign"],
  ["aparencia", "Aparência", "sun"],
  ["editor", "Editor", "edit"],
  ["biblioteca", "Armazenamento", "database"],
  ["bibliotecas", "Bibliotecas", "layers"],
  ["servidor", "Servidor e conexão", "activity"],
  ["agentes", "Agentes (MCP)", "terminal"],
  ["plugins", "Plugins", "puzzle"],
  ["snippets", "Estilos personalizados", "code"],
  ["sobre", "Sobre", "info"],
];

function lintHtml(warnings) {
  if (!warnings.length) return `<span class="lint ok">${icon("check-circle", 15)} Sem problemas.</span>`;
  return warnings
    .map((w) => {
      const bad = w.level === "erro";
      return `<span class="lint ${bad ? "bad" : "warn"}">${icon(bad ? "x-circle" : "alert", 15)} ${escapeHtml(w.message)}</span>`;
    })
    .join("");
}

function snippetEditor(sn) {
  return `<div class="snippet-editor">
    <div class="snippet-editor-head">
      <input class="field" data-snippet-name value="${escapeHtml(sn.name)}" aria-label="Nome do estilo">
      <div class="toolbar-actions">
        <button class="btn sm" data-snip-download>${icon("download", 14)} Baixar .css</button>
        <button class="btn sm danger" data-snip-delete>${icon("trash", 14)} Excluir</button>
        <button class="btn sm" data-snip-close>Fechar</button>
      </div>
    </div>
    <textarea class="snippet-css" data-snippet-css spellcheck="false" rows="14" aria-label="Código do estilo">${escapeHtml(sn.css)}</textarea>
    <div class="snippet-lint" data-lint aria-live="polite">${lintHtml(lintCss(sn.css))}</div>
  </div>`;
}

export function renderSettings(el, ctx, ui = { section: "aparencia" }) {
  const s = ctx.settings();
  const disk = ctx.disk();
  const plugins = ctx.plugins()?.list() || [];
  const snippets = ctx.snippets();

  const seg = (name, options, value) =>
    `<div class="segmented" role="group" data-seg="${name}">${options
      .map(([v, label, ic]) => `<button class="seg" data-v="${v}" aria-pressed="${value === v}">${ic ? icon(ic, 15) : ""}<span>${label}</span></button>`)
      .join("")}</div>`;
  const row = (title, sub, control) =>
    `<div class="form-row"><div class="grow"><div class="title">${title}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${control}</div>`;

  const diskText = disk.connected
    ? `Conectada: ${escapeHtml(disk.name)}. Cada mudança é gravada nos arquivos.`
    : disk.waiting
      ? `Pasta guardada: ${escapeHtml(disk.name)}. Falta a permissão do navegador.`
      : disk.supported
        ? "Nenhuma pasta conectada. As notas ficam só neste navegador."
        : "Este navegador não permite acessar pastas. Use o Chrome ou o Edge.";

  el.innerHTML = `
  <div class="page-inner" style="width:min(100%,1040px)">
    ${pageHead("Configurações", "As mudanças valem na hora e ficam salvas neste computador.")}
    <div class="settings">
      <nav class="settings-nav" aria-label="Seções">
        ${SECTIONS.map(([id, label, ic]) => `<button data-sec="${id}" ${ui.section === id ? 'aria-current="true"' : ""}>${icon(ic, 16)}${label}</button>`).join("")}
      </nav>
      <div>
        <section class="section" id="sec-conta" style="margin-top:0"><h2>Conta</h2><div data-net="conta"></div></section>
        <section class="section" id="sec-aparencia">
          <h2>Aparência</h2>
          <div class="rows">
            ${row("Tema", "Segue o sistema por padrão.", seg("theme", [["auto", "Sistema", "monitor"], ["light", "Claro", "sun"], ["dark", "Escuro", "moon"]], s.theme))}
            ${row("Tamanho do texto das notas", `${s.fontSize}px na leitura`, `<input type="range" min="14" max="22" step="1" value="${s.fontSize}" data-range="fontSize" aria-label="Tamanho do texto das notas">`)}
            ${row("Largura do texto", "Medida da coluna na leitura.", seg("larguraTexto", [["estreita", "Estreita"], ["normal", "Normal"], ["larga", "Larga"], ["total", "Total"]], s.larguraTexto))}
          </div>
        </section>
        <section class="section" id="sec-editor">
          <h2>Editor</h2>
          <div class="rows">
            ${row("Destaque de sintaxe", "Colore títulos, links, negrito, código e tags enquanto você escreve.", `<input type="checkbox" class="switch" data-bool="destaque" ${s.destaque !== false ? "checked" : ""} aria-label="Destaque de sintaxe no editor">`)}
            ${row("Fechar pares e continuar listas", "Fecha ( [ { aspas e crase, e continua listas, tarefas e citações ao apertar Enter.", `<input type="checkbox" class="switch" data-bool="ajudasEditor" ${s.ajudasEditor !== false ? "checked" : ""} aria-label="Ajudas de edição">`)}
            ${row("Tamanho do texto no editor", `${s.editorSize}px`, `<input type="range" min="12" max="20" step="1" value="${s.editorSize}" data-range="editorSize" aria-label="Tamanho do texto no editor">`)}
            ${row("Espera antes de salvar", "Quanto tempo depois de digitar a nota é gravada.", `<select class="field" data-select="atrasoSalvar" aria-label="Espera antes de salvar">${[0, 150, 300, 600, 1000, 2000].map((v) => `<option value="${v}" ${s.atrasoSalvar === v ? "selected" : ""}>${v === 0 ? "Imediato" : `${v} ms`}</option>`).join("")}</select>`)}
          </div>
        </section>
        <section class="section" id="sec-biblioteca">
          <h2>Armazenamento</h2>
          <div class="rows">
            ${row("Pasta do disco", diskText,
              disk.connected
                ? `<div class="toolbar-actions"><button class="btn" data-act="reload">${icon("refresh", 16)} Recarregar</button><button class="btn" data-act="disconnect">${icon("disconnect", 16)} Desconectar</button></div>`
                : disk.waiting
                  ? `<div class="toolbar-actions"><button class="btn primary" data-act="reconnect">${icon("folder-open", 16)} Reconectar</button><button class="btn" data-act="disconnect">Esquecer</button></div>`
                  : `<button class="btn primary" data-act="choose" ${disk.supported ? "" : "disabled"}>${icon("folder-open", 16)} Abrir pasta</button>`)}
            ${row("Exportar biblioteca", "Baixa todas as notas num arquivo JSON.", `<button class="btn" data-act="export">${icon("download", 16)} Exportar</button>`)}
            ${row("Importar biblioteca", disk.connected ? "Desconecte a pasta antes de importar." : "Substitui a biblioteca atual por um arquivo JSON.", `<button class="btn" data-act="import" ${disk.connected ? "disabled" : ""}>${icon("upload", 16)} Importar</button>`)}
            ${row("Restaurar biblioteca de exemplo", disk.connected ? "Desconecte a pasta antes de restaurar." : "Volta às notas de demonstração.", `<button class="btn" data-act="sample" ${disk.connected ? "disabled" : ""}>${icon("refresh", 16)} Restaurar</button>`)}
            ${row("Apagar dados locais", "Remove a biblioteca, as abas e as configurações deste navegador. Arquivos de uma pasta conectada não são tocados.", `<button class="btn danger" data-act="wipe">${icon("trash", 16)} Apagar</button>`)}
          </div>
        </section>
        <section class="section" id="sec-bibliotecas"><h2>Bibliotecas</h2><div data-net="bibliotecas"></div></section>
        <section class="section" id="sec-servidor"><h2>Servidor e conexão</h2><div data-net="servidor"></div></section>
        <section class="section" id="sec-agentes"><h2>Agentes (MCP)</h2><div data-net="agentes"></div></section>
        <section class="section" id="sec-plugins">
          <h2>Recursos internos</h2>
          <p class="lead">Partes do próprio app que você pode desligar. Desligar esconde o recurso; as notas e os arquivos continuam intactos.</p>
          <div class="rows">
            ${ctx
              .coreFeatures()
              .map(
                (f) => `<label class="plugin-row">
                  ${icon(f.icone, 18)}
                  <span class="grow"><span class="title" style="font-weight:550">${escapeHtml(f.nome)}</span>
                    <span class="sub" style="display:block;color:var(--muted);font-size:var(--fs-sm)">${escapeHtml(f.descricao)}</span></span>
                  <input type="checkbox" class="switch" data-core="${f.id}" ${f.on ? "checked" : ""} aria-label="Ligar ${escapeHtml(f.nome)}">
                </label>`,
              )
              .join("")}
          </div>
          <h2 style="margin-top:var(--s5)">Plugins</h2>
          <div class="rows" style="margin-bottom:var(--s3)">
            <label class="plugin-row">
              ${icon("alert", 18)}
              <span class="grow"><span class="title" style="font-weight:550">Plugins da comunidade</span>
                <span class="sub" style="display:block;color:var(--muted);font-size:var(--fs-sm)">Código importado de arquivos. Desligado, nada importado é carregado. Ligue só se confia em quem escreveu o código.</span></span>
              <input type="checkbox" class="switch" data-community ${ctx.communityPlugins?.() ? "checked" : ""} aria-label="Ligar os plugins da comunidade">
            </label>
          </div>
          <p class="lead">Plugins são arquivos locais listados em <code>plugins/registry.json</code>.</p>
          <div class="rows">
            ${
              plugins.length
                ? plugins
                    .map(
                      (p) => `<label class="plugin-row">
                        ${icon("puzzle", 18)}
                        <span class="grow"><span class="title" style="font-weight:550">${escapeHtml(p.nome)}</span> <span class="muted small">v${escapeHtml(p.versao)}</span>
                          <span class="sub" style="display:block;color:var(--muted);font-size:var(--fs-sm)">${escapeHtml(p.descricao)}</span>
                          <span class="sub" style="display:block;font-size:var(--fs-xs);color:var(--faint)">${p.permissoes ? `Permissões: ${p.permissoes.map((x) => escapeHtml(PERMISSOES[x] || x)).join(" · ") || "nenhuma"}` : "Sem permissões declaradas (acesso total)"}</span>
                          ${p.erro ? `<span class="error" style="display:block">Erro: ${escapeHtml(p.erro)}</span>` : ""}</span>
                        ${p.importado ? `<button type="button" class="btn sm danger" data-plugin-remove="${escapeHtml(p.id)}" aria-label="Remover ${escapeHtml(p.nome)}">${icon("trash", 14)}</button>` : ""}
                        <input type="checkbox" class="switch" data-plugin="${escapeHtml(p.id)}" ${p.ativo ? "checked" : ""} aria-label="Ativar ${escapeHtml(p.nome)}">
                      </label>`,
                    )
                    .join("")
                : `<div class="row"><span class="muted">Nenhum plugin registrado.</span></div>`
            }
          </div>
          <div class="toolbar-inline" style="margin-top:var(--s3)"><button class="btn" data-plugin-import>${icon("upload", 16)} Importar plugin de um arquivo…</button></div>
          <div class="callout-inline" style="margin-top:var(--s3)">${icon("alert", 16)}<span>As permissões limitam a API que o app entrega ao plugin, mas não o isolam: ele roda na página, com os mesmos privilégios, e pode usar a rede por conta própria. Ative só código que você conhece.</span></div>
        </section>
        <section class="section" id="sec-snippets">
          <h2>Estilos personalizados</h2>
          <p class="lead">Estilos seus, aplicados em todo o app depois do estilo padrão. Ficam salvos neste navegador.</p>
          ${ctx.safeMode() ? `<div class="callout-inline" style="margin-bottom:var(--s3)">${icon("alert", 16)}<span>Modo seguro ligado (<code>?safe=1</code>): nenhum snippet está sendo aplicado. Tire o <code>?safe=1</code> do endereço para voltar ao normal.</span></div>` : ""}
          <div class="rows">
            ${
              snippets.length
                ? snippets
                    .map((sn) => {
                      const warnings = lintCss(sn.css);
                      const broken = warnings.some((w) => w.level === "erro");
                      const lines = sn.css ? sn.css.split("\n").length : 0;
                      return `<div class="plugin-row">
                        ${icon("code", 18)}
                        <span class="grow"><span class="title" style="font-weight:550">${escapeHtml(sn.name)}</span> <span class="muted small">${lines} linhas</span>
                          ${broken ? `<span class="error" style="display:block">Erro de sintaxe: este snippet não é aplicado até você corrigir.</span>` : ""}</span>
                        <button class="icon-btn${ui.editing === sn.id ? " on" : ""}" data-edit-snippet="${escapeHtml(sn.id)}" aria-label="Editar ${escapeHtml(sn.name)}" aria-pressed="${ui.editing === sn.id}">${icon("edit", 16)}</button>
                        <input type="checkbox" class="switch" data-snippet="${escapeHtml(sn.id)}" ${sn.enabled ? "checked" : ""} aria-label="Ativar ${escapeHtml(sn.name)}">
                      </div>${ui.editing === sn.id ? snippetEditor(sn) : ""}`;
                    })
                    .join("")
                : `<div class="row"><span class="muted">Nenhum snippet ainda. Crie um ou importe um arquivo .css.</span></div>`
            }
          </div>
          <div class="toolbar-actions" style="margin-top:var(--s3)">
            <button class="btn" data-act="snip-new">${icon("plus", 16)} Novo snippet</button>
            <button class="btn" data-act="snip-import">${icon("upload", 16)} Importar .css</button>
            <button class="btn ghost" data-act="snip-off" ${snippets.some((x) => x.enabled) ? "" : "disabled"}>Desligar todos</button>
          </div>
          <details class="css-vars">
            <summary>Variáveis de CSS que você pode usar</summary>
            <dl class="props">${CSS_VARIABLES.map(([n, d]) => `<dt><code>${escapeHtml(n)}</code></dt><dd>${escapeHtml(d)}</dd>`).join("")}</dl>
            <p class="small" style="margin-top:var(--s2)">O tamanho do texto, o do editor e a largura da coluna são definidos em Configurações e não podem ser trocados por snippet.</p>
          </details>
        </section>
        <section class="section" id="sec-sobre">
          <h2>Sobre</h2>
          <div class="rows">
            ${row("Biblioteca", "Notas em Markdown que funcionam sem internet.", "")}
            ${row("Dados", "Notas, abas e configurações ficam neste navegador, ou nos arquivos da pasta conectada.", "")}
          </div>
        </section>
      </div>
    </div>
  </div>`;

  // Cada seção é uma aba: só a escolhida aparece. As ligadas a conta e servidor são desenhadas ao abrir.
  const filled = new Set();
  const netTabs = { conta: renderConta, bibliotecas: renderBibliotecas, servidor: renderServidor, agentes: renderAgentes };
  const show = (id) => {
    ui.section = id;
    for (const sec of el.querySelectorAll(".settings .section")) sec.hidden = sec.id !== `sec-${id}`;
    for (const x of el.querySelectorAll("[data-sec]")) {
      if (x.dataset.sec === id) x.setAttribute("aria-current", "true");
      else x.removeAttribute("aria-current");
    }
    if (netTabs[id] && !filled.has(id)) {
      filled.add(id);
      netTabs[id](el.querySelector(`[data-net="${id}"]`), ctx.net);
    }
  };
  for (const b of el.querySelectorAll("[data-sec]")) b.addEventListener("click", () => show(b.dataset.sec));
  show(ui.section || "aparencia");

  for (const group of el.querySelectorAll("[data-seg]")) {
    for (const b of group.querySelectorAll("[data-v]")) {
      b.addEventListener("click", () => {
        ctx.setSetting(group.dataset.seg, b.dataset.v);
        renderSettings(el, ctx, ui);
      });
    }
  }
  for (const r of el.querySelectorAll("[data-range]")) {
    r.addEventListener("input", () => ctx.setSetting(r.dataset.range, Number(r.value), { quiet: true }));
    r.addEventListener("change", () => renderSettings(el, ctx, ui));
  }
  for (const box of el.querySelectorAll("input[data-bool]")) {
    box.addEventListener("change", () => ctx.setSetting(box.dataset.bool, box.checked, { quiet: true }));
  }
  for (const sel of el.querySelectorAll("[data-select]")) {
    sel.addEventListener("change", () => ctx.setSetting(sel.dataset.select, Number(sel.value)));
  }
  for (const b of el.querySelectorAll("[data-act]")) {
    b.addEventListener("click", async () => {
      const a = b.dataset.act;
      if (a === "choose") await ctx.chooseFolder();
      if (a === "reconnect") await ctx.reconnectFolder();
      if (a === "reload") await ctx.reloadFolder();
      if (a === "disconnect") await ctx.disconnectFolder();
      if (a === "export") ctx.exportVault();
      if (a === "import") ctx.importVault();
      if (a === "sample") await ctx.restoreSample();
      if (a === "wipe") await ctx.wipeData();
      if (a === "snip-new") {
        ui.editing = ctx.newSnippet().id;
        ui.section = "snippets";
      }
      if (a === "snip-import") {
        ctx.importSnippet();
        ui.section = "snippets";
        return;
      }
      if (a === "snip-off") ctx.disableAllSnippets();
      renderSettings(el, ctx, ui);
    });
  }
  // --- snippets de CSS ---
  const refresh = () => renderSettings(el, ctx, ui);
  for (const b of el.querySelectorAll("[data-edit-snippet]")) {
    b.addEventListener("click", () => {
      ui.editing = ui.editing === b.dataset.editSnippet ? null : b.dataset.editSnippet;
      ui.section = "snippets";
      refresh();
      el.querySelector("[data-snippet-css]")?.focus();
    });
  }
  for (const box of el.querySelectorAll("input[data-snippet]")) {
    box.addEventListener("change", () => {
      ctx.toggleSnippet(box.dataset.snippet, box.checked);
      ui.section = "snippets";
      refresh();
    });
  }
  const css = el.querySelector("[data-snippet-css]");
  if (css) {
    const id = ui.editing;
    const lintBox = el.querySelector("[data-lint]");
    let timer = null;
    css.addEventListener("input", () => {
      lintBox.innerHTML = lintHtml(lintCss(css.value));
      clearTimeout(timer);
      timer = setTimeout(() => ctx.saveSnippetCss(id, css.value), 250);
    });
    css.addEventListener("blur", () => {
      clearTimeout(timer);
      ctx.saveSnippetCss(id, css.value);
    });
    css.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        document.execCommand("insertText", false, "  ");
      }
    });
    el.querySelector("[data-snippet-name]").addEventListener("change", (e) => {
      ctx.renameSnippet(id, e.target.value);
      refresh();
    });
    el.querySelector("[data-snip-download]").addEventListener("click", () => ctx.downloadSnippet(id));
    el.querySelector("[data-snip-close]").addEventListener("click", () => {
      ctx.saveSnippetCss(id, css.value);
      ui.editing = null;
      refresh();
    });
    el.querySelector("[data-snip-delete]").addEventListener("click", async () => {
      if (await ctx.deleteSnippet(id)) {
        ui.editing = null;
        refresh();
      }
    });
  }
  for (const box of el.querySelectorAll("input[data-core]")) {
    box.addEventListener("change", () => {
      ctx.setCoreFeature(box.dataset.core, box.checked);
      if (el.isConnected) renderSettings(el, ctx, ui);
    });
  }
  el.querySelector("[data-plugin-import]")?.addEventListener("click", () => ctx.importPlugin());
  el.querySelector("input[data-community]")?.addEventListener("change", async (e) => {
    await ctx.setCommunityPlugins(e.target.checked);
    renderSettings(el, ctx, ui);
  });
  for (const b of el.querySelectorAll("[data-plugin-remove]")) {
    b.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (await ctx.removePlugin(b.dataset.pluginRemove)) renderSettings(el, ctx, ui);
    });
  }
  for (const box of el.querySelectorAll("input[data-plugin]")) {
    box.addEventListener("change", async () => {
      const id = box.dataset.plugin;
      if (box.checked) await ctx.plugins().enable(id);
      else await ctx.plugins().disable(id);
      renderSettings(el, ctx, ui);
    });
  }
}

// --- Lixeira --------------------------------------------------------------

export function renderTrash(el, ctx) {
  const items = ctx.trashItems();
  el.innerHTML = `
  <div class="page-inner">
    ${pageHead("Lixeira", "Notas excluídas ficam aqui por 30 dias. Restaurar traz a nota de volta ao mesmo lugar.")}
    ${
      items.length
        ? `<div class="toolbar-inline"><button class="btn danger" data-trash-empty>${icon("trash", 16)} Esvaziar a lixeira</button><span class="muted small">${items.length} ${items.length === 1 ? "item" : "itens"}</span></div>
           <div class="rows" style="margin-top:var(--s4)">${items
             .map(
               (it) => `<div class="row">
                 ${icon(/\.canvas$/i.test(it.path) ? "layers" : "file-text", 18)}
                 <span class="grow"><span class="title">${escapeHtml(stripExt(baseName(it.path)))}</span><span class="sub" style="display:block">${escapeHtml(it.path.includes("/") ? it.path.slice(0, it.path.lastIndexOf("/")) : "Raiz da biblioteca")} · excluída ${relativeTime(it.deletedAt)}</span></span>
                 <button class="btn sm" data-trash-restore="${escapeHtml(it.path)}">${icon("refresh", 14)} Restaurar</button>
                 <button class="btn sm danger" data-trash-remove="${escapeHtml(it.path)}" aria-label="Excluir ${escapeHtml(stripExt(baseName(it.path)))} de vez">${icon("trash", 14)}</button>
               </div>`,
             )
             .join("")}</div>`
        : `<div class="welcome-empty">${icon("trash", 28)}<div><strong style="color:var(--text)">A lixeira está vazia.</strong><p>Quando você excluir uma nota, ela aparece aqui.</p></div></div>`
    }
  </div>`;
  el.querySelector("[data-trash-empty]")?.addEventListener("click", async () => {
    if (await ctx.emptyTrash()) renderTrash(el, ctx);
  });
  for (const b of el.querySelectorAll("[data-trash-restore]")) b.addEventListener("click", () => ctx.restoreTrash(b.dataset.trashRestore));
  for (const b of el.querySelectorAll("[data-trash-remove]")) {
    b.addEventListener("click", async () => {
      if (await ctx.removeTrash(b.dataset.trashRemove)) renderTrash(el, ctx);
    });
  }
}
