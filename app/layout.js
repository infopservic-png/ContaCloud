import { Lora, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PerfilProvider } from "@/lib/PerfilContext";

const display = Lora({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const num = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-num",
});

export const metadata = {
  title: "ContaCloud — Prácticas de contabilidad",
  description:
    "Práctica de contabilidad para empresas comerciales y de servicio: Diario, Mayor y Balance de comprobación.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Aplica los colores de la última marca usada antes de pintar la página, para que no parpadee */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=JSON.parse(localStorage.getItem('contacloud_marca')||'null');if(m&&m.vars){var s=document.documentElement.style;for(var k in m.vars){s.setProperty(k,m.vars[k]);}}}catch(e){}",
          }}
        />
      </head>
      <body
        className={`${display.variable} ${body.variable} ${num.variable} font-body bg-paper text-ink min-h-screen`}
      >
        <PerfilProvider>{children}</PerfilProvider>
      </body>
    </html>
  );
}
