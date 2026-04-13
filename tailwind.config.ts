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
        // 🔥 Minimal Black / Red / White Theme
        background: "#000000",
        surface: "#0A0A0A",
        surfaceLight: "#141414",

        primary: "#FF2D2D",      // main red
        primaryDark: "#CC1F1F",  // hover red

        text: "#FFFFFF",
        textMuted: "#A1A1AA",

        border: "#1F1F1F",
      },

      boxShadow: {
        soft: "0 10px 30px rgba(0, 0, 0, 0.6)",
        redGlow: "0 0 20px rgba(255, 45, 45, 0.35)",
      },

      backgroundImage: {
        // subtle red line glow (not full gradient)
        "red-glow":
          "radial-gradient(circle at 50% 0%, rgba(255,45,45,0.15), transparent 60%)",
      },

      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
