// Imagens do canvas: o arquivo escolhido (ou solto, ou colado) é reduzido e embutido no próprio .canvas como data URL,
// então a imagem viaja junto com o quadro e não depende de nenhum arquivo binário na biblioteca.

export const MAX_SIDE = 1600; // maior lado, em pixels, depois de reduzir
export const MAX_CHARS = 900_000; // tamanho máximo do texto do data URL de uma imagem
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const isImageFile = (file) => !!file && IMAGE_TYPES.includes(String(file.type).toLowerCase());

// Reduz (nunca amplia) um tamanho para que o maior lado caiba em `max`.
export function fitSize(width, height, max = MAX_SIDE) {
  const k = Math.min(1, max / Math.max(width, height, 1));
  return [Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k))];
}

// Tamanho com que a imagem entra no quadro: mantém a proporção e cabe numa caixa de `max` × `max`.
export function displaySize(width, height, max = 360) {
  const k = Math.min(1, max / Math.max(width, height, 1));
  return [Math.max(40, Math.round(width * k)), Math.max(30, Math.round(height * k))];
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível abrir essa imagem."));
    };
    img.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(file);
  });
}

// Lê uma imagem e devolve { src, width, height } com o data URL já reduzido, ou lança com uma mensagem clara.
export async function readImage(file, { maxSide = MAX_SIDE, maxChars = MAX_CHARS } = {}) {
  if (!isImageFile(file)) throw new Error("Só imagens PNG, JPG, WEBP ou GIF.");
  const img = await loadImage(file);
  const [w0, h0] = [img.naturalWidth || img.width, img.naturalHeight || img.height];
  if (!w0 || !h0) throw new Error("A imagem está vazia.");
  if (file.type === "image/gif") {
    // GIF animado perde a animação ao ser redesenhado: só entra como está, se couber.
    const src = await fileToDataUrl(file);
    if (src.length > maxChars) throw new Error("Esse GIF é grande demais (limite de cerca de 650 KB).");
    return { src, width: w0, height: h0 };
  }
  let side = maxSide;
  let quality = 0.88;
  for (let attempt = 0; attempt < 6; attempt++) {
    const [w, h] = fitSize(w0, h0, side);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    let src = canvas.toDataURL("image/webp", quality);
    if (!src.startsWith("data:image/webp")) {
      // navegador sem WEBP: JPEG precisa de fundo opaco
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      src = canvas.toDataURL("image/jpeg", quality);
    }
    if (src.length <= maxChars) return { src, width: w, height: h };
    side = Math.round(side * 0.75);
    quality = Math.max(0.6, quality - 0.06);
  }
  throw new Error("Essa imagem é pesada demais, mesmo reduzida.");
}
