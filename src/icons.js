// Biblioteca de ícones própria: SVG de traço único, grade de 24 px, traço de 1.6 e pontas arredondadas.
// Todos os ícones do app vêm daqui, para manter o mesmo peso e o mesmo estilo em qualquer tela.

const P = (d) => `<path d="${d}"/>`;
const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
const R = (x, y, w, h, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;

const FOLDER = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const FILE = "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z";

export const ICONS = {
  home: P("M3 11l9-8 9 8") + P("M5 10v10h14V10") + P("M10 20v-6h4v6"),
  folder: P(FOLDER),
  "folder-open": P("M3 8V6a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1") + P("M3 10h18l-1.6 8a2 2 0 0 1-2 1.6H6.6a2 2 0 0 1-2-1.6z"),
  "folder-plus": P(FOLDER) + P("M12 11v5M9.5 13.5h5"),
  file: P(FILE) + P("M14 3v5h5"),
  "file-plus": P(FILE) + P("M14 3v5h5") + P("M12 12v5M9.5 14.5h5"),
  "file-text": P(FILE) + P("M14 3v5h5") + P("M9 13h6M9 17h6"),
  search: C(11, 11, 7) + P("M21 21l-4.3-4.3"),
  tag: P("M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a2 2 0 0 1 0 2.8z") + C(7.5, 7.5, 1.2),
  "check-square": R(3, 3, 18, 18, 4) + P("M8 12.2l3 3 5-6"),
  graph: C(6, 12, 2.5) + C(18, 6, 2.5) + C(18, 18, 2.5) + P("M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"),
  sliders: P("M4 7h10M18 7h2M4 17h2M10 17h10") + C(16, 7, 2) + C(8, 17, 2),
  keyboard: R(2, 6, 20, 12, 2.5) + P("M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7.5 14h9"),
  plus: P("M12 5v14M5 12h14"),
  x: P("M6 6l12 12M18 6L6 18"),
  "chevron-right": P("M9 6l6 6-6 6"),
  "chevron-down": P("M6 9l6 6 6-6"),
  cursor: P("M4 3l16 7-7 2.5L10.5 20z"),
  hand: P("M8 13V6a1.5 1.5 0 0 1 3 0v5") + P("M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11") + P("M14 10.5V6.5a1.5 1.5 0 0 1 3 0V14") + P("M8 13l-1.3-1.8a1.6 1.6 0 0 0-2.6 1.9L8 19a5 5 0 0 0 4 2h1.5a5.5 5.5 0 0 0 5.5-5.5V14"),
  square: R(4, 4, 16, 16, 2),
  circle: C(12, 12, 8),
  diamond: P("M12 3l9 9-9 9-9-9z"),
  triangle: P("M12 4l9 16H3z"),
  play: P("M8 5.5v13l11-6.5z"),
  music: P("M9 18V6l10-2v12") + C(6.5, 18, 2.5) + C(16.5, 16, 2.5),
  paperclip: P("M20 11.5l-8.2 8.2a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8"),
  "mouse-pointer": P("M5 4l14 6.5-6 2-2 6z"),
  "at-sign": C(12, 12, 4) + P("M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.5 7.1"),
  "arrow-up": P("M12 19V5") + P("M6 11l6-6 6 6"),
  "arrow-up-right": P("M7 17L17 7") + P("M8 7h9v9"),
  minus: P("M5 12h14"),
  pencil: P("M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z") + P("M14.5 6.5l3 3"),
  type: P("M5 7V5h14v2") + P("M12 5v14") + P("M9 19h6"),
  sticky: P("M5 4h14v11l-5 5H5z") + P("M14 20v-5h5"),
  undo: P("M9 14L4 9l5-5") + P("M4 9h10a6 6 0 0 1 0 12h-3"),
  redo: P("M15 14l5-5-5-5") + P("M20 9H10a6 6 0 0 0 0 12h3"),
  image: R(3, 4, 18, 16, 3) + C(9, 10, 1.6) + P("M21 16l-5-5-8 8"),
  eraser: P("M8 20h12M5.5 14.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 19H7.5a2 2 0 0 1-1.4-.6l-.6-.6a2 2 0 0 1 0-2.8z") + P("M9 11l5 5"),
  grip: C(9, 6, 1.3) + C(15, 6, 1.3) + C(9, 12, 1.3) + C(15, 12, 1.3) + C(9, 18, 1.3) + C(15, 18, 1.3),
  "row-above": P("M4 14h16M4 20h16M12 3v6M9 6h6"),
  "row-below": P("M4 4h16M4 10h16M12 15v6M9 18h6"),
  "col-left": P("M14 4v16M20 4v16M3 12h6M6 9v6"),
  "col-right": P("M4 4v16M10 4v16M15 12h6M18 9v6"),
  "row-del": P("M4 5h16M4 19h16M9 12h6"),
  "col-del": P("M5 4v16M19 4v16M9 12h6"),
  "align-left": P("M4 6h16M4 10h10M4 14h16M4 18h10"),
  "align-center": P("M4 6h16M7 10h10M4 14h16M7 18h10"),
  "align-right": P("M4 6h16M10 10h10M4 14h16M10 18h10"),
  more: C(5, 12, 1.4) + C(12, 12, 1.4) + C(19, 12, 1.4),
  message: P("M4 5h16v11H9l-5 4z") + P("M8 9h8M8 12.5h5"),
  pin: P("M12 17v5") + P("M9 3h6l-1 6 3 3v2H7v-2l3-3z"),
  star: P("M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"),
  "chevrons-up": P("M7 14l5-5 5 5M7 19l5-5 5 5"),
  edit: P("M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z") + P("M13.5 6.5l4 4"),
  book: P("M12 6c-2-1.5-5-2-9-2v14c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2z") + P("M12 6v14"),
  columns: R(3, 4, 18, 16, 2.5) + P("M12 4v16"),
  gantt: R(3, 4, 18, 16, 2.5) + P("M7 8h6M11 12h7M8 16h5"),
  trash: P("M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"),
  download: P("M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"),
  upload: P("M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14"),
  link: P("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"),
  "link-broken": P("M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16"),
  terminal: P("M4 6l5 6-5 6M12 18h8"),
  sun: C(12, 12, 4) + P("M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"),
  moon: P("M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"),
  monitor: R(3, 4, 18, 12, 2) + P("M8 20h8M12 16v4"),
  "clipboard-check": R(6, 4, 12, 17, 2.5) + R(9, 2, 6, 4, 1) + P("M9.5 13.5l2 2 3.5-4"),
  puzzle: P("M10 4a2 2 0 1 1 4 0v1h4a1 1 0 0 1 1 1v4h-1a2 2 0 1 0 0 4h1v4a1 1 0 0 1-1 1h-4v-1a2 2 0 1 0-4 0v1H6a1 1 0 0 1-1-1v-4h1a2 2 0 1 0 0-4H5V6a1 1 0 0 1 1-1h4z"),
  refresh: P("M20 11a8 8 0 0 0-14-4L4 9M4 5v4h4M4 13a8 8 0 0 0 14 4l2-2M20 19v-4h-4"),
  "x-circle": C(12, 12, 9) + P("M9 9l6 6M15 9l-6 6"),
  info: C(12, 12, 9) + P("M12 11v5M12 8h.01"),
  alert: P("M12 4l9 16H3z") + P("M12 10v4M12 17h.01"),
  check: P("M5 12l5 5 9-10"),
  "check-circle": C(12, 12, 9) + P("M8.5 12.2l2.5 2.5 4.5-5"),
  bold: P("M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"),
  italic: P("M10 5h8M6 19h8M14 5l-4 14"),
  heading: P("M6 5v14M18 5v14M6 12h12"),
  quote: P("M7 8c-2 .5-3 2-3 4v4h5v-5H6c0-1 .5-1.5 1-2zM17 8c-2 .5-3 2-3 4v4h5v-5h-3c0-1 .5-1.5 1-2z"),
  code: P("M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"),
  list: P("M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"),
  menu: P("M4 7h16M4 12h16M4 17h16"),
  "panel-right": R(3, 4, 18, 16, 2.5) + P("M15 4v16"),
  "panel-left": R(3, 4, 18, 16, 2.5) + P("M9 4v16"),
  calendar: R(3, 5, 18, 16, 2.5) + P("M3 10h18M8 3v4M16 3v4"),
  hash: P("M5 9h14M4 15h14M10 4L8 20M16 4l-2 16"),
  "external-link": P("M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"),
  help: C(12, 12, 9) + P("M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"),
  outline: P("M4 7h16M7 12h13M10 17h10"),
  database: P("M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"),
  clock: C(12, 12, 9) + P("M12 7v5l3 2"),
  filter: P("M4 5h16l-6 7v6l-4 2v-8z"),
  eye: P("M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z") + C(12, 12, 3),
  copy: R(8, 8, 12, 12, 2) + P("M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"),
  inbox: P("M4 13l2-8h12l2 8M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M4 13h5a3 3 0 0 0 6 0h5"),
  layers: P("M12 3l9 5-9 5-9-5z") + P("M3 13l9 5 9-5"),
  "arrow-right": P("M5 12h14M13 6l6 6-6 6"),
  disconnect: P("M9 4v4M15 4v4M7 8h10v3a5 5 0 0 1-10 0z") + P("M12 16v4"),
  activity: P("M3 12h4l3-8 4 16 3-8h4"),
  maximize: P("M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"),
};

// Devolve o SVG de um ícone. `size` em px; `cls` opcional.
// Ícones extras (o catálogo do Lucide, carregado depois do começo do app). Os da biblioteca própria sempre vencem.
let extra = {};
export function registerIcons(catalog) {
  extra = Object.fromEntries(Object.entries(catalog || {}).map(([name, [inner]]) => [name, inner]));
}
export const hasIcon = (name) => Boolean(ICONS[name] || extra[name]);

export function icon(name, size = 18, cls = "") {
  const inner = ICONS[name] || extra[name];
  if (!inner) throw new Error(`Ícone desconhecido: ${name}`);
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
}

// Troca os elementos <i data-icon="nome" data-size="18"> pelo SVG correspondente (usado no HTML estático).
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll("i[data-icon]")) {
    const size = Number(el.dataset.size) || 18;
    const tmp = document.createElement("template");
    tmp.innerHTML = icon(el.dataset.icon, size, el.className);
    el.replaceWith(tmp.content.firstChild);
  }
}
