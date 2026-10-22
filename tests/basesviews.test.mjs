import test from "node:test";
import assert from "node:assert/strict";
import { VIEW_TYPES, VIEW_NAMES, BASE_TEMPLATES, templateBase, timelineItems, parseBase, serializeBase, makeView, defaultBase, readDate, inferType, monthGrid, totalsOf, linkTargets, coerce, collectRows, valueOf, PROP_TYPES, parseFormula, evalFormula, checkFormula, applyFormulas, availableKeys } from "../src/bases.js";

const row = (name, props) => ({ name, path: `${name}.md`, folder: "", props, ...props });

test("Visões: galeria e cronograma existem e têm nome", () => {
  assert.ok(VIEW_TYPES.includes("gallery") && VIEW_TYPES.includes("timeline"));
  assert.equal(VIEW_NAMES.gallery, "Galeria");
  assert.equal(VIEW_NAMES.timeline, "Cronograma");
  assert.equal(makeView("timeline").endKey, "");
});

test("Cronograma: barra vai do início ao fim e nota sem início fica de fora", () => {
  const rows = [
    row("A", { inicio: "2026-03-01", fim: "2026-03-10" }),
    row("B", { inicio: "2026-03-05" }),
    row("C", { fim: "2026-03-09" }),
    row("D", { inicio: "não é data" }),
  ];
  const tl = timelineItems(rows, "inicio", "fim");
  assert.deepEqual(tl.items.map((i) => i.row.name), ["A", "B"]);
  assert.equal(tl.items[0].end - tl.items[0].start, 9, "dez dias de A");
  assert.equal(tl.items[1].end, tl.items[1].start, "B sem fim vira um dia só");
  assert.equal(tl.span, tl.max - tl.min + 1);
});

test("Cronograma: fim antes do início vira um dia só e lista vazia não quebra", () => {
  const tl = timelineItems([row("X", { i: "2026-05-10", f: "2026-05-01" })], "i", "f");
  assert.equal(tl.items[0].end, tl.items[0].start);
  const empty = timelineItems([], "i", "f");
  assert.equal(empty.items.length, 0);
  assert.equal(empty.span, 1);
});

test("Cronograma: lista de vários tipos de data (a primeira vale)", () => {
  const tl = timelineItems([row("L", { i: ["2026-01-02", "2026-09-09"] })], "i");
  assert.equal(tl.items.length, 1);
});

test("Bases: galeria, cronograma e a data de fim voltam iguais do arquivo", () => {
  const base = {
    source: { folder: "", tag: "" },
    props: {},
    views: [
      { ...makeView("gallery", "Capas"), columns: ["status"] },
      { ...makeView("timeline", "Prazos"), dateKey: "inicio", endKey: "fim" },
    ],
  };
  const { base: back, error } = parseBase(serializeBase(base));
  assert.equal(error, null);
  assert.equal(back.views[0].type, "gallery");
  assert.equal(back.views[1].type, "timeline");
  assert.equal(back.views[1].endKey, "fim");
  assert.equal(back.views[1].dateKey, "inicio");
});

test("Bases: arquivo antigo sem endKey continua válido", () => {
  const old = JSON.stringify({ views: [{ id: "v1", name: "Calendário", type: "calendar", dateKey: "prazo" }] });
  const { base } = parseBase(old);
  assert.equal(base.views[0].endKey, "");
  assert.equal(defaultBase().views[0].type, "table");
});

test("Datas: DD/MM/AAAA e DD/MM/AA contam como data, data inválida não", () => {
  assert.equal(readDate("25/12/2026"), "2026-12-25");
  assert.equal(readDate("5/3/26"), "2026-03-05");
  assert.equal(readDate("2026-12-25"), "2026-12-25");
  assert.equal(readDate("31/02/2026"), "", "dia que não existe");
  assert.equal(readDate("abc"), "");
  assert.equal(inferType([{ props: { prazo: "25/12/2026" } }, { props: { prazo: "2026-01-02" } }], "prazo"), "date");
});

