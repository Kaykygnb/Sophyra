// Diagrama de banco de dados dentro do canvas. Uma tabela é um nó `table` (nome e campos); uma relação é uma aresta entre
// duas tabelas que diz de qual campo para qual campo e a cardinalidade. Daqui saem o DBML (formato do dbdiagram.io), o SQL
// e um esquema JSON documentado para agentes. Também lê esse esquema de volta, para o agente propor um diagrama que a
// pessoa importa depois de revisar. Funções puras, sem DOM.

export const FIELD_TYPES = "texto inteiro decimal data logico longo".split(" ");
export const CARDINALITIES = "1:1 1:N N:N".split(" ");
export const SCHEMA_FORMAT = "sophyra.diagram";
export const SCHEMA_VERSION = 1;

const SQL_TYPE = { texto: "VARCHAR(255)", inteiro: "INTEGER", decimal: "DECIMAL(12,2)", data: "DATE", logico: "BOOLEAN", longo: "TEXT" };
const DBML_TYPE = { texto: "varchar", inteiro: "int", decimal: "decimal", data: "date", logico: "boolean", longo: "text" };

// Nome seguro para SQL/DBML: minúsculas, sem acento, espaços e símbolos viram "_".
export const ident = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1") || "campo";

// Tabelas do canvas: { id, name, fields: [{ name, type, pk, nn }], node }.
export function tablesOf(data) {
  return (data?.nodes || [])
    .filter((n) => n.type === "table")
    .map((n) => ({
      id: n.id,
      name: String(n.name || "").trim(),
      fields: (Array.isArray(n.fields) ? n.fields : []).map((f) => ({ name: String(f?.name ?? "").trim(), type: FIELD_TYPES.includes(f?.type) ? f.type : "texto", pk: !!f?.pk, nn: !!f?.nn })),
      node: n,
    }));
}

// Relações do canvas: arestas com campo de origem e de destino entre duas tabelas. A origem é o lado "1" e o destino, o "N".
export function relationsOf(data) {
  const tables = new Map(tablesOf(data).map((t) => [t.id, t]));
  const out = [];
  for (const e of data?.edges || []) {
    const a = tables.get(e.fromNode);
    const b = tables.get(e.toNode);
    if (!a || !b || !e.fromField || !e.toField) continue;
    out.push({
      id: e.id,
      from: { table: a.name, field: e.fromField },
      to: { table: b.name, field: e.toField },
      cardinality: CARDINALITIES.includes(e.cardinality) ? e.cardinality : "1:N",
    });
  }
  return out;
}

// Problemas do diagrama, em português, para mostrar antes de exportar. Lista vazia = diagrama válido.
export function validateDiagram(data) {
  const issues = [];
  const tables = tablesOf(data);
  const names = new Set();
  for (const t of tables) {
    if (!t.name) issues.push("Uma tabela está sem nome.");
    else if (names.has(t.name.toLowerCase())) issues.push(`Há duas tabelas com o nome “${t.name}”.`);
    names.add(t.name.toLowerCase());
    const fieldNames = new Set();
    for (const f of t.fields) {
      if (!f.name) issues.push(`A tabela “${t.name || "sem nome"}” tem um campo sem nome.`);
      else if (fieldNames.has(f.name.toLowerCase())) issues.push(`A tabela “${t.name}” tem dois campos “${f.name}”.`);
      fieldNames.add(f.name.toLowerCase());
    }
    if (t.fields.length && !t.fields.some((f) => f.pk)) issues.push(`A tabela “${t.name}” não tem chave primária.`);
  }
  const byName = new Map(tables.map((t) => [t.name, t]));
  for (const r of relationsOf(data)) {
    const a = byName.get(r.from.table);
    const b = byName.get(r.to.table);
    if (!a?.fields.some((f) => f.name === r.from.field)) issues.push(`A relação aponta para o campo “${r.from.field}” que não existe em “${r.from.table}”.`);
    if (!b?.fields.some((f) => f.name === r.to.field)) issues.push(`A relação aponta para o campo “${r.to.field}” que não existe em “${r.to.table}”.`);
  }
  return issues;
}

