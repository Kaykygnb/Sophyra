// Tela das bases: abas de visões (tabela, lista, quadro e calendário) sobre as notas de uma pasta ou etiqueta, com filtros,
// ordem, agrupamento e colunas. Editar uma célula, arrastar um cartão ou um dia do calendário grava no frontmatter da nota.
// A definição da base (fonte, tipos e visões) fica no arquivo .base.

import {
  parseBase, serializeBase, makeView, collectRows, valueOf, inferType, typesFor, applyView, groupRows, monthGrid, rowsWithoutDate, coerce,
  setValue, newRowProps, newRowContent, uniquePath, columnsOf, availableKeys, optionsFor, isEmpty, isEditable, keyLabel, todayIso,
  VIEW_TYPES, VIEW_NAMES, PROP_TYPES, PROP_TYPE_NAMES, OPS, NO_VALUE_OPS, timelineItems, totalsOf, TOTAL_KINDS, linkTargets, applyFormulas, checkFormula,
} from "./bases.js";
import { baseName, stripExt } from "./vault.js";
import { escapeHtml } from "./markdown.js";
import { icon } from "./icons.js";
import { showContextMenu } from "./contextmenu.js";

const VIEW_ICON = { table: "columns", list: "list", board: "layers", calendar: "calendar", gallery: "image", timeline: "gantt" };
const SAFE_COVER = /^(https?:|blob:|data:image\/(png|jpeg|webp|gif);base64,)/i;
// Propriedades de data que o calendário e o cronograma usam por padrão.
const isDateKey = (typeOf, k) => typeOf(k) === "date" && k !== "file.mtime";
const SORT_ICON = { asc: "chevron-down", desc: "chevrons-up" };
const WEEKDAYS = "Dom Seg Ter Qua Qui Sex Sáb".split(" ");
const esc = escapeHtml;
const TOTAL_LABEL = { soma: "Soma", media: "Média", contagem: "Contagem" };
const fmtTotal = (v) => (v === null || v === undefined ? "—" : Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toLocaleString("pt-BR"));

const hashColor = (s) => {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
};

const fmtDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
};