test("Cronograma e grade aceitam DD/MM/AAAA", () => {
  const tl = timelineItems([row("A", { i: "01/03/2026", f: "10/03/2026" })], "i", "f");
  assert.equal(tl.items.length, 1);
  assert.equal(tl.items[0].end - tl.items[0].start, 9);
  assert.ok(monthGrid(2026, 2, [row("B", { prazo: "05/03/2026" })], "prazo").length > 0);
});

test("Totais: soma, média e contagem só para o que faz sentido", () => {
  const rows = [row("A", { valor: 10, nome: "x" }), row("B", { valor: 20 }), row("C", { valor: "" })];
  const t = totalsOf(rows, { valor: "soma", nome: "contagem", texto: "soma" }, { valor: "number" });
  assert.deepEqual(t.valor, { kind: "soma", value: 30 });
  assert.deepEqual(t.nome, { kind: "contagem", value: 1 });
  assert.equal(t.texto.value, null, "soma de coluna sem números não mostra valor");
  assert.equal(totalsOf(rows, { valor: "media" }, { valor: "number" }).valor.value, 15);
});

test("Totais: o que não é total válido some ao ler a visão", () => {
  const { base } = parseBase(JSON.stringify({ views: [{ id: "v1", name: "T", type: "table", totals: { valor: "soma", x: "nada", "": "soma" } }] }));
  assert.deepEqual(base.views[0].totals, { valor: "soma" });
});

test("Relação: lê os links internos [[Nota]], com alias e seção, e ignora o resto", () => {
  assert.deepEqual(linkTargets("[[Alfa]]"), ["Alfa"]);
  assert.deepEqual(linkTargets(["[[Alfa|apelido]]", "[[Beta#Seção]]", "sem link"]), ["Alfa", "Beta"]);
  assert.deepEqual(linkTargets(["[[Alfa]]", "[[Alfa]]"]), ["Alfa"], "não repete");
  assert.deepEqual(linkTargets(42), []);
});

test("Relação: texto digitado vira links; uma nota vira texto, várias viram lista", () => {
  assert.equal(coerce("relacao", "Alfa"), "[[Alfa]]");
  assert.equal(coerce("relacao", "[[Alfa]]"), "[[Alfa]]");
  assert.deepEqual(coerce("relacao", "Alfa, [[Beta]]"), ["[[Alfa]]", "[[Beta]]"]);
  assert.equal(coerce("relacao", "  "), "");
});

test("Ligações de entrada: quantas notas apontam para cada nota, contadas no cofre todo", () => {
  const files = [
    { path: "Projetos/Alfa.md", content: "# Alfa" },
    { path: "Tarefas/t1.md", content: "[[Alfa]] e [[Alfa|x]]" },
    { path: "Tarefas/t2.md", content: "veja [[alfa]]" },
    { path: "Notas/n.md", content: "[[Beta]]" },
  ];
  const rows = collectRows(files, {}, (f) => ({ frontmatter: {}, tags: [] }));
  const alfa = rows.find((r) => r.name === "Alfa");
  assert.equal(alfa.backlinks, 2, "t1 e t2 apontam, mesmo com maiúscula diferente");
  assert.equal(rows.find((r) => r.name === "t1").backlinks, 0);
  assert.equal(valueOf(alfa, "file.backlinks"), 2);
  assert.equal(inferType([{ props: {}, backlinks: 2 }], "file.backlinks"), "number");
});

test("Pessoa: texto livre, sem conta; o tipo vale quando a base define", () => {
  assert.equal(coerce("pessoa", " Maria "), "Maria");
  assert.ok(PROP_TYPES.includes("pessoa") && PROP_TYPES.includes("relacao"));
});

