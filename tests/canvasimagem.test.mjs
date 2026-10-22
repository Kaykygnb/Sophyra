import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCanvas, serializeCanvas, emptyCanvas, addNode, addLineNode, styleNode, smoothPath, isImageSrc, STROKES, resizeNode,
} from "../src/canvas.js";
import { fitSize, displaySize, isImageFile } from "../src/canvasimage.js";
import { autolink } from "../src/canvasview.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("Imagem: só data URL de PNG, JPEG, WEBP ou GIF vale; o resto é recusado", () => {
  assert.equal(isImageSrc(PNG), true);
  assert.equal(isImageSrc("data:image/svg+xml;base64,AAAA"), false, "SVG pode carregar script");
  assert.equal(isImageSrc("https://exemplo.com/a.png"), false, "nada de endereço remoto");
  assert.equal(isImageSrc("data:image/png;base64,<script>"), false);
  assert.equal(isImageSrc(42), false);
});

test("Imagem: vira cartão de texto com `image`, volta igual do arquivo e perde a forma se a fonte for inválida", () => {
  const d = emptyCanvas();
  const n = addNode(d, { type: "text", shape: "image", image: PNG, x: 5, y: 6, width: 120, height: 80 });
  assert.equal(n.shape, "image");
  assert.equal(n.image, PNG);
  const back = parseCanvas(serializeCanvas(d)).data.nodes[0];
  assert.equal(back.image, PNG);
  assert.equal(addNode(d, { type: "text", shape: "image", image: "http://x/a.png" }).shape, undefined);
  const raw = { nodes: [
    { id: "a", type: "text", x: 0, y: 0, shape: "image", image: "javascript:alert(1)" },
    { id: "b", type: "text", x: 0, y: 0, shape: "rect", image: PNG },
    { id: "c", type: "file", x: 0, y: 0, file: "A.md", shape: "image", image: PNG },
  ], edges: [] };
  const [a, b, c] = parseCanvas(JSON.stringify(raw)).data.nodes;
  assert.equal("shape" in a || "image" in a, false);
  assert.equal("image" in b, false, "só imagem carrega `image`");
  assert.equal("shape" in c || "image" in c, false);
});

test("Imagem: redimensiona com tamanho mínimo de forma", () => {
  const d = emptyCanvas();
  const n = addNode(d, { type: "text", shape: "image", image: PNG, width: 200, height: 100 });
  resizeNode(d, n.id, 5, 5);
  assert.deepEqual([n.width, n.height], [40, 30]);
});

test("Tamanhos: reduzir nunca amplia e mantém a proporção", () => {
  assert.deepEqual(fitSize(3200, 1600, 1600), [1600, 800]);
  assert.deepEqual(fitSize(800, 600, 1600), [800, 600]);
  assert.deepEqual(displaySize(1600, 800, 360), [360, 180]);
  assert.deepEqual(displaySize(100, 50, 360), [100, 50]);
  assert.equal(isImageFile({ type: "image/png" }), true);
  assert.equal(isImageFile({ type: "image/svg+xml" }), false);
  assert.equal(isImageFile({ type: "text/plain" }), false);
  assert.equal(isImageFile(null), false);
});

test("Espessura do traço: só 1, 2 ou 4; valores estranhos são limpos ou ignorados", () => {
  assert.deepEqual(STROKES, [1, 2, 4]);
  const d = emptyCanvas();
  const l = addLineNode(d, "line", [[0, 0], [50, 20]], { stroke: 4 });
  assert.equal(l.stroke, 4);
  assert.equal(styleNode(d, l.id, { stroke: 7 }), true);
  assert.equal(l.stroke, 4, "valor inválido é ignorado");
  styleNode(d, l.id, { stroke: 1 });
  assert.equal(l.stroke, 1);
  styleNode(d, l.id, { stroke: null });
  assert.equal("stroke" in l, false);
  const { data } = parseCanvas(JSON.stringify({ nodes: [{ id: "x", type: "text", x: 0, y: 0, shape: "rect", stroke: 9 }], edges: [] }));
  assert.equal("stroke" in data.nodes[0], false);
});

test("Traço suave: curvas pelos pontos médios, sem quinas, e pontas preservadas", () => {
  assert.equal(smoothPath([]), "");
  assert.equal(smoothPath([[1, 2]]), "M1 2");
  assert.equal(smoothPath([[0, 0], [10, 10]]), "M0 0 L10 10");
  const d = smoothPath([[0, 0], [10, 0], [10, 10]]);
  assert.equal(d, "M0 0 Q10 0 10 5 L10 10");
});

test("Links soltos: endereços http(s) no texto viram links; os que já são links ficam como estão", () => {
  assert.equal(autolink("veja https://exemplo.com/a?b=1."), "veja [https://exemplo.com/a?b=1](https://exemplo.com/a?b=1).");
  assert.equal(autolink("[site](https://exemplo.com)"), "[site](https://exemplo.com)");
  assert.equal(autolink("https://a.com e http://b.org"), "[https://a.com](https://a.com) e [http://b.org](http://b.org)");
  assert.equal(autolink("sem link"), "sem link");
  assert.equal(autolink(undefined), "");
});
