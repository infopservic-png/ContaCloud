// Prepara el logo que sube la persona: lo reduce para que pese poco (se guarda dentro del perfil).
// Solo se aceptan PNG, JPEG y WebP (no SVG: podría traer código).
export const TIPOS_LOGO = ["image/png", "image/jpeg", "image/webp"];
const MAX_ARCHIVO = 3 * 1024 * 1024; // 3 MB antes de reducir
const MAX_CARACTERES = 150000; // lo que ocupa el logo ya reducido (la base de datos admite hasta 400 000)

const leerComoDataURL = (archivo) =>
  new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });

const cargarImagen = (url) =>
  new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error("El archivo no parece una imagen válida."));
    img.src = url;
  });

export async function reducirLogo(archivo, { maxAncho = 360, maxAlto = 120 } = {}) {
  if (!archivo) throw new Error("Elige una imagen.");
  if (!TIPOS_LOGO.includes(archivo.type)) throw new Error("El logo debe ser una imagen PNG, JPG o WebP.");
  if (archivo.size > MAX_ARCHIVO) throw new Error("La imagen pesa más de 3 MB. Elige una más liviana.");

  const original = await leerComoDataURL(archivo);
  const lienzo = document.createElement("canvas");
  const ctx = lienzo.getContext && lienzo.getContext("2d");
  if (!ctx) {
    // Navegador sin lienzo: solo sirve si ya es pequeña
    if (original.length <= MAX_CARACTERES && /^data:image\/(png|jpeg|webp);base64,/.test(original)) return original;
    throw new Error("No se pudo reducir la imagen en este navegador. Usa un logo de menos de 100 KB.");
  }

  const img = await cargarImagen(original);
  let escala = Math.min(1, maxAncho / img.width, maxAlto / img.height);
  const tipo = archivo.type === "image/jpeg" ? "image/jpeg" : "image/png"; // PNG conserva la transparencia
  for (let intento = 0; intento < 6; intento++) {
    lienzo.width = Math.max(1, Math.round(img.width * escala));
    lienzo.height = Math.max(1, Math.round(img.height * escala));
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const url = lienzo.toDataURL(tipo, 0.9);
    if (url.length <= MAX_CARACTERES) return url;
    escala *= 0.75; // sigue pesando mucho: se achica un poco más
  }
  throw new Error("No se pudo reducir lo suficiente. Prueba con una imagen más sencilla.");
}
