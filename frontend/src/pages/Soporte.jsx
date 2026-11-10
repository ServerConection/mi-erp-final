// src/pages/Soporte.jsx
// ============================================================
// SOPORTE DESARROLLO — mesa de ayuda.
//   Todos: "Reportar" (falla / crear usuario / eliminar usuario, con capturas
//          pegadas con Ctrl+V) y "Mis solicitudes".
//   Desarrollo (kchala, bpineda): "Tablero" kanban (más antiguo primero) y
//          "Métricas" de tiempos de respuesta y módulos con más fallas.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  LifeBuoy, Send, ImagePlus, X, Clock, CheckCircle2, Loader2, RefreshCw,
  User, Building2, MessageSquareText, BarChart3, Inbox, ClipboardList,
} from "lucide-react";
import {
  soporteApi, MODULOS_SOPORTE, TIPOS_SOPORTE, ESTADOS_SOPORTE, hace, duracion, fechaHora,
} from "../components/soporte/soporteApi";

const MAX_CAPTURAS = 5;
const ORDEN_ESTADOS = ["SIN_ATENDER", "EN_PROCESO", "ATENDIDO"];

// ─── Captura (imagen protegida con token) ────────────────────────────────────
function Captura({ adjunto }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let vivo = true;
    let objUrl = null;
    soporteApi.adjuntoBlob(adjunto.id)
      .then((b) => { objUrl = URL.createObjectURL(b); if (vivo) setUrl(objUrl); })
      .catch(() => vivo && setError(true));
    return () => { vivo = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [adjunto.id]);
  if (error) return <div className="w-28 h-20 rounded-lg bg-slate-100 text-[11px] text-slate-400 flex items-center justify-center">No disponible</div>;
  if (!url) return <div className="w-28 h-20 rounded-lg bg-slate-100 animate-pulse" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir en grande">
      <img src={url} alt={adjunto.nombre || "captura"} className="w-28 h-20 object-cover rounded-lg border border-slate-200 hover:ring-2 hover:ring-blue-400" />
    </a>
  );
}

const BadgeTipo = ({ tipo }) => {
  const t = TIPOS_SOPORTE[tipo] || TIPOS_SOPORTE.INCIDENCIA;
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${t.color}`}>{t.icono} {t.corto}</span>;
};
const BadgeEstado = ({ estado }) => {
  const e = ESTADOS_SOPORTE[estado] || ESTADOS_SOPORTE.SIN_ATENDER;
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${e.suave}`}>{e.label}</span>;
};

