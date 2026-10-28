import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const SCREAMER_DURATION = 1450;
const SCREAMER_INTERVAL = 10_000;

export default function HalloweenPumpkinScreamer() {
  const { pathname } = useLocation();
  const [appearance, setAppearance] = useState(0);

  useEffect(() => {
    const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const authenticated = Boolean(localStorage.getItem("token"));
    const excludedRoute = pathname === "/login" || pathname.startsWith("/embed/");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!localPreview || !authenticated || excludedRoute || reducedMotion) return undefined;

    let hideTimer;
    const show = () => {
      if (document.hidden) return;
      setAppearance(Date.now());
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setAppearance(0), SCREAMER_DURATION);
    };

    // Sale entre dos apariciones del fantasma, para poder evaluar ambos efectos.
    const firstTimer = window.setTimeout(show, 5200);
    const interval = window.setInterval(show, SCREAMER_INTERVAL);

    return () => {
      window.clearTimeout(firstTimer);
      window.clearTimeout(hideTimer);
      window.clearInterval(interval);
      setAppearance(0);
    };
  }, [pathname]);

  if (!appearance) return null;

  return (
    <div key={appearance} className="pumpkin-screamer" aria-hidden="true">
      <div className="pumpkin-screamer-flash" />
      <svg className="pumpkin-screamer-face" viewBox="0 0 620 620" role="presentation">
        <defs>
          <radialGradient id="pumpkinSkin" cx="50%" cy="40%" r="62%">
            <stop offset="0" stopColor="#fb923c" />
            <stop offset=".52" stopColor="#c2410c" />
            <stop offset="1" stopColor="#431407" />
          </radialGradient>
          <radialGradient id="pumpkinFire" cx="50%" cy="50%" r="60%">
            <stop offset="0" stopColor="#fff7ae" />
            <stop offset=".35" stopColor="#facc15" />
            <stop offset="1" stopColor="#ef4444" />
          </radialGradient>
          <filter id="pumpkinGlow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="14" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <path d="M276 108c-4-46 18-76 67-89-10 30-2 57 24 80-22 4-44 7-66 18Z" fill="#365314" stroke="#172554" strokeWidth="10" />
        <path d="M305 101C158 66 56 164 64 315c8 150 112 253 246 253s238-103 246-253C564 164 462 66 315 101Z" fill="url(#pumpkinSkin)" stroke="#270800" strokeWidth="18" />
        <path d="M225 107c-57 85-61 349 4 444M392 107c57 85 61 349-4 444M305 100c-30 103-30 357 0 463" fill="none" stroke="#7c2d12" strokeWidth="18" opacity=".72" />

        <g filter="url(#pumpkinGlow)" fill="url(#pumpkinFire)" stroke="#2b0700" strokeWidth="13" strokeLinejoin="round">
          <path d="M121 244l133-56-43 112-91-11Z" />
          <path d="M499 244l-133-56 43 112 91-11Z" />
          <path d="M284 302l27-68 28 68-29 30Z" />
          <path d="M120 372l74 20 35-30 42 34 40-32 40 32 42-34 35 30 74-20-32 105-67-24-39 49-53-39-53 39-39-49-67 24Z" />
        </g>

        <g fill="#1a0500">
          <path d="M132 251l86-36-24 59-61-7Z" />
          <path d="M488 251l-86-36 24 59 61-7Z" />
          <path d="M154 402l47 12 30-26 40 34 40-32 40 32 40-34 30 26 47-12-20 48-54-18-42 45-51-39-51 39-42-45-54 18Z" />
        </g>
      </svg>
      <div className="pumpkin-screamer-vignette" />

      <style>{`
        .pumpkin-screamer {
          position: fixed; inset: 0; z-index: 10020; overflow: hidden;
          display: grid; place-items: center; pointer-events: none;
          background: rgba(2, 6, 23, .74);
          animation: pumpkin-backdrop ${SCREAMER_DURATION}ms ease-out forwards;
        }
        .pumpkin-screamer-face {
          width: min(72vh, 680px); height: min(72vh, 680px);
          filter: drop-shadow(0 0 28px rgba(249,115,22,.9));
          animation: pumpkin-jump ${SCREAMER_DURATION}ms cubic-bezier(.1,.8,.2,1) forwards;
          will-change: transform, opacity;
        }
        .pumpkin-screamer-flash {
          position: absolute; inset: 0; background: #f97316;
          mix-blend-mode: screen; animation: pumpkin-flash ${SCREAMER_DURATION}ms ease-out forwards;
        }
        .pumpkin-screamer-vignette {
          position: absolute; inset: -10%;
          box-shadow: inset 0 0 180px 75px #000;
          animation: pumpkin-vignette .16s steps(2,end) infinite;
        }
        @keyframes pumpkin-jump {
          0% { transform: scale(.08) rotate(-8deg); opacity: 0; }
          10% { transform: scale(1.18) rotate(3deg); opacity: 1; }
          18% { transform: scale(.96) rotate(-2deg); }
          27% { transform: scale(1.08) translate(-8px, 5px); }
          36% { transform: scale(1.11) translate(9px, -5px); }
          48% { transform: scale(1.14) translate(-5px, 4px); }
          72% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1.55); opacity: 0; }
        }
        @keyframes pumpkin-backdrop { 0% { opacity: 0; } 8%,76% { opacity: 1; } 100% { opacity: 0; } }
        @keyframes pumpkin-flash { 0% { opacity: .95; } 9% { opacity: 0; } 15% { opacity: .28; } 22%,100% { opacity: 0; } }
        @keyframes pumpkin-vignette { 0% { transform: translate(-3px,2px); } 100% { transform: translate(3px,-2px); } }
        @media print, (prefers-reduced-motion: reduce) { .pumpkin-screamer { display: none !important; } }
      `}</style>
    </div>
  );
}