// DBML (dbdiagram.io). Relação 1:N vira `Ref: muitos.campo > um.campo`; 1:1 usa `-`; N:N usa `<>`.
export function toDBML(data) {
  const lines = [];
  for (const t of tablesOf(data)) {
    lines.push(`Table ${ident(t.name)} {`);
    for (const f of t.fields) {
      const attrs = [f.pk && "pk", f.nn && "not null"].filter(Boolean);
      lines.push(`  ${ident(f.name)} ${DBML_TYPE[f.type]}${attrs.length ? ` [${attrs.join(", ")}]` : ""}`);
    }
    lines.push("}", "");
  }
  for (const r of relationsOf(data)) {
    const a = `${ident(r.from.table)}.${ident(r.from.field)}`;
    const b = `${ident(r.to.table)}.${ident(r.to.field)}`;
    const op = r.cardinality === "1:1" ? "-" : r.cardinality === "N:N" ? "<>" : ">";
    lines.push(op === ">" ? `Ref: ${b} > ${a}` : `Ref: ${a} ${op} ${b}`);
  }
  return lines.join("\n").trimEnd() + "\n";
}

// SQL. Tabelas primeiro, depois as chaves estrangeiras (ALTER TABLE), para não depender da ordem de criação.
// N:N cria uma tabela de ligação com as duas chaves.
export function toSQL(data) {
  const out = [];
  for (const t of tablesOf(data)) {
    const cols = t.fields.map((f) => `  ${ident(f.name)} ${SQL_TYPE[f.type]}${f.nn || f.pk ? " NOT NULL" : ""}`);
    const pks = t.fields.filter((f) => f.pk).map((f) => ident(f.name));
    if (pks.length) cols.push(`  PRIMARY KEY (${pks.join(", ")})`);
    out.push(`CREATE TABLE ${ident(t.name)} (\n${cols.join(",\n")}\n);`);
  }
  const types = new Map(tablesOf(data).map((t) => [t.name, t]));
  for (const r of relationsOf(data)) {
    const one = `${ident(r.from.table)}`;
    const many = `${ident(r.to.table)}`;
    if (r.cardinality === "N:N") {
      const junction = `${one}_${many}`;
      const fromType = SQL_TYPE[types.get(r.from.table)?.fields.find((f) => f.name === r.from.field)?.type] || "INTEGER";
      const toType = SQL_TYPE[types.get(r.to.table)?.fields.find((f) => f.name === r.to.field)?.type] || "INTEGER";
      out.push(
        `CREATE TABLE ${junction} (\n  ${one}_${ident(r.from.field)} ${fromType} NOT NULL,\n  ${many}_${ident(r.to.field)} ${toType} NOT NULL,\n  PRIMARY KEY (${one}_${ident(r.from.field)}, ${many}_${ident(r.to.field)}),\n  FOREIGN KEY (${one}_${ident(r.from.field)}) REFERENCES ${one}(${ident(r.from.field)}),\n  FOREIGN KEY (${many}_${ident(r.to.field)}) REFERENCES ${many}(${ident(r.to.field)})\n);`,
      );
      continue;
    }
    out.push(`ALTER TABLE ${many} ADD FOREIGN KEY (${ident(r.to.field)}) REFERENCES ${one}(${ident(r.from.field)});`);
    if (r.cardinality === "1:1") out.push(`ALTER TABLE ${many} ADD CONSTRAINT ${many}_${ident(r.to.field)}_unico UNIQUE (${ident(r.to.field)});`);
  }
  return out.join("\n\n") + "\n";
}

// Esquema para agentes: JSON estável, em inglês, com a versão do formato. É o que o agente lê e o que ele pode propor.
export function toAgentSchema(data) {
  return {
    format: SCHEMA_FORMAT,
    version: SCHEMA_VERSION,
    tables: tablesOf(data).map((t) => ({
      name: t.name,
      fields: t.fields.map((f) => ({ name: f.name, type: f.type, primaryKey: f.pk, required: f.nn })),
    })),
    relations: relationsOf(data).map((r) => ({ from: { table: r.from.table, field: r.from.field }, to: { table: r.to.table, field: r.to.field }, cardinality: r.cardinality })),
  };
}