export function mountBase(host, { vault, path, openNote = () => {}, fileMenu = null, getMeta, askText = async () => null, toast = () => {} }) {
  const parsed = parseBase(vault.read(path));
  const base = parsed.base;
  let viewId = base.views[0].id;
  let month = (() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  })();
  let dirty = false; // só regrava o arquivo depois de uma edição: um .base ilegível não é sobrescrito por abrir
  let saveTimer = null;
  let renderTimer = null;
  let editing = null; // { td, ... } enquanto uma célula está em edição
  let pending = false;
  let pop = null; // { kind, anchor }
  let justDragged = false;
  let data = null; // linhas, tipos e visão atual, do último desenho

  host.innerHTML = `<div class="bs">
    ${parsed.error ? `<div class="bs-banner" role="alert">${icon("alert", 16)}<span>Este arquivo .base não pôde ser lido (${esc(parsed.error)}). Mostrando uma base vazia — o arquivo só muda se você editar aqui.</span></div>` : ""}
    <div class="bs-head"><div class="bs-tabs" role="tablist" aria-label="Visões"></div></div>
    <div class="bs-bar"></div>
    <div class="bs-body"></div>
    <div class="bs-pop" hidden></div>
  </div>`;
  const root = host.querySelector(".bs");
  const tabsEl = root.querySelector(".bs-tabs");
  const barEl = root.querySelector(".bs-bar");
  const bodyEl = root.querySelector(".bs-body");
  const popEl = root.querySelector(".bs-pop");

  const view = () => base.views.find((v) => v.id === viewId) || base.views[0];

  // --- Gravação ------------------------------------------------------------------------------------------------------------

  function save() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }

  function flush() {
    clearTimeout(saveTimer);
    if (dirty && vault.has(path)) vault.write(path, serializeBase(base));
    dirty = false;
  }

  function changed() {
    save();
    renderAll();
  }

  function writeProp(row, key, value) {
    if (!vault.has(row.path)) return;
    const src = vault.read(row.path);
    const next = setValue(src, key, value);
    if (next !== src) vault.write(row.path, next);
  }

  // --- Dados ---------------------------------------------------------------------------------------------------------------

  function compute() {
    const v = view();
    const files = vault.list();
    const rows = applyFormulas(collectRows(files, base.source, getMeta ? (f) => getMeta(f) : undefined), base.props);
    const keys = availableKeys(rows);
    const used = new Set([...keys, ...v.columns, v.groupBy, v.dateKey, ...v.filters.map((f) => f.key), ...v.sort.map((s) => s.key)].filter(Boolean));
    const types = typesFor(rows, [...used], base.props);
    data = { v, rows, keys, types, shown: applyView(rows, v, types) };
    return data;
  }

  const typeOf = (key) => data.types[key] || inferType(data.rows, key, base.props);

  // --- Desenho ---------------------------------------------------------------------------------------------------------------

  function chipHtml(value) {
    return `<span class="bs-chip bs-c${hashColor(value)}">${esc(value)}</span>`;
  }

  function cellInner(row, key) {
    const v = valueOf(row, key);
    const t = typeOf(key);
    if (key === "file.name") return `<span class="bs-name" data-open="${esc(row.path)}" title="Abrir a nota">${esc(v)}</span>`;
    if (t === "checkbox" && isEditable(key)) return `<input type="checkbox" class="bs-check" data-check ${v === true ? "checked" : ""} aria-label="${esc(keyLabel(key))}">`;
    if (isEmpty(v)) return `<span class="bs-empty"></span>`;
    if (t === "formula" && typeof v === "number") return esc(v.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
    if (t === "relacao") return linkTargets(v).map((n) => `<span class="bs-chip bs-rel" data-link="${esc(n)}">${esc(n)}</span>`).join("");
    if (Array.isArray(v)) return v.map((x) => chipHtml(String(x))).join("");
    if (t === "select") return chipHtml(String(v));
    if (t === "date") return esc(fmtDate(v));
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    return esc(String(v));
  }

  function renderTabs() {
    tabsEl.innerHTML = `${base.views
      .map((v) => `<button type="button" class="bs-tab${v.id === viewId ? " on" : ""}" role="tab" aria-selected="${v.id === viewId}" data-view="${v.id}">${icon(VIEW_ICON[v.type], 15)}<span>${esc(v.name)}</span></button>`)
      .join("")}<button type="button" class="bs-tab bs-tab-add" data-act="view-menu" title="Opções da visão" aria-label="Opções da visão">${icon("sliders", 15)}</button><button type="button" class="bs-tab bs-tab-add" data-act="add-view" title="Nova visão" aria-label="Nova visão">${icon("plus", 15)}</button><span class="bs-grow"></span><button type="button" class="bs-btn primary bs-newnote" data-act="new">${icon("plus", 15)}<span>Nova nota</span></button>`;
  }

  function renderBar() {
    const v = view();
    const src = [base.source.folder && `${base.source.folder}/`, base.source.tag && `#${base.source.tag}`].filter(Boolean).join(" ") || "Todas as notas";
    const group = v.groupBy ? keyLabel(v.groupBy) : "Nenhum";
    const btn = (kind, ic, label, n) => `<button type="button" class="bs-btn${pop?.kind === kind ? " on" : ""}${n ? " active" : ""}" data-pop="${kind}">${icon(ic, 15)}<span>${label}</span>${n ? `<b>${n}</b>` : ""}</button>`;
    barEl.innerHTML = `${btn("source", "folder", esc(src))}${btn("filter", "filter", "Filtro", v.filters.length)}${btn("sort", "chevrons-up", "Ordenar", v.sort.length)}${v.type === "timeline" ? btn("group", "gantt", `Início: ${esc(keyLabel(v.dateKey || "—"))} · Fim: ${esc(keyLabel(v.endKey || "—"))}`) : v.type === "calendar" ? btn("group", "calendar", `Data: ${esc(keyLabel(v.dateKey || "—"))}`) : btn("group", "layers", `Agrupar: ${esc(group)}`)}${btn("props", "sliders", "Propriedades")}<span class="bs-grow"></span>`;
  }

  function tableHtml(shown, v) {
    const cols = columnsOf(v, data.rows);
    const head = cols
      .map((k) => {
        const s = v.sort[0]?.key === k ? v.sort[0].dir : "";
        return `<th data-sort="${esc(k)}" class="${s ? "sorted" : ""}"><span>${esc(keyLabel(k))}</span>${s ? icon(SORT_ICON[s], 13) : ""}</th>`;
      })
      .join("");
    const rowHtml = (r) => `<tr data-path="${esc(r.path)}">${cols.map((k) => `<td data-key="${esc(k)}" class="${isEditable(k) && typeOf(k) !== "checkbox" && k !== "file.name" ? "edit" : ""} t-${typeOf(k)}">${cellInner(r, k)}</td>`).join("")}</tr>`;
    let body = "";
    if (v.groupBy) {
      for (const g of groupRows(shown, v.groupBy, base.props, { withEmpty: false })) {
        body += `<tr class="bs-grouprow"><td colspan="${cols.length}">${g.value === "" ? "Sem valor" : chipHtml(g.value)}<span class="bs-n">${g.rows.length}</span></td></tr>${g.rows.map(rowHtml).join("")}`;
      }
    } else body = shown.map(rowHtml).join("");
    if (!shown.length) body = `<tr><td colspan="${cols.length}" class="bs-none">Nenhuma nota nesta visão.</td></tr>`;
    const totals = totalsOf(shown, v.totals, Object.fromEntries(cols.map((k) => [k, typeOf(k)])));
    const hasTotals = cols.some((k) => totals[k]);
    const foot = hasTotals
      ? `<tfoot><tr class="bs-totals">${cols.map((k) => (totals[k] ? `<td data-key="${esc(k)}"><span class="bs-tot-kind">${TOTAL_LABEL[totals[k].kind]}</span> ${esc(fmtTotal(totals[k].value))}</td>` : "<td></td>")).join("")}</tr></tfoot>`
      : "";
    return `<div class="bs-scroll"><table class="bs-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
  }

  function listHtml(shown, v) {
    const cols = columnsOf(v, data.rows).filter((k) => k !== "file.name");
    const item = (r) => `<li data-path="${esc(r.path)}"><span class="bs-name" data-open="${esc(r.path)}">${esc(r.name)}</span>${cols.map((k) => (isEmpty(valueOf(r, k)) ? "" : `<span class="bs-meta" title="${esc(keyLabel(k))}">${cellInner(r, k)}</span>`)).join("")}</li>`;
    let body = "";
    if (v.groupBy) {
      for (const g of groupRows(shown, v.groupBy, base.props, { withEmpty: false })) body += `<h3 class="bs-gh">${g.value === "" ? "Sem valor" : chipHtml(g.value)}<span class="bs-n">${g.rows.length}</span></h3><ul class="bs-list">${g.rows.map(item).join("")}</ul>`;
    } else body = `<ul class="bs-list">${shown.map(item).join("")}</ul>`;
    return `<div class="bs-scroll bs-pad">${shown.length ? body : `<p class="bs-none">Nenhuma nota nesta visão.</p>`}</div>`;
  }

  function cardHtml(r, v) {
    const cols = columnsOf(v, data.rows).filter((k) => k !== "file.name" && k !== v.groupBy);
    return `<div class="bs-card" data-drag="${esc(r.path)}" data-path="${esc(r.path)}"><div class="bs-card-title bs-name" data-open="${esc(r.path)}">${esc(r.name)}</div>${cols
      .map((k) => (isEmpty(valueOf(r, k)) ? "" : `<div class="bs-card-prop"><span class="bs-card-label">${esc(keyLabel(k))}</span>${cellInner(r, k)}</div>`))
      .join("")}</div>`;
  }

  function boardHtml(shown, v) {
    if (!v.groupBy) return `<div class="bs-pad"><div class="bs-hint">${icon("layers", 22)}<p>O quadro agrupa as notas em colunas.</p><button type="button" class="bs-btn primary" data-pop="group">${icon("layers", 15)}<span>Escolher a propriedade</span></button></div></div>`;
    const opts = optionsFor(data.rows, v.groupBy, base.props).filter((o) => !(base.props[v.groupBy]?.options || []).includes(o));
    const withOpts = { ...base.props, [v.groupBy]: { ...base.props[v.groupBy], options: [...(base.props[v.groupBy]?.options || []), ...opts] } };
    const cols = groupRows(shown, v.groupBy, withOpts, { withEmpty: true });
    return `<div class="bs-board">${cols
      .map(
        (g) => `<section class="bs-col" data-drop="${esc(g.value)}" aria-label="${esc(g.value || "Sem valor")}"><header><span class="bs-col-title">${g.value === "" ? "Sem valor" : chipHtml(g.value)}</span><span class="bs-n">${g.rows.length}</span><button type="button" class="bs-iconbtn" data-act="new-in" data-value="${esc(g.value)}" title="Nova nota nesta coluna" aria-label="Nova nota nesta coluna">${icon("plus", 15)}</button></header><div class="bs-cards">${g.rows.map((r) => cardHtml(r, v)).join("")}</div></section>`,
      )
      .join("")}</div>`;
  }

  function calendarHtml(shown, v) {
    const dateKey = v.dateKey || data.keys.find((k) => typeOf(k) === "date" && k !== "file.mtime") || "";
    if (!dateKey) return `<div class="bs-pad"><div class="bs-hint">${icon("calendar", 22)}<p>O calendário precisa de uma propriedade de data.</p><button type="button" class="bs-btn primary" data-pop="group">${icon("calendar", 15)}<span>Escolher a data</span></button></div></div>`;
    const weeks = monthGrid(month.y, month.m, shown, dateKey);
    const longTitle = new Date(month.y, month.m, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).replace(" de ", " ");
    const title = longTitle.charAt(0).toUpperCase() + longTitle.slice(1);
    const today = todayIso();
    const chip = (r) => `<div class="bs-ev bs-c${hashColor(v.groupBy ? String(valueOf(r, v.groupBy)) : r.folder || "x")}" data-drag="${esc(r.path)}" data-path="${esc(r.path)}" data-open="${esc(r.path)}" title="${esc(r.name)}">${esc(r.name)}</div>`;
    const cell = (c) => `<div class="bs-day${c.inMonth ? "" : " out"}${c.date === today ? " today" : ""}" data-drop="${c.date}"><div class="bs-day-head"><span>${c.day}</span><button type="button" class="bs-iconbtn" data-act="new-in" data-value="${c.date}" title="Nova nota neste dia" aria-label="Nova nota neste dia">${icon("plus", 13)}</button></div>${c.rows.slice(0, 3).map(chip).join("")}${c.rows.length > 3 ? `<div class="bs-more">+${c.rows.length - 3}</div>` : ""}</div>`;
    const nodate = rowsWithoutDate(shown, dateKey);
    return `<div class="bs-cal"><div class="bs-cal-bar"><button type="button" class="bs-iconbtn" data-act="prev" aria-label="Mês anterior">${icon("chevron-right", 16, "flip")}</button><strong>${esc(title)}</strong><button type="button" class="bs-iconbtn" data-act="next" aria-label="Próximo mês">${icon("chevron-right", 16)}</button><button type="button" class="bs-btn" data-act="today">Hoje</button></div><div class="bs-weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join("")}</div><div class="bs-grid" style="grid-template-rows:repeat(${weeks.length}, minmax(96px, 1fr))">${weeks.flat().map(cell).join("")}</div>${nodate.length ? `<div class="bs-nodate" data-drop="">${`<span class="bs-nodate-title">Sem data (${nodate.length})</span>`}${nodate.map(chip).join("")}</div>` : ""}</div>`;
  }

  // Galeria: cartões com a capa (propriedade `capa` ou `cover`, com endereço de imagem) e até duas propriedades.
  function galleryHtml(shown, v) {
    if (!shown.length) return `<div class="bs-scroll bs-pad"><p class="bs-none">Nenhuma nota nesta visão.</p></div>`;
    const cols = columnsOf(v, data.rows).filter((k) => k !== "file.name").slice(0, 2);
    const card = (r) => {
      const cover = String(valueOf(r, "capa") || valueOf(r, "cover") || "");
      const img = SAFE_COVER.test(cover) ? `<img src="${esc(cover)}" alt="" loading="lazy" draggable="false">` : `<span class="bs-gnocover">${icon("image", 22)}</span>`;
      return `<article class="bs-gcard" data-path="${esc(r.path)}"><div class="bs-gcover" data-open="${esc(r.path)}">${img}</div><div class="bs-gbody"><div class="bs-name" data-open="${esc(r.path)}">${esc(r.name)}</div>${cols
        .map((k) => (isEmpty(valueOf(r, k)) ? "" : `<div class="bs-card-prop">${cellInner(r, k)}</div>`))
        .join("")}</div></article>`;
    };
    return `<div class="bs-scroll bs-pad"><div class="bs-gallery">${shown.map(card).join("")}</div></div>`;
  }

  // Cronograma: uma linha por nota, com uma barra entre a data de início e a de fim.
  function timelineHtml(shown, v) {
    const startKey = v.dateKey || data.keys.find((k) => isDateKey(typeOf, k)) || "";
    if (!startKey) return `<div class="bs-pad"><div class="bs-hint">${icon("gantt", 22)}<p>O cronograma precisa de uma propriedade de data de início.</p><button type="button" class="bs-btn primary" data-pop="group">${icon("gantt", 15)}<span>Escolher as datas</span></button></div></div>`;
    const tl = timelineItems(shown, startKey, v.endKey);
    if (!tl.items.length) return `<div class="bs-pad"><p class="bs-none">Nenhuma nota com data de início no formato AAAA-MM-DD.</p></div>`;
    const iso = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
    const rows = tl.items
      .map(({ row, start, end }) => {
        const left = ((start - tl.min) / tl.span) * 100;
        const width = Math.max(1.2, ((end - start + 1) / tl.span) * 100);
        const label = `${fmtDate(iso(start))}${end > start ? ` → ${fmtDate(iso(end))}` : ""}`;
        return `<div class="bs-tl-row" data-path="${esc(row.path)}"><div class="bs-tl-name bs-name" data-open="${esc(row.path)}">${esc(row.name)}</div><div class="bs-tl-track"><div class="bs-tl-bar bs-c${hashColor(row.folder || "x")}" data-open="${esc(row.path)}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%" title="${esc(label)}"></div></div></div>`;
      })
      .join("");
    return `<div class="bs-scroll bs-pad"><div class="bs-tl"><div class="bs-tl-axis"><span>${fmtDate(iso(tl.min))}</span><span>${fmtDate(iso(tl.max))}</span></div>${rows}</div></div>`;
  }

  function renderBody() {
    const v = view();
    const shown = data.shown;
    bodyEl.dataset.type = v.type;
    bodyEl.innerHTML = v.type === "table" ? tableHtml(shown, v) : v.type === "list" ? listHtml(shown, v) : v.type === "board" ? boardHtml(shown, v) : v.type === "gallery" ? galleryHtml(shown, v) : v.type === "timeline" ? timelineHtml(shown, v) : calendarHtml(shown, v);
  }

  function renderAll() {
    if (editing) {
      pending = true;
      return;
    }
    compute();
    renderTabs();
    renderBar();
    renderBody();
    if (pop) renderPop();
  }

  // --- Popovers ------------------------------------------------------------------------------------------------------------

  const keyOptions = (selected, { none = "" } = {}) =>
    `${none ? `<option value="">${esc(none)}</option>` : ""}${data.keys.map((k) => `<option value="${esc(k)}"${k === selected ? " selected" : ""}>${esc(keyLabel(k))}</option>`).join("")}`;

  function popHtml() {
    const v = view();
    if (pop.kind === "source") {
      const folders = [...new Set(vault.list().map((f) => (f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "")).filter(Boolean))];
      return `<h4>De onde vêm as notas</h4><label>Pasta<input class="bs-in" data-source="folder" list="bs-folders" value="${esc(base.source.folder)}" placeholder="todas as pastas" autocomplete="off"></label><datalist id="bs-folders">${folders.map((f) => `<option value="${esc(f)}">`).join("")}</datalist><label>Etiqueta<input class="bs-in" data-source="tag" value="${esc(base.source.tag)}" placeholder="sem etiqueta" autocomplete="off"></label><p class="bs-note">Vale só para notas .md. Pasta e etiqueta juntas: a nota precisa das duas.</p>`;
    }
    if (pop.kind === "filter") {
      const rows = v.filters
        .map((f, i) => {
          const t = typeOf(f.key);
          const ops = Object.entries(OPS).map(([k, l]) => `<option value="${k}"${k === f.op ? " selected" : ""}>${l}</option>`).join("");
          const val = NO_VALUE_OPS.includes(f.op)
            ? ""
            : t === "checkbox"
              ? `<select class="bs-in" data-f="value" data-i="${i}"><option value="true"${String(f.value) === "true" ? " selected" : ""}>marcado</option><option value="false"${String(f.value) === "false" ? " selected" : ""}>desmarcado</option></select>`
              : `<input class="bs-in" data-f="value" data-i="${i}" ${t === "date" ? 'type="date"' : ""} list="bs-opt-${i}" value="${esc(f.value)}" placeholder="valor" autocomplete="off"><datalist id="bs-opt-${i}">${optionsFor(data.rows, f.key, base.props).map((o) => `<option value="${esc(o)}">`).join("")}</datalist>`;
          return `<div class="bs-rule"><select class="bs-in" data-f="key" data-i="${i}">${keyOptions(f.key)}</select><select class="bs-in" data-f="op" data-i="${i}">${ops}</select>${val}<button type="button" class="bs-iconbtn" data-f-del="${i}" aria-label="Remover filtro">${icon("x", 14)}</button></div>`;
        })
        .join("");
      return `<h4>Filtros</h4>${rows || `<p class="bs-note">Sem filtros: todas as notas da fonte aparecem.</p>`}<button type="button" class="bs-btn" data-f-add>${icon("plus", 15)}<span>Adicionar filtro</span></button>`;
    }
    if (pop.kind === "sort") {
      const rows = v.sort
        .map((s, i) => `<div class="bs-rule"><select class="bs-in" data-s="key" data-i="${i}">${keyOptions(s.key)}</select><select class="bs-in" data-s="dir" data-i="${i}"><option value="asc"${s.dir === "asc" ? " selected" : ""}>crescente</option><option value="desc"${s.dir === "desc" ? " selected" : ""}>decrescente</option></select><button type="button" class="bs-iconbtn" data-s-del="${i}" aria-label="Remover ordem">${icon("x", 14)}</button></div>`)
        .join("");
      return `<h4>Ordenar</h4>${rows || `<p class="bs-note">Sem ordem definida: pelo nome da nota.</p>`}<button type="button" class="bs-btn" data-s-add>${icon("plus", 15)}<span>Adicionar ordem</span></button>`;
    }
    if (pop.kind === "group") {
      if (v.type === "timeline") return `<h4>Início</h4><select class="bs-in" data-date>${keyOptions(v.dateKey, { none: "Escolher…" })}</select><h4>Fim</h4><select class="bs-in" data-enddate>${keyOptions(v.endKey, { none: "Mesmo dia do início" })}</select><p class="bs-note">Notas sem data de início em AAAA-MM-DD ficam de fora. Sem fim, a barra é de um dia só.</p>`;
      if (v.type === "calendar") return `<h4>Propriedade de data</h4><select class="bs-in" data-date>${keyOptions(v.dateKey, { none: "Escolher…" })}</select><p class="bs-note">Notas com essa propriedade em formato AAAA-MM-DD aparecem no dia.</p>`;
      return `<h4>${v.type === "board" ? "Colunas do quadro" : "Agrupar por"}</h4><select class="bs-in" data-group>${keyOptions(v.groupBy, { none: v.type === "board" ? "Escolher…" : "Nenhum" })}</select>${v.groupBy ? `<label>Ordem das colunas<input class="bs-in" data-options value="${esc((base.props[v.groupBy]?.options || []).join(", "))}" placeholder="${esc(optionsFor(data.rows, v.groupBy, base.props).join(", "))}" autocomplete="off"></label><p class="bs-note">Separe por vírgula. O que não estiver na lista aparece depois.</p>` : ""}`;
    }
    if (pop.kind === "props") {
      const cols = columnsOf(v, data.rows);
      return `<h4>Propriedades visíveis</h4><div class="bs-props">${data.keys
        .map((k) => {
          const on = cols.includes(k);
          const t = typeOf(k);
          const typeSel = k.startsWith("file.") || k === "tags" ? "" : `<select class="bs-in bs-type" data-type-of="${esc(k)}" aria-label="Tipo de ${esc(keyLabel(k))}">${PROP_TYPES.map((p) => `<option value="${p}"${p === t ? " selected" : ""}>${PROP_TYPE_NAMES[p]}</option>`).join("")}</select>`;
          return `<label class="bs-propline"><input type="checkbox" data-col="${esc(k)}" ${on ? "checked" : ""}><span>${esc(keyLabel(k))}</span>${typeSel}</label>`;
        })
        .join("")}</div>`;
    }
    if (pop.kind === "view") {
      const totalCols = columnsOf(v, data.rows).filter((k) => k !== "file.name");
      const totalRows = totalCols.length && v.type === "table" ? `<h4>Totais no rodapé</h4>${totalCols.map((k) => `<label>${esc(keyLabel(k))}<select class="bs-in" data-total="${esc(k)}"><option value="">Nenhum</option>${TOTAL_KINDS.map((t) => `<option value="${t}"${v.totals?.[k] === t ? " selected" : ""}>${TOTAL_LABEL[t]}</option>`).join("")}</select></label>`).join("")}` : "";
      return `${totalRows}<h4>Visão</h4><label>Nome<input class="bs-in" data-vname value="${esc(v.name)}" autocomplete="off"></label><label>Tipo<select class="bs-in" data-vtype>${VIEW_TYPES.map((t) => `<option value="${t}"${t === v.type ? " selected" : ""}>${VIEW_NAMES[t]}</option>`).join("")}</select></label><div class="bs-actions"><button type="button" class="bs-btn" data-act="dup-view">${icon("copy", 15)}<span>Duplicar</span></button><button type="button" class="bs-btn danger" data-act="del-view"${base.views.length < 2 ? " disabled" : ""}>${icon("trash", 15)}<span>Excluir</span></button></div>`;
    }
    if (pop.kind === "newview") {
      return `<h4>Nova visão</h4><div class="bs-types">${VIEW_TYPES.map((t) => `<button type="button" class="bs-btn" data-new-type="${t}">${icon(VIEW_ICON[t], 15)}<span>${VIEW_NAMES[t]}</span></button>`).join("")}</div>`;
    }
    return "";
  }

  function renderPop() {
    if (!pop) {
      popEl.hidden = true;
      return;
    }
    const focused = document.activeElement?.closest?.(".bs-pop") ? document.activeElement : null;
    const sel = focused ? { sel: focused.dataset ? Object.entries(focused.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${v}"]`).join("") : "", pos: focused.selectionStart } : null;
    popEl.innerHTML = popHtml();
    popEl.hidden = false;
    const a = pop.anchor && root.contains(pop.anchor) ? pop.anchor : barEl.querySelector(`[data-pop="${pop.kind}"]`);
    if (a) {
      const r = a.getBoundingClientRect();
      const b = root.getBoundingClientRect();
      popEl.style.left = `${Math.max(8, Math.min(r.left - b.left, b.width - popEl.offsetWidth - 8))}px`;
      popEl.style.top = `${r.bottom - b.top + 6}px`;
    }
    if (sel?.sel) {
      const again = popEl.querySelector(`.bs-in${sel.sel}`);
      if (again) {
        again.focus();
        if (typeof sel.pos === "number" && again.setSelectionRange && again.type !== "date") try { again.setSelectionRange(sel.pos, sel.pos); } catch { /* tipo sem seleção */ }
      }
    }
  }

  function openPop(kind, anchor) {
    pop = pop?.kind === kind ? null : { kind, anchor };
    renderBar();
    renderTabs();
    renderPop();
  }

  function closePop() {
    if (!pop) return;
    pop = null;
    popEl.hidden = true;
    renderBar();
  }

  // --- Ações -----------------------------------------------------------------------------------------------------------------

  async function createRow(extra = {}) {
    const v = view();
    const name = await askText("Nova nota", "Nova nota", "Nome da nota");
    if (!name) return;
    const props = newRowProps(base, v, extra);
    const p = uniquePath((x) => vault.has(x), base.source.folder, name.replace(/[\\/:*?"<>|]/g, "-").trim() || "Nova nota");
    try {
      vault.create(p, newRowContent(props));
      toast(`Nota criada: ${p}`, "success");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  function moveToColumn(path, value) {
    const row = data.rows.find((r) => r.path === path);
    const v = view();
    if (!row || !v.groupBy) return;
    const t = typeOf(v.groupBy);
    const cur = valueOf(row, v.groupBy);
    if ((Array.isArray(cur) ? cur[0] : cur) === value || (isEmpty(cur) && value === "")) return;
    writeProp(row, v.groupBy, value === "" ? "" : t === "list" ? [value] : coerce(t, value));
  }

  function moveToDay(path, date) {
    const row = data.rows.find((r) => r.path === path);
    const v = view();
    const key = v.dateKey || data.keys.find((k) => typeOf(k) === "date" && k !== "file.mtime");
    if (row && key) writeProp(row, key, date);
  }

  function startEdit(td) {
    const tr = td.closest("tr");
    const row = data.rows.find((r) => r.path === tr.dataset.path);
    const key = td.dataset.key;
    if (!row || !isEditable(key) || typeOf(key) === "formula") return;
    const t = typeOf(key);
    const cur = valueOf(row, key);
    const input = document.createElement("input");
    input.className = "bs-edit";
    input.value = Array.isArray(cur) ? cur.join(", ") : isEmpty(cur) ? "" : String(cur);
    if (t === "date") input.type = "date";
    td.textContent = "";
    if (t === "select" || t === "pessoa" || t === "relacao") {
      // sugestões: opções já usadas (seleção e pessoa); nomes de nota (relação)
      input.setAttribute("list", "bs-cell-opts");
      const dl = document.createElement("datalist");
      dl.id = "bs-cell-opts";
      const names = t === "relacao" ? vault.markdownFiles().map((f) => stripExt(baseName(f.path))) : optionsFor(data.rows, key, base.props);
      dl.innerHTML = names.map((o) => `<option value="${esc(o)}">`).join("");
      td.appendChild(dl);
    }
    if (t === "relacao") input.placeholder = "[[Nota]], [[Outra]]";
    td.appendChild(input);
    editing = { td };
    input.focus();
    input.select?.();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      editing = null;
      if (commit) writeProp(row, key, coerce(t, input.value));
      renderAll();
      pending = false;
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(true);
      else if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  }

  function toggleSort(key) {
    const v = view();
    const cur = v.sort[0];
    if (cur?.key === key) v.sort = cur.dir === "asc" ? [{ key, dir: "desc" }, ...v.sort.slice(1)] : v.sort.slice(1);
    else v.sort = [{ key, dir: "asc" }, ...v.sort.filter((s) => s.key !== key)];
    changed();
  }

  function onClick(e) {
    const t = e.target;
    if (justDragged) {
      justDragged = false;
      return;
    }
    const link = t.closest("[data-link]");
    if (link) {
      const target = vault.resolveLink(link.dataset.link, path);
      if (target) openNote(target);
      else toast(`Nota não encontrada: ${link.dataset.link}`, "info");
      return;
    }
    const tab = t.closest("[data-view]");
    if (tab && tab.classList.contains("bs-tab")) {
      viewId = tab.dataset.view;
      closePop();
      return renderAll();
    }
    const popBtn = t.closest("[data-pop]");
    if (popBtn) return openPop(popBtn.dataset.pop, popBtn);
    const openEl = t.closest("[data-open]");
    if (openEl) return openNote(openEl.dataset.open);
    const sortTh = t.closest("th[data-sort]");
    if (sortTh) return toggleSort(sortTh.dataset.sort);
    const act = t.closest("[data-act]")?.dataset.act;
    if (act === "new") return void createRow();
    if (act === "new-in") {
      const v = view();
      const value = t.closest("[data-act]").dataset.value;
      const key = v.type === "calendar" ? v.dateKey || data.keys.find((k) => typeOf(k) === "date" && k !== "file.mtime") : v.groupBy;
      return void createRow(key ? { [key]: value } : {});
    }
    if (act === "prev" || act === "next") {
      const d = new Date(month.y, month.m + (act === "next" ? 1 : -1), 1);
      month = { y: d.getFullYear(), m: d.getMonth() };
      return renderAll();
    }
    if (act === "today") {
      const d = new Date();
      month = { y: d.getFullYear(), m: d.getMonth() };
      return renderAll();
    }
    if (act === "add-view") return openPop("newview", t.closest("[data-act]"));
    if (act === "view-menu") return openPop("view", t.closest("[data-act]"));
    if (act === "dup-view") {
      const v = view();
      const copy = { ...JSON.parse(JSON.stringify(v)), ...makeView(v.type, `${v.name} (cópia)`) };
      Object.assign(copy, { columns: [...v.columns], filters: JSON.parse(JSON.stringify(v.filters)), sort: JSON.parse(JSON.stringify(v.sort)), groupBy: v.groupBy, dateKey: v.dateKey });
      base.views.push(copy);
      viewId = copy.id;
      pop = null;
      return changed();
    }
    if (act === "del-view" && base.views.length > 1) {
      base.views = base.views.filter((x) => x.id !== viewId);
      viewId = base.views[0].id;
      pop = null;
      return changed();
    }
    const nt = t.closest("[data-new-type]");
    if (nt) {
      const nv = makeView(nt.dataset.newType);
      if (nv.type === "board") nv.groupBy = data.keys.find((k) => typeOf(k) === "select") || "";
      if (nv.type === "calendar" || nv.type === "timeline") nv.dateKey = data.keys.find((k) => isDateKey(typeOf, k)) || "";
      base.views.push(nv);
      viewId = nv.id;
      pop = null;
      return changed();
    }
    const fAdd = t.closest("[data-f-add]");
    if (fAdd) {
      view().filters.push({ key: data.keys.find((k) => !k.startsWith("file.") && k !== "tags") || data.keys[1] || "file.name", op: "is", value: "" });
      return changed();
    }
    const fDel = t.closest("[data-f-del]");
    if (fDel) {
      view().filters.splice(Number(fDel.dataset.fDel), 1);
      return changed();
    }
    const sAdd = t.closest("[data-s-add]");
    if (sAdd) {
      view().sort.push({ key: data.keys.find((k) => !view().sort.some((s) => s.key === k)) || "file.name", dir: "asc" });
      return changed();
    }
    const sDel = t.closest("[data-s-del]");
    if (sDel) {
      view().sort.splice(Number(sDel.dataset.sDel), 1);
      return changed();
    }
    const td = t.closest("td.edit");
    if (td && !editing) return startEdit(td);
    if (!t.closest(".bs-pop") && pop) closePop();
  }

  function onChange(e) {
    const t = e.target;
    const v = view();
    if (t.matches("[data-check]")) {
      const tr = t.closest("tr");
      const row = data.rows.find((r) => r.path === tr.dataset.path);
      if (row) writeProp(row, t.closest("td").dataset.key, t.checked ? true : false);
      return;
    }
    if (t.dataset.source) {
      base.source[t.dataset.source] = t.dataset.source === "tag" ? t.value.trim().replace(/^#/, "") : t.value.trim().replace(/^\/+|\/+$/g, "");
      return changed();
    }
    if (t.dataset.f) {
      const f = v.filters[Number(t.dataset.i)];
      if (!f) return;
      f[t.dataset.f] = t.value;
      if (t.dataset.f === "key") f.value = "";
      return changed();
    }
    if (t.dataset.s) {
      const s = v.sort[Number(t.dataset.i)];
      if (s) s[t.dataset.s] = t.value;
      return changed();
    }
    if (t.matches("[data-group]")) {
      v.groupBy = t.value;
      return changed();
    }
    if (t.matches("[data-date]")) {
      v.dateKey = t.value;
      return changed();
    }
    if (t.matches("[data-enddate]")) {
      v.endKey = t.value;
      return changed();
    }
    if (t.matches("[data-options]")) {
      base.props[v.groupBy] = { ...base.props[v.groupBy], options: t.value.split(",").map((x) => x.trim()).filter(Boolean) };
      return changed();
    }
    if (t.dataset.col !== undefined) {
      const cols = columnsOf(v, data.rows);
      v.columns = t.checked ? [...cols, t.dataset.col] : cols.filter((c) => c !== t.dataset.col);
      if (!v.columns.length) v.columns = ["file.name"];
      return changed();
    }
    if (t.dataset.typeOf && t.value === "formula") {
      // fórmula: pede a expressão antes de gravar o tipo
      Promise.resolve(askText("Fórmula", base.props[t.dataset.typeOf]?.expr || "", "Ex.: preco * quantidade (use aspas para nomes com espaço)")).then((expr) => {
        if (!expr) return renderAll();
        const check = checkFormula(expr);
        if (!check.ok) {
          toast(check.error, "error");
          return renderAll();
        }
        base.props[t.dataset.typeOf] = { ...base.props[t.dataset.typeOf], type: "formula", expr: expr.trim() };
        changed();
      });
      return;
    }
    if (t.dataset.typeOf) {
      base.props[t.dataset.typeOf] = { ...base.props[t.dataset.typeOf], type: t.value };
      return changed();
    }
    if (t.matches("[data-total]")) {
      v.totals = { ...(v.totals || {}) };
      if (t.value) v.totals[t.dataset.total] = t.value;
      else delete v.totals[t.dataset.total];
      return changed();
    }
    if (t.matches("[data-vname]")) {
      v.name = t.value.trim() || VIEW_NAMES[v.type];
      return changed();
    }
    if (t.matches("[data-vtype]")) {
      v.type = t.value;
      if (v.type === "board" && !v.groupBy) v.groupBy = data.keys.find((k) => typeOf(k) === "select") || "";
      if ((v.type === "calendar" || v.type === "timeline") && !v.dateKey) v.dateKey = data.keys.find((k) => isDateKey(typeOf, k)) || "";
      return changed();
    }
  }

  // --- Arrastar (cartões do quadro e notas do calendário) -----------------------------------------------------------

  let drag = null;

  function dropAt(x, y) {
    if (drag?.ghost) drag.ghost.style.display = "none";
    const el = document.elementFromPoint(x, y)?.closest?.("[data-drop]");
    if (drag?.ghost) drag.ghost.style.display = "";
    return el && root.contains(el) ? el : null;
  }

  function onPointerDown(e) {
    const it = e.target.closest("[data-drag]");
    if (!it || e.button !== 0 || e.target.closest("input, select, textarea, button")) return;
    drag = { it, x: e.clientX, y: e.clientY, moved: false, ghost: null, target: null };
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.moved = true;
      const r = drag.it.getBoundingClientRect();
      drag.ghost = drag.it.cloneNode(true);
      drag.ghost.classList.add("bs-ghost");
      drag.ghost.style.width = `${r.width}px`;
      document.body.appendChild(drag.ghost);
      drag.it.classList.add("bs-dragging");
    }
    drag.ghost.style.left = `${e.clientX + 8}px`;
    drag.ghost.style.top = `${e.clientY + 8}px`;
    const target = dropAt(e.clientX, e.clientY);
    if (target !== drag.target) {
      drag.target?.classList.remove("bs-over");
      drag.target = target;
      target?.classList.add("bs-over");
    }
  }

  function onPointerUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    // o último movimento pode não ter sido entregue: usa a posição do próprio soltar
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 6) {
      d.moved = true;
      d.target = dropAt(e.clientX, e.clientY);
    }
    d.ghost?.remove();
    d.target?.classList.remove("bs-over");
    d.it.classList.remove("bs-dragging");
    if (!d.moved) return;
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    if (!d.target) return;
    const path = d.it.dataset.drag;
    if (view().type === "board") moveToColumn(path, d.target.dataset.drop);
    else if (view().type === "calendar" && d.target.dataset.drop !== undefined) moveToDay(path, d.target.dataset.drop);
  }

  // Botão direito numa nota (linha, cartão ou evento do calendário) ou numa aba de visão.
  root.addEventListener("contextmenu", (e) => {
    const rowEl = e.target.closest("[data-path]");
    const tab = e.target.closest(".bs-tab[data-view]");
    if (!rowEl && !tab) return;
    e.preventDefault();
    e.stopPropagation();
    if (rowEl && fileMenu) return fileMenu(rowEl.dataset.path, e.clientX, e.clientY);
    if (rowEl) return showContextMenu(e.clientX, e.clientY, [{ label: "Abrir nota", icon: "file-text", run: () => openNote(rowEl.dataset.path) }]);
    viewId = tab.dataset.view;
    renderAll();
    showContextMenu(e.clientX, e.clientY, [
      { label: "Renomear ou trocar o tipo…", icon: "edit", run: () => openPop("view", tab) },
      { label: "Duplicar visão", icon: "copy", run: () => root.querySelector("[data-act=view-menu]") && (openPop("view", tab), root.querySelector("[data-act=dup-view]")?.click()) },
      { label: "Excluir visão", icon: "trash", danger: true, disabled: base.views.length < 2, run: () => { openPop("view", tab); root.querySelector("[data-act=del-view]")?.click(); } },
    ]);
  });
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) closePop();
    if (e.key === "Enter" && e.target.matches?.(".bs-pop input.bs-in")) e.target.blur();
  });
  // Mudança nas notas (criar, editar, mover, apagar): desenha de novo, sem interromper uma célula em edição.
  const unsub = ["create", "modify", "delete", "rename"].map((ev) =>
    vault.on(ev, (payload) => {
      const p = payload?.path ?? payload?.from;
      if (p === path || payload?.to === path) return;
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderAll, 40);
    }),
  );

  renderAll();

  return {
    base: () => base,
    stats: () => ({ rows: data?.rows.length ?? 0, shown: data?.shown.length ?? 0, view: view().name }),
    flush,
    destroy() {
      flush();
      clearTimeout(renderTimer);
      unsub.forEach((u) => u());
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      host.innerHTML = "";
    },
  };
}
