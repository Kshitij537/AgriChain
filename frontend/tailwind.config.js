/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "surface-bright": "#fafaf5",
        "on-error-container": "#93000a",
        "tertiary-fixed-dim": "#7ed1f7",
        "on-secondary-container": "#00337c",
        "on-error": "#ffffff",
        "secondary-container": "#759efd",
        "tertiary": "#002e3e",
        "outline": "#707970",
        "inverse-primary": "#4edea3",
        "surface-container-highest": "#e3e3de",
        "error": "#ba1a1a",
        "on-primary-fixed": "#002113",
        "on-primary": "#ffffff",
        "on-primary-container": "#27c38a",
        "inverse-surface": "#2f312e",
        "on-surface-variant": "#404941",
        "primary-container": "#004a31",
        "surface-tint": "#006c49",
        "error-container": "#ffdad6",
        "tertiary-container": "#00465c",
        "surface-variant": "#e3e3de",
        "surface-container-lowest": "#ffffff",
        "secondary": "#2b5bb5",
        "on-surface": "#1a1c19",
        "background": "#fafaf5",
        "surface-container-high": "#e8e8e3",
        "primary-fixed": "#6ffbbe",
        "secondary-fixed": "#d9e2ff",
        "on-tertiary-fixed-variant": "#004d65",
        "on-background": "#1a1c19",
        "on-tertiary": "#ffffff",
        "on-tertiary-fixed": "#001f2a",
        "inverse-on-surface": "#f1f1ec",
        "primary-fixed-dim": "#4edea3",
        "surface-dim": "#dadad5",
        "on-primary-fixed-variant": "#005236",
        "on-secondary-fixed": "#001945",
        "tertiary-fixed": "#bee9ff",
        "outline-variant": "#c0c9be",
        "on-secondary": "#ffffff",
        "on-secondary-fixed-variant": "#00429c",
        "surface-container": "#eeeee9",
        "primary": "#00311f",
        "secondary-fixed-dim": "#b0c6ff",
        "surface": "#fafaf5",
        "surface-container-low": "#f4f4ef",
        "on-tertiary-container": "#62b6db"
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "2rem",
        "xl": "3rem",
        "full": "9999px"
      },
      fontFamily: {
        "headline": ["Manrope", "sans-serif"],
        "body": ["Inter", "sans-serif"],
        "label": ["Inter", "sans-serif"]
      },
      boxShadow: {
        'glow-emerald': '0 0 30px rgba(16, 185, 129, 0.2)',
        'glow-blue': '0 0 30px rgba(59, 130, 246, 0.2)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