// Lê um esquema recebido (de um agente ou de um arquivo). Devolve { ok, errors, schema } com o esquema normalizado.
export function readAgentSchema(input) {
  const errors = [];
  const obj = typeof input === "string" ? safeJson(input, errors) : input;
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return { ok: false, errors: [...errors, "O esquema precisa ser um objeto JSON."], schema: null };
  if (obj.format !== SCHEMA_FORMAT) errors.push(`O campo "format" precisa ser "${SCHEMA_FORMAT}".`);
  if (obj.version !== SCHEMA_VERSION) errors.push(`A versão precisa ser ${SCHEMA_VERSION}.`);
  const tables = Array.isArray(obj.tables) ? obj.tables : [];
  const names = new Set();
  const schema = { tables: [], relations: [] };
  for (const t of tables) {
    const name = String(t?.name ?? "").trim();
    if (!name) errors.push("Uma tabela está sem nome.");
    if (names.has(name)) errors.push(`Tabela repetida: “${name}”.`);
    names.add(name);
    const fields = (Array.isArray(t?.fields) ? t.fields : []).map((f) => {
      const type = FIELD_TYPES.includes(f?.type) ? f.type : null;
      if (!type) errors.push(`Tipo de campo inválido em “${name}”: “${f?.type}”. Use um de: ${FIELD_TYPES.join(", ")}.`);
      return { name: String(f?.name ?? "").trim(), type: type || "texto", pk: !!f?.primaryKey, nn: !!f?.required };
    });
    schema.tables.push({ name, fields });
  }
  const find = (tname, fname) => schema.tables.find((t) => t.name === tname)?.fields.some((f) => f.name === fname);
  for (const r of Array.isArray(obj.relations) ? obj.relations : []) {
    if (!CARDINALITIES.includes(r?.cardinality)) errors.push(`Cardinalidade inválida: “${r?.cardinality}”. Use 1:1, 1:N ou N:N.`);
    if (!find(r?.from?.table, r?.from?.field)) errors.push(`Relação aponta para “${r?.from?.table}.${r?.from?.field}”, que não existe.`);
    if (!find(r?.to?.table, r?.to?.field)) errors.push(`Relação aponta para “${r?.to?.table}.${r?.to?.field}”, que não existe.`);
    schema.relations.push({ from: { table: r?.from?.table, field: r?.from?.field }, to: { table: r?.to?.table, field: r?.to?.field }, cardinality: r?.cardinality });
  }
  return { ok: errors.length === 0, errors, schema: errors.length ? null : schema };
}

function safeJson(text, errors) {
  try {
    return JSON.parse(text);
  } catch (err) {
    errors.push(`JSON inválido: ${err.message}`);
    return null;
  }
}

// Troca o diagrama do canvas pelo esquema lido, mantendo os outros nós. As tabelas novas são dispostas em grade.
export function applySchema(data, schema, { step = 320, columns = 3 } = {}) {
  const keep = (data.nodes || []).filter((n) => n.type !== "table");
  const keepEdges = (data.edges || []).filter((e) => !e.fromField && !e.toField);
  const nodes = [...keep];
  const ids = new Map();
  schema.tables.forEach((t, i) => {
    const id = `t${Date.now().toString(36)}${i}`;
    ids.set(t.name, id);
    nodes.push({ id, type: "table", x: (i % columns) * step, y: Math.floor(i / columns) * step, width: 260, height: 40 + t.fields.length * 26 + 20, name: t.name, fields: t.fields });
  });
  const edges = [...keepEdges];
  for (const r of schema.relations) {
    edges.push({ id: `r${Date.now().toString(36)}${edges.length}`, fromNode: ids.get(r.from.table), toNode: ids.get(r.to.table), fromField: r.from.field, toField: r.to.field, cardinality: r.cardinality, label: r.cardinality });
  }
  return { ...data, nodes, edges };
}
