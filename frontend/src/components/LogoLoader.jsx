import { useId } from "react";

export function NovoLogo({ size = 96, animated = false, ring = animated }) {
  const uid = useId().replace(/:/g, "");
  const id = (name) => `nv-${name}-${uid}`;
  const hexPath = "M60 22 L93 41 V79 L60 98 L27 79 V41 Z";

  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Novo Core ERP">
      <defs>
        <linearGradient id={id("badge")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e40af" /><stop offset="1" stopColor="#0b1b4a" /></linearGradient>
        <linearGradient id={id("edge")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#93c5fd" stopOpacity=".9" /><stop offset="1" stopColor="#1d4ed8" stopOpacity=".15" /></linearGradient>
        <linearGradient id={id("blue")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#93c5fd" /><stop offset="1" stopColor="#2563eb" /></linearGradient>
        <linearGradient id={id("white")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#bfdbfe" /></linearGradient>
        <linearGradient id={id("cyan")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#0891b2" /></linearGradient>
        <linearGradient id={id("ring")} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#60a5fa" stopOpacity="0" /><stop offset="1" stopColor="#93c5fd" /></linearGradient>
      </defs>
      {ring && <><circle cx="60" cy="60" r="55" fill="none" stroke="rgba(147,197,253,.16)" strokeWidth="2.5" /><g className={animated ? "nv-spin" : undefined} style={{ transformOrigin: "60px 60px" }}><path d="M5 60 A55 55 0 0 1 60 5" fill="none" stroke={`url(#${id("ring")})`} strokeWidth="3.5" strokeLinecap="round" /><circle cx="60" cy="5" r="4" fill="#93c5fd" /></g></>}
      <path d={hexPath} fill={`url(#${id("badge")})`} stroke={`url(#${id("badge")})`} strokeWidth="8" strokeLinejoin="round" />
      <path d={hexPath} fill="none" stroke={`url(#${id("edge")})`} strokeWidth="1.5" strokeLinejoin="round" transform="translate(60 60) scale(1.075) translate(-60 -60)" />
      <rect className={animated ? "nv-grow" : undefined} x="42" y="62" width="9" height="16" rx="2.5" fill={`url(#${id("blue")})`} />
      <rect className={animated ? "nv-grow nv-d1" : undefined} x="55.5" y="52" width="9" height="26" rx="2.5" fill={`url(#${id("white")})`} />
      <rect className={animated ? "nv-grow nv-d2" : undefined} x="69" y="42" width="9" height="36" rx="2.5" fill={`url(#${id("cyan")})`} />
    </svg>
  );
}

export default function LogoLoader({ show = true, text = "Cargando módulo…", fullScreen = false }) {
  if (!show) return null;
  return (
    <div className={`nv-overlay ${fullScreen ? "nv-full" : ""}`} role="status" aria-live="polite" aria-label={text}>
      <style>{loaderCss}</style>
      <div className="nv-card"><NovoLogo size={112} animated /><div className="nv-brand">NOVO CORE <span>ERP</span></div><div className="nv-sub">{text}</div><div className="nv-bar"><i /></div></div>
    </div>
  );
}

const loaderCss = `
.nv-overlay{position:absolute;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;background:rgba(7,17,45,.68);backdrop-filter:blur(7px) saturate(.72);-webkit-backdrop-filter:blur(7px) saturate(.72);animation:nv-fade .2s ease-out}
.nv-overlay.nv-full{position:fixed}.nv-card{display:flex;flex-direction:column;align-items:center;gap:10px;padding:28px 38px;border-radius:22px;background:rgba(8,20,50,.38);border:1px solid rgba(147,197,253,.13);box-shadow:0 24px 70px rgba(0,0,0,.26)}
.nv-brand{margin-top:8px;color:#fff;font:800 17px/1.2 Inter,system-ui,sans-serif;letter-spacing:.2em}.nv-brand span{color:#60a5fa}.nv-sub{color:rgba(255,255,255,.68);font:600 11px/1.3 Inter,system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}
.nv-bar{width:140px;height:3px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:6px}.nv-bar i{display:block;height:100%;width:40%;border-radius:3px;background:linear-gradient(90deg,#3b82f6,#67e8f9);animation:nv-slide 1.2s ease-in-out infinite}
.nv-spin{animation:nv-rot 1.3s linear infinite}.nv-grow{transform-box:fill-box;transform-origin:50% 100%;animation:nv-grow 1.4s ease-in-out infinite}.nv-d1{animation-delay:.15s}.nv-d2{animation-delay:.3s}
@keyframes nv-rot{to{transform:rotate(360deg)}}@keyframes nv-grow{0%,100%{transform:scaleY(.35)}45%,60%{transform:scaleY(1)}}@keyframes nv-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}@keyframes nv-fade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.nv-spin,.nv-grow,.nv-bar i{animation:none}}@media print{.nv-overlay{display:none!important}}
`;
