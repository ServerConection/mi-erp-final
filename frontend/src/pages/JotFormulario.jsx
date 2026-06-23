/**
 * JOT FORMULARIO — Embebido de formularios JotForm
 * Muestra el formulario según la empresa del usuario logueado:
 *   VELSA   → https://form.jotform.com/251603619851660
 *   NOVONET → https://form.jotform.com/213356674788673
 * Acceso libre para todos los perfiles.
 */

import { useState, useEffect } from "react";

const FORMS = {
  VELSA:   { id: "251603619851660", label: "VELSA",   color: "#7c3aed", bg: "#f5f3ff", border: "#c4b5fd" },
  NOVONET: { id: "213356674788673", label: "NOVONET", color: "#0369a1", bg: "#f0f9ff", border: "#7dd3fc" },
};

export default function JotFormulario() {
  const [empresa, setEmpresa] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    try {
      const perfil = JSON.parse(localStorage.getItem("userProfile") || "{}");
      const emp = (perfil.empresa || "").toUpperCase();
      setEmpresa(emp);
    } catch (_) {
      setEmpresa("NOVONET");
    }
  }, []);

  // Determinar formulario a mostrar
  const form = FORMS[empresa] || FORMS.NOVONET;
  const src  = `https://form.jotform.com/${form.id}`;

  return (
    <div className="flex flex-col h-full gap-4" style={{ minHeight: "calc(100vh - 120px)" }}>

      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-6 py-4 shadow-sm"
        style={{ background: form.bg, border: `1px solid ${form.border}` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center rounded-xl font-black text-white text-lg"
            style={{ width: 44, height: 44, background: form.color, boxShadow: `0 4px 14px ${form.color}55` }}
          >
            📋
          </div>
          <div>
            <h1 className="text-base font-black uppercase tracking-tight" style={{ color: form.color }}>
              JOT FORMULARIO · {form.label}
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: form.color, opacity: 0.6 }}>
              Formulario de ingreso de ventas
            </p>
          </div>
        </div>

        {/* Selector manual de empresa (por si el perfil tiene acceso a ambas) */}
        <div className="flex gap-2">
          {Object.entries(FORMS).map(([key, f]) => (
            <button
              key={key}
              onClick={() => setEmpresa(key)}
              className="px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border"
              style={{
                background:   empresa === key ? f.color   : "white",
                color:        empresa === key ? "white"   : f.color,
                borderColor:  f.border,
                boxShadow:    empresa === key ? `0 4px 12px ${f.color}40` : "none",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* iFrame embebido */}
      <div
        className="flex-1 rounded-2xl overflow-hidden shadow-md relative"
        style={{ border: `1px solid ${form.border}`, minHeight: 600 }}
      >
        {cargando && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10"
            style={{ background: form.bg }}
          >
            <div
              className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
              style={{ borderColor: `${form.border} ${form.border} ${form.border} transparent` }}
            />
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: form.color, opacity: 0.7 }}>
              Cargando formulario {form.label}…
            </p>
          </div>
        )}

        <iframe
          key={form.id}                      // fuerza re-render al cambiar empresa
          src={src}
          title={`Formulario JotForm ${form.label}`}
          onLoad={() => setCargando(false)}
          allow="geolocation; camera; microphone"
          style={{
            width:       "100%",
            height:      "100%",
            minHeight:   600,
            border:      "none",
            display:     "block",
            opacity:     cargando ? 0 : 1,
            transition:  "opacity .3s ease",
          }}
        />
      </div>

      {/* Footer */}
      <p className="text-center text-[8px] font-bold uppercase tracking-widest text-slate-400">
        Formulario embebido desde JotForm · {form.label} · ID {form.id}
      </p>
    </div>
  );
}
