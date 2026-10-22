// Persistência local (localStorage). Toda leitura e escrita é protegida: se o navegador bloquear o
// armazenamento, o app continua funcionando só em memória.

const VAULT_KEY = "sophyra.vault.v1";
const WORKSPACE_KEY = "sophyra.workspace.v1";
const SETTINGS_KEY = "sophyra.settings.v1";
const WORKSPACE_BACKUP_KEY = "sophyra.workspace.backup.v1";
const KV_PREFIX = "sophyra.kv.";

import { recoverWorkspace } from "./workspace.js";

// Dados salvos com o nome antigo ("cofre.*") são levados para as chaves novas ("sophyra.*") uma única vez. Uma marca
// (`sophyra.migrado.v1`) registra que já foi feito. Antes disso, o que está nas chaves novas pode ser só o exemplo
// gravado no primeiro carregamento, então os valores antigos substituem os novos. As chaves antigas não são apagadas.
function migrateLegacyKeys() {
  try {
    if (localStorage.getItem("sophyra.migrado.v1") !== null) return;
    for (const old of Object.keys(localStorage).filter((k) => k.startsWith("cofre."))) {
      localStorage.setItem(`sophyra.${old.slice("cofre.".length)}`, localStorage.getItem(old));
    }
    localStorage.setItem("sophyra.migrado.v1", new Date().toISOString());
  } catch {
    /* sem armazenamento: nada a migrar */
  }
}
migrateLegacyKeys();

function readText(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const DEFAULT_SETTINGS = {
  theme: "auto", // auto | light | dark
  fontSize: 17, // px do texto das notas na leitura
  editorSize: 15, // px do texto no editor
  larguraTexto: "normal", // estreita | normal | larga
  atrasoSalvar: 300, // ms de espera antes de gravar
  destaque: true, // destaque de sintaxe no editor
  ajudasEditor: true, // fechar pares e continuar listas
  ribbonOff: false, // esconde a faixa de ícones da esquerda
  hotkeys: {}, // atalhos globais trocados pela pessoa: { idDoComando: "Ctrl+Shift+K" }
  pluginsComunidade: false, // plugins importados só carregam com isso ligado (consentimento, como o "Trust author" do original)
  cmdKeys: {}, // atalhos próprios de comandos da paleta: { idDoComando: "Ctrl+Alt+K" }
  coreOff: [], // recursos internos desligados (canvas, graph, tasks, tags)
  fonteEditor: "serif", // serif | sans | mono: fonte do editor de blocos
  textoPequeno: false, // texto menor no editor de blocos
  larguraCh: 68, // largura do editor em "ch" quando larguraTexto é "custom"
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const storage = {
  loadVault: () => read(VAULT_KEY, null),
  saveVault: (data) => write(VAULT_KEY, data),
  // Nunca lança: texto estragado é corrigido ou trocado pela última cópia boa; `recovered` conta o que aconteceu.
  loadWorkspaceDetailed: () => recoverWorkspace(readText(WORKSPACE_KEY), readText(WORKSPACE_BACKUP_KEY)),
  loadWorkspace: () => recoverWorkspace(readText(WORKSPACE_KEY), readText(WORKSPACE_BACKUP_KEY)).ws,
  saveWorkspace: (ws) => {
    // guarda a versão anterior como cópia de segurança, mas só se ela estava boa
    const prev = readText(WORKSPACE_KEY);
    if (prev && recoverWorkspace(prev, null).recovered === null) {
      try {
        localStorage.setItem(WORKSPACE_BACKUP_KEY, prev);
      } catch {
        // sem espaço: segue sem cópia
      }
    }
    return write(WORKSPACE_KEY, ws);
  },
  loadSettings: () => ({ ...DEFAULT_SETTINGS, ...read(SETTINGS_KEY, {}) }),
  saveSettings: (s) => write(SETTINGS_KEY, s),
  // Chave-valor genérica, usada pelos plugins (api.settings).
  get: (key, fallback) => {
    const v = read(KV_PREFIX + key, undefined);
    return v === undefined ? fallback : v;
  },
  set: (key, value) => write(KV_PREFIX + key, value),
};
