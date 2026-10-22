import test from "node:test";
import assert from "node:assert/strict";
import {
  splitCells, parseTable, serializeTable, emptyTable, insertRow, deleteRow, insertCol, deleteCol, setAlign, moveRow, moveCol, setCell,
  tableFromTsv, escapeCell, unescapeCell,
} from "../src/tables.js";
import { parseBlocks, serializeBlocks } from "../src/blocks.js";
import { renderMarkdown } from "../src/markdown.js";

test("Tabela: células são separadas por | sem contar o \\| nem os de fora", () => {
  assert.deepEqual(splitCells("| a | b | c |"), ["a", "b", "c"]);
  assert.deepEqual(splitCells("a | b"), ["a", "b"]);
  assert.deepEqual(splitCells("| a \\| b | c |"), ["a \\| b", "c"]);
  assert.deepEqual(splitCells("| a | |"), ["a", ""]);
  assert.deepEqual(splitCells("|a|b"), ["a", "b"]);
});

test("Tabela: lê cabeçalho, alinhamento e linhas, e completa linhas curtas", () => {
  const t = parseTable("| Nome | Qtd | Obs |\n|:--|--:|:-:|\n| maçã | 3 |\n| pera | 10 | ok | extra |\n");
  assert.deepEqual(t.header, ["Nome", "Qtd", "Obs"]);
  assert.deepEqual(t.align, ["left", "right", "center"]);
  assert.deepEqual(t.rows, [["maçã", "3", ""], ["pera", "10", "ok"]]);
  assert.equal(parseTable("só texto"), null);
  assert.equal(parseTable("| a |\n| b |"), null, "sem linha de separação não é tabela");
  assert.deepEqual(parseTable("a | b\n-|-").header, ["a", "b"]);
});

test("Tabela: escrever alinha as colunas e escapa | e quebras", () => {
  const t = { header: ["Item", "Valor"], align: ["", "right"], rows: [["a|b", "1"], ["linha" + String.fromCharCode(10) + "dois", "1000"]] };
  const out = serializeTable(t).split(String.fromCharCode(10));
  assert.equal(out[0], "| Item          | Valor |");
  assert.equal(out[1], "| ------------- | ----: |");
  assert.equal(out[2], "| a\\|b          |     1 |");
  assert.equal(out[3], "| linha<br>dois |  1000 |");
});

test("Tabela: ler e escrever de volta é estável e a tabela escrita é lida igual", () => {
  const md = "| Nome | Qtd |\n| :--- | --: |\n| maçã |   3 |\n| pera |  10 |";
  assert.equal(serializeTable(parseTable(md)), md);
  const bagunçada = "|Nome|Qtd|\n|:-|-:|\n|maçã|3|\n";
  const once = serializeTable(parseTable(bagunçada));
  assert.equal(serializeTable(parseTable(once)), once);
  assert.deepEqual(parseTable(once), parseTable(bagunçada));
});

test("Tabela: centralizado e células com acento", () => {
  const out = serializeTable({ header: ["Título"], align: ["center"], rows: [["é"]] });
  assert.equal(out, "| Título |\n| :----: |\n|   é    |");
});

test("Tabela: escapar e desfazer o escape da célula", () => {
  assert.equal(escapeCell("a|b\nc"), "a\\|b<br>c");
  assert.equal(escapeCell("já\\|escapado"), "já\\|escapado");
  assert.equal(unescapeCell("a\\|b<br>c"), "a|b\nc");
  assert.equal(unescapeCell("x<BR/>y"), "x\ny");
});

test("Tabela: linhas e colunas se inserem, apagam e movem sem alterar a original", () => {
  const t = emptyTable(2, 2);
  const before = JSON.stringify(t);
  const t1 = insertRow(t, 1);
  assert.equal(t1.rows.length, 3);
  assert.deepEqual(t1.rows[1], ["", ""]);
  assert.equal(JSON.stringify(t), before);
  assert.equal(deleteRow(t1, 1).rows.length, 2);
  assert.equal(deleteRow(t1, 9).rows.length, 3);
  const t2 = insertCol(setCell(t, 1, 0, "x"), 1);
  assert.equal(t2.header.length, 3);
  assert.deepEqual(t2.rows[0], ["x", "", ""]);
  assert.equal(t2.align.length, 3);
  const one = deleteCol(deleteCol(t2, 0), 0);
  assert.equal(one.header.length, 1);
  assert.equal(deleteCol(one, 0).header.length, 1, "a última coluna fica");
  const m = moveRow({ ...t, rows: [["a", ""], ["b", ""], ["c", ""]] }, 0, 2);
  assert.deepEqual(m.rows.map((r) => r[0]), ["b", "c", "a"]);
  const mc = moveCol({ header: ["A", "B", "C"], align: ["", "right", ""], rows: [["1", "2", "3"]] }, 0, 2);
  assert.deepEqual(mc.header, ["B", "C", "A"]);
  assert.deepEqual(mc.align, ["right", "", ""]);
  assert.deepEqual(mc.rows[0], ["2", "3", "1"]);
});

test("Tabela: alinhamento e célula do cabeçalho", () => {
  const t = setAlign(emptyTable(2, 1), 1, "right");
  assert.deepEqual(t.align, ["", "right"]);
  assert.deepEqual(setAlign(t, 5, "left").align, ["", "right"]);
  assert.deepEqual(setAlign(t, 0, "nada").align, ["", "right"]);
  assert.equal(setCell(t, 0, 0, "Novo").header[0], "Novo");
  assert.equal(setCell(t, 1, 1, "v").rows[0][1], "v");
  assert.equal(setCell(t, 9, 1, "v").rows.length, 1, "fora da tabela não muda");
});

test("Tabela: texto de planilha (tabulações) vira tabela", () => {
  const t = tableFromTsv("Nome\tQtd\nmaçã\t3\npera\t10");
  assert.deepEqual(t.header, ["Nome", "Qtd"]);
  assert.deepEqual(t.rows, [["maçã", "3"], ["pera", "10"]]);
  assert.equal(tableFromTsv("só uma linha\tcom tab"), null);
  assert.equal(tableFromTsv("sem\ntabulação"), null);
});

test("Tabela: no editor de blocos a tabela volta idêntica, mesmo curta ou com | escapado", () => {
  for (const md of ["| a |\n| --- |\n| 1 |\n", "| x | y |\n| --- | --- |\n| 1\\|2 | 3 |\n"]) {
    const b = parseBlocks(md);
    assert.equal(b[0].type, "table", md);
    assert.equal(serializeBlocks(b), md);
  }
});

test("Tabela: a leitura entende | escapado e quebra de linha na célula", () => {
  const html = renderMarkdown("| a | b |\n| --- | --- |\n| 1\\|2 | x<br>y |\n");
  assert.ok(html.includes("<td>1|2</td>"));
  assert.ok(html.includes("<td>x<br>y</td>"));
});
