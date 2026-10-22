// Propriedades dentro da nota: cada linha tem o ícone do tipo, o nome (que abre um menu para
// renomear, trocar o tipo ou remover) e um editor próprio do tipo: texto, número, seleção e seleção múltipla com chips coloridos,
// data, caixa de marcar e endereço. Editar grava direto no frontmatter da nota, sem mexer no resto do texto.

import { setProperty, removeProperty, renameProperty } from "./frontmatter.js";
import { escapeHtml } from "./markdown.js";
import { icon, ICONS } from "./icons.js";
import { showContextMenu } from "./contextmenu.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const URL_RE = /^https?:\/\/\S+$/i;
export const TYPE_NAMES = { text: "Texto", number: "Número", select: "Seleção", list: "Seleção múltipla", date: "Data", checkbox: "Caixa de marcar", url: "Endereço (URL)" };
// Ícones que a pessoa pode escolher para uma propriedade.
export const ICON_CHOICES = "type hash calendar check-square link tag star pin clock file-text folder graph puzzle sun moon alert info book code eye layers database search check-circle".split(" ");
export const TYPE_ICONS = { text: "type", number: "hash", select: "chevron-down", list: "tag", date: "calendar", checkbox: "check-square", url: "link" };

// Tipo que se deduz só do valor.
export function propType(value) {
  if (typeof value === "boolean") return "checkbox";
  if (typeof value === "number") return "number";
  if (Array.isArray(value)) return "list";
  if (typeof value === "string" && ISO.test(value)) return "date";
  if (typeof value === "string" && URL_RE.test(value)) return "url";
  return "text";
}

// Tipo final: o que a pessoa escolheu vence; `tags` é sempre seleção múltipla; texto que se repete pouco na biblioteca vira seleção.
export function resolveType(key, value, { override = null, distinct = 0, uses = 0 } = {}) {
  if (override && TYPE_NAMES[override]) return override;
  if (key === "tags") return "list";
  const t = propType(value);
  if (t === "text" && typeof value === "string" && value && uses >= 2 && distinct <= 8 && distinct < uses) return "select";
  return t;
}

// Valor digitado → valor gravado, conforme o tipo.
export function parseInput(type, raw) {
  const t = String(raw ?? "").trim();
  if (type === "number") {
    if (t === "") return "";
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : "";
  }
  if (type === "list") return t.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean);
  return t;
}

export function defaultFor(type, today = new Date().toISOString().slice(0, 10)) {
  return type === "number" ? 0 : type === "date" ? today : type === "checkbox" ? false : type === "list" ? [] : "";
}

// Leva o valor atual para o novo tipo sem perder o que dá para aproveitar.
export function convertValue(type, value) {
  const items = Array.isArray(value) ? value.map(String) : value === "" || value == null ? [] : [String(value)];
  switch (type) {
    case "list":
      return items;
    case "checkbox":
      return typeof value === "boolean" ? value : items.length > 0 && !/^(false|não|nao|0)$/i.test(items[0]);
    case "number": {
      const n = Number(String(items[0] ?? "").replace(",", "."));
      return items.length && Number.isFinite(n) ? n : "";
    }
    case "date":
      return ISO.test(items[0] ?? "") ? items[0] : "";
    case "select":
      return items[0] ?? "";
    default:
      return items.join(", ");
  }
}

// Texto da nota com a propriedade criada (vazia, quando o tipo não tem valor padrão).
export function withNewProperty(source, key, type) {
  const k = String(key).trim().replace(/[:\n]/g, "");
  if (!k) return source;
  const v = defaultFor(type);
  if (v === "" || (Array.isArray(v) && !v.length)) {
    const line = type === "list" ? `${k}: []` : `${k}:`;
    const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(source);
    if (!m) return `---\n${line}\n---\n${source}`;
    return `---\n${m[1]}\n${line}\n---${m[2]}${source.slice(m[0].length)}`;
  }
  return setProperty(source, k, v);
}

