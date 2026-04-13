import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 🔥 EvolvNex Brand Theme
        primary: "#00FFB2",
        primaryDark: "#00CC8E",

        background: "#0B0F14",
        surface: "#111827",
        surfaceLight: "#1F2937",

        text: "#E5E7EB",
        textMuted: "#9CA3AF",

        border: "#1F2937",

        accent: "#22D3EE",
      },

      boxShadow: {
        soft: "0 20px 60px rgba(0, 0, 0, 0.35)",
        glow: "0 0 30px rgba(0, 255, 178, 0.25)",
      },

      backgroundImage: {
        "dashboard-gradient":
          "radial-gradient(circle at top left, rgba(0, 255, 178, 0.15), transparent 35%), radial-gradient(circle at top right, rgba(34, 211, 238, 0.12), transparent 30%), linear-gradient(180deg, #0B0F14, #0B0F14)",
      },

      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },

      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
