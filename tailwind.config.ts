import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0b",
          elevated: "#111114",
          subtle: "#16161a",
          hover: "#1c1c22",
        },
        border: {
          DEFAULT: "#26262d",
          subtle: "#1c1c22",
          strong: "#34343d",
        },
        fg: {
          DEFAULT: "#e6e6e9",
          muted: "#9a9aa3",
          subtle: "#65656e",
        },
        accent: {
          DEFAULT: "#5b8def",
          hover: "#7aa2f7",
          subtle: "#1a2540",
        },
        success: "#4ade80",
        warning: "#fbbf24",
        danger: "#f87171",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