// Tipo mais provável para um nome novo (data, endereço, lista…); na dúvida, texto.
export function guessType(name) {
  const n = String(name || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/(^|[\s_-])(data|date|prazo|vencimento|inicio|fim|criad[oa]|nascimento|quando)($|[\s_-])/.test(n)) return "date";
  if (/(^|[\s_-])(url|link|site|endereco|pagina|href)($|[\s_-])/.test(n)) return "url";
  if (/^(tags?|etiquetas?|categorias|marcadores|participantes|autores)$/.test(n)) return "list";
  if (/^(feito|concluid[oa]|pronto|ok|ativo|favorito|arquivad[oa]|publicad[oa])$/.test(n)) return "checkbox";
  if (/^(prioridade|valor|preco|qtd|quantidade|nota|pontos|ordem|total|idade|ano|numero)$/.test(n)) return "number";
  if (/^(status|estado|etapa|fase|tipo|categoria|area|situacao)$/.test(n)) return "select";
  return "text";
}

// Cor estável de uma opção (0 a 5), para os chips de seleção.
export function optionColor(value) {
  let h = 0;
  for (const ch of String(value)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

export function mountNoteProps(el, { vault, path, getMeta, toast = () => {}, types = null, meta = null }) {
  let collapsed = false;
  let destroyed = false;
  let pop = null; // { key, type }

  // "[]" (lista vazia escrita como texto) é valor vazio: não mostra os colchetes no campo.
  const emptyish = (v) => v === "[]" || (Array.isArray(v) && v.every((x) => x === "" || x === "[]"));
  const fm = () => {
    const data = (getMeta({ path, content: vault.read(path) }) || { frontmatter: {} }).frontmatter || {};
    return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, emptyish(v) ? "" : v]));
  };

  // Uso da chave na biblioteca inteiro: quantas vezes, quantos valores diferentes e quais são.
  const usage = (key) => {
    const set = new Map();
    let uses = 0;
    for (const f of vault.markdownFiles()) {
      const v = ((getMeta(f) || {}).frontmatter || {})[key];
      for (const x of Array.isArray(v) ? v : [v]) {
        if (typeof x === "string" && x) {
          uses++;
          set.set(x, (set.get(x) || 0) + 1);
        }
      }
    }
    return { uses, values: [...set.keys()], distinct: set.size };
  };

  const typeOf = (key, value) => {
    const u = usage(key);
    return resolveType(key, value, { override: types?.get(key) || null, distinct: u.distinct, uses: u.uses });
  };

  const allKeys = () => {
    const s = new Set();
    for (const f of vault.markdownFiles()) for (const k of Object.keys((getMeta(f) || {}).frontmatter || {})) s.add(k);
    return [...s];
  };

  function write(fn) {
    if (!vault.has(path)) return;
    const src = vault.read(path);
    const next = fn(src);
    if (next !== src) vault.write(path, next);
  }

  const setValue = (key, value) => write((s) => setProperty(s, key, value));
  // Ícone e valores definidos pela pessoa para a propriedade (valem para a biblioteca toda).
  const metaOf = (key) => (meta && meta.get(key)) || {};
  const iconOf = (key, type) => (ICONS[metaOf(key).icon] ? metaOf(key).icon : TYPE_ICONS[type]);
  const colorOf = (key, v) => {
    const o = (metaOf(key).options || []).find((x) => x.name === String(v));
    return o ? o.color : optionColor(v);
  };
  const chip = (v, key, removable = null) => `<span class="np-chip c${colorOf(key, v)}">${key === "tags" ? "#" : ""}${escapeHtml(String(v))}${removable !== null ? `<button type="button" class="np-x" data-del-item="${removable}" data-key="${escapeHtml(key)}" aria-label="Remover ${escapeHtml(String(v))}">${icon("x", 12)}</button>` : ""}</span>`;

  function valueHtml(key, v, type) {
    const k = escapeHtml(key);
    if (type === "checkbox") return `<input type="checkbox" class="np-check" data-key="${k}" ${v === true || v === "true" ? "checked" : ""} aria-label="${k}">`;
    if (type === "select" || type === "list") {
      const arr = type === "list" ? (Array.isArray(v) ? v : v === "" ? [] : [v]) : v === "" ? [] : [v];
      const chips = arr.map((x, i) => chip(x, key, type === "list" ? i : null)).join("");
      return `<div class="np-sel" data-open-opts="${k}" data-type="${type}" tabindex="0" role="button" aria-label="Escolher ${k}">${chips || `<span class="np-empty">Vazio</span>`}</div>`;
    }
    if (type === "url") {
      const ok = typeof v === "string" && URL_RE.test(v);
      return `<div class="np-urlwrap"><input class="np-in" data-key="${k}" data-type="url" value="${escapeHtml(v == null ? "" : String(v))}" placeholder="https://…" autocomplete="off">${ok ? `<a class="np-open" href="${escapeHtml(v)}" target="_blank" rel="noopener" title="Abrir o endereço" aria-label="Abrir o endereço">${icon("external-link", 14)}</a>` : ""}</div>`;
    }
    const attr = type === "date" ? 'type="date"' : type === "number" ? 'inputmode="decimal"' : "";
    return `<input class="np-in" data-key="${k}" data-type="${type}" ${attr} value="${escapeHtml(v === "" || v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v))}" placeholder="Vazio" autocomplete="off">`;
  }

  function render() {
    if (destroyed) return;
    const data = fm();
    const entries = Object.entries(data);
    const rows = entries
      .map(([k, v]) => {
        const t = typeOf(k, v);
        return `<div class="np-row" data-row="${escapeHtml(k)}"><button type="button" class="np-key" data-key-menu="${escapeHtml(k)}" data-type="${t}" title="${escapeHtml(TYPE_NAMES[t])}: ${escapeHtml(k)}">${icon(iconOf(k, t), 15)}<span>${escapeHtml(k)}</span></button><div class="np-val">${valueHtml(k, v, t)}</div></div>`;
      })
      .join("");
    const addRow = `<button type="button" class="np-btn np-addbtn" data-start>${icon("plus", 14)}<span>Adicionar propriedade</span></button>`;
    el.innerHTML = `<div class="np${collapsed ? " collapsed" : ""}"><button type="button" class="np-head" aria-expanded="${!collapsed}">${icon("chevron-down", 14, "caret")}<span>Propriedades</span>${entries.length ? `<span class="np-count">${entries.length}</span>` : ""}</button><div class="np-body">${rows}${addRow}</div><div class="np-pop" hidden></div></div>`;
    if (pop?.edit) pop = null;
    if (pop?.add) openAdd(true);
    else if (pop) openOptions(pop.key, pop.type, true);
  }

  // --- Escolher opções (seleção e seleção múltipla) -------------------------------------------------------------------
  function openOptions(key, type, keep = false) {
    const box = el.querySelector(".np-pop");
    const anchor = el.querySelector(`[data-open-opts="${CSS.escape(key)}"]`);
    if (!box || !anchor) {
      pop = null;
      return;
    }
    pop = { key, type };
    box.classList.remove("wide");
    const cur = fm()[key];
    const chosen = new Set(Array.isArray(cur) ? cur.map(String) : cur ? [String(cur)] : []);
    const opts = [...new Set([...(metaOf(key).options || []).map((o) => o.name), ...usage(key).values, ...chosen])];
    const draw = (q = "") => {
      const f = q.trim().toLowerCase();
      const list = opts.filter((o) => !f || o.toLowerCase().includes(f));
      const exact = opts.some((o) => o.toLowerCase() === f);
      box.querySelector(".np-opts").innerHTML = `${list.map((o) => `<button type="button" class="np-opt${chosen.has(o) ? " on" : ""}" data-opt="${escapeHtml(o)}">${chip(o, key)}${chosen.has(o) ? icon("check", 14) : ""}</button>`).join("")}${f && !exact ? `<button type="button" class="np-opt" data-opt="${escapeHtml(q.trim())}"><span class="np-new-lbl">Criar</span>${chip(q.trim(), key)}</button>` : ""}${!list.length && !f ? `<p class="np-none">Nenhuma opção ainda: digite para criar.</p>` : ""}`;
    };
    box.innerHTML = `<input class="np-pop-in" placeholder="Buscar ou criar…" autocomplete="off"><div class="np-opts"></div>${chosen.size ? `<button type="button" class="np-opt np-clear" data-clear>${icon("x", 14)} Limpar</button>` : ""}`;
    draw();
    box.hidden = false;
    const r = anchor.getBoundingClientRect();
    const b = el.querySelector(".np").getBoundingClientRect();
    box.style.left = `${Math.max(6, Math.min(r.left - b.left, b.width - 270))}px`;
    box.style.top = `${r.bottom - b.top + 4}px`;
    const input = box.querySelector(".np-pop-in");
    if (!keep) input.focus();
    input.addEventListener("input", () => draw(input.value));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") return closePop();
      if (e.key === "Enter") {
        e.preventDefault();
        const first = box.querySelector(".np-opt[data-opt]");
        if (first) pick(first.dataset.opt);
      }
    });
  }

  // --- Adicionar propriedade: nomes já usados na biblioteca, ou um nome novo com a escolha do tipo ------------------------------------
  function sampleOf(key) {
    for (const f of vault.markdownFiles()) {
      const v = ((getMeta(f) || {}).frontmatter || {})[key];
      if (v !== undefined && v !== "") return v;
    }
    return "";
  }

  function createProperty(key, type) {
    const k = String(key).trim().replace(/[:\n]/g, "");
    if (!k) return;
    if (k in fm()) return toast("Essa propriedade já existe nesta nota.", "info");
    closePop();
    if (!types?.get(k)) types?.set(k, type);
    write((s) => withNewProperty(s, k, type));
    setTimeout(render, 0);
  }

  // Adicionar propriedade, em linha: o nome digitado sugere o tipo (que pode ser trocado por um botão), e as chaves já
  // usadas na biblioteca aparecem como sugestões. Enter cria; Esc cancela. Ícone e opções ficam no editor (menu da chave).
  function openAdd() {
    const start = el.querySelector("[data-start]");
    if (!start) return;
    const data = fm();
    const existing = allKeys().filter((k) => !(k in data));
    const row = document.createElement("div");
    row.className = "np-newrow";
    row.innerHTML = `
      <div class="np-nr-top">
        <input class="np-in np-nr-name" placeholder="Nome da propriedade" autocomplete="off" aria-label="Nome da propriedade">
        <button type="button" class="np-btn primary np-nr-ok" disabled>Adicionar</button>
        <button type="button" class="np-btn np-nr-cancel">Cancelar</button>
      </div>
      <div class="np-nr-sugs"></div>
      <div class="np-nr-types" role="group" aria-label="Tipo da propriedade"></div>`;
    start.replaceWith(row);
    const input = row.querySelector(".np-nr-name");
    let type = "text";
    let typeChosen = false;

    const drawTypes = () => {
      row.querySelector(".np-nr-types").innerHTML = Object.keys(TYPE_NAMES)
        .map((t) => `<button type="button" class="np-nr-type${t === type ? " on" : ""}" data-nr-type="${t}" aria-pressed="${t === type}">${icon(TYPE_ICONS[t], 14)}<span>${TYPE_NAMES[t]}</span></button>`)
        .join("");
    };
    const draw = () => {
      const q = input.value.trim();
      const f = q.toLowerCase();
      if (!typeChosen) type = q ? guessType(q) : "text";
      drawTypes();
      row.querySelector(".np-nr-sugs").innerHTML = existing
        .filter((k) => f && k.toLowerCase().includes(f) && k.toLowerCase() !== f)
        .slice(0, 6)
        .map((k) => `<button type="button" class="np-nr-sug" data-nr-sug="${escapeHtml(k)}">${escapeHtml(k)}</button>`)
        .join("");
      row.querySelector(".np-nr-ok").disabled = !q;
    };
    const create = (key, kind) => {
      const k = String(key).trim();
      if (!k) return;
      createProperty(k, kind);
    };
    const confirmTyped = () => {
      const q = input.value.trim();
      if (!q) return;
      const known = existing.find((k) => k.toLowerCase() === q.toLowerCase());
      create(known || q, known ? types?.get(known) || resolveType(known, sampleOf(known), usage(known)) : type);
    };

    input.addEventListener("input", draw);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        confirmTyped();
      } else if (e.key === "Escape") {
        e.preventDefault();
        render();
      }
    });
    row.addEventListener("click", (e) => {
      const t = e.target.closest("[data-nr-type]");
      if (t) {
        type = t.dataset.nrType;
        typeChosen = true;
        drawTypes();
        input.focus();
        return;
      }
      const sug = e.target.closest("[data-nr-sug]");
      if (sug) {
        const k = sug.dataset.nrSug;
        return create(k, types?.get(k) || resolveType(k, sampleOf(k), usage(k)));
      }
      if (e.target.closest(".np-nr-ok")) return confirmTyped();
      if (e.target.closest(".np-nr-cancel")) render();
    });
    draw();
    input.focus();
  }

  // --- Editor da propriedade: nome, tipo, ícone e valores --------------------------------------------------------------------
  const HAS_OPTIONS = (t) => t === "select" || t === "list";

  function openEditor(draft, anchorEl = null) {
    const box = el.querySelector(".np-pop");
    if (!box) return;
    pop = { edit: true, draft };
    const d = draft;
    const iconGrid = ICON_CHOICES.map((n) => `<button type="button" class="np-ico${(d.icon || TYPE_ICONS[d.type]) === n ? " on" : ""}" data-pick-icon="${n}" title="${n}" aria-label="Ícone ${n}">${icon(n, 16)}</button>`).join("");
    const opts = d.options
      .map((o, i) => `<div class="np-oprow"><button type="button" class="np-dot c${o.color}" data-opt-color="${i}" title="Trocar a cor" aria-label="Trocar a cor"></button><input class="np-in np-opname" data-opt-name="${i}" value="${escapeHtml(o.name)}" autocomplete="off"><button type="button" class="np-x" data-opt-del="${i}" aria-label="Remover valor">${icon("x", 12)}</button></div>`)
      .join("");
    box.innerHTML = `<div class="np-editor"><label>Nome<input class="np-in np-ed-name" value="${escapeHtml(d.name)}" placeholder="Nome da propriedade" autocomplete="off"></label><label>Tipo<select class="np-in np-ed-type">${Object.entries(TYPE_NAMES).map(([t, n]) => `<option value="${t}"${t === d.type ? " selected" : ""}>${n}</option>`).join("")}</select></label><div class="np-lbl">Ícone</div><div class="np-icons">${iconGrid}</div>${HAS_OPTIONS(d.type) ? `<div class="np-lbl">Valores</div><div class="np-ops">${opts}</div><input class="np-in np-opnew" placeholder="Adicionar valor e Enter" autocomplete="off">` : ""}<div class="np-actions"><button type="button" class="np-btn primary" data-ed-save>${d.mode === "create" ? "Criar propriedade" : "Salvar"}</button><button type="button" class="np-btn" data-ed-cancel>Cancelar</button></div></div>`;
    box.classList.add("wide");
    box.hidden = false;
    const ref = anchorEl || el.querySelector("[data-start]");
    const r = ref.getBoundingClientRect();
    const b = el.querySelector(".np").getBoundingClientRect();
    box.style.left = `${Math.max(6, Math.min(r.left - b.left, b.width - 330))}px`;
    box.style.top = `${r.bottom - b.top + 4}px`;
    box.querySelector(".np-ed-name").focus();
  }

  function saveEditor() {
    const d = pop?.draft;
    if (!d) return;
    const name = d.name.trim().replace(/[:\n]/g, "");
    if (!name) return toast("Dê um nome à propriedade.", "info");
    const options = d.options.filter((o) => o.name.trim()).map((o) => ({ name: o.name.trim(), color: o.color }));
    const patch = { icon: d.icon || "", options };
    if (d.mode === "create") {
      if (name in fm()) return toast("Essa propriedade já existe nesta nota.", "info");
      closePop();
      types?.set(name, d.type);
      meta?.set(name, patch);
      write((s) => withNewProperty(s, name, d.type));
      return void setTimeout(render, 0);
    }
    const key = d.key;
    closePop();
    let cur = key;
    if (name !== key) {
      if (name in fm()) toast("Já existe uma propriedade com esse nome.", "info");
      else {
        if (types?.get(key)) types.set(name, types.get(key));
        meta?.set(name, metaOf(key));
        write((s) => renameProperty(s, key, name));
        cur = name;
      }
    }
    meta?.set(cur, patch);
    if (d.origType !== d.type) changeType(cur, d.type);
    else {
      types?.set(cur, d.type);
      render();
    }
  }

  function editorClick(t) {
    const d = pop?.draft;
    if (!d) return false;
    const sync = () => {
      const box = el.querySelector(".np-pop");
      d.name = box.querySelector(".np-ed-name")?.value ?? d.name;
      box.querySelectorAll("[data-opt-name]").forEach((inp) => {
        const o = d.options[Number(inp.dataset.optName)];
        if (o) o.name = inp.value;
      });
    };
    const ico = t.closest("[data-pick-icon]");
    if (ico) {
      sync();
      d.icon = ico.dataset.pickIcon;
      openEditor(d);
      return true;
    }
    const col = t.closest("[data-opt-color]");
    if (col) {
      sync();
      const o = d.options[Number(col.dataset.optColor)];
      o.color = (o.color + 1) % 6;
      openEditor(d);
      return true;
    }
    const del = t.closest("[data-opt-del]");
    if (del) {
      sync();
      d.options.splice(Number(del.dataset.optDel), 1);
      openEditor(d);
      return true;
    }
    if (t.closest("[data-ed-save]")) {
      sync();
      saveEditor();
      return true;
    }
    if (t.closest("[data-ed-cancel]")) {
      closePop();
      return true;
    }
    return false;
  }

  function closePop() {
    pop = null;
    const box = el.querySelector(".np-pop");
    if (box) {
      box.hidden = true;
      box.classList.remove("wide");
    }
  }

  function pick(value) {
    if (!pop) return;
    const { key, type } = pop;
    const cur = fm()[key];
    if (type === "select") {
      closePop();
      return setValue(key, cur === value ? "" : value);
    }
    const arr = Array.isArray(cur) ? cur.map(String) : cur ? [String(cur)] : [];
    setValue(key, arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value]);
  }

  // --- Menu da propriedade ---------------------------------------------------------------------------------------------
  function keyMenu(btn, e) {
    const key = btn.dataset.keyMenu;
    const type = btn.dataset.type;
    const r = btn.getBoundingClientRect();
    showContextMenu(e.clientX || r.left, e.clientY || r.bottom, [
      { label: "Editar propriedade…", icon: "sliders", run: () => openEditor({ mode: "edit", key, name: key, type, origType: type, icon: metaOf(key).icon || "", options: (metaOf(key).options || []).map((o) => ({ ...o })) }, btn) },
      { label: "Renomear…", icon: "edit", run: () => renameKey(key) },
      {
        label: "Tipo da propriedade",
        icon: TYPE_ICONS[type],
        items: Object.entries(TYPE_NAMES).map(([t, n]) => ({ label: n, icon: TYPE_ICONS[t], checked: t === type, run: () => changeType(key, t) })),
      },
      { sep: true },
      { label: "Remover da nota", icon: "trash", danger: true, run: () => write((s) => removeProperty(s, key)) },
    ]);
  }

  function renameKey(key) {
    const row = el.querySelector(`[data-row="${CSS.escape(key)}"] .np-key span`);
    if (!row) return;
    const input = document.createElement("input");
    input.className = "np-in np-rename";
    input.value = key;
    row.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const next = input.value.trim().replace(/[:\n]/g, "");
      if (commit && next && next !== key) {
        if (next in fm()) toast("Já existe uma propriedade com esse nome.", "info");
        else {
          if (types?.get(key)) types.set(next, types.get(key));
          write((s) => renameProperty(s, key, next));
        }
      }
      render();
    };
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") finish(true);
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  }

  function changeType(key, type) {
    types?.set(key, type);
    write((s) => {
      const converted = convertValue(type, fm()[key]);
      if (converted === "" || (Array.isArray(converted) && !converted.length)) {
        // sem valor para guardar: a chave continua, vazia, no tipo novo
        return withNewProperty(removeProperty(s, key), key, type === "list" ? "list" : "text");
      }
      return setProperty(s, key, converted);
    });
    render();
  }

  // --- Eventos ------------------------------------------------------------------------------------------------------------
  const editingValue = () => !!document.activeElement?.closest?.(".np-row, .np-pop") && document.activeElement.matches("input");

  const onClick = (e) => {
    const t = e.target;
    if (t.closest(".np-head")) {
      collapsed = !collapsed;
      closePop();
      return render();
    }
    if (pop?.edit && t.closest(".np-pop")) return void editorClick(t);
    const cz = t.closest("[data-customize]");
    if (cz) {
      const name = cz.dataset.customize;
      return openEditor({ mode: "create", key: "", name, type: guessType(name), icon: "", options: [] });
    }
    const km = t.closest("[data-key-menu]");
    if (km) return keyMenu(km, e);
    const opener = t.closest("[data-open-opts]");
    if (opener && !t.closest("[data-del-item]")) {
      if (pop && pop.key === opener.dataset.openOpts) return closePop();
      return openOptions(opener.dataset.openOpts, opener.dataset.type);
    }
    const opt = t.closest("[data-opt]");
    if (opt) return pick(opt.dataset.opt);
    if (t.closest("[data-clear]")) {
      const key = pop?.key;
      closePop();
      return key ? setValue(key, "") : undefined;
    }
    if (t.closest("[data-start]")) return pop?.add ? closePop() : openAdd();
    const addKey = t.closest("[data-add-key]");
    if (addKey) return createProperty(addKey.dataset.addKey, addKey.dataset.addType);
    const createType = t.closest("[data-create-type]");
    if (createType) return createProperty(createType.dataset.createKey, createType.dataset.createType);
    const delItem = t.closest("[data-del-item]");
    if (delItem) {
      const key = delItem.dataset.key;
      const cur = fm()[key] || [];
      return setValue(key, cur.filter((_, i) => i !== Number(delItem.dataset.delItem)));
    }
    if (pop && !t.closest(".np-pop")) closePop();
  };

  const onChange = (e) => {
    const t = e.target;
    if (pop?.edit && t.matches(".np-ed-type")) {
      const d = pop.draft;
      d.name = el.querySelector(".np-ed-name")?.value ?? d.name;
      el.querySelectorAll("[data-opt-name]").forEach((inp) => {
        const o = d.options[Number(inp.dataset.optName)];
        if (o) o.name = inp.value;
      });
      d.type = t.value;
      return openEditor(d);
    }
    if (pop?.edit && t.closest(".np-pop")) return;
    const key = t.dataset?.key;
    if (!key) return;
    if (t.matches(".np-check")) return setValue(key, t.checked);
    if (t.matches(".np-in")) setValue(key, parseInput(t.dataset.type || "text", t.value));
  };

  const onKey = (e) => {
    if (pop?.edit && e.target.closest?.(".np-pop")) {
      e.stopPropagation();
      if (e.key === "Escape") return closePop();
      if (e.key === "Enter" && e.target.matches(".np-opnew")) {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v && !pop.draft.options.some((o) => o.name === v)) {
          pop.draft.name = el.querySelector(".np-ed-name")?.value ?? pop.draft.name;
          pop.draft.options.push({ name: v, color: pop.draft.options.length % 6 });
          openEditor(pop.draft);
          el.querySelector(".np-opnew")?.focus();
        }
        return;
      }
      if (e.key === "Enter" && e.target.matches(".np-ed-name")) {
        e.preventDefault();
        return el.querySelector("[data-ed-save]")?.click();
      }
      return;
    }
    if (e.target.closest?.(".np-pop")) return;
    if (e.key === "Enter" && e.target.matches("input")) {
      e.preventDefault();
      e.target.blur();
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open-opts]")) {
      e.preventDefault();
      openOptions(e.target.dataset.openOpts, e.target.dataset.type);
    }
    if (e.key === "Escape") {
      if (pop) closePop();
    }
    e.stopPropagation(); // o editor de blocos não deve tratar teclas digitadas aqui
  };

  el.addEventListener("click", onClick);
  el.addEventListener("change", onChange);
  el.addEventListener("keydown", onKey);
  const unsub = vault.on("modify", (f) => {
    if (f.path !== path || editingValue()) return;
    render();
  });
  render();

  return {
    refresh: () => {
      if (!editingValue()) render();
    },
    destroy() {
      destroyed = true;
      unsub();
      el.removeEventListener("click", onClick);
      el.removeEventListener("change", onChange);
      el.removeEventListener("keydown", onKey);
      el.innerHTML = "";
    },
  };
}
