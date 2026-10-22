import test from "node:test";
import assert from "node:assert/strict";
import {
  GLOBAL_COMMANDS, normalizeCombo, comboFromEvent, effectiveHotkeys, validateCombo, findCommand, sanitizeOverrides, keysOf,
} from "../src/hotkeys.js";
import { CORE_FEATURES, sanitizeCoreOff, isFeatureOn, setFeature, featureOfView, featureOfPath } from "../src/core.js";
import { sanitizeWorkspace, recoverWorkspace, DEFAULT_WORKSPACE } from "../src/workspace.js";

const ev = (key, mods = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

// --- Atalhos ------------------------------------------------------------------------------------------------------

test("Atalhos: normaliza a escrita e a ordem dos modificadores", () => {
  assert.equal(normalizeCombo("ctrl+shift+f"), "Ctrl+Shift+F");
  assert.equal(normalizeCombo("Shift+Ctrl+K"), "Ctrl+Shift+K");
  assert.equal(normalizeCombo("cmd+,"), "Ctrl+,");
  assert.equal(normalizeCombo("alt+enter"), "Alt+Enter");
  assert.equal(normalizeCombo("Ctrl+"), null);
  assert.equal(normalizeCombo(""), null);
  assert.equal(normalizeCombo("Ctrl+Shift"), null, "só modificadores, sem tecla");
});

test("Atalhos: o evento vira texto; só modificador não conta; Cmd vale como Ctrl", () => {
  assert.equal(comboFromEvent(ev("p", { ctrlKey: true })), "Ctrl+P");
  assert.equal(comboFromEvent(ev("F", { metaKey: true, shiftKey: true })), "Ctrl+Shift+F");
  assert.equal(comboFromEvent(ev("Control", { ctrlKey: true })), null);
  assert.equal(comboFromEvent(ev("Shift", { shiftKey: true })), null);
  assert.equal(comboFromEvent(ev("F5")), "F5");
  assert.equal(comboFromEvent(ev("ArrowUp", { altKey: true })), "Alt+↑");
});

test("Atalhos: padrões e trocas convivem", () => {
  const base = effectiveHotkeys();
  assert.equal(base.paleta, "Ctrl+P");
  assert.equal(effectiveHotkeys({ paleta: "ctrl+k" }).paleta, "Ctrl+K");
  assert.equal(effectiveHotkeys({ paleta: "lixo" }).paleta, "Ctrl+P");
  assert.deepEqual(keysOf("Ctrl+Shift+F"), ["Ctrl", "Shift", "F"]);
});

test("Atalhos: validação recusa letra solta, reservados e repetidos", () => {
  assert.equal(validateCombo("K", "paleta").ok, false);
  assert.match(validateCombo("K", "paleta").error, /Ctrl ou Alt/);
  assert.match(validateCombo("Ctrl+B", "paleta").error, /editor/);
  assert.match(validateCombo("Ctrl+N", "paleta").error, /Criar uma nota/);
  assert.equal(validateCombo("Ctrl+N", "nova").ok, true, "repetir o próprio atalho é permitido");
  assert.equal(validateCombo("F6", "paleta").ok, true);
  assert.equal(validateCombo("Ctrl+K", "paleta").combo, "Ctrl+K");
});

test("Atalhos: o evento dispara o comando certo, e o antigo atalho deixa de valer", () => {
  assert.equal(findCommand(ev("p", { ctrlKey: true })), "paleta");
  assert.equal(findCommand(ev("n", { ctrlKey: true })), "nova");
  const over = { paleta: "Ctrl+K" };
  assert.equal(findCommand(ev("k", { ctrlKey: true }), over), "paleta");
  assert.equal(findCommand(ev("p", { ctrlKey: true }), over), null);
  assert.equal(findCommand(ev("x"), over), null);
  assert.equal(findCommand(ev("Control", { ctrlKey: true }), over), null);
});

test("Atalhos: dados salvos estragados são limpos", () => {
  assert.deepEqual(sanitizeOverrides(null), {});
  assert.deepEqual(sanitizeOverrides([1]), {});
  assert.deepEqual(sanitizeOverrides({ paleta: "Ctrl+K", inventado: "Ctrl+J", nova: "Ctrl+K", abrir: "x", fechar: "Ctrl+B" }), { paleta: "Ctrl+K" });
  assert.deepEqual(sanitizeOverrides({ paleta: "Ctrl+P" }), {}, "igual ao padrão não precisa ser guardado");
  assert.equal(GLOBAL_COMMANDS.length, new Set(GLOBAL_COMMANDS.map((c) => c.combo)).size, "padrões não se repetem");
});

// --- Recursos internos -------------------------------------------------------------------------------------------

test("Recursos internos: tudo ligado por padrão, desligar e religar", () => {
  assert.equal(isFeatureOn([], "canvas"), true);
  let off = setFeature([], "canvas", false);
  assert.deepEqual(off, ["canvas"]);
  assert.equal(isFeatureOn(off, "canvas"), false);
  off = setFeature(off, "canvas", true);
  assert.deepEqual(off, []);
  assert.deepEqual(setFeature([], "nao-existe", false), []);
  assert.deepEqual(setFeature(["graph"], "graph", false), ["graph"], "sem repetir");
});

test("Recursos internos: dados estragados voltam a tudo ligado; telas e arquivos têm dono", () => {
  assert.deepEqual(sanitizeCoreOff("canvas"), []);
  assert.deepEqual(sanitizeCoreOff(["canvas", 3, "x", "canvas", "tags"]), ["canvas", "tags"]);
  assert.equal(featureOfView("@graph"), "graph");
  assert.equal(featureOfView("@home"), null);
  assert.equal(featureOfPath("a/Quadro.canvas"), "canvas");
  assert.equal(featureOfPath("Nota.md"), null);
  assert.equal(CORE_FEATURES.length, new Set(CORE_FEATURES.map((f) => f.id)).size);
});

// --- Espaço de trabalho ------------------------------------------------------------------------------------------

test("Workspace: um válido passa sem correções", () => {
  const ok = { tabs: ["@home", "A.md"], active: "A.md", mode: "read", sideTab: "files", sideOpen: true, collapsed: { "dir:x": true }, canvasViews: { "Q.canvas": { x: 5, y: 6, zoom: 2 } } };
  const r = sanitizeWorkspace(ok);
  assert.deepEqual(r.issues, []);
  assert.equal(r.ws.active, "A.md");
  assert.deepEqual(r.ws.canvasViews["Q.canvas"], { x: 5, y: 6, zoom: 2 });
});

test("Workspace: dados estragados são corrigidos campo a campo", () => {
  const r = sanitizeWorkspace({ tabs: ["A.md", 7, null, "A.md", ""], active: "sumiu.md", mode: "voar", collapsed: [1], canvasViews: { "Q.canvas": { zoom: 99, x: "a" } }, panels: { ok: true, ruim: "sim" } });
  assert.deepEqual(r.ws.tabs, ["A.md"]);
  assert.equal(r.ws.active, "A.md");
  assert.equal(r.ws.mode, undefined);
  assert.deepEqual(r.ws.collapsed, {});
  assert.deepEqual(r.ws.panels, { ok: true });
  assert.deepEqual(r.ws.canvasViews["Q.canvas"], { x: 0, y: 0, zoom: 4 });
  assert.ok(r.issues.length >= 3);
  assert.equal(r.usable, true);
});

test("Workspace: formas impossíveis não são aproveitadas", () => {
  for (const bad of [null, 5, "texto", [1, 2]]) {
    const r = sanitizeWorkspace(bad);
    assert.equal(r.usable, false);
    assert.deepEqual(r.ws, DEFAULT_WORKSPACE);
  }
});

test("Workspace: JSON inválido usa a cópia anterior; sem cópia, o estado padrão", () => {
  const backup = JSON.stringify({ tabs: ["B.md"], active: "B.md" });
  const r = recoverWorkspace("{ não é json", backup);
  assert.deepEqual(r.ws.tabs, ["B.md"]);
  assert.equal(r.recovered.source, "cópia anterior");
  const r2 = recoverWorkspace("{ não é json", "também ruim");
  assert.deepEqual(r2.ws, DEFAULT_WORKSPACE);
  assert.equal(r2.recovered.source, "estado padrão");
  assert.match(r2.recovered.reason, /JSON/);
});

test("Workspace: ausente é normal e válido não acusa recuperação; ajuste parcial é avisado", () => {
  assert.equal(recoverWorkspace(null, null).recovered, null);
  assert.equal(recoverWorkspace(JSON.stringify({ tabs: ["A.md"], active: "A.md" }), null).recovered, null);
  const r = recoverWorkspace(JSON.stringify({ tabs: "x" }), null);
  assert.equal(r.recovered.source, "ajustado");
  assert.deepEqual(r.ws.tabs, []);
});
