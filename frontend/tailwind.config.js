/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          blue: "#2563eb",
          indigo: "#4f46e5",
          navy: "#1A3A6E",
        },
        novonet: {
          DEFAULT: "#2563eb",
          light: "#3b82f6",
          dark: "#1d4ed8",
          50: "#eff6ff",
          100: "#dbeafe",
        },
        velsa: {
          DEFAULT: "#ea580c",
          light: "#f97316",
          dark: "#c2410c",
          50: "#fff7ed",
          100: "#ffedd5",
        },
        netlife: {
          DEFAULT: "#FF6B00",
          light: "#FF8533",
          tint: "#FFF3E8",
        },
        accent: {
          teal: "#0d9488",
          amber: "#f59e0b",
          rose: "#e11d48",
          emerald: "#10b981",
          violet: "#8b5cf6",
        },
        surface: {
          DEFAULT: "#ffffff",
          2: "#f8fafc",
          3: "#f1f5f9",
        },
        ink: {
          DEFAULT: "#0f172a",
          secondary: "#475569",
          muted: "#94a3b8",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
        "card-hover": "0 8px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)",
        glow: "0 0 0 1px rgba(37,99,235,0.12), 0 8px 24px rgba(37,99,235,0.16)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: 0, transform: "translateY(8px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in-up": "fadeInUp 0.35s ease-out both",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
}
