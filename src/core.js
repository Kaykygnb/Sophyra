// Recursos internos que podem ser ligados e desligados (como os "core plugins" do original, onde o Canvas foi
// desligado e religado). A lista de desligados fica nas configurações; o resto é ligado por padrão.

export const CORE_FEATURES = [
  { id: "canvas", nome: "Canvas", descricao: "Quadros infinitos com cartões e setas (arquivos .canvas).", icone: "layers", view: null },
  { id: "graph", nome: "Grafo", descricao: "Mapa das ligações entre as notas.", icone: "graph", view: "@graph" },
  { id: "tasks", nome: "Tarefas", descricao: "Lista de todas as tarefas da biblioteca.", icone: "check-square", view: "@tasks" },
  { id: "tags", nome: "Tags", descricao: "Navegação pelas tags das notas.", icone: "tag", view: "@tags" },
];

const KNOWN = new Set(CORE_FEATURES.map((f) => f.id));

// Mantém só ids conhecidos, sem repetição. Dados salvos estragados viram "tudo ligado".
export function sanitizeCoreOff(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id) => typeof id === "string" && KNOWN.has(id)))];
}

export function isFeatureOn(coreOff, id) {
  return !sanitizeCoreOff(coreOff).includes(id);
}

export function setFeature(coreOff, id, on) {
  const off = new Set(sanitizeCoreOff(coreOff));
  if (!KNOWN.has(id)) return [...off];
  if (on) off.delete(id);
  else off.add(id);
  return [...off];
}

// Qual recurso é dono de uma tela (@graph → graph). Telas sem dono nunca são desligadas.
export function featureOfView(viewId) {
  return CORE_FEATURES.find((f) => f.view === viewId)?.id || null;
}

export function featureOfPath(path) {
  return /\.canvas$/i.test(String(path)) ? "canvas" : null;
}
