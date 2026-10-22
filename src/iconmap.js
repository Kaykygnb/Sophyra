// Ícones escolhidos para pastas e notas: um mapa `caminho → nome do ícone`. Funções puras, sem DOM, para testar.
// Quando uma pasta é renomeada, todos os caminhos dentro dela mudam junto (mesma regra das abas e dos comentários).

export const fold = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function setIconFor(map, path, name) {
  if (!name) return removeIconFor(map, path);
  return { ...map, [path]: name };
}

export function removeIconFor(map, path) {
  if (!(path in map)) return map;
  const { [path]: _gone, ...rest } = map;
  return rest;
}

// Troca o caminho de uma nota ou pasta (e tudo que está dentro dela).
export function renameIcons(map, from, to) {
  if (!from || from === to) return map;
  const hit = (p) => p === from || p.startsWith(`${from}/`);
  if (!Object.keys(map).some(hit)) return map; // nada dentro de `from`: o mesmo objeto volta
  const out = {};
  for (const [p, name] of Object.entries(map)) {
    if (p === from) out[to] = name;
    else if (p.startsWith(`${from}/`)) out[`${to}${p.slice(from.length)}`] = name;
    else out[p] = name;
  }
  return out;
}

// Ícones do catálogo que combinam com a busca: o nome que começa com o texto vem antes; depois as palavras-chave.
export function searchIcons(catalog, query, limit = 120) {
  const names = Object.keys(catalog || {});
  const text = fold(query);
  if (!text) return names.slice(0, limit);
  const q = text.replace(/\s+/g, "-"); // "arrow up" acha "arrow-up"
  const scored = [];
  for (const name of names) {
    const keys = fold(catalog[name][1]);
    let score = -1;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (keys.split(" ").some((w) => w.startsWith(text))) score = 3;
    else if (keys.includes(text)) score = 4;
    if (score >= 0) scored.push([score, name]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).slice(0, limit).map((x) => x[1]);
}
