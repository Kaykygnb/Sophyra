// Plugins importados de um arquivo local. O arquivo .js leva o manifesto num comentário no começo:
//
//   /* sophyra-plugin
//   { "id": "meu-plugin", "nome": "Meu plugin", "versao": "1.0.0", "descricao": "…", "permissoes": ["painel"] }
//   */
//
// Nada é carregado de endereço remoto e nada roda antes de a pessoa ver as permissões, os avisos e o código e confirmar.
// A varredura de riscos é uma ajuda para ler o código, não uma garantia: o plugin roda na página.

import { PERMISSOES } from "./plugins.js";

export const MAX_CODE_CHARS = 200_000;
export const MAX_TOTAL_CHARS = 1_000_000;
export const MAX_IMPORTED = 20;

const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const HEADER_RE = /^\s*\/\*\s*sophyra-plugin\s*\r?\n([\s\S]*?)\*\//;

// Lê o arquivo. Devolve { ok: true, manifest, code } ou { ok: false, error }.
export function parsePluginFile(text) {
  const src = String(text ?? "");
  if (!src.trim()) return { ok: false, error: "O arquivo está vazio." };
  if (src.length > MAX_CODE_CHARS) return { ok: false, error: `O arquivo passa de ${Math.round(MAX_CODE_CHARS / 1000)} mil caracteres.` };
  if (src.includes("\u0000")) return { ok: false, error: "O arquivo parece binário." };
  const m = HEADER_RE.exec(src);
  if (!m) return { ok: false, error: "Falta o comentário /* sophyra-plugin … */ com o manifesto, no começo do arquivo." };
  let raw;
  try {
    raw = JSON.parse(m[1]);
  } catch (err) {
    return { ok: false, error: `O manifesto não é um JSON válido (${err.message}).` };
  }
  const checked = validateManifest(raw);
  if (!checked.ok) return checked;
  if (!/\bonload\b/.test(src)) return { ok: false, error: "O plugin precisa exportar um objeto com onload(api)." };
  if (/^\s*import\s[^;]*from\s+["'](https?:)?\/\//m.test(src) || /\bimport\s*\(\s*["'](https?:)?\/\//.test(src)) {
    return { ok: false, error: "O plugin tenta importar código de um endereço remoto, o que não é permitido." };
  }
  return { ok: true, manifest: checked.manifest, code: src };
}

// Imported plugins MUST declare permissions (os do projeto podem ficar sem, por compatibilidade).
export function validateManifest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "O manifesto precisa ser um objeto." };
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) return { ok: false, error: "id inválido: use letras minúsculas, números e hífens (2 a 40 caracteres)." };
  if (typeof raw.nome !== "string" || !raw.nome.trim() || raw.nome.length > 80) return { ok: false, error: "nome ausente ou longo demais (máximo 80)." };
  if (raw.versao !== undefined && (typeof raw.versao !== "string" || raw.versao.length > 20)) return { ok: false, error: "versao inválida." };
  if (raw.descricao !== undefined && (typeof raw.descricao !== "string" || raw.descricao.length > 300)) return { ok: false, error: "descricao longa demais (máximo 300)." };
  if (!Array.isArray(raw.permissoes)) return { ok: false, error: "O plugin precisa declarar permissoes (pode ser uma lista vazia)." };
  const bad = raw.permissoes.find((p) => !Object.prototype.hasOwnProperty.call(PERMISSOES, p));
  if (bad !== undefined) return { ok: false, error: `Permissão desconhecida: ${bad}.` };
  return {
    ok: true,
    manifest: {
      id: raw.id,
      nome: raw.nome.trim(),
      versao: raw.versao || "0.0.0",
      descricao: raw.descricao || "",
      permissoes: [...new Set(raw.permissoes)],
    },
  };
}

const RISKS = [
  [/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|\bsendBeacon\b|\bEventSource\b/, "Acessa a rede (fetch, XMLHttpRequest, WebSocket…): pode enviar dados da sua nota para fora."],
  [/\beval\s*\(|new\s+Function\s*\(|\bFunction\s*\(\s*["'`]/, "Executa texto como código (eval ou new Function)."],
  [/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b|document\s*\.\s*cookie/, "Lê o armazenamento do navegador diretamente, inclusive dados que não são do plugin."],
  [/\bdocument\s*\.\s*(write|body\s*\.\s*innerHTML)|\.innerHTML\s*=|insertAdjacentHTML/, "Escreve HTML na página (risco de injetar scripts se usar texto não confiável)."],
  [/\bnavigator\s*\.\s*(clipboard|geolocation|mediaDevices)|\bwindow\s*\.\s*open\b|\blocation\s*(\.|=)/, "Usa área de transferência, localização, câmera ou troca o endereço da página."],
  [/\bimport\s*\(/, "Importa outros módulos dinamicamente."],
];

// Avisos de leitura do código. Devolve a lista de textos (vazia se nada chamou atenção).
export function scanRisks(code) {
  return RISKS.filter(([re]) => re.test(code)).map(([, label]) => label);
}

// --- Armazenamento dos importados -------------------------------------------------------------------------------------

// Lista guardada: [{ id, manifest, code, importedAt }]. Limpa dados estragados e respeita os limites de tamanho.
export function sanitizeImported(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  let total = 0;
  for (const it of raw) {
    if (!it || typeof it.code !== "string") continue;
    const checked = validateManifest(it.manifest);
    if (!checked.ok || seen.has(checked.manifest.id) || it.code.length > MAX_CODE_CHARS) continue;
    if (total + it.code.length > MAX_TOTAL_CHARS || out.length >= MAX_IMPORTED) break;
    total += it.code.length;
    seen.add(checked.manifest.id);
    out.push({ id: checked.manifest.id, manifest: checked.manifest, code: it.code, importedAt: Number.isFinite(it.importedAt) ? it.importedAt : 0 });
  }
  return out;
}

// Junta um plugin novo à lista. `takenIds` são os ids já usados por plugins do projeto. Devolve { ok, list } ou { ok: false, error }.
export function addImported(list, parsed, takenIds = [], now = Date.now()) {
  const { manifest, code } = parsed;
  if (takenIds.includes(manifest.id)) return { ok: false, error: `Já existe um plugin com o id “${manifest.id}”.` };
  if (list.some((p) => p.id === manifest.id)) return { ok: false, error: `Você já importou um plugin com o id “${manifest.id}”. Remova-o antes de importar de novo.` };
  if (list.length >= MAX_IMPORTED) return { ok: false, error: `O limite é de ${MAX_IMPORTED} plugins importados.` };
  const total = list.reduce((n, p) => n + p.code.length, 0) + code.length;
  if (total > MAX_TOTAL_CHARS) return { ok: false, error: "Não há espaço guardado para mais um plugin. Remova algum." };
  return { ok: true, list: [...list, { id: manifest.id, manifest, code, importedAt: now }] };
}

export const removeImported = (list, id) => list.filter((p) => p.id !== id);

// Manifesto que o host de plugins registra para um importado (o código é carregado de um Blob, não de um endereço).
export const hostManifest = (p) => ({ ...p.manifest, main: `local:${p.id}`, importado: true });
