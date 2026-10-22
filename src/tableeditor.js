// Editor de tabela do diagrama: um diálogo com nome, campos (nome, tipo, chave, obrigatório) e relações com outras tabelas
// (campo daqui, tabela e campo de lá, cardinalidade). Tudo por listas e menus, sem digitar código.

import { icon } from "./icons.js";
import { escapeHtml } from "./markdown.js";
import { FIELD_TYPES, CARDINALITIES } from "./dbdiagram.js";

const TYPE_LABEL = { texto: "Texto", inteiro: "Número inteiro", decimal: "Decimal", data: "Data", logico: "Sim ou não", longo: "Texto longo" };
const CARD_LABEL = { "1:1": "um para um", "1:N": "um para muitos", "N:N": "muitos para muitos" };

// `table`: { name, fields, id }. `tables`: todas as tabelas do diagrama { id, name, fields }. `relations`: relações saindo
// desta tabela { fromField, toTableId, toField, cardinality }. Resolve com o resultado, ou null se a pessoa cancelar.
export function openTableEditor({ table, tables, relations = [] }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "tbl-dialog";
    const fields = (table.fields || []).map((f) => ({ ...f }));
    let rels = relations.map((r) => ({ ...r }));
    let title = table.name || "";
    const others = tables;

    const fieldOpts = (list, selected) => list.map((f) => `<option value="${escapeHtml(f.name)}"${f.name === selected ? " selected" : ""}>${escapeHtml(f.name || "(sem nome)")}</option>`).join("");
    const tableOpts = (sel) => others.map((t) => `<option value="${escapeHtml(t.id)}"${t.id === sel ? " selected" : ""}>${escapeHtml(t.name || "(sem nome)")}</option>`).join("");

    const draw = () => {
      const fieldRows = fields
        .map(
          (f, i) => `<div class="tbl-row" data-i="${i}">
            <input class="field tbl-fname" value="${escapeHtml(f.name)}" placeholder="nome do campo" aria-label="Nome do campo">
            <select class="field tbl-ftype" aria-label="Tipo">${FIELD_TYPES.map((t) => `<option value="${t}"${t === f.type ? " selected" : ""}>${TYPE_LABEL[t]}</option>`).join("")}</select>
            <label class="tbl-flag" title="Chave primária"><input type="checkbox" class="tbl-fpk" ${f.pk ? "checked" : ""}> chave</label>
            <label class="tbl-flag" title="Obrigatório"><input type="checkbox" class="tbl-fnn" ${f.nn ? "checked" : ""}> obrigatório</label>
            <button type="button" class="tbl-del" data-del-field="${i}" aria-label="Remover campo">${icon("x", 14)}</button>
          </div>`,
        )
        .join("");
      const relRows = rels
        .map(
          (r, i) => {
            const target = others.find((t) => t.id === r.toTableId) || others[0];
            return `<div class="tbl-row tbl-rel" data-r="${i}">
              <select class="field tbl-rfrom" aria-label="Campo desta tabela">${fieldOpts(fields, r.fromField)}</select>
              <span class="muted small">liga a</span>
              <select class="field tbl-rtable" aria-label="Tabela de destino">${tableOpts(target?.id)}</select>
              <select class="field tbl-rto" aria-label="Campo de destino">${fieldOpts(target?.fields || [], r.toField)}</select>
              <select class="field tbl-rcard" aria-label="Cardinalidade">${CARDINALITIES.map((c) => `<option value="${c}"${c === r.cardinality ? " selected" : ""}>${CARD_LABEL[c]}</option>`).join("")}</select>
              <button type="button" class="tbl-del" data-del-rel="${i}" aria-label="Remover relação">${icon("x", 14)}</button>
            </div>`;
          },
        )
        .join("");
      dlg.innerHTML = `
        <form method="dialog" class="tbl-form">
          <h3>Tabela</h3>
          <label class="tbl-name">Nome da tabela<input class="field tbl-tname" value="${escapeHtml(title)}" placeholder="ex.: Clientes"></label>
          <div class="tbl-section"><strong>Campos</strong><span class="muted small">Cada tabela precisa de uma chave primária.</span></div>
          <div class="tbl-list">${fieldRows || `<p class="muted small">Nenhum campo ainda.</p>`}</div>
          <button type="button" class="btn sm" data-add-field>${icon("plus", 14)} Adicionar campo</button>
          <div class="tbl-section"><strong>Relações</strong><span class="muted small">Ligue um campo desta tabela a um campo de outra.</span></div>
          <div class="tbl-list">${relRows || `<p class="muted small">Nenhuma relação.</p>`}</div>
          <button type="button" class="btn sm" data-add-rel ${fields.length && others.length ? "" : "disabled"}>${icon("plus", 14)} Adicionar relação</button>
          <p class="tbl-error" role="alert" hidden></p>
          <div class="tbl-actions">
            <button type="button" class="btn" data-cancel>Cancelar</button>
            <button type="button" class="btn primary" data-save>Salvar</button>
          </div>
        </form>`;
      bind();
    };

    const readForm = () => {
      const name = dlg.querySelector(".tbl-tname").value.trim();
      const rows = [...dlg.querySelectorAll(".tbl-row:not(.tbl-rel)")];
      const outFields = rows.map((row) => ({
        name: row.querySelector(".tbl-fname").value.trim(),
        type: row.querySelector(".tbl-ftype").value,
        pk: row.querySelector(".tbl-fpk").checked,
        nn: row.querySelector(".tbl-fnn").checked,
      }));
      const outRels = [...dlg.querySelectorAll(".tbl-rel")].map((row) => ({
        fromField: row.querySelector(".tbl-rfrom").value,
        toTableId: row.querySelector(".tbl-rtable").value,
        toField: row.querySelector(".tbl-rto").value,
        cardinality: row.querySelector(".tbl-rcard").value,
      }));
      return { name, fields: outFields, relations: outRels };
    };

    const problem = ({ name, fields: fs }) => {
      if (!name) return "Dê um nome para a tabela.";
      const seen = new Set();
      for (const f of fs) {
        if (!f.name) return "Um campo está sem nome.";
        if (seen.has(f.name.toLowerCase())) return `Há dois campos chamados “${f.name}”.`;
        seen.add(f.name.toLowerCase());
      }
      if (fs.length && !fs.some((f) => f.pk)) return "Marque pelo menos um campo como chave primária.";
      return "";
    };

    function bind() {
      dlg.querySelector("[data-add-field]").addEventListener("click", () => {
        const cur = readForm();
        title = cur.name;
        fields.splice(0, fields.length, ...cur.fields, { name: "", type: "texto", pk: false, nn: false });
        rels = cur.relations;
        draw();
      });
      dlg.querySelector("[data-add-rel]")?.addEventListener("click", () => {
        const cur = readForm();
        title = cur.name;
        fields.splice(0, fields.length, ...cur.fields);
        const first = others[0];
        rels = [...cur.relations, { fromField: fields[0]?.name || "", toTableId: first?.id || "", toField: first?.fields[0]?.name || "", cardinality: "1:N" }];
        draw();
      });
      for (const b of dlg.querySelectorAll("[data-del-field]")) {
        b.addEventListener("click", () => {
          const cur = readForm();
          title = cur.name;
          cur.fields.splice(Number(b.dataset.delField), 1);
          fields.splice(0, fields.length, ...cur.fields);
          rels = cur.relations;
          draw();
        });
      }
      for (const b of dlg.querySelectorAll("[data-del-rel]")) {
        b.addEventListener("click", () => {
          const cur = readForm();
          title = cur.name;
          cur.relations.splice(Number(b.dataset.delRel), 1);
          fields.splice(0, fields.length, ...cur.fields);
          rels = cur.relations;
          draw();
        });
      }
      // trocar a tabela de destino atualiza a lista de campos de destino
      for (const sel of dlg.querySelectorAll(".tbl-rtable")) {
        sel.addEventListener("change", () => {
          const cur = readForm();
          title = cur.name;
          const i = Number(sel.closest(".tbl-rel").dataset.r);
          const target = others.find((t) => t.id === sel.value);
          cur.relations[i].toTableId = sel.value;
          cur.relations[i].toField = target?.fields[0]?.name || "";
          fields.splice(0, fields.length, ...cur.fields);
          rels = cur.relations;
          draw();
        });
      }
      dlg.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
      dlg.querySelector("[data-save]").addEventListener("click", () => {
        const result = readForm();
        const msg = problem(result);
        const err = dlg.querySelector(".tbl-error");
        if (msg) {
          err.textContent = msg;
          err.hidden = false;
          return;
        }
        finish(result);
      });
    }

    const finish = (value) => {
      dlg.close();
      resolve(value);
    };
    dlg.addEventListener("close", () => {
      resolve(null);
      dlg.remove();
    }, { once: true });

    draw();
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector(".tbl-tname").focus();
  });
}
