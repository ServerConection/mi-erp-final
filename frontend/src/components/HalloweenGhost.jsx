import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import HalloweenPumpkinFlight from "./HalloweenPumpkinFlight";

const MIN_INTERVAL = 3 * 60 * 1000;
const MAX_INTERVAL = 3 * 60 * 1000;
const FLIGHT_DURATION = 7000;
const NEXT_FLIGHT_KEY = "novo_erp_halloween_next_flight";

const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min));

function halloweenSeason() {
  const now = new Date();
  const month = now.getMonth();
  const day = now.getDate();
  return (month === 9 && day >= 20) || (month === 10 && day <= 2);
}

export default function HalloweenGhost() {
  const { pathname } = useLocation();
  const [flight, setFlight] = useState(null);

  useEffect(() => {
    const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const storageKey = localPreview ? `${NEXT_FLIGHT_KEY}_local` : NEXT_FLIGHT_KEY;
    const authenticated = Boolean(localStorage.getItem("token"));
    const excludedRoute = pathname === "/login" || pathname.startsWith("/embed/");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!authenticated || excludedRoute || reducedMotion || (!localPreview && !halloweenSeason())) return undefined;

    let timer;
    let hideTimer;
    let cancelled = false;

    const schedule = (delay) => {
      const nextAt = Date.now() + delay;
      localStorage.setItem(storageKey, String(nextAt));
      timer = window.setTimeout(showGhost, delay);
    };

    const showGhost = () => {
      if (cancelled) return;
      if (document.hidden) {
        schedule(60 * 1000);
        return;
      }

      const offset = randomBetween(-70, 71);
      setFlight({ id: Date.now(), offset, tilt: randomBetween(-5, 6) });

      hideTimer = window.setTimeout(() => {
        setFlight(null);
        schedule(randomBetween(MIN_INTERVAL, MAX_INTERVAL + 1));
      }, FLIGHT_DURATION);
    };

    const savedNext = Number(localStorage.getItem(storageKey));
    const initialDelay = Number.isFinite(savedNext) && savedNext > Date.now()
      ? savedNext - Date.now()
      : randomBetween(MIN_INTERVAL, MAX_INTERVAL + 1);
    schedule(initialDelay);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(hideTimer);
      setFlight(null);
    };
  }, [pathname]);

  if (!flight) return null;

  return (
    <>
      <HalloweenPumpkinFlight flight={flight} />
      <div className="halloween-ghost-layer" aria-hidden="true">
      <div
        key={flight.id}
        className="halloween-ghost-flight"
        style={{ "--ghost-offset": `${flight.offset}px`, "--ghost-tilt": `${flight.tilt}deg` }}
      >
        <span className="halloween-mist mist-one" />
        <span className="halloween-mist mist-two" />
        <span className="halloween-mist mist-three" />
        <svg className="halloween-ghost" viewBox="0 0 360 220" role="presentation">
          <defs>
            <linearGradient id="ghostBody" x1="0" y1="0" x2=".9" y2="1">
              <stop offset="0" stopColor="#f0f9ff" stopOpacity="1" />
              <stop offset=".38" stopColor="#94a3b8" stopOpacity=".94" />
              <stop offset=".78" stopColor="#475569" stopOpacity=".74" />
              <stop offset="1" stopColor="#0f172a" stopOpacity=".28" />
            </linearGradient>
            <radialGradient id="hoodDark" cx="50%" cy="42%" r="60%">
              <stop offset="0" stopColor="#020617" />
              <stop offset=".7" stopColor="#111827" />
              <stop offset="1" stopColor="#334155" stopOpacity=".94" />
            </radialGradient>
            <filter id="ghostGlow" x="-60%" y="-70%" width="240%" height="250%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor="#67e8f9" floodOpacity=".42" />
              <feComposite in2="blur" operator="in" />
              <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="eyeGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="3" result="redBlur" />
              <feMerge><feMergeNode in="redBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g filter="url(#ghostGlow)">
            <path
              d="M331 148c-38-14-70-9-101-3-21 4-40 6-55-1 36 17 70 26 111 23-55 25-112 13-145-8-18-11-31-12-53-2-19 9-45 16-76 8 31-9 51-26 63-48 7-13 10-29 12-46C91 31 118 8 153 8c43 0 70 31 69 76 0 15 6 28 18 38 20 17 51 25 91 26Z"
              fill="url(#ghostBody)" stroke="#475569" strokeOpacity=".55" strokeWidth="3"
            />
            <path d="M103 99c-7-43 12-76 50-78 39 1 59 34 49 78-8 34-25 50-49 50-25 0-43-17-50-50Z" fill="url(#hoodDark)" />
            <path d="M119 73c9-18 23-28 35-28 14 0 29 12 36 30-9-7-19-11-35-11-15 0-26 3-36 9Z" fill="#64748b" opacity=".28" />
            <path d="M125 90c9-8 20-7 27 2-5 15-11 21-19 18-7-2-10-9-8-20Zm57 0c-9-8-20-7-27 2 5 15 11 21 19 18 7-2 10-9 8-20Z" fill="#000" />
            <g filter="url(#eyeGlow)" fill="#ef4444">
              <path d="M133 94c5-3 10-2 13 2-3 6-7 8-11 6-3-1-4-4-2-8Z" />
              <path d="M174 94c-5-3-10-2-13 2 3 6 7 8 11 6 3-1 4-4 2-8Z" />
            </g>
            <path d="M140 124c8-9 20-9 28 0-2 13-7 19-14 19s-12-6-14-19Z" fill="#000" opacity=".9" />
            <path d="M98 119c-24 3-43 15-60 34 22-10 42-11 60-6m108-31c26 4 50 15 72 33-27-10-50-10-70-3" fill="none" stroke="#64748b" strokeOpacity=".76" strokeWidth="9" strokeLinecap="round" />
          </g>
        </svg>
      </div>

      <style>{`
        .halloween-ghost-layer {
          position: fixed; inset: 0; z-index: 9996; overflow: hidden;
          pointer-events: none; user-select: none;
        }
        .halloween-ghost-flight {
          position: absolute; top: calc(50% + var(--ghost-offset)); right: -250px;
          width: 360px; height: 220px;
          animation: halloween-cross ${FLIGHT_DURATION}ms cubic-bezier(.18,.65,.25,1) forwards;
          will-change: transform, opacity;
        }
        .halloween-ghost { width: 360px; height: 220px; overflow: visible;
          animation: halloween-float 1.15s ease-in-out infinite alternate; }
        .halloween-mist { position: absolute; border-radius: 50%; background: rgba(103,232,249,.2);
          filter: blur(12px); animation: halloween-mist 1.8s ease-in-out infinite alternate; }
        .mist-one { width: 110px; height: 38px; left: -70px; top: 88px; }
        .mist-two { width: 75px; height: 28px; left: -118px; top: 126px; animation-delay: -.7s; }
        .mist-three { width: 55px; height: 20px; left: -155px; top: 70px; animation-delay: -1.2s; }
        @keyframes halloween-cross {
          0% { transform: translate3d(0, 15px, 0) rotate(var(--ghost-tilt)); opacity: 0; }
          6% { opacity: 1; }
          50% { transform: translate3d(calc(-50vw - 305px), -12px, 0) rotate(-2deg); opacity: 1; }
          94% { opacity: 1; }
          100% { transform: translate3d(calc(-100vw - 650px), 10px, 0) rotate(var(--ghost-tilt)); opacity: 0; }
        }
        @keyframes halloween-float { from { transform: translateY(-7px) rotate(-1deg); } to { transform: translateY(7px) rotate(1.5deg); } }
        @keyframes halloween-mist { from { transform: translateX(0) scale(.8); opacity: .25; } to { transform: translateX(-22px) scale(1.18); opacity: .65; } }
        @media (max-width: 640px) { .halloween-ghost-flight { scale: .72; transform-origin: right center; } }
        @media print, (prefers-reduced-motion: reduce) { .halloween-ghost-layer { display: none !important; } }
      `}</style>
      </div>
    </>
  );
}
