/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "var(--brand-bg)",
          text: "var(--brand-text)",
          border: "var(--brand-border)",
          subtle: "var(--brand-subtle)",
          accent: "var(--accent-text)",
        },
      },
    },
  },
  plugins: [],
};