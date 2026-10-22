import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBase, serializeBase, defaultBase, makeView, collectRows, valueOf, inferType, typesFor, applyView, groupRows, monthGrid,
  rowsWithoutDate, coerce, setValue, newRowProps, newRowContent, uniquePath, columnsOf, availableKeys, optionsFor, matchesFilter,
  propertyKeys, isEmpty, VIEW_TYPES,
} from "../src/bases.js";
import { removeProperty, setProperty } from "../src/frontmatter.js";

const note = (path, fm, body = "texto") => ({ path, mtime: Date.UTC(2026, 9, 20), content: `---\n${fm}\n---\n${body}` });
const files = [
  note("Projetos/Alfa.md", "status: em andamento\nprioridade: 2\nprazo: 2026-10-30\ntags: [projeto, app]"),
  note("Projetos/Beta.md", "status: feito\nprioridade: 1\nprazo: 2026-10-05\ntags: [projeto]"),
  note("Projetos/Gama.md", "status: em andamento\nprioridade: 3\nconcluido: false"),
  note("Projetos/Delta.md", "status: a fazer\nprioridade: 2\nprazo: 2026-11-02\nconcluido: true"),
  { path: "Diário/2026-10-21.md", mtime: 0, content: "sem propriedades #diario" },
  note(".oculta/X.md", "status: feito"),
  { path: "Projetos/dados.json", mtime: 0, content: "{}" },
];
const rowsOf = (source) => collectRows(files, source);

test("Base: arquivo ilegível ou vazio vira a base padrão, e campos inválidos são limpos", () => {
  assert.equal(parseBase("").error, null);
  assert.equal(parseBase("{oops").base.views.length, 1);
  assert.ok(parseBase("{oops").error.startsWith("JSON inválido"));
  assert.ok(parseBase("[1]").error);
  const { base } = parseBase(JSON.stringify({
    source: { folder: "/Projetos/", tag: "#projeto" },
    props: { status: { type: "select", options: ["a", 3] }, x: { type: "nada" }, y: 5 },
    views: [
      { id: "a", name: " ", type: "tabela?", columns: ["status", 4], filters: [{ key: "k", op: "is", value: "v" }, { key: "k", op: "xx" }, null], sort: [{ key: "prazo", dir: "desc" }, { key: "" }], groupBy: 7 },
      { id: "a", type: "board", groupBy: "status" },
    ],
  }));
  assert.deepEqual(base.source, { folder: "Projetos", tag: "projeto" });
  assert.deepEqual(base.props.status, { type: "select", options: ["a", "3"] });
  assert.deepEqual(base.props.x, {});
  assert.equal("y" in base.props, false);
  assert.equal(base.views.length, 2);
  assert.equal(base.views[0].type, "table");
  assert.equal(base.views[0].name, "Tabela");
  assert.deepEqual(base.views[0].columns, ["status"]);
  assert.equal(base.views[0].filters.length, 1);
  assert.deepEqual(base.views[0].sort, [{ key: "prazo", dir: "desc" }]);
  assert.equal(base.views[0].groupBy, "");
  assert.notEqual(base.views[0].id, base.views[1].id, "ids repetidos são refeitos");
  assert.equal(base.views[1].type, "board");
});

test("Base: escrever e ler de volta dá a mesma base", () => {
  const b = defaultBase({ folder: "Projetos", tag: "projeto" });
  b.views.push({ ...makeView("calendar"), dateKey: "prazo" });
  const back = parseBase(serializeBase(b)).base;
  assert.deepEqual(back, b);
  assert.deepEqual(VIEW_TYPES, ["table", "list", "board", "calendar", "gallery", "timeline"]);
});

test("Linhas: pasta e etiqueta escolhem as notas; ocultas e não-notas ficam de fora", () => {
  assert.equal(rowsOf({}).length, 5);
  assert.deepEqual(rowsOf({ folder: "Projetos" }).map((r) => r.name), ["Alfa", "Beta", "Gama", "Delta"]);
  assert.deepEqual(rowsOf({ tag: "#PROJETO" }).map((r) => r.name), ["Alfa", "Beta"]);
  assert.deepEqual(rowsOf({ folder: "Projetos", tag: "app" }).map((r) => r.name), ["Alfa"]);
  assert.deepEqual(rowsOf({ tag: "diario" }).map((r) => r.name), ["2026-10-21"], "etiqueta no texto também vale");
});

test("Valores: propriedades do frontmatter e do arquivo", () => {
  const r = rowsOf({ folder: "Projetos" })[0];
  assert.equal(valueOf(r, "status"), "em andamento");
  assert.equal(valueOf(r, "prioridade"), 2);
  assert.deepEqual(valueOf(r, "tags"), ["app", "projeto"]);
  assert.equal(valueOf(r, "file.name"), "Alfa");
  assert.equal(valueOf(r, "file.folder"), "Projetos");
  assert.equal(valueOf(r, "file.mtime"), "2026-10-20");
  assert.equal(valueOf(r, "nada"), "");
  assert.equal(isEmpty([]) && isEmpty("") && !isEmpty(0) && !isEmpty(false), true);
});

