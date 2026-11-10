// src/pages/CarpetaCompartida.jsx
// Drive interno: manuales y documentos del ERP.
// Todos ven y descargan. Solo ADMINISTRADOR crea carpetas, sube y elimina
// (el backend lo valida; aquí solo se ocultan los botones).
import { useCallback, useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { Folder, FolderPlus, FileText, Image as ImageIcon, Upload, Download, Eye, Trash2, Home, ChevronRight, Search } from "lucide-react";

const API = import.meta.env.VITE_API_URL;
const BASE = `${API}/api/carpeta-compartida`;
const token = () => localStorage.getItem("token");
const headers = (json = true) => ({
  Authorization: `Bearer ${token()}`,
  ...(json ? { "Content-Type": "application/json" } : {}),
});

const esAdmin = () => {
  try {
    const d = jwtDecode(token() || "");
    return String(d.perfil || d.rol || "").toUpperCase() === "ADMINISTRADOR";
  } catch {
    return false;
  }
};

const tamano = (b) => {
  const n = Number(b) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
const fecha = (f) => (f ? new Date(f).toLocaleDateString("es-EC") : "—");

export default function CarpetaCompartida() {
  const admin = esAdmin();
  const [ruta, setRuta] = useState([]); // [{id, nombre}] — vacío = raíz
  const [carpetas, setCarpetas] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [busca, setBusca] = useState("");
  const [error, setError] = useState("");

  const actualId = ruta.length ? ruta[ruta.length - 1].id : null;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [rc, ra] = await Promise.all([
        fetch(`${BASE}/carpetas${actualId ? `?padre_id=${actualId}` : ""}`, { headers: headers() }),
        fetch(`${BASE}/archivos${actualId ? `?carpeta_id=${actualId}` : ""}`, { headers: headers() }),
      ]);
      const [dc, da] = await Promise.all([rc.json(), ra.json()]);
      if (!dc.success || !da.success) throw new Error(dc.error || da.error || "Error cargando");
      setCarpetas(dc.data);
      setArchivos(da.data);
    } catch (e) {
      setError(e.message || "No se pudo cargar la carpeta.");
    } finally {
      setCargando(false);
    }
  }, [actualId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crearCarpeta = async () => {
    const nombre = prompt("Nombre de la nueva carpeta:");
    if (!nombre || !nombre.trim()) return;
    const r = await fetch(`${BASE}/carpetas`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ nombre, carpeta_padre_id: actualId }),
    });
    const d = await r.json();
    if (d.success) cargar(); else alert(`❌ ${d.error}`);
  };

  const subir = async (files) => {
    if (!files || !files.length) return;
    setSubiendo(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("archivo", f);
        if (actualId) fd.append("carpeta_id", actualId);
        const r = await fetch(`${BASE}/archivos/upload`, { method: "POST", headers: headers(false), body: fd });
        const d = await r.json().catch(() => ({}));
        if (!d.success) alert(`❌ ${f.name}: ${d.error || "no se pudo subir"}`);
      }
    } finally {
      setSubiendo(false);
      cargar();
    }
  };

  const obtenerBlob = async (a) => {
    const r = await fetch(`${BASE}/archivos/${a.id}/descargar`, { headers: headers(false) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || "No se pudo obtener el archivo.");
    }
    return r.blob();
  };

  const ver = async (a) => {
    try {
      const url = URL.createObjectURL(await obtenerBlob(a));
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) { alert(`❌ ${e.message}`); }
  };

  const descargar = async (a) => {
    try {
      const url = URL.createObjectURL(await obtenerBlob(a));
      const link = document.createElement("a");
      link.href = url;
      link.download = a.nombre_original;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) { alert(`❌ ${e.message}`); }
  };

  const eliminar = async (tipo, item) => {
    const nombre = tipo === "carpetas" ? item.nombre : item.nombre_original;
    const extra = tipo === "carpetas" ? " y todo su contenido" : "";
    if (!confirm(`¿Eliminar "${nombre}"${extra}?`)) return;
    const r = await fetch(`${BASE}/${tipo}/${item.id}`, { method: "DELETE", headers: headers() });
    const d = await r.json();
    if (d.success) cargar(); else alert(`❌ ${d.error}`);
  };

  const q = busca.trim().toLowerCase();
  const carpetasF = carpetas.filter((c) => !q || c.nombre.toLowerCase().includes(q));
  const archivosF = archivos.filter((a) => !q || a.nombre_original.toLowerCase().includes(q));

  const onDrop = (e) => {
    e.preventDefault();
    setArrastrando(false);
    if (admin) subir(e.dataTransfer.files);
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <Folder className="w-7 h-7 text-blue-600" /> Carpeta Compartida
          </h1>
          <p className="text-sm text-slate-500">Manuales y documentos del ERP. Todos pueden verlos y descargarlos.</p>
        </div>
        {admin && (
          <div className="flex gap-2">
            <button onClick={crearCarpeta}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-600 text-blue-700 font-semibold text-sm hover:bg-blue-50">
              <FolderPlus className="w-4 h-4" /> Nueva carpeta
            </button>
            <label className={`flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm cursor-pointer hover:bg-blue-700 ${subiendo ? "opacity-60 pointer-events-none" : ""}`}>
              <Upload className="w-4 h-4" /> {subiendo ? "Subiendo…" : "Subir archivo"}
              <input type="file" multiple accept="application/pdf,image/*" className="hidden"
                onChange={(e) => { subir(e.target.files); e.target.value = ""; }} />
            </label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <nav className="flex items-center flex-wrap gap-1 text-sm">
          <button onClick={() => setRuta([])}
            className={`flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 ${ruta.length ? "text-blue-700" : "font-bold text-slate-800"}`}>
            <Home className="w-4 h-4" /> Inicio
          </button>
          {ruta.map((r, i) => (
            <span key={r.id} className="flex items-center gap-1">
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <button onClick={() => setRuta((x) => x.slice(0, i + 1))}
                className={`px-2 py-1 rounded hover:bg-slate-100 ${i === ruta.length - 1 ? "font-bold text-slate-800" : "text-blue-700"}`}>
                {r.nombre}
              </button>
            </span>
          ))}
        </nav>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en esta carpeta"
            className="pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-60" />
        </div>
      </div>

      <div
        onDragOver={(e) => { if (admin) { e.preventDefault(); setArrastrando(true); } }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        className={`bg-white rounded-xl border-2 ${arrastrando ? "border-blue-500 border-dashed bg-blue-50" : "border-slate-100"} p-4 min-h-[300px]`}
      >
        {error && <p className="text-red-600 text-sm mb-3">⚠️ {error}</p>}
        {cargando ? (
          <p className="text-slate-500 text-sm">Cargando…</p>
        ) : carpetasF.length === 0 && archivosF.length === 0 ? (
          <div className="text-center text-slate-400 py-16">
            <Folder className="w-12 h-12 mx-auto mb-2" />
            <p>{q ? "Sin resultados." : "Carpeta vacía."}</p>
            {admin && !q && <p className="text-xs mt-1">Arrastra aquí PDFs o imágenes (máx. 20 MB) para subirlos.</p>}
          </div>
        ) : (
          <>
            {carpetasF.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
                {carpetasF.map((c) => (
                  <div key={c.id} onClick={() => setRuta((r) => [...r, { id: c.id, nombre: c.nombre }])}
                    className="group relative flex items-center gap-2 p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer">
                    <Folder className="w-6 h-6 text-amber-500 shrink-0" fill="currentColor" />
                    <span className="text-sm font-medium text-slate-700 truncate" title={c.nombre}>{c.nombre}</span>
                    {admin && (
                      <button title="Eliminar carpeta" onClick={(e) => { e.stopPropagation(); eliminar("carpetas", c); }}
                        className="absolute top-1 right-1 p-1 rounded text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {archivosF.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b">
                      <th className="py-2 px-2">Nombre</th>
                      <th className="py-2 px-2">Tamaño</th>
                      <th className="py-2 px-2">Subido por</th>
                      <th className="py-2 px-2">Fecha</th>
                      <th className="py-2 px-2 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivosF.map((a) => {
                      const Icono = (a.tipo_mime || "").startsWith("image/") ? ImageIcon : FileText;
                      return (
                        <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-2 px-2">
                            <button onClick={() => ver(a)} className="flex items-center gap-2 text-left text-slate-800 hover:text-blue-700">
                              <Icono className="w-5 h-5 text-red-500 shrink-0" />
                              <span className="break-all">{a.nombre_original}</span>
                            </button>
                          </td>
                          <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{tamano(a.tamano_bytes)}</td>
                          <td className="py-2 px-2 text-slate-500">{a.subido_por || "—"}</td>
                          <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{fecha(a.fecha_subida)}</td>
                          <td className="py-2 px-2">
                            <div className="flex justify-end gap-1">
                              <button title="Ver" onClick={() => ver(a)} className="p-1.5 rounded hover:bg-slate-200 text-slate-600"><Eye className="w-4 h-4" /></button>
                              <button title="Descargar" onClick={() => descargar(a)} className="p-1.5 rounded hover:bg-slate-200 text-blue-700"><Download className="w-4 h-4" /></button>
                              {admin && (
                                <button title="Eliminar" onClick={() => eliminar("archivos", a)} className="p-1.5 rounded hover:bg-red-50 text-red-600"><Trash2 className="w-4 h-4" /></button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