const ETIQUETAS_DATOS = {
  nombres: "Nombres completos", cedula: "Cédula", correo: "Correo", empresa: "Empresa",
  cargo: "Cargo", perfil: "Perfil en el ERP", fecha: "Fecha", usuario: "Usuario", motivo: "Motivo",
};
function DatosTicket({ datos }) {
  const entradas = Object.entries(datos || {}).filter(([, v]) => v);
  if (!entradas.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm bg-slate-50 rounded-lg p-3">
      {entradas.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-slate-500">{ETIQUETAS_DATOS[k] || k}</dt>
          <dd className="text-slate-800 font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// FORMULARIO DE REGISTRO
// ═════════════════════════════════════════════════════════════════════════════
const CAMPOS_TIPO = {
  CREACION_USUARIO: [
    ["nombres", "Nombres y apellidos *", "text"],
    ["cedula", "Cédula", "text"],
    ["correo", "Correo", "email"],
    ["empresa", "Empresa *", "empresa"],
    ["cargo", "Cargo", "text"],
    ["perfil", "Perfil en el ERP", "perfil"],
    ["fecha", "Fecha de ingreso", "date"],
  ],
  ELIMINACION_USUARIO: [
    ["nombres", "Nombres y apellidos *", "text"],
    ["usuario", "Usuario del ERP / Bitrix", "text"],
    ["empresa", "Empresa *", "empresa"],
    ["fecha", "Fecha de salida", "date"],
    ["motivo", "Motivo", "text"],
  ],
};
const OBLIGATORIOS = { CREACION_USUARIO: ["nombres", "empresa"], ELIMINACION_USUARIO: ["nombres", "empresa"] };

function FormularioReporte({ onCreado }) {
  const [tipo, setTipo] = useState("INCIDENCIA");
  const [modulo, setModulo] = useState(MODULOS_SOPORTE[0]);
  const [descripcion, setDescripcion] = useState("");
  const [datos, setDatos] = useState({});
  const [capturas, setCapturas] = useState([]); // [{file, url}]
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const inputRef = useRef(null);

  const agregarArchivos = useCallback((files) => {
    const imgs = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setCapturas((prev) => {
      const libres = MAX_CAPTURAS - prev.length;
      const nuevas = imgs.slice(0, libres).map((f, i) => {
        const nombre = f.name && f.name !== "image.png" ? f.name : `captura-${Date.now()}-${i}.png`;
        const file = new File([f], nombre, { type: f.type });
        return { file, url: URL.createObjectURL(file) };
      });
      return [...prev, ...nuevas];
    });
  }, []);

  // Ctrl+V en cualquier parte de la pantalla pega la captura.
  useEffect(() => {
    const onPaste = (e) => {
      const files = Array.from(e.clipboardData?.items || [])
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile()).filter(Boolean);
      if (files.length) { e.preventDefault(); agregarArchivos(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [agregarArchivos]);

  useEffect(() => () => capturas.forEach((c) => URL.revokeObjectURL(c.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const quitar = (i) => setCapturas((prev) => {
    URL.revokeObjectURL(prev[i].url);
    return prev.filter((_, j) => j !== i);
  });

  const limpiar = () => {
    capturas.forEach((c) => URL.revokeObjectURL(c.url));
    setCapturas([]); setDescripcion(""); setDatos({});
  };

  const enviar = async (e) => {
    e.preventDefault();
    setMensaje(null);
    const faltan = (OBLIGATORIOS[tipo] || []).filter((k) => !String(datos[k] || "").trim());
    if (faltan.length) return setMensaje({ tipo: "error", texto: "Completa los campos marcados con *." });
    if (descripcion.trim().length < 5) return setMensaje({ tipo: "error", texto: "Cuéntanos qué pasó o qué necesitas." });

    const fd = new FormData();
    fd.append("tipo", tipo);
    if (tipo === "INCIDENCIA") fd.append("modulo", modulo);
    fd.append("descripcion", descripcion.trim());
    fd.append("datos", JSON.stringify(tipo === "INCIDENCIA" ? {} : datos));
    capturas.forEach((c) => fd.append("capturas", c.file));

    setEnviando(true);
    try {
      const r = await soporteApi.crear(fd);
      limpiar();
      setMensaje({
        tipo: r.aviso ? "aviso" : "ok",
        texto: `✅ Solicitud #${r.data.id} enviada al área de desarrollo. Te avisaremos aquí cuando esté atendida.${r.aviso ? ` (${r.aviso})` : ""}`,
      });
      onCreado?.();
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message });
    } finally {
      setEnviando(false);
    }
  };

  const campo = (k, label, tipoCampo) => {
    const valor = datos[k] || "";
    const set = (v) => setDatos((d) => ({ ...d, [k]: v }));
    const cls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300";
    return (
      <label key={k} className="block">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        {tipoCampo === "empresa" ? (
          <select className={cls} value={valor} onChange={(e) => set(e.target.value)}>
            <option value="">Selecciona…</option><option>NOVONET</option><option>VELSA</option><option>Otra</option>
          </select>
        ) : tipoCampo === "perfil" ? (
          <select className={cls} value={valor} onChange={(e) => set(e.target.value)}>
            <option value="">Selecciona…</option>
            {["USUARIO (asesor)", "SUPERVISOR", "ANALISTA", "GERENCIA", "TTHH", "ATC", "ADMINISTRADOR"].map((p) => <option key={p}>{p}</option>)}
          </select>
        ) : (
          <input type={tipoCampo} className={cls} value={valor} onChange={(e) => set(e.target.value)} />
        )}
      </label>
    );
  };

  return (
    <form onSubmit={enviar} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 md:p-6 space-y-5 max-w-3xl">
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">¿Qué necesitas?</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {Object.entries(TIPOS_SOPORTE).map(([k, t]) => (
            <button type="button" key={k} onClick={() => { setTipo(k); setDatos({}); setMensaje(null); }}
              className={`text-left p-3 rounded-xl border-2 transition ${tipo === k ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="text-xl">{t.icono}</div>
              <div className="text-sm font-bold text-slate-800">{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      {tipo === "INCIDENCIA" ? (
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">¿Qué herramienta o módulo falló?</span>
          <select value={modulo} onChange={(e) => setModulo(e.target.value)}
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
            {MODULOS_SOPORTE.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CAMPOS_TIPO[tipo].map(([k, l, t]) => campo(k, l, t))}
        </div>
      )}

      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          {tipo === "INCIDENCIA" ? "Describe el error" : "Detalle de la solicitud"}
        </span>
        <textarea rows={5} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={5000}
          placeholder={tipo === "INCIDENCIA"
            ? "Ej.: Al abrir WABOT no cargan los chats desde las 9:00. Sale el mensaje 'Error de conexión'."
            : "Accesos o módulos que necesita, observaciones…"}
          className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
      </label>

      <div>
        <span className="text-sm font-semibold text-slate-700">Capturas de pantalla (opcional)</span>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); agregarArchivos(e.dataTransfer.files); }}
          className="mt-1 border-2 border-dashed border-slate-300 rounded-xl p-4 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40"
        >
          <ImagePlus className="w-7 h-7 mx-auto text-slate-400" />
          <p className="text-sm text-slate-600 mt-1">
            Pega tu captura con <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-xs">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-xs">V</kbd>, arrástrala aquí o haz clic
          </p>
          <p className="text-[11px] text-slate-400">Máx. {MAX_CAPTURAS} imágenes de 5 MB · Tip: Windows + Shift + S para recortar la pantalla</p>
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
            onChange={(e) => { agregarArchivos(e.target.files); e.target.value = ""; }} />
        </div>
        {capturas.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {capturas.map((c, i) => (
              <div key={c.url} className="relative">
                <img src={c.url} alt="" className="w-28 h-20 object-cover rounded-lg border" />
                <button type="button" onClick={() => quitar(i)} title="Quitar"
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {mensaje && (
        <div className={`text-sm rounded-lg px-3 py-2 ${mensaje.tipo === "error" ? "bg-rose-50 text-rose-700" : mensaje.tipo === "aviso" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          {mensaje.texto}
        </div>
      )}

      <button type="submit" disabled={enviando}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-60">
        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {enviando ? "Enviando…" : "Enviar a Desarrollo"}
      </button>
    </form>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DETALLE (modal)
// ═════════════════════════════════════════════════════════════════════════════
function DetalleTicket({ ticket, esDesarrollo, onCerrar, onCambio, estadoDestino }) {
  const [respuesta, setRespuesta] = useState(ticket.respuesta || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [pidiendoRespuesta, setPidiendoRespuesta] = useState(estadoDestino === "ATENDIDO");

  const mover = async (estado) => {
    if (estado === "ATENDIDO" && !respuesta.trim()) { setPidiendoRespuesta(true); setError("Escribe la respuesta que verá el usuario."); return; }
    setGuardando(true); setError("");
    try {
      const t = await soporteApi.cambiarEstado(ticket.id, estado, estado === "ATENDIDO" ? respuesta.trim() : undefined);
      onCambio(t);
    } catch (e) { setError(e.message); } finally { setGuardando(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/40 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-5 border-b">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-bold text-slate-400">#{ticket.id}</span>
              <BadgeTipo tipo={ticket.tipo} /><BadgeEstado estado={ticket.estado} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">{ticket.titulo}</h3>
            <p className="text-xs text-slate-500 mt-1">
              {ticket.creado_por_nombre || ticket.creado_por} · {ticket.empresa || "—"} · {fechaHora(ticket.creado_en)}
            </p>
          </div>
          <button onClick={onCerrar} className="p-1 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <DatosTicket datos={ticket.datos} />
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{ticket.descripcion}</p>
          {ticket.adjuntos?.length > 0 && (
            <div className="flex flex-wrap gap-2">{ticket.adjuntos.map((a) => <Captura key={a.id} adjunto={a} />)}</div>
          )}

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-slate-50 rounded-lg p-2"><div className="text-slate-400">Creado</div><div className="font-semibold">{fechaHora(ticket.creado_en)}</div></div>
            <div className="bg-slate-50 rounded-lg p-2"><div className="text-slate-400">En proceso</div><div className="font-semibold">{fechaHora(ticket.en_proceso_en)}</div>{ticket.tomado_por && <div className="text-slate-400">{ticket.tomado_por}</div>}</div>
            <div className="bg-slate-50 rounded-lg p-2"><div className="text-slate-400">Atendido</div><div className="font-semibold">{fechaHora(ticket.atendido_en)}</div>{ticket.atendido_por && <div className="text-slate-400">{ticket.atendido_por}</div>}</div>
          </div>

          {ticket.estado === "ATENDIDO" && ticket.respuesta && !pidiendoRespuesta && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs font-bold text-emerald-700 mb-1">Respuesta de Desarrollo</p>
              <p className="text-sm text-emerald-900 whitespace-pre-wrap">{ticket.respuesta}</p>
            </div>
          )}

          {esDesarrollo && (
            <div className="border-t pt-4 space-y-3">
              {(pidiendoRespuesta || ticket.estado !== "ATENDIDO") && (
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Respuesta para el usuario {pidiendoRespuesta && "*"}</span>
                  <textarea rows={3} value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
                    placeholder="Ej.: Se reinició la sesión de WABOT, ya puedes ingresar."
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300" />
                </label>
              )}
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <div className="flex flex-wrap gap-2 justify-end">
                {ticket.estado !== "SIN_ATENDER" && (
                  <button disabled={guardando} onClick={() => mover("SIN_ATENDER")} className="px-3 py-2 rounded-lg border text-sm text-slate-600 hover:bg-slate-50">↩ Sin atender</button>
                )}
                {ticket.estado !== "EN_PROCESO" && (
                  <button disabled={guardando} onClick={() => mover("EN_PROCESO")} className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600">⏳ Tomar / En proceso</button>
                )}
                <button disabled={guardando} onClick={() => mover("ATENDIDO")} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 flex items-center gap-1">
                  {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {ticket.estado === "ATENDIDO" ? "Actualizar respuesta" : "Marcar atendido"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TABLERO KANBAN (desarrollo)
// ═════════════════════════════════════════════════════════════════════════════
function Tablero({ esDesarrollo }) {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState(null); // { ticket, destino }
  const [arrastrado, setArrastrado] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("");

  const cargar = useCallback(async () => {
    try { setError(""); setTickets(await soporteApi.tickets("todos")); }
    catch (e) { setError(e.message); } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  const columnas = useMemo(() => {
    const base = Object.fromEntries(ORDEN_ESTADOS.map((e) => [e, []]));
    tickets.filter((t) => !filtroTipo || t.tipo === filtroTipo).forEach((t) => base[t.estado]?.push(t));
    // Atendidos: el más reciente arriba. Pendientes: el más antiguo arriba.
    base.ATENDIDO.sort((a, b) => new Date(b.atendido_en) - new Date(a.atendido_en));
    return base;
  }, [tickets, filtroTipo]);

  const actualizar = (t) => {
    setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, ...t } : x)));
    setAbierto(null);
  };

  const soltar = async (estado) => {
    const t = arrastrado; setArrastrado(null);
    if (!t || t.estado === estado) return;
    if (estado === "ATENDIDO") { setAbierto({ ticket: t, destino: "ATENDIDO" }); return; }
    try { actualizar(await soporteApi.cambiarEstado(t.id, estado)); } catch (e) { alert(`❌ ${e.message}`); }
  };

  if (cargando) return <p className="text-slate-500 text-sm">Cargando tablero…</p>;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_SOPORTE).map(([k, t]) => <option key={k} value={k}>{t.corto}</option>)}
        </select>
        <button onClick={cargar} className="flex items-center gap-1 px-3 py-2 rounded-lg border text-sm hover:bg-slate-50"><RefreshCw className="w-4 h-4" /> Actualizar</button>
        <span className="text-xs text-slate-400">Arrastra las tarjetas entre columnas · se actualiza cada 30 s</span>
      </div>
      {error && <p className="text-sm text-rose-600 mb-2">⚠️ {error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {ORDEN_ESTADOS.map((estado) => {
          const e = ESTADOS_SOPORTE[estado];
          return (
            <div key={estado} onDragOver={(ev) => ev.preventDefault()} onDrop={() => soltar(estado)}
              className={`rounded-2xl bg-slate-50 border border-slate-200 p-3 min-h-[420px] ${arrastrado && arrastrado.estado !== estado ? "ring-2 ring-blue-200" : ""}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-700 flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${e.color}`} />{e.label}</h3>
                <span className="text-xs font-bold bg-white border rounded-full px-2 py-0.5">{columnas[estado].length}</span>
              </div>
              <div className="space-y-2">
                {columnas[estado].map((t) => (
                  <div key={t.id} draggable onDragStart={() => setArrastrado(t)} onDragEnd={() => setArrastrado(null)}
                    onClick={() => setAbierto({ ticket: t })}
                    className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm hover:shadow-md cursor-pointer">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <BadgeTipo tipo={t.tipo} />
                      <span className="text-[11px] text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{hace(estado === "ATENDIDO" ? t.atendido_en : t.creado_en)}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-800">#{t.id} · {t.titulo}</p>
                    <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{t.descripcion}</p>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><User className="w-3 h-3" />{t.creado_por}</span>
                      {t.empresa && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{t.empresa}</span>}
                      {t.adjuntos?.length > 0 && <span>📎 {t.adjuntos.length}</span>}
                      {t.tomado_por && estado !== "SIN_ATENDER" && <span className="ml-auto font-semibold text-slate-600">{t.tomado_por}</span>}
                    </div>
                  </div>
                ))}
                {columnas[estado].length === 0 && <p className="text-xs text-slate-400 text-center py-8">Sin tickets</p>}
              </div>
            </div>
          );
        })}
      </div>
      {abierto && (
        <DetalleTicket ticket={abierto.ticket} estadoDestino={abierto.destino} esDesarrollo={esDesarrollo}
          onCerrar={() => setAbierto(null)} onCambio={actualizar} />
      )}
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MIS SOLICITUDES
// ═════════════════════════════════════════════════════════════════════════════
function MisSolicitudes({ version }) {
  const [tickets, setTickets] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState(null);

  const cargar = useCallback(async () => {
    try { setTickets(await soporteApi.tickets("mios")); } catch { /* silencioso */ } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar, version]);

  const abrir = (t) => {
    setAbierto(t);
    if (t.estado === "ATENDIDO" && !t.visto_por_usuario) {
      soporteApi.visto(t.id).catch(() => {});
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, visto_por_usuario: true } : x)));
      window.dispatchEvent(new Event("soporte:avisos"));
    }
  };

  if (cargando) return <p className="text-slate-500 text-sm">Cargando…</p>;
  if (!tickets.length) return (
    <div className="text-center text-slate-400 py-16 bg-white rounded-2xl border">
      <Inbox className="w-10 h-10 mx-auto mb-2" /><p>Aún no has enviado solicitudes.</p>
    </div>
  );

  return (
    <div className="space-y-2 max-w-3xl">
      {tickets.map((t) => (
        <button key={t.id} onClick={() => abrir(t)}
          className={`w-full text-left bg-white rounded-xl border p-4 hover:shadow-md transition ${t.estado === "ATENDIDO" && !t.visto_por_usuario ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-400">#{t.id}</span>
            <BadgeTipo tipo={t.tipo} /><BadgeEstado estado={t.estado} />
            {t.estado === "ATENDIDO" && !t.visto_por_usuario && <span className="text-[11px] font-bold text-emerald-600">● Nueva respuesta</span>}
            <span className="ml-auto text-xs text-slate-400">{fechaHora(t.creado_en)}</span>
          </div>
          <p className="text-sm font-semibold text-slate-800 mt-1">{t.titulo}</p>
          {t.estado === "ATENDIDO" && t.respuesta && (
            <p className="text-sm text-emerald-800 mt-1 flex gap-1"><MessageSquareText className="w-4 h-4 shrink-0 mt-0.5" />{t.respuesta}</p>
          )}
        </button>
      ))}
      {abierto && <DetalleTicket ticket={abierto} esDesarrollo={false} onCerrar={() => setAbierto(null)} onCambio={() => {}} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MÉTRICAS (desarrollo)
// ═════════════════════════════════════════════════════════════════════════════
function Metricas() {
  const hoy = new Date().toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 8) + "01";
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoy);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    soporteApi.metricas(desde, hasta).then(setDatos).catch((e) => setError(e.message));
  }, [desde, hasta]);

  const r = datos?.resumen || {};
  const maxMod = Math.max(1, ...(datos?.porModulo || []).map((m) => m.total));
  const tarjetas = [
    ["Total", r.total ?? 0, "text-slate-800"],
    ["Sin atender", r.sin_atender ?? 0, "text-rose-600"],
    ["En proceso", r.en_proceso ?? 0, "text-amber-600"],
    ["Atendidos", r.atendido ?? 0, "text-emerald-600"],
    ["1ª respuesta prom.", duracion(r.min_primera_respuesta), "text-blue-700"],
    ["Resolución prom.", duracion(r.min_resolucion), "text-blue-700"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border rounded-lg px-2 py-1.5" />
        <span className="text-slate-500">hasta</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border rounded-lg px-2 py-1.5" />
      </div>
      {error && <p className="text-sm text-rose-600">⚠️ {error}</p>}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {tarjetas.map(([l, v, c]) => (
          <div key={l} className="bg-white rounded-xl border p-3">
            <div className="text-xs text-slate-500">{l}</div>
            <div className={`text-xl font-extrabold ${c}`}>{v}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <h4 className="font-bold text-slate-700 mb-3">Módulos con más fallas</h4>
          {(datos?.porModulo || []).length === 0 && <p className="text-sm text-slate-400">Sin incidencias en el periodo.</p>}
          {(datos?.porModulo || []).map((m) => (
            <div key={m.modulo} className="mb-2">
              <div className="flex justify-between text-sm"><span className="text-slate-700">{m.modulo}</span><span className="font-semibold">{m.total} · {duracion(m.min_resolucion)}</span></div>
              <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-rose-400 rounded-full" style={{ width: `${(m.total / maxMod) * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border p-4">
          <h4 className="font-bold text-slate-700 mb-3">Por tipo de solicitud</h4>
          {(datos?.porTipo || []).map((t) => (
            <div key={t.tipo} className="flex justify-between items-center py-1.5 border-b last:border-0">
              <BadgeTipo tipo={t.tipo} /><span className="font-bold">{t.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
export default function Soporte() {
  const [params, setParams] = useSearchParams();
  const [esDesarrollo, setEsDesarrollo] = useState(false);
  const [version, setVersion] = useState(0);
  const tab = params.get("tab") || "reportar";
  const setTab = (t) => setParams({ tab: t }, { replace: true });

  useEffect(() => { soporteApi.me().then((m) => setEsDesarrollo(!!m.esDesarrollo)).catch(() => {}); }, []);

  const tabs = [
    ["reportar", "Reportar", LifeBuoy],
    ["mis", "Mis solicitudes", ClipboardList],
    ...(esDesarrollo ? [["tablero", "Tablero Desarrollo", Inbox], ["metricas", "Métricas", BarChart3]] : []),
  ];

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <span className="w-11 h-11 rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white flex items-center justify-center shadow-lg">
          <LifeBuoy className="w-6 h-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">Soporte Desarrollo</h1>
          <p className="text-sm text-slate-500">Reporta fallas de herramientas o pide creación/eliminación de usuarios. Te avisamos cuando esté atendido.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-5 border-b">
        {tabs.map(([k, l, Icono]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            <Icono className="w-4 h-4" />{l}
          </button>
        ))}
      </div>

      {tab === "reportar" && <FormularioReporte onCreado={() => setVersion((v) => v + 1)} />}
      {tab === "mis" && <MisSolicitudes version={version} />}
      {tab === "tablero" && esDesarrollo && <Tablero esDesarrollo />}
      {tab === "metricas" && esDesarrollo && <Metricas />}
    </div>
  );
}