test("Fórmulas: precedência, parênteses, sinal e funções", () => {
  const calc = (src, vars = {}) => evalFormula(parseFormula(src), (n) => (n in vars ? vars[n] : null));
  assert.equal(calc("2 + 3 * 4"), 14);
  assert.equal(calc("(2 + 3) * 4"), 20);
  assert.equal(calc("-2 * 3"), -6);
  assert.equal(calc("preco * quantidade", { preco: 10, quantidade: 3 }), 30);
  assert.equal(calc('"preço total" / 2', { "preço total": 9 }), 4.5);
  assert.equal(calc("soma(1, 2, 3)"), 6);
  assert.equal(calc("media(2, 4)"), 3);
  assert.equal(calc("arred(2.345, 2)"), 2.35);
  assert.equal(calc("arred(7.6)"), 8);
  assert.equal(calc("1,5 + 1"), 2.5, "vírgula decimal");
});

test("Fórmulas: vazio dá vazio, divisão por zero dá vazio, soma ignora vazios", () => {
  const calc = (src, vars = {}) => evalFormula(parseFormula(src), (n) => (n in vars ? vars[n] : null));
  assert.equal(calc("a + 1"), null, "operando vazio");
  assert.equal(calc("1 / 0"), null);
  assert.equal(calc("soma(a, 5)", {}), 5, "soma ignora o que está vazio");
  assert.equal(calc("media(a)"), null);
});

test("Fórmulas: erros de digitação têm mensagem clara e não executam nada", () => {
  assert.equal(checkFormula("2 +").ok, false);
  assert.match(checkFormula("2 +").error, /termina/);
  assert.match(checkFormula("(2 + 3").error, /parêntese/);
  assert.match(checkFormula("2 3").error, /Sobrou/);
  assert.match(checkFormula("apagar(x)").error, /Função desconhecida/);
  assert.match(checkFormula("2 ; 3").error, /Não entendi/);
  assert.equal(checkFormula("preco * 2").ok, true);
  assert.throws(() => parseFormula(""), /vazia/);
});

test("Fórmulas: aplicadas às linhas, com a propriedade lendo o valor calculado", () => {
  const rows = [
    { name: "a", path: "a.md", props: { preco: "10", quantidade: "3" }, tags: [] },
    { name: "b", path: "b.md", props: { preco: "5" }, tags: [] },
  ];
  applyFormulas(rows, { total: { type: "formula", expr: "preco * quantidade" } });
  assert.equal(valueOf(rows[0], "total"), 30);
  assert.equal(valueOf(rows[1], "total"), null, "sem quantidade, a célula fica vazia");
});

test("Fórmula inválida na base não derruba a tela", () => {
  const rows = [{ name: "a", path: "a.md", props: { x: 1 }, tags: [] }];
  applyFormulas(rows, { y: { type: "formula", expr: "x +" } });
  assert.equal(valueOf(rows[0], "y"), null);
});

test("Base: a expressão da fórmula sobrevive ao salvar e reabrir", () => {
  const b = defaultBase();
  b.props.total = { type: "formula", expr: "preco * quantidade" };
  assert.deepEqual(parseBase(serializeBase(b)).base.props.total, { type: "formula", expr: "preco * quantidade" });
});

test("Ligações de entrada: aparecem entre as colunas disponíveis", () => {
  const keys = availableKeys([{ props: { a: 1 }, backlinks: 0 }]);
  assert.ok(keys.includes("file.backlinks"));
});

test("Modelos de base: cada modelo vira uma base válida, com visões", () => {
  for (const t of BASE_TEMPLATES) {
    const b = templateBase(t.id, { folder: "Casa" });
    assert.equal(b.source.folder, "Casa");
    const back = parseBase(serializeBase(b));
    assert.equal(back.error, null, t.id);
    assert.ok(back.base.views.length >= 1, t.id);
  }
  assert.ok(BASE_TEMPLATES.length >= 5);
});

test("Modelos de base: despesas soma valores, leituras agrupa por situação, projetos tem cronograma", () => {
  const d = templateBase("despesas");
  assert.equal(d.views.find((v) => v.type === "table").totals.valor, "soma");
  assert.equal(templateBase("leituras").views.find((v) => v.type === "board").groupBy, "situacao");
  assert.ok(templateBase("projetos").views.some((v) => v.type === "timeline" && v.dateKey === "prazo"));
  assert.equal(templateBase("inexistente").props && Object.keys(templateBase("inexistente").props).length, 0, "modelo desconhecido vira base em branco");
});
