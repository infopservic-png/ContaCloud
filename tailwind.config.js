/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#EFEBDE",
        paperLine: "#CBC2A4",
        ink: "#1F2A3C",
        inkSoft: "#4B5768",
        brass: "#A8703A",
        brassDark: "#7E5228",
        ledger: "#2F6B4F",
        ledgerDark: "#204A37",
        rust: "#9C3B2E",
        // Colores de marca: se personalizan en Mi perfil (variables CSS definidas en globals.css)
        brand: "rgb(var(--brand) / <alpha-value>)",
        brandDark: "rgb(var(--brand-dark) / <alpha-value>)",
        onBrand: "rgb(var(--on-brand) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        accentDark: "rgb(var(--accent-dark) / <alpha-value>)",
        onAccent: "rgb(var(--on-accent) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        body: ["var(--font-body)", "sans-serif"],
        num: ["var(--font-num)", "monospace"],
      },
      backgroundImage: {
        ruled:
          "repeating-linear-gradient(to bottom, transparent, transparent 35px, #CBC2A4 36px)",
      },
    },
  },
  plugins: [],
};