test("Tipos: inferidos dos valores, e o que a base define vale mais", () => {
  const rows = rowsOf({ folder: "Projetos" });
  assert.equal(inferType(rows, "status"), "select");
  assert.equal(inferType(rows, "prioridade"), "number");
  assert.equal(inferType(rows, "prazo"), "date");
  assert.equal(inferType(rows, "concluido"), "checkbox");
  assert.equal(inferType(rows, "tags"), "list");
  assert.equal(inferType(rows, "file.name"), "text");
  assert.equal(inferType(rows, "file.mtime"), "date");
  assert.equal(inferType(rows, "inexistente"), "text");
  assert.equal(inferType(rows, "prioridade", { prioridade: { type: "text" } }), "text");
  assert.deepEqual(typesFor(rows, ["prazo", "status"]), { prazo: "date", status: "select" });
});

test("Filtros: igual, contém, vazio e comparações por tipo", () => {
  const rows = rowsOf({ folder: "Projetos" });
  const types = typesFor(rows, ["status", "prioridade", "prazo", "tags", "concluido"]);
  const names = (filters, sort = []) => applyView(rows, { ...makeView(), filters, sort }, types).map((r) => r.name);
  assert.deepEqual(names([{ key: "status", op: "is", value: "EM ANDAMENTO" }]), ["Alfa", "Gama"]);
  assert.deepEqual(names([{ key: "status", op: "isnot", value: "feito" }]), ["Alfa", "Delta", "Gama"]);
  assert.deepEqual(names([{ key: "tags", op: "contains", value: "app" }]), ["Alfa"]);
  assert.deepEqual(names([{ key: "tags", op: "is", value: "projeto" }]), ["Alfa", "Beta"], "em lista, é = tem o item");
  assert.deepEqual(names([{ key: "prazo", op: "empty" }]), ["Gama"]);
  assert.deepEqual(names([{ key: "prazo", op: "notempty" }]), ["Alfa", "Beta", "Delta"]);
  assert.deepEqual(names([{ key: "prioridade", op: "gte", value: "2" }]), ["Alfa", "Delta", "Gama"]);
  assert.deepEqual(names([{ key: "prioridade", op: "lt", value: 2 }]), ["Beta"]);
  assert.deepEqual(names([{ key: "prazo", op: "gt", value: "2026-10-10" }]), ["Alfa", "Delta"]);
  assert.deepEqual(names([{ key: "concluido", op: "is", value: "true" }]), ["Delta"]);
  assert.deepEqual(names([{ key: "concluido", op: "is", value: "false" }]), ["Alfa", "Beta", "Gama"], "sem a propriedade conta como desmarcado");
  assert.equal(matchesFilter(rows[0], { key: "nada", op: "gt", value: "1" }, "text"), false);
  assert.equal(matchesFilter(rows[0], { key: "status", op: "is", value: "" }, "select"), true, "filtro sem valor não esconde nada");
  assert.equal(names([{ key: "status", op: "contains", value: "" }]).length, 4);
});

test("Ordem: por várias chaves, estável, com vazios sempre no fim", () => {
  const rows = rowsOf({ folder: "Projetos" });
  const types = typesFor(rows, ["prazo", "prioridade", "status"]);
  const by = (sort) => applyView(rows, { ...makeView(), sort }, types).map((r) => r.name);
  assert.deepEqual(by([]), ["Alfa", "Beta", "Delta", "Gama"], "padrão: pelo nome");
  assert.deepEqual(by([{ key: "prazo", dir: "asc" }]), ["Beta", "Alfa", "Delta", "Gama"]);
  assert.deepEqual(by([{ key: "prazo", dir: "desc" }]), ["Delta", "Alfa", "Beta", "Gama"], "sem data fica no fim nas duas ordens");
  assert.deepEqual(by([{ key: "prioridade", dir: "desc" }, { key: "file.name", dir: "desc" }]), ["Gama", "Delta", "Alfa", "Beta"]);
});

test("Agrupar: opções definidas primeiro, depois a ordem de aparição, e sem valor por último", () => {
  const rows = rowsOf({ folder: "Projetos" });
  const g = groupRows(rows, "status", { status: { options: ["a fazer", "em andamento", "feito"] } });
  assert.deepEqual(g.map((x) => [x.value, x.rows.map((r) => r.name)]), [["a fazer", ["Delta"]], ["em andamento", ["Alfa", "Gama"]], ["feito", ["Beta"]], ["", []]]);
  const g2 = groupRows(rows, "prazo", {}, { withEmpty: false });
  assert.deepEqual(g2.map((x) => x.value), ["2026-10-30", "2026-10-05", "2026-11-02", ""], "o grupo sem valor aparece quando tem linhas");
  assert.deepEqual(groupRows(rows, "tags", {}).map((x) => x.value), ["app", "projeto", ""], "lista agrupa pelo primeiro item");
});

