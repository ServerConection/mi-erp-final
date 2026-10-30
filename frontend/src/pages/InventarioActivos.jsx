import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, ChevronLeft, ChevronRight, ClipboardEdit, Cpu, Download, Image as ImageIcon, Laptop, Loader2, Plus, Save, Search, ShieldCheck, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PlanoInventarioActivos from "../components/PlanoInventarioActivos";

const API = `${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}/api/inventario-activos`;
const API_ORIGEN = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const urlFoto = (ruta) => !ruta ? "" : /^https?:\/\//i.test(ruta) ? ruta : `${API_ORIGEN}${ruta.startsWith('/') ? ruta : `/uploads/${ruta}`}`;

// Catalogo inicial de areas. Modificar solamente esta constante cuando cambie.
const AREAS = [
  "COMERCIAL", "TALENTO HUMANO", "CONTABILIDAD", "DESARROLLO",
  "GERENCIA COMERCIAL", "ANALISTA", "FINANCIERO", "GERENCIA GENERAL",
  "GERENCIA FINANCIERA", "BACKOFFICE",
];
const TIPOS = ["CPU", "MONITOR", "LAPTOP", "TELEVISION", "IMPRESORA"];
const ESTADOS = ["ACTIVO", "EN REPARACION", "DISPONIBLE", "DE BAJA"];
const SI_NO_CAMBIAR = ["SI", "NO", "CAMBIAR"];
const FILTROS_INICIAL = {
  empresa: "", tipo_dispositivo: "", area: "", estado: "", cambio_reemplazo: "", q: "",
  ram_gb_min: "", ram_gb_max: "", disco_gb_min: "", disco_gb_max: "",
};

const INICIAL = {
  empresa: "", tipo_dispositivo: "", marca: "", modelo: "", numero_serie: "",
  procesador: "", ram_gb: "", disco_tipo: "", disco_gb: "", fecha_fabricacion: "",
  pulgadas: "", impresion: "", ubicacion: "", area: "", estado: "",
  fecha_adquisicion: "", observacion_vida_util: "", mouse: "", teclado: "",
  regulador: "", cambio_reemplazo: "", foto: null,
  usuario_asignado_id: null, usuario_asignado_nombre: "", usuario_asignado_cargo: "", usuario_asignado_perfil: "",
};

const leerPerfil = () => {
  try { return JSON.parse(localStorage.getItem("userProfile") || "{}"); }
  catch { return {}; }
};
const normalizarEntrada = (valor) => valor.toUpperCase().replace(/\s{2,}/g, " ");
const cabeceras = () => ({
  Authorization: `Bearer ${localStorage.getItem("token")}`,
  "Content-Type": "application/json",
});
async function leerRespuesta(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `No se pudo completar la operacion (HTTP ${response.status}).`);
  return data;
}

function Campo({ label, requerido = false, ayuda, children, className = "" }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}{requerido && <span className="ml-1 text-rose-500">*</span>}
      </span>
      {children}
      {ayuda && <span className="text-xs text-slate-400">{ayuda}</span>}
    </label>
  );
}

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

function SelectOpciones({ value, onChange, opciones, requerido = false }) {
  return (
    <select required={requerido} value={value} onChange={onChange} className={inputClass}>
      <option value="">SELECCIONE</option>
      {opciones.map((opcion) => <option key={opcion}>{opcion}</option>)}
    </select>
  );
}

const DETALLE_CAMPOS = [
  ["id", "ID"], ["empresa", "Empresa"], ["tipo_dispositivo", "Tipo"], ["marca", "Marca"],
  ["modelo", "Modelo"], ["numero_serie", "Serie / MAC"], ["procesador", "Procesador"],
  ["usuario_asignado_nombre", "Usuario asignado"], ["usuario_asignado_cargo", "Cargo del usuario"],
  ["ram", "RAM (texto compatible)"], ["ram_gb", "RAM (GB)"], ["disco_tipo", "Tipo de disco"],
  ["disco_espacio", "Disco (texto compatible)"], ["disco_gb", "Disco (GB)"],
  ["fecha_fabricacion", "Fecha de fabricacion"], ["pulgadas", "Pulgadas"], ["impresion", "Impresion"],
  ["ubicacion", "Ubicacion"], ["area", "Area"], ["responsable", "Responsable"],
  ["estado", "Estado"], ["fecha_adquisicion", "Fecha de adquisicion"],
  ["fecha_revision", "Fecha de revision"], ["mouse", "Mouse"], ["teclado", "Teclado"],
  ["regulador", "Regulador"], ["cambio_reemplazo", "Cambio / reemplazo"],
  ["observacion_vida_util", "Observacion de vida util"],
  ["created_at", "Creado"], ["updated_at", "Actualizado"], ["creado_por", "Creado por"],
  ["actualizado_por", "Actualizado por"],
];

const mostrarValor = (campo, valor) => {
  if (valor === null || valor === undefined || valor === "") return "-";
  if (["fecha_revision", "created_at", "updated_at"].includes(campo)) return new Date(valor).toLocaleString("es-EC");
  return String(valor);
};

