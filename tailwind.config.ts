import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 20px 60px rgba(15, 23, 42, 0.16)",
      },
      backgroundImage: {
        "dashboard-gradient":
          "radial-gradient(circle at top left, rgba(14, 165, 233, 0.18), transparent 34%), radial-gradient(circle at top right, rgba(16, 185, 129, 0.16), transparent 28%), linear-gradient(180deg, rgba(248, 250, 252, 1), rgba(241, 245, 249, 1))",
      },
      colors: {
        ink: {
          950: "#08111f",
        },
      },
    },
  },
  plugins: [],
};

export default config;