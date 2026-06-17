import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16314F",        // deep navy — headers, primary text
        navy: "#1F4E79",       // brand navy — buttons, accents
        navylight: "#2E75B6",
        paper: "#F4F6F9",      // app background
        gold: "#B08A3E",       // brand gold from the printed menus
        goldsoft: "#F3ECDB",
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(22,49,79,0.08), 0 4px 14px rgba(22,49,79,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