function ModalDetalle({ activo, esAdmin, onCerrar, onEditar }) {
  if (!activo) return null;
  return <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={onCerrar}>
    <section role="dialog" aria-modal="true" aria-labelledby="detalle-activo-titulo" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl" onMouseDown={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
        <div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Detalle del activo</p><h2 id="detalle-activo-titulo" className="text-xl font-black text-slate-900">{activo.id} · {activo.tipo_dispositivo}</h2></div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar detalle" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X /></button>
      </div>
      {activo.foto && <div className="bg-slate-100 p-4 sm:p-6"><img src={urlFoto(activo.foto)} alt={`Activo ${activo.id}`} className="mx-auto max-h-[420px] w-full rounded-2xl object-contain shadow-sm" /></div>}
      <div className="border-b border-slate-200 bg-blue-50/60 px-5 py-4 sm:px-7">
        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-600">Ultima auditoria del equipo</p>
        {activo.cargandoAuditoria ? <p className="mt-2 text-sm font-semibold text-slate-500">Cargando auditoria...</p> : activo.ultima_auditoria ? <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div><p className="text-xs font-bold text-slate-400">PERFIL WINDOWS</p><p className="mt-1 font-black text-slate-800">{activo.ultima_auditoria.perfil_windows}</p></div>
          <div><p className="text-xs font-bold text-slate-400">USB BLOQUEADO</p><p className="mt-1 font-black text-slate-800">{activo.ultima_auditoria.usb_bloqueado ? "SI" : "NO"}</p></div>
          <div><p className="text-xs font-bold text-slate-400">PAGINAS BLOQUEADAS</p><p className="mt-1 font-black text-slate-800">{activo.ultima_auditoria.paginas_bloqueadas_ok ? "OK" : "NO"}</p></div>
          <div><p className="text-xs font-bold text-slate-400">FECHA</p><p className="mt-1 font-black text-slate-800">{new Date(activo.ultima_auditoria.fecha_auditoria).toLocaleString("es-EC")}</p></div>
        </div> : <p className="mt-2 text-sm font-semibold text-slate-500">Este activo aun no tiene auditorias.</p>}
      </div>
      <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
        {DETALLE_CAMPOS.map(([campo, etiqueta]) => <div key={campo} className={`bg-white px-5 py-4 ${campo === "observacion_vida_util" ? "sm:col-span-2 lg:col-span-3" : ""}`}><p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{etiqueta}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{mostrarValor(campo, activo[campo])}</p></div>)}
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:px-7">
        <button type="button" onClick={onCerrar} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cerrar</button>
        {esAdmin && <button type="button" onClick={onEditar} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-700"><ClipboardEdit size={17} /> Editar</button>}
      </div>
    </section>
  </div>;
}

const COLORES_ESTADO = ["#2563eb", "#10b981", "#f59e0b", "#64748b", "#8b5cf6"];

function DashboardInventario({ datos, cargando, onFiltro, onDetalle }) {
  if (cargando) return <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="animate-spin text-blue-600" size={30} /></div>;
  const kpis = datos?.kpis || {};
  const tarjetas = [
    ["Total", kpis.total, {}], ["NOVONET", kpis.novonet, { empresa: "NOVONET" }],
    ["VELSA", kpis.velsa, { empresa: "VELSA" }], ["Sin responsable / POR DEFINIR", kpis.sin_responsable, { especial: "sin_responsable" }],
    ["Sin auditoria (+90 dias)", kpis.sin_auditoria_90, { especial: "sin_auditoria_90" }], ["RAM menor a 8 GB", kpis.ram_menor_8, { ram_gb_max: "7.99" }],
  ];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{tarjetas.map(([titulo, valor, filtro]) => <button type="button" key={titulo} onClick={() => onFiltro(filtro)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"><div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Laptop size={18} /></div><p className="text-2xl font-black text-slate-900">{valor || 0}</p><p className="mt-1 text-xs font-semibold leading-4 text-slate-500">{titulo}</p><p className="mt-3 text-[10px] font-black uppercase tracking-wide text-blue-600">Ver equipos</p></button>)}</div>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-800">Equipos por area</h2><p className="mb-4 text-xs text-slate-500">Haz clic en una barra para abrir el listado.</p><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={datos?.por_area || []} layout="vertical" margin={{ left: 10, right: 20 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="nombre" width={115} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="total" name="Equipos" radius={[0, 7, 7, 0]}>{(datos?.por_area || []).map((item) => <Cell key={item.nombre} fill="#2563eb" className="cursor-pointer" onClick={() => onFiltro({ area: item.nombre === "SIN AREA" ? "" : item.nombre })} />)}</Bar></BarChart></ResponsiveContainer></div></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-black text-slate-800">Equipos por estado</h2><p className="mb-4 text-xs text-slate-500">Haz clic en un segmento para abrir el listado.</p><div className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={datos?.por_estado || []} dataKey="total" nameKey="nombre" innerRadius={65} outerRadius={105} paddingAngle={3}>{(datos?.por_estado || []).map((item, indice) => <Cell key={item.nombre} fill={COLORES_ESTADO[indice % COLORES_ESTADO.length]} className="cursor-pointer" onClick={() => onFiltro({ estado: item.nombre === "SIN ESTADO" ? "" : item.nombre })} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></section>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-black text-slate-800">10 equipos a revisar</h2><p className="text-xs text-slate-500">Priorizados por cantidad de alertas y antiguedad de auditoria.</p></div><div className="divide-y divide-slate-100">{(datos?.por_revisar || []).map((equipo) => <button type="button" key={equipo.id} onClick={() => onDetalle(equipo)} className="flex w-full flex-col gap-1 px-5 py-3 text-left hover:bg-blue-50 sm:flex-row sm:items-center sm:justify-between"><div><span className="font-black text-blue-700">{equipo.id}</span><span className="ml-2 text-sm font-semibold text-slate-700">{equipo.marca} {equipo.modelo || ""}</span><p className="text-xs text-slate-400">{equipo.empresa} · {equipo.area || "SIN AREA"}</p></div><p className="text-xs font-bold text-amber-700 sm:max-w-[55%] sm:text-right">{equipo.motivo}</p></button>)}{!datos?.por_revisar?.length && <p className="p-8 text-center text-sm font-semibold text-slate-400">No hay equipos pendientes de revision.</p>}</div></section>
  </div>;
}

function EstadoBadge({ valor }) {
  const estilos = valor === "ACTIVO" ? "bg-emerald-50 text-emerald-700" : valor === "DE BAJA" ? "bg-slate-100 text-slate-600" : valor === "EN REPARACION" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-black ${estilos}`}>{valor || "-"}</span>;
}

export default function InventarioActivos() {
  const paginaRef = useRef(null);
  const [perfil] = useState(() => leerPerfil());
  const esAdmin = String(perfil.perfil || "").trim().toUpperCase() === "ADMINISTRADOR";
  const usuarioSesion = normalizarEntrada(String(perfil.usuario || perfil.nombre || "USUARIO AUTENTICADO"));
  const [form, setForm] = useState(INICIAL);
  const [activosPaginados, setActivos] = useState([]);
  const [activosPlano, setActivosPlano] = useState([]);
  const [cargandoPlano, setCargandoPlano] = useState(true);
  const [vistaPrincipal, setVistaPrincipal] = useState("dashboard");
  const [idSolicitado, setIdSolicitado] = useState("");
  const [usuarioAsignadoId, setUsuarioAsignadoId] = useState(perfil.id ? String(perfil.id) : "");
  const [usuariosAsignables, setUsuariosAsignables] = useState([]);
  const [busquedaUsuario, setBusquedaUsuario] = useState("");
  const [selectorUsuarioAbierto, setSelectorUsuarioAbierto] = useState(false);
  const [verTodasEmpresas, setVerTodasEmpresas] = useState(false);
  const [marcasOpciones, setMarcasOpciones] = useState([]);
  const [activoId, setActivoId] = useState("");
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIAL);
  const [filtrosAplicados, setFiltrosAplicados] = useState(FILTROS_INICIAL);
  const [pagina, setPagina] = useState(1);
  const [paginacionReal, setPaginacion] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 });
  const [dashboard, setDashboard] = useState(null);
  const [cargandoDashboard, setCargandoDashboard] = useState(true);
  const [filtroEspecial, setFiltroEspecial] = useState("");
  const [responsable, setResponsable] = useState(usuarioSesion);
  const [fechaRevision, setFechaRevision] = useState("AUTOMATICA AL GUARDAR");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [fotoArchivo, setFotoArchivo] = useState(null);
  const [fotoPreview, setFotoPreview] = useState("");
  const [discoEntrada, setDiscoEntrada] = useState("");
  const [discoUnidad, setDiscoUnidad] = useState("GB");
  const [mensaje, setMensaje] = useState(null);

  const marcas = useMemo(() => [...new Set(marcasOpciones.filter(Boolean))].sort(), [marcasOpciones]);
  const activos = filtroEspecial ? (dashboard?.filtros_especiales?.[filtroEspecial] || []) : activosPaginados;
  const activosVisibles = activos;
  const paginacion = filtroEspecial ? { page: 1, limit: activos.length, total: activos.length, total_pages: 1 } : paginacionReal;
  const usuariosAsignablesFiltrados = useMemo(() => {
    const termino = normalizarEntrada(busquedaUsuario.trim());
    if (!termino) return usuariosAsignables;
    return usuariosAsignables.filter((usuario) => {
      return normalizarEntrada([
        usuario.nombre, usuario.usuario, usuario.cargo, usuario.perfil, usuario.empresa,
      ].filter(Boolean).join(" ")).includes(termino);
    });
  }, [busquedaUsuario, usuariosAsignables]);
  const usuarioAsignadoActual = usuariosAsignables.find((usuario) => String(usuario.id) === String(usuarioAsignadoId));
  const etiquetaUsuario = (usuario) => `${usuario.nombre} · ${usuario.cargo || usuario.perfil || "SIN CARGO"} · ${usuario.empresa}`;
  const esComputador = ["CPU", "LAPTOP"].includes(form.tipo_dispositivo);
  const esPantalla = ["MONITOR", "TELEVISION"].includes(form.tipo_dispositivo);
  const esImpresora = form.tipo_dispositivo === "IMPRESORA";

  const irAlInicio = () => {
    const contenedor = paginaRef.current?.parentElement;
    if (contenedor) contenedor.scrollTo({ top: 0, behavior: "auto" });
  };

  const cargarDiscoEnFormulario = (discoGBOriginal) => {
    const discoGB = discoGBOriginal === null || discoGBOriginal === undefined || discoGBOriginal === ""
      ? ""
      : Number(discoGBOriginal);
    const usarTB = discoGB !== "" && discoGB >= 1024 && discoGB % 1024 === 0;
    setDiscoUnidad(usarTB ? "TB" : "GB");
    setDiscoEntrada(discoGB === "" ? "" : String(usarTB ? discoGB / 1024 : discoGB));
  };

  const cargarActivoEnFormulario = (activo) => {
    setForm(Object.fromEntries(Object.keys(INICIAL).map((campo) => [campo, activo[campo] ?? INICIAL[campo]])));
    cargarDiscoEnFormulario(activo.disco_gb);
    setResponsable(activo.responsable || "-");
    setFechaRevision(activo.fecha_revision ? new Date(activo.fecha_revision).toLocaleString("es-EC") : "-");
    setFotoArchivo(null);
    setFotoPreview(urlFoto(activo.foto));
  };

  const parametrosListado = (incluirPagina = true) => {
    const params = new URLSearchParams();
    Object.entries(filtrosAplicados).forEach(([campo, valor]) => { if (valor) params.set(campo, valor); });
    if (incluirPagina) { params.set("page", String(pagina)); params.set("limit", "20"); }
    return params.toString();
  };

  const cargarActivos = async () => {
    const respuestaListado = await fetch(`${API}?${parametrosListado(true)}`, { headers: cabeceras() });
    const listado = await leerRespuesta(respuestaListado);
    setActivos(listado.data || []);
    setPaginacion(listado.pagination || { page: 1, limit: 20, total: 0, total_pages: 0 });
  };

  const cargarDashboard = async () => {
    setCargandoDashboard(true);
    try {
      const respuesta = await fetch(`${API}/dashboard`, { headers: cabeceras() });
      const datos = await leerRespuesta(respuesta);
      setDashboard(datos.data || null);
    } finally { setCargandoDashboard(false); }
  };

  const cargarPlano = async () => {
    setCargandoPlano(true);
    try {
      const respuesta = await fetch(`${API}/plano`, { headers: cabeceras() });
      const datos = await leerRespuesta(respuesta);
      setActivosPlano(datos.data || []);
    } finally {
      setCargandoPlano(false);
    }
  };

  useEffect(() => {
    let vigente = true;
    const params = new URLSearchParams();
    Object.entries(filtrosAplicados).forEach(([campo, valor]) => { if (valor) params.set(campo, valor); });
    params.set("page", String(pagina)); params.set("limit", "20");
    fetch(`${API}?${params}`, { headers: cabeceras() }).then(leerRespuesta)
      .then((listado) => {
        if (!vigente) return;
        setActivos(listado.data || []); setPaginacion(listado.pagination || {});
      })
      .catch((error) => { if (vigente) setMensaje({ tipo: "error", texto: error.message }); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [filtrosAplicados, pagina]);

  useEffect(() => {
    let vigente = true;
    fetch(`${API}/dashboard`, { headers: cabeceras() }).then(leerRespuesta)
      .then((datos) => { if (vigente) setDashboard(datos.data || null); })
      .catch((error) => { if (vigente) setMensaje({ tipo: "error", texto: error.message }); })
      .finally(() => { if (vigente) setCargandoDashboard(false); });
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    let vigente = true;
    fetch(`${API}/opciones`, { headers: cabeceras() })
      .then(leerRespuesta)
      .then((data) => { if (vigente) setMarcasOpciones(data.data?.marcas || []); })
      .catch((error) => { if (vigente) setMensaje({ tipo: "error", texto: error.message }); });
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    cargarPlano().catch((error) => setMensaje({ tipo: "error", texto: error.message }));
  }, []);

  useEffect(() => {
    if (!esAdmin || !mostrarFormulario || !form.empresa) return;
    let vigente = true;
    const params = new URLSearchParams({ empresa: form.empresa });
    if (verTodasEmpresas) params.set("todas", "true");
    fetch(`${API}/usuarios-asignables?${params}`, { headers: cabeceras() })
      .then(leerRespuesta)
      .then((datos) => {
        if (!vigente) return;
        const usuarios = datos.data || [];
        setUsuariosAsignables(usuarios);
        if (!activoId && !usuarioAsignadoId) {
          const propio = usuarios.find((u) => normalizarEntrada(String(u.usuario || "")) === usuarioSesion);
          if (propio) setUsuarioAsignadoId(String(propio.id));
        }
      })
      .catch((error) => { if (vigente) setMensaje({ tipo: "error", texto: error.message }); });
    return () => { vigente = false; };
  }, [esAdmin, mostrarFormulario, form.empresa, verTodasEmpresas]);

  useEffect(() => () => {
    if (fotoPreview.startsWith("blob:")) URL.revokeObjectURL(fotoPreview);
  }, [fotoPreview]);

  const cambiar = (campo, valor, esTexto = true) => {
    const siguiente = esTexto ? normalizarEntrada(valor) : valor;
    setForm((actual) => {
      const nuevo = { ...actual, [campo]: siguiente };
      if (campo === "tipo_dispositivo") {
        if (!["CPU", "LAPTOP"].includes(siguiente)) {
          Object.assign(nuevo, { procesador: "", ram_gb: "", disco_tipo: "", disco_gb: "", fecha_fabricacion: "" });
        }
        if (!["MONITOR", "TELEVISION"].includes(siguiente)) nuevo.pulgadas = "";
        if (siguiente !== "IMPRESORA") nuevo.impresion = "";
      }
      return nuevo;
    });
    if (campo === "tipo_dispositivo" && !["CPU", "LAPTOP"].includes(siguiente)) {
      setDiscoEntrada(""); setDiscoUnidad("GB");
    }
    setMensaje(null);
  };

  const nuevoActivo = (idPlano = "", empresaPlano = "") => {
    setForm({ ...INICIAL, empresa: empresaPlano }); setActivoId(""); setResponsable(usuarioSesion);
    setIdSolicitado(idPlano); setUsuarioAsignadoId(perfil.id ? String(perfil.id) : "");
    setBusquedaUsuario("");
    setVerTodasEmpresas(false); setUsuariosAsignables([]);
    setFechaRevision("AUTOMATICA AL GUARDAR"); setFotoArchivo(null); setFotoPreview("");
    setDiscoEntrada(""); setDiscoUnidad("GB");
    setMostrarFormulario(true); setMensaje(null);
    requestAnimationFrame(irAlInicio);
  };

  const seleccionarActivo = (id) => {
    setActivoId(id); setMensaje(null);
    if (!id) return;
    const activo = activosVisibles.find((item) => item.id === id);
    const activoPlano = activosPlano.find((item) => item.id === id);
    const seleccionado = activo || activoPlano;
    if (!seleccionado) return;
    cargarActivoEnFormulario(seleccionado);
    setIdSolicitado("");
    setUsuarioAsignadoId(seleccionado.usuario_asignado_id ? String(seleccionado.usuario_asignado_id) : "");
    setBusquedaUsuario("");
    setVerTodasEmpresas(false);
    setMostrarFormulario(true);
    requestAnimationFrame(irAlInicio);
  };

  const abrirDetalle = async (activo) => {
    setDetalle({ ...activo, cargandoAuditoria: true, ultima_auditoria: null });
    try {
      const response = await fetch(`${API}/${activo.id}/auditorias`, { headers: cabeceras() });
      const data = await leerRespuesta(response);
      setDetalle((actual) => actual?.id === activo.id
        ? { ...actual, cargandoAuditoria: false, ultima_auditoria: data.ultima || null }
        : actual);
    } catch (error) {
      setDetalle((actual) => actual?.id === activo.id ? { ...actual, cargandoAuditoria: false } : actual);
      setMensaje({ tipo: "error", texto: error.message });
    }
  };

  const seleccionarFoto = (archivo) => {
    if (!archivo) return;
    const extensiones = /\.(jpe?g|png|webp|gif)$/i;
    if (!archivo.type.startsWith("image/") || !extensiones.test(archivo.name)) {
      setMensaje({ tipo: "error", texto: "La foto debe ser JPG, JPEG, PNG, WEBP o GIF." }); return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setMensaje({ tipo: "error", texto: "La foto supera el tamano maximo de 5 MB." }); return;
    }
    setFotoArchivo(archivo); setFotoPreview(URL.createObjectURL(archivo)); setMensaje(null);

    // Algunos navegadores conservan una posición inválida del scroll al volver
    // de la cámara/selector de archivos. Se limita al alto real del contenido.
    requestAnimationFrame(() => {
      const contenedor = paginaRef.current?.parentElement;
      if (!contenedor) return;
      contenedor.scrollTop = Math.min(contenedor.scrollTop, Math.max(0, contenedor.scrollHeight - contenedor.clientHeight));
    });
  };

  const guardar = async (event) => {
    event.preventDefault();
    if (esAdmin && !usuarioAsignadoId && (!activoId || busquedaUsuario)) {
      setMensaje({ tipo: "error", texto: "Selecciona un usuario asignado de la lista." });
      return;
    }
    setGuardando(true); setMensaje(null);
    const editando = Boolean(activoId);
    let idGuardado = activoId;
    try {
      let guardado;
      if (editando && !esAdmin) {
        guardado = { ...form, id: activoId, responsable, fecha_revision: new Date().toISOString() };
      } else {
        const payload = {
          ...form,
          ...(editando ? { responsable } : {}),
          ...(!editando && idSolicitado ? { id_solicitado: idSolicitado } : {}),
          ...(esAdmin ? { usuario_asignado_id: usuarioAsignadoId || null } : {}),
          disco_gb: discoEntrada === "" ? null : Number(discoEntrada) * (discoUnidad === "TB" ? 1024 : 1),
        };
        const response = await fetch(editando ? `${API}/${activoId}` : API, {
          method: editando ? "PUT" : "POST", headers: cabeceras(), body: JSON.stringify(payload),
        });
        ({ data: guardado } = await leerRespuesta(response));
        idGuardado = guardado.id;
        setActivoId(guardado.id);
        cargarActivoEnFormulario(guardado);
      }

      if (fotoArchivo) {
        const datosFoto = new FormData();
        datosFoto.append("foto", fotoArchivo);
        const respuestaFoto = await fetch(`${API}/${idGuardado}/foto`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: datosFoto,
        });
        ({ data: guardado } = await leerRespuesta(respuestaFoto));
      }

      setActivoId(guardado.id);
      cargarActivoEnFormulario(guardado);
      setMarcasOpciones((actuales) => [...new Set([...actuales, guardado.marca].filter(Boolean))]);
      setFotoArchivo(null); setFotoPreview(urlFoto(guardado.foto));
      await cargarActivos();
      await cargarPlano();
      await cargarDashboard();
      setMensaje({ tipo: "exito", texto: editando ? `Activo ${guardado.id} actualizado correctamente.` : `Activo ${guardado.id} registrado correctamente.` });
      setMostrarFormulario(false);
      requestAnimationFrame(irAlInicio);
    } catch (error) {
      const prefijo = fotoArchivo && idGuardado
        ? editando
          ? `Los datos del activo ${idGuardado} se guardaron, pero la foto no pudo subirse. `
          : `El activo ${idGuardado} fue creado, pero la foto no pudo subirse. `
        : "";
      setMensaje({ tipo: "error", texto: `${prefijo}${error.message}` });
    } finally { setGuardando(false); }
  };

  const aplicarFiltros = (event) => {
    event.preventDefault(); setFiltroEspecial(""); setPagina(1); setCargando(true); setFiltrosAplicados(filtros);
  };

  const limpiarFiltros = () => {
    setFiltroEspecial(""); setFiltros(FILTROS_INICIAL); setFiltrosAplicados(FILTROS_INICIAL); setPagina(1); setCargando(true);
  };

  const abrirListadoFiltrado = ({ especial = "", ...filtro } = {}) => {
    const siguientes = { ...FILTROS_INICIAL, ...filtro };
    setFiltroEspecial(especial);
    setFiltros(siguientes); setFiltrosAplicados(siguientes); setPagina(1); setCargando(true);
    setVistaPrincipal("listado");
  };

  const exportarExcel = async () => {
    setExportando(true); setMensaje(null);
    try {
      const response = await fetch(`${API}/exportar?${parametrosListado(false)}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo exportar el inventario.");
      }
      const blob = await response.blob();
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `inventario_activos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
    } catch (error) {
      setMensaje({ tipo: "error", texto: error.message });
    } finally { setExportando(false); }
  };

  return (
    <div ref={paginaRef} className="bg-slate-50 pb-4">
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-5 py-7 shadow-xl sm:px-8 sm:py-9">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg"><Laptop size={25} /></div>
            <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-300">Novo Core</p><h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Inventario de Activos TI</h1><p className="mt-1 text-sm text-slate-300">Registro y actualizacion de equipos corporativos</p></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {mostrarFormulario && <button type="button" onClick={() => setMostrarFormulario(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/20"><ArrowLeft size={18} /> Volver al listado</button>}
            <button type="button" onClick={() => nuevoActivo()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-900 shadow hover:bg-blue-50"><Plus size={18} /> Nuevo activo</button>
          </div>
        </div>
      </header>

      <main className={`mx-auto mt-5 px-1 sm:mt-7 sm:px-3 ${vistaPrincipal === "plano" ? "max-w-[1600px]" : "max-w-6xl"}`}>
        {mensaje && <div role="alert" className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm font-semibold ${mensaje.tipo === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {mensaje.tipo === "error" ? <AlertCircle className="mt-0.5 shrink-0" size={19} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={19} />}<span>{mensaje.texto}</span>
        </div>}

        {mostrarFormulario ? <form onSubmit={guardar} className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><h2 className="font-black text-slate-800">Identificacion del activo</h2><p className="mt-0.5 text-xs text-slate-500">Los campos marcados con * son obligatorios.</p></div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
              {idSolicitado && <Campo label="ID del plano" className="sm:col-span-2"><input readOnly value={idSolicitado} className={inputClass} /></Campo>}
              <Campo label="Empresa" requerido><SelectOpciones value={form.empresa} onChange={(e) => cambiar("empresa", e.target.value)} opciones={["NOVONET", "VELSA"]} requerido /></Campo>
              <Campo label="Tipo de dispositivo" requerido><SelectOpciones value={form.tipo_dispositivo} onChange={(e) => cambiar("tipo_dispositivo", e.target.value)} opciones={TIPOS} requerido /></Campo>
              <Campo label="Marca" requerido ayuda="Puede elegir una marca registrada o escribir una nueva."><input required list="marcas-activos" value={form.marca} onChange={(e) => cambiar("marca", e.target.value)} className={inputClass} placeholder="EJ. DELL" /><datalist id="marcas-activos">{marcas.map((m) => <option key={m} value={m} />)}</datalist></Campo>
              <Campo label="Modelo"><input value={form.modelo} onChange={(e) => cambiar("modelo", e.target.value)} className={inputClass} placeholder="EJ. LATITUDE 5420" /></Campo>
              <Campo label={esComputador ? "MAC" : "Serial o descripcion"} requerido className="sm:col-span-2"><input required value={form.numero_serie} onChange={(e) => cambiar("numero_serie", e.target.value)} className={inputClass} placeholder={esComputador ? "EJ. AA:BB:CC:DD:EE:FF" : "INGRESE SERIAL O DESCRIPCION"} /></Campo>
            </div>
          </section>

          {(esComputador || esPantalla || esImpresora) && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><h2 className="font-black text-slate-800">Caracteristicas tecnicas</h2></div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
              {esComputador && <><Campo label="Procesador"><input value={form.procesador} onChange={(e) => cambiar("procesador", e.target.value)} className={inputClass} /></Campo><Campo label="RAM" ayuda="Capacidad expresada en GB."><div className="relative"><input type="number" min="0" step="0.01" value={form.ram_gb} onChange={(e) => cambiar("ram_gb", e.target.value, false)} className={`${inputClass} pr-12`} placeholder="16" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">GB</span></div></Campo><Campo label="Tipo de disco"><SelectOpciones value={form.disco_tipo} onChange={(e) => cambiar("disco_tipo", e.target.value)} opciones={["MECANICO", "SOLIDO", "OTRO"]} /></Campo><Campo label="Espacio de disco"><div className="flex gap-2"><input type="number" min="0" step="0.01" value={discoEntrada} onChange={(e) => setDiscoEntrada(e.target.value)} className={`${inputClass} min-w-0 flex-1`} placeholder="512" /><select aria-label="Unidad del disco" value={discoUnidad} onChange={(e) => setDiscoUnidad(e.target.value)} className={`${inputClass} shrink-0`} style={{ width: "6rem" }}><option>GB</option><option>TB</option></select></div></Campo><Campo label="Fecha de fabricacion"><input type="date" value={form.fecha_fabricacion} onChange={(e) => cambiar("fecha_fabricacion", e.target.value, false)} className={inputClass} /></Campo></>}
              {esPantalla && <Campo label="Pulgadas"><input value={form.pulgadas} onChange={(e) => cambiar("pulgadas", e.target.value)} className={inputClass} placeholder="EJ. 24" /></Campo>}
              {esImpresora && <Campo label="Tipo de impresion"><SelectOpciones value={form.impresion} onChange={(e) => cambiar("impresion", e.target.value)} opciones={["COLOR", "BLANCO Y NEGRO"]} /></Campo>}
            </div>
          </section>}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 sm:px-6"><h2 className="font-black text-slate-800">Asignacion y estado</h2></div>
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <Campo label="Ubicacion" requerido ayuda="Texto libre. Ejemplo: ESTACION 1."><input required value={form.ubicacion} onChange={(e) => cambiar("ubicacion", e.target.value)} className={inputClass} placeholder="EJ. ESTACION 1" /></Campo>
              <Campo label="Area" requerido><SelectOpciones value={form.area} onChange={(e) => cambiar("area", e.target.value)} opciones={AREAS} requerido /></Campo>
              <Campo label="Estado" requerido><SelectOpciones value={form.estado} onChange={(e) => cambiar("estado", e.target.value)} opciones={ESTADOS} requerido /></Campo>
              <Campo label="Fecha de adquisicion"><input type="date" value={form.fecha_adquisicion} onChange={(e) => cambiar("fecha_adquisicion", e.target.value, false)} className={inputClass} /></Campo>
              <Campo label="Mouse"><SelectOpciones value={form.mouse} onChange={(e) => cambiar("mouse", e.target.value)} opciones={SI_NO_CAMBIAR} /></Campo>
              <Campo label="Teclado"><SelectOpciones value={form.teclado} onChange={(e) => cambiar("teclado", e.target.value)} opciones={SI_NO_CAMBIAR} /></Campo>
              <Campo label="Regulador"><SelectOpciones value={form.regulador} onChange={(e) => cambiar("regulador", e.target.value)} opciones={["SI", "NO"]} /></Campo>
              <Campo label="Cambio o reemplazo"><SelectOpciones value={form.cambio_reemplazo} onChange={(e) => cambiar("cambio_reemplazo", e.target.value)} opciones={["MANTENER", "POTENCIAR", "REEMPLAZAR"]} /></Campo>
              <Campo label="Observacion de vida util" className="sm:col-span-2"><textarea rows={4} value={form.observacion_vida_util} onChange={(e) => cambiar("observacion_vida_util", e.target.value)} className={`${inputClass} resize-y`} placeholder="DETALLE EL ESTADO O RECOMENDACIONES DEL ACTIVO" /></Campo>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-slate-800"><Camera size={20} className="text-blue-600" /><h2 className="font-black">Foto del activo</h2></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr] sm:items-center">
              <div className="flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 sm:aspect-square">
                {fotoPreview ? <img src={fotoPreview} alt="Vista previa del activo" className="h-full w-full object-contain" /> : <div className="text-center text-slate-400"><ImageIcon className="mx-auto mb-2" size={34} /><p className="text-xs font-bold">SIN FOTO</p></div>}
              </div>
              <div>
                <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
                  <Camera size={18} /> {form.foto ? "Reemplazar foto" : "Tomar o elegir foto"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif" capture="environment" className="sr-only" onChange={(e) => seleccionarFoto(e.target.files?.[0])} />
                </label>
                <p className="mt-2 text-xs leading-5 text-slate-500">En celular se abrira la camara trasera. Formatos: JPG, PNG, WEBP o GIF. Maximo 5 MB.</p>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-2 text-slate-800"><ShieldCheck size={20} className="text-blue-600" /><h2 className="font-black">Datos automaticos</h2></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Campo label="Responsable" requerido={Boolean(activoId && esAdmin)} ayuda={activoId && esAdmin ? "Editable solo por administradores." : "Se asigna automaticamente al registrar."}><input required={Boolean(activoId && esAdmin)} readOnly={!activoId || !esAdmin} value={responsable} onChange={(e) => setResponsable(normalizarEntrada(e.target.value))} className={inputClass} /></Campo><Campo label="Fecha de revision"><input readOnly value={fechaRevision} className={inputClass} /></Campo>
              {esAdmin ? <Campo label="Usuario asignado" requerido={!activoId} ayuda="Usuario que utiliza el equipo; no cambia quien lo registro." className="sm:col-span-2">
                <div className="space-y-2">
                  <div className="relative" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSelectorUsuarioAbierto(false); }}>
                    <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      role="combobox"
                      aria-expanded={selectorUsuarioAbierto}
                      value={busquedaUsuario || (usuarioAsignadoActual ? etiquetaUsuario(usuarioAsignadoActual) : "")}
                      onFocus={() => setSelectorUsuarioAbierto(true)}
                      onChange={(e) => { setBusquedaUsuario(normalizarEntrada(e.target.value)); setUsuarioAsignadoId(""); setSelectorUsuarioAbierto(true); }}
                      placeholder={activoId ? "SIN ASIGNAR — BUSCAR USUARIO" : "BUSCAR Y SELECCIONAR USUARIO"}
                      className={`${inputClass} pl-10`}
                    />
                    {selectorUsuarioAbierto && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                      {activoId && <button type="button" onClick={() => { setUsuarioAsignadoId(""); setBusquedaUsuario(""); setSelectorUsuarioAbierto(false); }} className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-bold text-slate-600 hover:bg-slate-100">SIN ASIGNAR</button>}
                      {usuariosAsignablesFiltrados.map((u) => <button type="button" key={u.id} onClick={() => { setUsuarioAsignadoId(String(u.id)); setBusquedaUsuario(etiquetaUsuario(u)); setSelectorUsuarioAbierto(false); }} className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-blue-50 ${String(u.id) === String(usuarioAsignadoId) ? "bg-blue-50 font-black text-blue-700" : "font-semibold text-slate-700"}`}>{etiquetaUsuario(u)}</button>)}
                      {!usuariosAsignablesFiltrados.length && <p className="px-3 py-4 text-center text-sm font-semibold text-slate-400">No se encontraron usuarios.</p>}
                    </div>}
                  </div>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600"><input type="checkbox" checked={verTodasEmpresas} onChange={(e) => setVerTodasEmpresas(e.target.checked)} /> Ver usuarios de todas las empresas</label>
                </div>
              </Campo> : <Campo label="Usuario asignado" ayuda="Al registrar se asigna automaticamente al usuario logueado." className="sm:col-span-2"><input readOnly value={activoId ? (form.usuario_asignado_nombre || usuarioSesion) : usuarioSesion} className={inputClass}/></Campo>}
            </div>
          </section>

          <div className="mt-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex sm:items-center sm:justify-between sm:px-5">
            <p className="mb-3 text-center text-xs font-medium text-slate-500 sm:mb-0 sm:text-left">{activoId ? `Editando ${activoId}` : "Registrando un activo nuevo"}</p>
            <button type="submit" disabled={guardando || (activoId && !esAdmin && !fotoArchivo)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
              {guardando ? <Loader2 size={19} className="animate-spin" /> : <Save size={19} />}{guardando ? "Guardando..." : activoId && !esAdmin ? "Subir foto" : activoId ? "Guardar cambios" : "Registrar activo"}
            </button>
          </div>
        </form> : <>
          <div className="mb-5 flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            <button type="button" onClick={() => setVistaPrincipal("dashboard")} className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black sm:flex-none ${vistaPrincipal === "dashboard" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Dashboard</button>
            <button type="button" onClick={() => setVistaPrincipal("listado")} className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black sm:flex-none ${vistaPrincipal === "listado" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Listado</button>
            <button type="button" onClick={() => setVistaPrincipal("plano")} className={`min-h-11 flex-1 rounded-xl px-4 py-2.5 text-sm font-black sm:flex-none ${vistaPrincipal === "plano" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Plano de puestos</button>
          </div>
          {vistaPrincipal === "plano" ? <PlanoInventarioActivos activos={activosPlano} cargando={cargandoPlano} esAdmin={esAdmin} urlFoto={urlFoto} onRegistrar={nuevoActivo} onEditar={(activo) => seleccionarActivo(activo.id)} /> : vistaPrincipal === "dashboard" ? <DashboardInventario datos={dashboard} cargando={cargandoDashboard} onFiltro={abrirListadoFiltrado} onDetalle={abrirDetalle} /> : <div className="space-y-5">
          <form onSubmit={aplicarFiltros} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Search size={18} className="text-blue-600" /><h2 className="font-black text-slate-800">Buscar y filtrar</h2></div><button type="button" onClick={exportarExcel} disabled={exportando} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">{exportando ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />} {exportando ? "Exportando..." : "Exportar a Excel"}</button></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <input aria-label="Buscar activos" value={filtros.q} onChange={(e) => setFiltros((f) => ({ ...f, q: normalizarEntrada(e.target.value) }))} className={`${inputClass} sm:col-span-2 lg:col-span-3`} placeholder="BUSCAR POR SERIE/MAC, MARCA, MODELO O UBICACION" />
              <select aria-label="Filtrar por empresa" value={filtros.empresa} onChange={(e) => setFiltros((f) => ({ ...f, empresa: e.target.value }))} className={inputClass}><option value="">TODAS LAS EMPRESAS</option><option>NOVONET</option><option>VELSA</option></select>
              <select aria-label="Filtrar por tipo" value={filtros.tipo_dispositivo} onChange={(e) => setFiltros((f) => ({ ...f, tipo_dispositivo: e.target.value }))} className={inputClass}><option value="">TODOS LOS TIPOS</option>{TIPOS.map((v) => <option key={v}>{v}</option>)}</select>
              <select aria-label="Filtrar por area" value={filtros.area} onChange={(e) => setFiltros((f) => ({ ...f, area: e.target.value }))} className={inputClass}><option value="">TODAS LAS AREAS</option>{AREAS.map((v) => <option key={v}>{v}</option>)}</select>
              <select aria-label="Filtrar por estado" value={filtros.estado} onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))} className={inputClass}><option value="">TODOS LOS ESTADOS</option>{ESTADOS.map((v) => <option key={v}>{v}</option>)}</select>
              <select aria-label="Filtrar por cambio o reemplazo" value={filtros.cambio_reemplazo} onChange={(e) => setFiltros((f) => ({ ...f, cambio_reemplazo: e.target.value }))} className={inputClass}><option value="">TODAS LAS ACCIONES</option><option>MANTENER</option><option>POTENCIAR</option><option>REEMPLAZAR</option></select>
              <input aria-label="RAM minima en GB" type="number" min="0" step="0.01" value={filtros.ram_gb_min} onChange={(e) => setFiltros((f) => ({ ...f, ram_gb_min: e.target.value }))} className={inputClass} placeholder="RAM MINIMA (GB)" />
              <input aria-label="RAM maxima en GB" type="number" min="0" step="0.01" value={filtros.ram_gb_max} onChange={(e) => setFiltros((f) => ({ ...f, ram_gb_max: e.target.value }))} className={inputClass} placeholder="RAM MAXIMA (GB)" />
              <input aria-label="Disco minimo en GB" type="number" min="0" step="0.01" value={filtros.disco_gb_min} onChange={(e) => setFiltros((f) => ({ ...f, disco_gb_min: e.target.value }))} className={inputClass} placeholder="DISCO MINIMO (GB)" />
              <input aria-label="Disco maximo en GB" type="number" min="0" step="0.01" value={filtros.disco_gb_max} onChange={(e) => setFiltros((f) => ({ ...f, disco_gb_max: e.target.value }))} className={inputClass} placeholder="DISCO MAXIMO (GB)" />
              <div className="flex gap-2"><button type="submit" className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">Aplicar</button><button type="button" onClick={limpiarFiltros} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Limpiar</button></div>
            </div>
          </form>

          {cargando && !filtroEspecial ? <div className="flex min-h-48 items-center justify-center rounded-2xl border border-slate-200 bg-white"><Loader2 className="animate-spin text-blue-600" size={28} /></div> : activosVisibles.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Cpu className="mx-auto mb-3 text-slate-300" size={38} /><p className="font-black text-slate-700">No se encontraron activos</p><p className="mt-1 text-sm text-slate-400">Prueba con otros filtros o registra un activo nuevo.</p></div> : <>
            <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
              <div className="overflow-x-auto"><table className="w-full min-w-[1240px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr>{["Foto", "ID", "Empresa", "Tipo", "Marca / modelo", "Serie / MAC", "Ubicacion", "Area", "Responsable", "Estado", "Cambio / reemplazo"].map((h) => <th key={h} className="px-4 py-3 font-black">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{activos.map((a) => <tr key={a.id} onClick={() => abrirDetalle(a)} className="cursor-pointer transition hover:bg-blue-50/60"><td className="px-4 py-2">{a.foto ? <img src={urlFoto(a.foto)} alt="" className="h-11 w-11 rounded-lg border border-slate-200 object-cover" loading="lazy" /> : <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-100 text-slate-300"><ImageIcon size={18}/></div>}</td><td className="px-4 py-3 font-black text-blue-700">{a.id}</td><td className="px-4 py-3">{a.empresa}</td><td className="px-4 py-3 font-semibold">{a.tipo_dispositivo}</td><td className="px-4 py-3"><span className="font-semibold">{a.marca}</span><br/><span className="text-xs text-slate-400">{a.modelo || "-"}</span></td><td className="px-4 py-3 font-mono text-xs">{a.numero_serie}</td><td className="px-4 py-3">{a.ubicacion}</td><td className="px-4 py-3">{a.area}</td><td className="px-4 py-3">{a.responsable}</td><td className="px-4 py-3"><EstadoBadge valor={a.estado} /></td><td className="px-4 py-3 font-semibold">{a.cambio_reemplazo || "-"}</td></tr>)}</tbody></table></div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:hidden">{activos.map((a) => <button type="button" key={a.id} onClick={() => abrirDetalle(a)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm active:bg-blue-50">{a.foto && <img src={urlFoto(a.foto)} alt="" className="h-40 w-full object-cover" loading="lazy" />}<div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-blue-700">{a.id}</p><h3 className="mt-1 font-black text-slate-900">{a.tipo_dispositivo} · {a.marca}</h3><p className="text-sm text-slate-500">{a.modelo || "SIN MODELO"}</p></div><EstadoBadge valor={a.estado} /></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs"><div><p className="font-bold uppercase text-slate-400">Serie / MAC</p><p className="mt-0.5 break-all font-semibold text-slate-700">{a.numero_serie}</p></div><div><p className="font-bold uppercase text-slate-400">Ubicacion</p><p className="mt-0.5 font-semibold text-slate-700">{a.ubicacion}</p></div><div><p className="font-bold uppercase text-slate-400">Area</p><p className="mt-0.5 font-semibold text-slate-700">{a.area}</p></div><div><p className="font-bold uppercase text-slate-400">Accion</p><p className="mt-0.5 font-semibold text-slate-700">{a.cambio_reemplazo || "-"}</p></div></div></div></button>)}</div>
          </>}

          {paginacion.total_pages > 1 && <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><button type="button" disabled={pagina <= 1} onClick={() => { setCargando(true); setPagina((p) => p - 1); }} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-40"><ChevronLeft size={17}/> Anterior</button><p className="text-xs font-bold text-slate-500">Pagina {paginacion.page} de {paginacion.total_pages} · {paginacion.total} activos</p><button type="button" disabled={pagina >= paginacion.total_pages} onClick={() => { setCargando(true); setPagina((p) => p + 1); }} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-40">Siguiente <ChevronRight size={17}/></button></div>}
        </div>}
        </>}
      </main>
      <ModalDetalle activo={detalle} esAdmin={esAdmin} onCerrar={() => setDetalle(null)} onEditar={() => { seleccionarActivo(detalle.id); setDetalle(null); }} />
    </div>
  );
}
