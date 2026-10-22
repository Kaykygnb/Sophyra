import test from "node:test";
import assert from "node:assert/strict";
import { addTableNode, emptyCanvas, addEdge, serializeCanvas, parseCanvas } from "../src/canvas.js";
import { tablesOf, relationsOf, validateDiagram, toDBML, toSQL, toAgentSchema, readAgentSchema, applySchema, ident } from "../src/dbdiagram.js";

function sample() {
  const d = emptyCanvas();
  const u = addTableNode(d, { x: 0, y: 0, name: "Usuários" });
  u.fields.push({ name: "nome", type: "texto", pk: false, nn: true });
  const p = addTableNode(d, { x: 400, y: 0, name: "Pedidos" });
  p.fields.push({ name: "usuario_id", type: "inteiro", pk: false, nn: false });
  addEdge(d, u.id, p.id, { label: "1:N" });
  const e = d.edges[0];
  Object.assign(e, { fromField: "id", toField: "usuario_id", cardinality: "1:N" });
  return d;
}

test("Tabelas e relações saem do canvas com nomes e campos", () => {
  const d = sample();
  assert.deepEqual(tablesOf(d).map((t) => t.name), ["Usuários", "Pedidos"]);
  assert.deepEqual(relationsOf(d)[0].from, { table: "Usuários", field: "id" });
  assert.equal(relationsOf(d)[0].to.field, "usuario_id");
});

test("Validação: tabela sem chave, nome repetido e relação com campo inexistente", () => {
  const d = sample();
  assert.equal(validateDiagram(d).length, 0, "tabela nova já nasce com chave id");
  d.nodes.forEach((n) => { if (n.type === "table") n.fields[0].pk = false; });
  assert.equal(validateDiagram(d).filter((m) => /não tem chave primária/.test(m)).length, 2);
  const ok = sample();
  ok.nodes.forEach((n) => { if (n.type === "table") n.fields[0].pk = true; });
  assert.deepEqual(validateDiagram(ok), []);
  ok.edges[0].toField = "nao_existe";
  assert.match(validateDiagram(ok).join("\n"), /nao_existe/);
  const dup = sample();
  dup.nodes.push({ id: "x", type: "table", x: 0, y: 0, width: 1, height: 1, name: "usuários", fields: [] });
  assert.match(validateDiagram(dup).join("\n"), /dois|repetid|nome/);
});

test("DBML: tabelas, chave e referência 1:N", () => {
  const d = sample();
  d.nodes.forEach((n) => { if (n.type === "table") n.fields[0].pk = true; });
  const out = toDBML(d);
  assert.match(out, /Table usuarios \{\n  id int \[pk, not null\]/);
  assert.match(out, /Ref: pedidos\.usuario_id > usuarios\.id/);
});

test("SQL: CREATE TABLE e chave estrangeira com ALTER, 1:1 com UNIQUE e N:N com tabela de ligação", () => {
  const d = sample();
  d.nodes.forEach((n) => { if (n.type === "table") n.fields[0].pk = true; });
  const sql = toSQL(d);
  assert.match(sql, /CREATE TABLE usuarios \(/);
  assert.match(sql, /id INTEGER NOT NULL/);
  assert.match(sql, /ALTER TABLE pedidos ADD FOREIGN KEY \(usuario_id\) REFERENCES usuarios\(id\);/);
  d.edges[0].cardinality = "1:1";
  assert.match(toSQL(d), /UNIQUE/);
  d.edges[0].cardinality = "N:N";
  assert.match(toSQL(d), /CREATE TABLE usuarios_pedidos/);
});

test("Esquema para agentes: JSON estável e volta a ser lido sem perda", () => {
  const d = sample();
  const s = toAgentSchema(d);
  assert.equal(s.format, "sophyra.diagram");
  assert.equal(s.version, 1);
  assert.equal(s.tables[0].name, "Usuários");
  const back = readAgentSchema(JSON.stringify(s));
  assert.equal(back.ok, true, back.errors.join("; "));
  assert.equal(back.schema.relations[0].cardinality, "1:N");
});

test("Esquema lido: recusa formato, versão, tipo e relação que não existe", () => {
  const bad = readAgentSchema({ format: "outro", version: 2, tables: [{ name: "A", fields: [{ name: "x", type: "xyz" }] }], relations: [{ from: { table: "A", field: "x" }, to: { table: "B", field: "y" }, cardinality: "9:9" }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 5);
  assert.equal(readAgentSchema("{quebrado").ok, false);
});

test("Aplicar esquema: troca as tabelas e relações e mantém os outros nós", () => {
  const d = sample();
  d.nodes.push({ id: "t1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "nota" });
  const schema = readAgentSchema({ format: "sophyra.diagram", version: 1, tables: [{ name: "Clientes", fields: [{ name: "id", type: "inteiro", primaryKey: true }] }], relations: [] }).schema;
  const out = applySchema(d, schema);
  assert.deepEqual(tablesOf(out).map((t) => t.name), ["Clientes"]);
  assert.ok(out.nodes.some((n) => n.id === "t1"), "o cartão de texto continua");
  assert.equal(out.edges.length, 0);
});

test("Nome seguro: sem acento, espaços viram _", () => {
  assert.equal(ident("Data de Início!"), "data_de_inicio");
  assert.equal(ident("1ª coluna"), "_1_coluna");
});

test("Canvas: tabela e relação sobrevivem ao salvar e ler de novo", () => {
  const d = sample();
  const back = parseCanvas(serializeCanvas(d)).data;
  assert.equal(tablesOf(back).length, 2);
  assert.equal(relationsOf(back)[0].cardinality, "1:N");
});
