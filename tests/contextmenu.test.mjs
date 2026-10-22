import test from "node:test";
import assert from "node:assert/strict";
import { cleanItems, nextEnabled, placeBox } from "../src/contextmenu.js";

const it = (label, extra = {}) => ({ label, run() {}, ...extra });

test("Menu de contexto: some o que está escondido e arruma os separadores", () => {
  const out = cleanItems([{ sep: true }, it("a"), { sep: true }, { sep: true }, it("b", { hidden: true }), { sep: true }, it("c"), { sep: true }]);
  assert.deepEqual(out.map((x) => x.sep ? "-" : x.label), ["a", "-", "c"]);
  assert.deepEqual(cleanItems(null), []);
  assert.deepEqual(cleanItems([it("a", { hidden: true }), { sep: true }]), []);
  assert.deepEqual(cleanItems([null, undefined, it("x")]).length, 1);
});

test("Menu de contexto: teclado pula separadores e itens desligados e dá a volta", () => {
  const list = [it("a"), { sep: true }, it("b", { disabled: true }), it("c")];
  assert.equal(nextEnabled(list, -1, 1), 0);
  assert.equal(nextEnabled(list, 0, 1), 3);
  assert.equal(nextEnabled(list, 3, 1), 0);
  assert.equal(nextEnabled(list, 0, -1), 3);
  assert.equal(nextEnabled([it("x", { disabled: true })], -1, 1), -1);
  assert.equal(nextEnabled([], -1, 1), -1);
});

test("Menu de contexto: a caixa fica dentro da janela", () => {
  assert.deepEqual(placeBox(100, 100, 200, 150, 1000, 800), { left: 100, top: 100 });
  assert.deepEqual(placeBox(900, 100, 200, 150, 1000, 800), { left: 794, top: 100 });
  assert.deepEqual(placeBox(100, 750, 200, 150, 1000, 800), { left: 100, top: 644 });
  assert.deepEqual(placeBox(0, 0, 2000, 2000, 1000, 800), { left: 6, top: 6 }, "maior que a janela: encosta na margem");
});
