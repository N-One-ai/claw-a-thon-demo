import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0C1017",
          surface: "#10151C",
          card: "#141B24",
          "card-hover": "#1A2230",
          elevated: "#1E2938",
        },
        border: {
          DEFAULT: "rgba(255,255,255,0.03)",
          light: "rgba(255,255,255,0.06)",
          focus: "#A3FF12",
        },
        accent: {
          DEFAULT: "#A3FF12",
          soft: "#7CFF3B",
          dim: "rgba(163,255,18,0.12)",
          glow: "rgba(163,255,18,0.25)",
        },
        profit: {
          DEFAULT: "#7CFF3B",
          dim: "rgba(124,255,59,0.12)",
        },
        loss: {
          DEFAULT: "#FF5A76",
          dim: "rgba(255,90,118,0.12)",
        },
        warn: {
          DEFAULT: "#FFB020",
          dim: "rgba(255,176,32,0.12)",
        },
        neutral: {
          DEFAULT: "#8b5cf6",
          dim: "rgba(139,92,246,0.12)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "grid-pattern":
          "linear-gradient(rgba(163,255,18,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(163,255,18,0.02) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 1.5s infinite",
        "draw-gauge": "drawGauge 1s ease-out forwards",
      },
      keyframes: {
        fadeIn: { from: { opacity: "0" }, to: { opacity: "1" } },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        drawGauge: {
          from: { strokeDashoffset: "283" },
          to: { strokeDashoffset: "var(--gauge-offset)" },
        },
      },
      boxShadow: {
        card: "0 2px 10px rgba(0,0,0,0.35)",
        "card-hover":
          "0 4px 14px rgba(0,0,0,0.40)",
        glow: "0 0 20px rgba(163,255,18,0.15)",
        "glow-green": "0 0 16px rgba(45,255,122,0.2)",
        "glow-red": "0 0 16px rgba(255,77,109,0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
