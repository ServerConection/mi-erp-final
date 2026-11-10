// Burbuja flotante de Soporte (salvavidas). Reemplaza a la burbuja de Tareas.
//  - Usuario: badge = solicitudes atendidas sin leer + aviso emergente.
//  - Desarrollo: badge = tickets sin atender.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LifeBuoy, X, CheckCircle2 } from "lucide-react";
import { soporteApi } from "./soporteApi";

export default function BotonSoporte() {
  const navigate = useNavigate();
  const location = useLocation();
  const inbox = location.pathname.includes("/inbox");
  const [avisos, setAvisos] = useState({ atendidos: [], sinAtender: 0, esDesarrollo: false });
  const [toast, setToast] = useState(null);
  const vistos = useRef(new Set());
  const primeraCarga = useRef(true);

  const cargar = useCallback(() => {
    soporteApi.avisos().then((d) => {
      setAvisos(d);
      const nuevo = (d.atendidos || []).find((a) => !vistos.current.has(a.id));
      (d.atendidos || []).forEach((a) => vistos.current.add(a.id));
      if (nuevo) setToast(nuevo); // también al entrar: así no se pierde el aviso
      primeraCarga.current = false;
    }).catch(() => { /* la burbuja nunca debe romper el ERP */ });
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 60000);
    window.addEventListener("soporte:avisos", cargar);
    return () => { clearInterval(t); window.removeEventListener("soporte:avisos", cargar); };
  }, [cargar]);

  useEffect(() => { if (location.pathname === "/soporte") cargar(); }, [location.pathname, cargar]);

  const total = (avisos.atendidos?.length || 0) + (avisos.esDesarrollo ? avisos.sinAtender || 0 : 0);
  const destino = avisos.esDesarrollo && avisos.sinAtender > 0 && !avisos.atendidos?.length ? "/soporte?tab=tablero"
    : avisos.atendidos?.length ? "/soporte?tab=mis" : "/soporte";

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(destino)}
        title="Soporte Desarrollo — reportar un problema"
        aria-label={total ? `Soporte, ${total} avisos` : "Soporte Desarrollo"}
        className={`fixed ${inbox ? "top-[248px]" : "bottom-[112px]"} right-2 z-[999] group`}
      >
        <span className="relative flex items-center justify-center w-11 h-11 rounded-full text-white
                         shadow-[0_8px_24px_rgba(225,29,72,0.45)] transition-transform duration-200
                         group-hover:scale-110 group-active:scale-95 bg-gradient-to-br from-rose-500 to-red-600">
          <LifeBuoy className="w-5 h-5" />
        </span>
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full bg-amber-400 text-slate-900
                           text-[11px] font-bold flex items-center justify-center px-1 border-2 border-white animate-pulse">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {toast && (
        <div className={`fixed ${inbox ? "top-[300px]" : "bottom-[170px]"} right-3 z-[1000] w-80 bg-white rounded-xl shadow-2xl border border-emerald-200 p-4`}>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800">Tu solicitud #{toast.id} fue atendida</p>
              <p className="text-xs text-slate-500 truncate">{toast.titulo}</p>
              {toast.respuesta && <p className="text-sm text-slate-700 mt-1 line-clamp-3">{toast.respuesta}</p>}
              <button onClick={() => { setToast(null); navigate("/soporte?tab=mis"); }}
                className="mt-2 text-xs font-bold text-emerald-700 hover:underline">Ver detalle →</button>
            </div>
            <button onClick={() => setToast(null)} className="p-0.5 rounded hover:bg-slate-100"><X className="w-4 h-4 text-slate-400" /></button>
          </div>
        </div>
      )}
    </>
  );
}
