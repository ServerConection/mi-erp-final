// src/pages/BotVendedor.jsx
// Bot Vendedor IA: editar prompt y reglas, cargar conocimiento y probar el bot.
// Solo ADMINISTRADOR (el backend lo valida). Lo que se guarda aqui lo usa el bot
// de WhatsApp en menos de un minuto, sin reiniciarlo.
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Save, Upload, FileText, Plus, Send, Loader2, Archive, RotateCcw, Pin, PinOff, Eye, X, RefreshCw, Smartphone, ImagePlus, Image as ImageIcon } from "lucide-react";

const API = import.meta.env.VITE_API_URL;
const BASE = `${API}/api/bot-vendedor`;
const token = () => localStorage.getItem("token");
const headers = (json = true) => ({
  Authorization: `Bearer ${token()}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

async function pedir(url, opciones = {}) {
  const r = await fetch(url, opciones);
  let j = {};
  try { j = await r.json(); } catch { /* respuesta sin JSON */ }
  if (!r.ok || j.success === false) throw new Error(j.error || `Error ${r.status}`);
  return j.data;
}

const fecha = (f) => (f ? new Date(f).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" }) : "—");
const PESTANAS = [
  { id: "prompt", nombre: "Prompt y reglas" },
  { id: "conocimiento", nombre: "Conocimiento" },
  { id: "planes", nombre: "Planes e imágenes" },
  { id: "probar", nombre: "Probar bot" },
  { id: "lineas", nombre: "Líneas WhatsApp" },
];

export default function BotVendedor() {
  const [pestana, setPestana] = useState("prompt");
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
          <Bot className="w-7 h-7 text-blue-600" /> Bot Vendedor IA
        </h1>
        <p className="text-sm text-slate-500">
          Configura lo que sabe y cómo vende el bot de WhatsApp. Los cambios se aplican en menos de un minuto.
        </p>
      </div>
      <div className="flex gap-1 border-b mb-4">
        {PESTANAS.map((p) => (
          <button key={p.id} onClick={() => setPestana(p.id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px ${pestana === p.id ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {p.nombre}
          </button>
        ))}
      </div>
      {pestana === "prompt" && <PestanaPrompt />}
      {pestana === "conocimiento" && <PestanaConocimiento />}
      {pestana === "planes" && <PestanaPlanes />}
      {pestana === "probar" && <PestanaProbar />}
      {pestana === "lineas" && <PestanaLineas />}
    </div>
  );
}

// ─── Prompt y reglas ─────────────────────────────────────────────────────────
function PestanaPrompt() {
  const [cfg, setCfg] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [reglas, setReglas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    try {
      const d = await pedir(`${BASE}/config`, { headers: headers() });
      setCfg(d); setPrompt(d.prompt); setReglas(d.reglas);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => {
    setGuardando(true); setError(""); setAviso("");
    try {
      await pedir(`${BASE}/config`, { method: "PUT", headers: headers(), body: JSON.stringify({ prompt, reglas }) });
      setAviso("Guardado. El bot lo usará en menos de un minuto.");
      cargar();
    } catch (e) { setError(e.message); }
    setGuardando(false);
  };

  if (!cfg && !error) return <Cargando />;
  const cambiado = cfg && (prompt !== cfg.prompt || reglas !== cfg.reglas);

  return (
    <div className="space-y-4">
      {error && <Mensaje tipo="error" texto={error} />}
      {aviso && <Mensaje tipo="ok" texto={aviso} />}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex justify-between items-baseline mb-2">
          <h2 className="font-bold text-slate-800">Prompt del vendedor</h2>
          <span className="text-xs text-slate-400">{prompt.length} caracteres</span>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Quién es el bot, cómo habla y el flujo de venta. Mantén las palabras ESCALAR_ASESOR y FUERA_DE_HORARIO: así el bot pasa el chat a un asesor.
        </p>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={18}
          className="w-full border rounded-lg p-3 font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200" />
      </div>
      <div className="bg-white rounded-xl border p-4">
        <h2 className="font-bold text-slate-800 mb-1">Reglas adicionales</h2>
        <p className="text-xs text-slate-500 mb-2">
          Reglas rápidas del día a día, una por línea. Ejemplo: "Esta semana no ofrecer el plan Jedi", "Siempre preguntar si ya es cliente".
        </p>
        <textarea value={reglas} onChange={(e) => setReglas(e.target.value)} rows={6}
          placeholder="- Regla 1&#10;- Regla 2"
          className="w-full border rounded-lg p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Modelo: {cfg?.modelo} · Última edición: {cfg?.actualizado_por || "—"} {fecha(cfg?.actualizado_en)}
        </span>
        <button onClick={guardar} disabled={guardando || !cambiado}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
          {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar cambios
        </button>
      </div>
    </div>
  );
}

// ─── Conocimiento ────────────────────────────────────────────────────────────
function PestanaConocimiento() {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [fijarAlSubir, setFijarAlSubir] = useState(false);
  const [nuevoTexto, setNuevoTexto] = useState(null); // {nombre, contenido, siempre_incluir}
  const [viendo, setViendo] = useState(null); // documento completo

  const cargar = useCallback(async () => {
    setError("");
    try { setDocs(await pedir(`${BASE}/conocimiento`, { headers: headers() })); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (archivo) => {
    if (!archivo) return;
    setSubiendo(true); setError(""); setAviso("");
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("siempre_incluir", fijarAlSubir ? "true" : "false");
      const d = await pedir(`${BASE}/conocimiento/archivo`, { method: "POST", headers: headers(false), body: fd });
      setAviso(`"${d.nombre}" cargado (${d.caracteres.toLocaleString("es-EC")} caracteres de texto).`);
      cargar();
    } catch (e) { setError(e.message); }
    setSubiendo(false);
  };

  const actualizar = async (id, cambios) => {
    setError("");
    try {
      await pedir(`${BASE}/conocimiento/${id}`, { method: "PUT", headers: headers(), body: JSON.stringify(cambios) });
      cargar();
    } catch (e) { setError(e.message); }
  };

  const guardarTexto = async () => {
    setError("");
    try {
      await pedir(`${BASE}/conocimiento/texto`, { method: "POST", headers: headers(), body: JSON.stringify(nuevoTexto) });
      setNuevoTexto(null); setAviso("Texto agregado."); cargar();
    } catch (e) { setError(e.message); }
  };

  const ver = async (d) => {
    try { setViendo(await pedir(`${BASE}/conocimiento/${d.id}`, { headers: headers() })); } catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-4">
      {error && <Mensaje tipo="error" texto={error} />}
      {aviso && <Mensaje tipo="ok" texto={aviso} />}

      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="text-sm text-slate-600 max-w-xl">
          Sube la guía comercial, catálogos o políticas (PDF, TXT, MD, CSV). Marca <b>Siempre</b> solo en documentos cortos y clave (catálogo de precios):
          se envían completos en cada respuesta. El resto se busca por palabras.
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={fijarAlSubir} onChange={(e) => setFijarAlSubir(e.target.checked)} /> Siempre
          </label>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm cursor-pointer hover:bg-blue-700 ${subiendo ? "opacity-60 pointer-events-none" : ""}`}>
            {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {subiendo ? "Leyendo archivo…" : "Subir archivo"}
            <input type="file" accept=".pdf,.txt,.md,.csv" className="hidden"
              onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button onClick={() => setNuevoTexto({ nombre: "", contenido: "", siempre_incluir: false })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-600 text-blue-700 font-semibold text-sm hover:bg-blue-50">
            <Plus className="w-4 h-4" /> Escribir texto
          </button>
          <button onClick={cargar} title="Actualizar" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {nuevoTexto && (
        <div className="bg-white rounded-xl border p-4 space-y-2">
          <input value={nuevoTexto.nombre} onChange={(e) => setNuevoTexto({ ...nuevoTexto, nombre: e.target.value })}
            placeholder="Nombre (ej. Preguntas frecuentes de instalación)" className="w-full border rounded-lg p-2 text-sm" />
          <textarea value={nuevoTexto.contenido} onChange={(e) => setNuevoTexto({ ...nuevoTexto, contenido: e.target.value })}
            rows={8} placeholder="Escribe aquí la información que debe saber el bot" className="w-full border rounded-lg p-2 text-sm" />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={nuevoTexto.siempre_incluir}
                onChange={(e) => setNuevoTexto({ ...nuevoTexto, siempre_incluir: e.target.checked })} /> Enviar siempre
            </label>
            <div className="flex gap-2">
              <button onClick={() => setNuevoTexto(null)} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button onClick={guardarTexto} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {!docs && !error ? <Cargando /> : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left py-2 px-3">Documento</th>
                <th className="text-left py-2 px-3">Tamaño</th>
                <th className="text-left py-2 px-3">Uso</th>
                <th className="text-left py-2 px-3">Subido</th>
                <th className="py-2 px-3" />
              </tr>
            </thead>
            <tbody>
              {(docs || []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">Aún no hay documentos. Sube la guía comercial.</td></tr>
              )}
              {(docs || []).map((d) => (
                <tr key={d.id} className={`border-t ${d.activo ? "" : "opacity-50"}`}>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="break-all">{d.nombre}</span>
                      {!d.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">ARCHIVADO</span>}
                    </div>
                    <div className="text-xs text-slate-400 line-clamp-1">{d.vista_previa}</div>
                  </td>
                  <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{Number(d.caracteres).toLocaleString("es-EC")} car.</td>
                  <td className="py-2 px-3">
                    {d.siempre_incluir
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">Siempre</span>
                      : <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Búsqueda</span>}
                  </td>
                  <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{d.creado_por || "—"} · {fecha(d.creado_en)}</td>
                  <td className="py-2 px-3">
                    <div className="flex justify-end gap-1">
                      <button title="Ver texto" onClick={() => ver(d)} className="p-1.5 rounded hover:bg-slate-100 text-slate-600"><Eye className="w-4 h-4" /></button>
                      <button title={d.siempre_incluir ? "Pasar a búsqueda" : "Enviar siempre"}
                        onClick={() => actualizar(d.id, { siempre_incluir: !d.siempre_incluir })}
                        className="p-1.5 rounded hover:bg-slate-100 text-amber-600">
                        {d.siempre_incluir ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </button>
                      <button title={d.activo ? "Archivar (el bot deja de usarlo)" : "Reactivar"}
                        onClick={() => actualizar(d.id, { activo: !d.activo })}
                        className="p-1.5 rounded hover:bg-slate-100 text-slate-600">
                        {d.activo ? <Archive className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viendo && <VerDocumento doc={viendo} onCerrar={() => setViendo(null)}
        onGuardar={async (contenido) => { await actualizar(viendo.id, { contenido }); setViendo(null); setAviso("Documento actualizado."); }} />}
    </div>
  );
}

function VerDocumento({ doc, onCerrar, onGuardar }) {
  const [texto, setTexto] = useState(doc.contenido || "");
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-bold text-slate-800 break-all">{doc.nombre}</h3>
            <p className="text-xs text-slate-500">Este es el texto que lee el bot. Puedes corregirlo aquí.</p>
          </div>
          <button onClick={onCerrar} className="p-1.5 rounded hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)}
          className="flex-1 m-4 border rounded-lg p-3 font-mono text-xs min-h-[50vh]" />
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onCerrar} className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100">Cerrar</button>
          <button onClick={() => onGuardar(texto)} disabled={texto === doc.contenido}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">Guardar texto</button>
        </div>
      </div>
    </div>
  );
}

// ─── Probar ──────────────────────────────────────────────────────────────────
function PestanaProbar() {
  const [mensajes, setMensajes] = useState([]); // {role, content, meta?}
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState("");
  const fin = useRef(null);

  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes, pensando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || pensando) return;
    const nuevos = [...mensajes, { role: "user", content: t }];
    setMensajes(nuevos); setTexto(""); setPensando(true); setError("");
    try {
      const d = await pedir(`${BASE}/probar`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ historial: nuevos.map(({ role, content, imagenes }) => ({ role, content: imagenes?.length ? `${content}\n(Se enviaron las imagenes de los planes ${imagenes.join(", ")})` : content })) }),
      });
      setMensajes([...nuevos, { role: "assistant", content: d.texto, imagenes: d.imagenes || [], meta: `${d.modelo} · ${(d.ms / 1000).toFixed(1)} s${d.accion ? ` · ${d.accion}` : ""}` }]);
    } catch (e) { setError(e.message); }
    setPensando(false);
  };

  return (
    <div className="bg-white rounded-xl border flex flex-col h-[70vh]">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm text-slate-500">Escribe como si fueras un cliente. Usa el mismo prompt y conocimiento que el bot de WhatsApp.</span>
        <button onClick={() => { setMensajes([]); setError(""); }} className="text-xs px-3 py-1 rounded border hover:bg-slate-50">Nueva conversación</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#efeae2]">
        {mensajes.length === 0 && <p className="text-center text-sm text-slate-500 mt-10">Prueba con "hola".</p>}
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ${m.role === "user" ? "bg-[#d9fdd3]" : "bg-white"}`}>
              {m.content}
              {(m.imagenes || []).map((id) => <ImagenPlan key={id} id={id} className="mt-2 rounded-md max-h-64" />)}
              {m.meta && <div className="text-[10px] text-slate-400 mt-1">{m.meta}</div>}
            </div>
          </div>
        ))}
        {pensando && <div className="flex"><div className="bg-white rounded-lg px-3 py-2 text-sm text-slate-400 shadow-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> escribiendo…</div></div>}
        <div ref={fin} />
      </div>
      {error && <div className="px-3 pt-2"><Mensaje tipo="error" texto={error} /></div>}
      <div className="flex gap-2 p-3 border-t">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === "Enter" && enviar()}
          placeholder="Mensaje del cliente…" className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        <button onClick={enviar} disabled={pensando || !texto.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
          <Send className="w-4 h-4" /> Enviar
        </button>
      </div>
    </div>
  );
}

// ─── Líneas de WABOT ──────────────────────────────────────────────────────────
function PestanaLineas() {
  const [lineas, setLineas] = useState(null);
  const [error, setError] = useState("");
  const [cambiando, setCambiando] = useState(null);

  const cargar = useCallback(async () => {
    setError("");
    try { setLineas(await pedir(`${BASE}/lineas`, { headers: headers() })); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const alternar = async (l) => {
    const activar = !l.bot_activo;
    if (activar && !window.confirm(`¿Activar el bot vendedor en "${l.name}"? Responderá solo a los clientes de esa línea (reemplaza el flujo de bot que tenga asignado).`)) return;
    setCambiando(l.id); setError("");
    try {
      await pedir(`${BASE}/lineas/${l.id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ activo: activar }) });
      await cargar();
    } catch (e) { setError(e.message); }
    setCambiando(null);
  };

  return (
    <div className="space-y-4">
      {error && <Mensaje tipo="error" texto={error} />}
      <div className="bg-white rounded-xl border p-4 text-sm text-slate-600">
        Activa el bot en las líneas de WABOT que quieras. Se aplica en menos de 30 segundos. El bot se calla solo en un chat
        cuando pasa el caso a un asesor o cuando un asesor escribe a mano (por 2 horas). Las respuestas del bot se ven en la bandeja.
      </div>
      {!lineas && !error ? <Cargando /> : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left py-2 px-3">Línea</th>
                <th className="text-left py-2 px-3">Estado WhatsApp</th>
                <th className="text-left py-2 px-3">Último cambio</th>
                <th className="text-right py-2 px-3">Bot vendedor</th>
              </tr>
            </thead>
            <tbody>
              {(lineas || []).length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-slate-400">No hay líneas registradas en WABOT.</td></tr>
              )}
              {(lineas || []).map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <Smartphone className="w-4 h-4 text-green-600 shrink-0" /> {l.name}
                    </div>
                    <div className="text-xs text-slate-400">{l.phone_number || "sin número"}</div>
                  </td>
                  <td className="py-2 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${l.status === "connected" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {l.status === "connected" ? "Conectada" : (l.status || "desconectada")}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">{l.actualizado_por ? `${l.actualizado_por} · ${fecha(l.actualizado_en)}` : "—"}</td>
                  <td className="py-2 px-3 text-right">
                    <button onClick={() => alternar(l)} disabled={cambiando === l.id}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${l.bot_activo ? "bg-green-600" : "bg-slate-300"} disabled:opacity-50`}
                      title={l.bot_activo ? "Desactivar bot" : "Activar bot"}>
                      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${l.bot_activo ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Planes con imagen ───────────────────────────────────────────────────────
function PestanaPlanes() {
  const [planes, setPlanes] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [subiendo, setSubiendo] = useState(null);
  const [version, setVersion] = useState(0); // fuerza recargar miniaturas

  const cargar = useCallback(async () => {
    setError("");
    try { setPlanes(await pedir(`${BASE}/planes`, { headers: headers() })); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (plan, archivo) => {
    if (!archivo) return;
    setSubiendo(plan.id); setError(""); setAviso("");
    try {
      const fd = new FormData();
      fd.append("imagen", archivo);
      await pedir(`${BASE}/planes/${plan.id}/imagen`, { method: "POST", headers: headers(false), body: fd });
      setAviso(`Imagen de "${plan.nombre}" cargada.`);
      setVersion((v) => v + 1);
      await cargar();
    } catch (e) { setError(e.message); }
    setSubiendo(null);
  };

  const alternar = async (plan) => {
    try {
      await pedir(`${BASE}/planes/${plan.id}`, { method: "PUT", headers: headers(), body: JSON.stringify({ activo: !plan.activo }) });
      cargar();
    } catch (e) { setError(e.message); }
  };

  const agregar = async () => {
    const nombre = window.prompt("Nombre del plan tal como está en la guía comercial:");
    if (!nombre) return;
    const mbps = window.prompt("Velocidad en Mbps (solo el número):", "");
    try {
      await pedir(`${BASE}/planes`, { method: "POST", headers: headers(), body: JSON.stringify({ nombre, velocidad_mbps: mbps }) });
      cargar();
    } catch (e) { setError(e.message); }
  };

  if (!planes && !error) return <Cargando />;
  const conImagen = (planes || []).filter((p) => p.tiene_imagen).length;

  return (
    <div className="space-y-4">
      {error && <Mensaje tipo="error" texto={error} />}
      {aviso && <Mensaje tipo="ok" texto={aviso} />}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600 max-w-2xl">
          Sube la imagen de cada plan (JPG, PNG o WEBP, máx. 3 MB). Cuando el bot recomiende un plan o el cliente pregunte por él,
          enviará su imagen. Solo se usan los planes <b>activos y con imagen</b>.
          <div className="mt-1 font-semibold text-slate-800">{conImagen} de {(planes || []).length} planes con imagen.</div>
        </div>
        <button onClick={agregar}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-600 text-blue-700 font-semibold text-sm hover:bg-blue-50">
          <Plus className="w-4 h-4" /> Agregar plan
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(planes || []).map((p) => (
          <div key={p.id} className={`bg-white rounded-xl border p-3 flex flex-col gap-2 ${p.activo ? "" : "opacity-50"}`}>
            <div className="aspect-video rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
              {p.tiene_imagen
                ? <ImagenPlan key={`${p.id}-${version}`} id={p.id} className="w-full h-full object-contain" />
                : <div className="text-center text-xs text-slate-400"><ImageIcon className="w-8 h-8 mx-auto mb-1" />Falta la imagen</div>}
            </div>
            <div>
              <div className="font-bold text-slate-800 text-sm">{p.nombre}</div>
              <div className="text-xs text-slate-500">
                {p.velocidad_mbps ? `${p.velocidad_mbps} Mbps · ` : ""}{p.segmento}
              </div>
              {p.descripcion && <div className="text-xs text-slate-400 mt-1">{p.descripcion}</div>}
            </div>
            <div className="flex items-center justify-between mt-auto">
              <label className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${p.tiene_imagen ? "border border-blue-600 text-blue-700 hover:bg-blue-50" : "bg-blue-600 text-white hover:bg-blue-700"} ${subiendo === p.id ? "opacity-60 pointer-events-none" : ""}`}>
                {subiendo === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                {p.tiene_imagen ? "Cambiar imagen" : "Subir imagen"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={(e) => { subir(p, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button onClick={() => alternar(p)} className="text-xs text-slate-500 hover:text-slate-800">
                {p.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Las imágenes requieren el token, por eso se piden con fetch y se muestran como blob.
function ImagenPlan({ id, className }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivo = true;
    let creada = null;
    fetch(`${BASE}/planes/${id}/imagen`, { headers: headers(false) })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => { if (b && vivo) { creada = URL.createObjectURL(b); setUrl(creada); } })
      .catch(() => {});
    return () => { vivo = false; if (creada) URL.revokeObjectURL(creada); };
  }, [id]);
  if (!url) return <div className="text-xs text-slate-400 p-2">Cargando imagen…</div>;
  return <img src={url} alt="Plan" className={className} />;
}

// ─── Auxiliares ──────────────────────────────────────────────────────────────
function Cargando() {
  return <div className="flex items-center gap-2 text-slate-500 text-sm p-6"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;
}
function Mensaje({ tipo, texto }) {
  return (
    <div className={`text-sm rounded-lg px-3 py-2 ${tipo === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
      {texto}
    </div>
  );
}