test("Calendário: grade do mês com as notas no dia da data", () => {
  const rows = rowsOf({ folder: "Projetos" });
  const weeks = monthGrid(2026, 9, rows, "prazo"); // outubro de 2026
  assert.equal(weeks[0][0].date, "2026-09-27", "começa no domingo que cobre o dia 1");
  assert.ok(weeks.every((w) => w.length === 7));
  const cells = weeks.flat();
  assert.equal(cells.filter((c) => c.inMonth).length, 31);
  assert.deepEqual(cells.find((c) => c.date === "2026-10-30").rows.map((r) => r.name), ["Alfa"]);
  assert.deepEqual(cells.find((c) => c.date === "2026-10-05").rows.map((r) => r.name), ["Beta"]);
  assert.equal(weeks.length, 5, "outubro de 2026 cabe em 5 semanas");
  assert.deepEqual(monthGrid(2026, 10, rows, "prazo").flat().find((c) => c.date === "2026-11-02").rows.map((r) => r.name), ["Delta"]);
  assert.deepEqual(rowsWithoutDate(rows, "prazo").map((r) => r.name), ["Gama"]);
  assert.equal(monthGrid(2026, 1, [], "x").length, 4, "fevereiro de 2026 cabe em 4 semanas");
});

test("Escrever: o texto digitado vira o valor certo e grava no frontmatter", () => {
  assert.equal(coerce("number", "3,5"), 3.5);
  assert.equal(coerce("number", "abc"), "");
  assert.equal(coerce("checkbox", "true"), true);
  assert.equal(coerce("checkbox", false), false);
  assert.deepEqual(coerce("list", " a, b ,, c "), ["a", "b", "c"]);
  assert.equal(coerce("text", "  oi "), "oi");
  assert.equal(coerce("date", ""), "");
  const src = "---\nstatus: a fazer\ntags: [x]\n---\ncorpo";
  assert.equal(setValue(src, "status", "feito"), "---\nstatus: feito\ntags: [x]\n---\ncorpo");
  assert.equal(setValue(src, "prioridade", 2), "---\nstatus: a fazer\ntags: [x]\nprioridade: 2\n---\ncorpo");
  assert.equal(setValue(src, "tags", ["x", "y z"]), "---\nstatus: a fazer\ntags: [x, y z]\n---\ncorpo");
  assert.equal(setValue(src, "status", ""), "---\ntags: [x]\n---\ncorpo", "valor vazio tira a propriedade");
  assert.equal(setValue(src, "file.name", "outro"), src, "propriedades do arquivo não se editam");
  assert.equal(setValue("só texto", "status", "novo"), "---\nstatus: novo\n---\nsó texto");
  assert.equal(removeProperty(setProperty("corpo", "a", 1), "a"), "corpo", "bloco vazio some");
});

test("Nova nota: nasce com o que a visão filtra, agrupa e a etiqueta da base", () => {
  const base = defaultBase({ folder: "Projetos", tag: "projeto" });
  const view = { ...makeView("board"), filters: [{ key: "status", op: "is", value: "a fazer" }, { key: "file.name", op: "is", value: "x" }, { key: "tags", op: "is", value: "app" }, { key: "n", op: "gt", value: "1" }] };
  const props = newRowProps(base, view, { prazo: "2026-10-30", "file.name": "x", vazio: "" });
  assert.deepEqual(props, { tags: ["projeto", "app"], status: "a fazer", prazo: "2026-10-30" });
  assert.equal(newRowContent(props), "---\ntags: [projeto, app]\nstatus: a fazer\nprazo: 2026-10-30\n---\n");
  assert.equal(newRowContent({}), "");
  const has = (p) => ["Projetos/Nova nota.md", "Projetos/Nova nota 2.md"].includes(p);
  assert.equal(uniquePath(has, "Projetos"), "Projetos/Nova nota 3.md");
  assert.equal(uniquePath(() => false, "", "Ideia"), "Ideia.md");
});

test("Colunas e propriedades disponíveis", () => {
  const rows = rowsOf({ folder: "Projetos" });
  assert.deepEqual(propertyKeys(rows).slice(0, 2), ["status", "prioridade"]);
  assert.deepEqual(columnsOf(makeView(), rows).slice(0, 3), ["file.name", "status", "prioridade"]);
  assert.deepEqual(columnsOf({ ...makeView(), columns: ["prazo"] }, rows), ["prazo"]);
  assert.ok(availableKeys(rows).includes("file.mtime") && availableKeys(rows).includes("concluido"));
  assert.deepEqual(optionsFor(rows, "status", { status: { options: ["backlog"] } }), ["backlog", "em andamento", "feito", "a fazer"]);
  assert.deepEqual(optionsFor(rows, "tags"), ["app", "projeto"]);
});
