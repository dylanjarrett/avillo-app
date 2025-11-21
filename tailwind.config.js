/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./src/ui/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#0C1A2A",        // Avillo dark navy
          card: "#13263A",
          text: "#F2F5F7",       // Off-white
          muted: "#9BA8B6",
          accent: "#4F9FE3"      // Blue accent
        }
      }
    },
  },
  plugins: [],
};