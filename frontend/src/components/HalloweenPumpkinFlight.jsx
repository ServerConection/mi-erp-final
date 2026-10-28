const FLIGHT_DURATION = 7000;

export default function HalloweenPumpkinFlight({ flight }) {
  if (!flight) return null;

  return (
    <div className="halloween-pumpkin-layer" aria-hidden="true">
      <div
        key={flight.id}
        className="halloween-pumpkin-flight"
        style={{ "--pumpkin-offset": `${flight.offset - 175}px` }}
      >
        <span className="pumpkin-trail pumpkin-trail-one" />
        <span className="pumpkin-trail pumpkin-trail-two" />
        <svg className="flying-pumpkin" viewBox="0 0 240 210" role="presentation">
          <defs>
            <radialGradient id="flyingPumpkinSkin" cx="45%" cy="35%" r="70%">
              <stop offset="0" stopColor="#fed7aa" stopOpacity=".86" />
              <stop offset=".48" stopColor="#f97316" stopOpacity=".78" />
              <stop offset="1" stopColor="#7c2d12" stopOpacity=".7" />
            </radialGradient>
            <radialGradient id="flyingPumpkinFire" cx="50%" cy="50%" r="65%">
              <stop offset="0" stopColor="#fff7ae" />
              <stop offset=".45" stopColor="#facc15" />
              <stop offset="1" stopColor="#ef4444" />
            </radialGradient>
            <filter id="flyingPumpkinGlow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <path d="M108 43c-2-25 10-39 37-47-6 18-2 32 13 45-15 1-29 5-41 12Z" fill="#3f6212" stroke="#1a2e05" strokeWidth="5" />
          <path d="M120 42C55 28 17 74 24 126c8 58 47 88 96 88s88-30 96-88c7-52-31-98-96-84Z" fill="url(#flyingPumpkinSkin)" stroke="#240700" strokeWidth="9" />
          <path d="M83 47c-22 42-23 122 1 158m72-158c22 42 23 122-1 158M120 43c-12 44-12 126 0 169" fill="none" stroke="#7c2d12" strokeWidth="7" opacity=".7" />
          <g filter="url(#flyingPumpkinGlow)" fill="url(#flyingPumpkinFire)" stroke="#290700" strokeWidth="6" strokeLinejoin="round">
            <path d="M48 105l55-27-18 50-38-6Z" />
            <path d="M192 105l-55-27 18 50 38-6Z" />
            <path d="M108 138l12-27 12 27-12 12Z" />
            <path d="M55 154l31 8 15-12 19 15 19-15 15 12 31-8-14 39-28-10-18 20-21-17-21 17-18-20-28 10Z" />
          </g>
        </svg>
      </div>

      <style>{`
        .halloween-pumpkin-layer {
          position: fixed; inset: 0; z-index: 9995; overflow: hidden;
          pointer-events: none; user-select: none;
        }
        .halloween-pumpkin-flight {
          position: absolute; top: calc(50% + var(--pumpkin-offset)); left: -270px;
          width: 240px; height: 210px;
          animation: pumpkin-cross ${FLIGHT_DURATION}ms cubic-bezier(.18,.65,.25,1) forwards;
          will-change: transform, opacity;
        }
        .flying-pumpkin {
          width: 240px; height: 210px; overflow: visible;
          animation: pumpkin-float .8s ease-in-out infinite alternate;
          opacity: .76;
          filter: saturate(.88) contrast(1.06) drop-shadow(0 7px 9px rgba(67,20,7,.34)) drop-shadow(0 0 18px rgba(251,146,60,.7));
        }
        .pumpkin-trail {
          position: absolute; top: 92px; right: 205px; border-radius: 50%;
          background: rgba(249,115,22,.25); filter: blur(11px);
          animation: pumpkin-trail 1.2s ease-in-out infinite alternate;
        }
        .pumpkin-trail-one { width: 95px; height: 30px; }
        .pumpkin-trail-two { width: 60px; height: 20px; right: 275px; top: 116px; animation-delay: -.55s; }
        @keyframes pumpkin-cross {
          0% { transform: translate3d(0, 8px, 0) rotate(-7deg); opacity: 0; }
          7% { opacity: 1; }
          50% { transform: translate3d(calc(50vw + 150px), -9px, 0) rotate(4deg); opacity: 1; }
          94% { opacity: 1; }
          100% { transform: translate3d(calc(100vw + 540px), 7px, 0) rotate(-5deg); opacity: 0; }
        }
        @keyframes pumpkin-float { from { transform: translateY(-5px) rotate(-1deg); } to { transform: translateY(6px) rotate(1deg); } }
        @keyframes pumpkin-trail { from { transform: scale(.7); opacity: .2; } to { transform: translateX(-18px) scale(1.15); opacity: .65; } }
        @media (max-width: 640px) { .halloween-pumpkin-flight { scale: .7; transform-origin: left center; } }
        @media print, (prefers-reduced-motion: reduce) { .halloween-pumpkin-layer { display: none !important; } }
      `}</style>
    </div>
  );
}
