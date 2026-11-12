export default function manifest() {
  return {
    name: "ContaCloud",
    short_name: "ContaCloud",
    description: "Contabilidad, facturación electrónica e impuestos en la nube.",
    start_url: "/",
    orientation: "any",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#1F2A3C",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
