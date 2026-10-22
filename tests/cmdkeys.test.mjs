import test from "node:test";
import assert from "node:assert/strict";
import { commandId, validateCmdKey, findCmdKey, sanitizeCmdKeys, setCmdKey, clearCmdKey } from "../src/cmdkeys.js";

const ev = (key, mods = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test("Id do comando: sem acento, sem contagem entre parênteses, com hífens", () => {
  assert.equal(commandId("Lixeira (3)"), "lixeira");
  assert.equal(commandId("Nota diária anterior"), "nota-diaria-anterior");
  assert.equal(commandId("Mover para outra pasta…"), "mover-para-outra-pasta");
  assert.equal(commandId("Abrir esta nota ao lado"), "abrir-esta-nota-ao-lado");
  assert.equal(commandId("   "), "");
});

test("Validação: exige Ctrl ou Alt (ou F), recusa reservados, globais e repetidos", () => {
  assert.equal(validateCmdKey("K", "x").ok, false);
  assert.match(validateCmdKey("Ctrl+B", "x").error, /editor/);
  assert.match(validateCmdKey("Ctrl+P", "x").error, /comando geral/);
  assert.match(validateCmdKey("Ctrl+Alt+R", "novo", { outro: "Ctrl+Alt+R" }, {}, { outro: "Nota aleatória" }).error, /Nota aleatória/);
  assert.equal(validateCmdKey("Ctrl+Alt+R", "outro", { outro: "Ctrl+Alt+R" }).ok, true, "repetir o próprio");
  assert.equal(validateCmdKey("F7", "x").combo, "F7");
  assert.equal(validateCmdKey("ctrl+alt+j", "x").combo, "Ctrl+Alt+J");
  assert.match(validateCmdKey("Ctrl+K", "x", {}, { paleta: "Ctrl+K" }).error, /geral/, "respeita um atalho global trocado");
  assert.equal(validateCmdKey("Ctrl+P", "x", {}, { paleta: "Ctrl+K" }).ok, true, "o antigo ficou livre");
});

test("Evento: acha o comando; nada para só modificador ou combinação sem dono", () => {
  const keys = { "nota-aleatoria": "Ctrl+Alt+R", "duplicar": "Alt+D" };
  assert.equal(findCmdKey(ev("r", { ctrlKey: true, altKey: true }), keys), "nota-aleatoria");
  assert.equal(findCmdKey(ev("d", { altKey: true }), keys), "duplicar");
  assert.equal(findCmdKey(ev("Alt", { altKey: true }), keys), null);
  assert.equal(findCmdKey(ev("z", { ctrlKey: true, altKey: true }), keys), null);
});

test("Limpeza: ids ruins, combinações inválidas, repetidas e iguais a um global saem", () => {
  const clean = sanitizeCmdKeys({ a: "Ctrl+Alt+A", b: "Ctrl+Alt+A", c: "x", "Id Ruim": "Ctrl+Alt+Q", d: "Ctrl+P", e: "F9", f: 3 });
  assert.deepEqual(clean, { a: "Ctrl+Alt+A", e: "F9" });
  assert.deepEqual(sanitizeCmdKeys(null), {});
  assert.deepEqual(sanitizeCmdKeys([1]), {});
});

test("Trocar e remover", () => {
  let k = setCmdKey({}, "x", "Ctrl+Alt+X");
  assert.deepEqual(k, { x: "Ctrl+Alt+X" });
  k = clearCmdKey(k, "x");
  assert.deepEqual(k, {});
  assert.deepEqual(clearCmdKey(k, "nada"), {});
});
