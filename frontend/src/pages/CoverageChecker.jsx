/**
 * CoverageChecker.jsx
 * Módulo de consulta de cobertura de internet para el ERP.
 *
 * Permite verificar cobertura mediante:
 *  1. Enlace de WhatsApp / Google Maps / Apple Maps (pegado directamente)
 *  2. Coordenadas manuales (lat, lon)
 *
 * Incluye historial de consultas y carga de archivo KML/KMZ.
 */

import { useState, useEffect, useRef }  from "react";
import JSZip from "jszip";

// ─────────────────────────────────────────────────────────────────────────────
// Parser de URLs de ubicación (cliente — para formatos no acortados)
// ─────────────────────────────────────────────────────────────────────────────

function isValidCoords(lat, lon) {
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function parseCoordPair(text) {
  const m = (text || "").trim().match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
  if (m) {
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (isValidCoords(lat, lon)) return { lat, lon };
  }
  return null;
}

function parseLocationUrl(text) {
  text = (text || "").trim();

  // 1. Coordenadas directas: "-2.4189, -79.3459"
  const direct = parseCoordPair(text);
  if (direct) return direct;

  try {
    const url = new URL(text);
    const params = new URLSearchParams(url.search);

    // 2. Google Maps ?q=LAT,LNG  (WhatsApp comparte este formato)
    if (params.has("q")) {
      const r = parseCoordPair(params.get("q"));
      if (r) return r;
    }

    // 3. Apple Maps ?ll=LAT,LNG
    if (params.has("ll")) {
      const r = parseCoordPair(params.get("ll"));
      if (r) return r;
    }

    // 4. Google Maps place: /@LAT,LNG,ZOOMz en el path
    const pathMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (pathMatch) {
      const lat = parseFloat(pathMatch[1]);
      const lon = parseFloat(pathMatch[2]);
      if (isValidCoords(lat, lon)) return { lat, lon };
    }

    // 5. Google Maps /search/LAT,+LNG
    const searchMatch = url.pathname.match(/\/search\/(-?\d+\.?\d*)(?:,\+?|,\s*)(-?\d+\.?\d*)/);
    if (searchMatch) {
      const lat = parseFloat(searchMatch[1]);
      const lon = parseFloat(searchMatch[2]);
      if (isValidCoords(lat, lon)) return { lat, lon };
    }
  } catch {
    // no es una URL válida
  }

  // 6. Búsqueda general (mínimo 4 decimales para evitar falsos positivos)
  const general = text.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
  if (general) {
    const lat = parseFloat(general[1]);
    const lon = parseFloat(general[2]);
    if (isValidCoords(lat, lon)) return { lat, lon };
  }

  return null;
}

function isShortenedUrl(text) {
  const short = ["goo.gl", "maps.app.goo.gl", "bit.ly", "t.co", "tinyurl.com"];
  try {
    const { hostname } = new URL(text);
    return short.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/coverage`;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Leer perfil del usuario logueado
// ─────────────────────────────────────────────────────────────────────────────
function getUserPerfil() {
  try {
    const u = JSON.parse(localStorage.getItem("userProfile") || "{}");
    return (u.perfil || "").toUpperCase();
  } catch {
    return "";
  }
}

export default function CoverageChecker() {
  // ── Perfil del usuario ──────────────────────────────────────────────────────
  const isAdmin = getUserPerfil() === "ADMINISTRADOR";

  // ── Estado general ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState("link"); // "link" | "coords"
  const [apiStatus, setApiStatus] = useState("checking"); // "online" | "offline" | "checking"

  // ── Formulario de enlace ────────────────────────────────────────────────────
  const [linkInput, setLinkInput] = useState("");
  const [parsedCoords, setParsedCoords] = useState(null); // {lat, lon}
  const [parseError, setParseError] = useState("");
  const [parsing, setParsing] = useState(false);

  // ── Formulario de coordenadas manuales ──────────────────────────────────────
  const [manualLat, setManualLat] = useState("");
  const [manualLon, setManualLon] = useState("");

  // ── Resultado y estado ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  // ── Historial ───────────────────────────────────────────────────────────────
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("coverageHistory") || "[]");
    } catch {
      return [];
    }
  });

  // ── Carga de KML ────────────────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null);
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef(null);

  // ── Verificar estado de la API ──────────────────────────────────────────────
  useEffect(() => {
    checkAPIStatus();
    const timer = setInterval(checkAPIStatus, 30_000);
    return () => clearInterval(timer);
  }, []);

  async function checkAPIStatus() {
    try {
      const r = await fetch(`${API_URL}/status`);
      setApiStatus(r.ok ? "online" : "offline");
    } catch {
      setApiStatus("offline");
    }
  }

  // ── Guardar historial ───────────────────────────────────────────────────────
  function saveHistory(newHistory) {
    try {
      localStorage.setItem("coverageHistory", JSON.stringify(newHistory));
    } catch {
      /* ignore */
    }
  }

  function addToHistory(entry) {
    const updated = [{ id: Date.now(), ...entry }, ...history].slice(0, 100);
    setHistory(updated);
    saveHistory(updated);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parsear enlace de WhatsApp / Google Maps
  // ─────────────────────────────────────────────────────────────────────────
  async function handleParseLink() {
    setParseError("");
    setParsedCoords(null);
    const text = linkInput.trim();
    if (!text) return;

    // Intento cliente primero (más rápido)
    const local = parseLocationUrl(text);
    if (local) {
      setParsedCoords(local);
      return;
    }

    // Para URLs acortadas → pedir al backend que resuelva el redirect
    if (isShortenedUrl(text) || text.startsWith("http")) {
      setParsing(true);
      try {
        const res = await fetch(`${API_URL}/resolve-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ link: text }),
        });
        const data = await res.json();
        if (res.ok && data.status === "ok") {
          setParsedCoords({ lat: data.lat, lon: data.lon });
        } else {
          setParseError(data.message || "No se pudo extraer coordenadas.");
        }
      } catch {
        setParseError("Error de conexión al resolver el enlace.");
      } finally {
        setParsing(false);
      }
    } else {
      setParseError(
        "No se pudo extraer coordenadas. Pega un enlace de Google Maps o escribe lat, lon."
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Verificar cobertura
  // ─────────────────────────────────────────────────────────────────────────
  async function handleCheck() {
    setError("");
    setResult(null);

    let lat, lon;

    if (tab === "link") {
      if (!parsedCoords) {
        setError("Primero parsea el enlace para extraer las coordenadas.");
        return;
      }
      ({ lat, lon } = parsedCoords);
    } else {
      lat = parseFloat(manualLat);
      lon = parseFloat(manualLon);
      if (isNaN(lat) || isNaN(lon)) {
        setError("Ingresa coordenadas numéricas válidas.");
        return;
      }
      if (!isValidCoords(lat, lon)) {
        setError("Coordenadas fuera de rango válido (lat: ±90, lon: ±180).");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/check?lat=${lat}&lon=${lon}`,
        { headers: authHeaders() }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Error al consultar cobertura");
      }
      const data = await res.json();
      const entry = {
        lat,
        lon,
        hasCoverage: data.hasCoverage,
        zoneName: data.zoneName || "—",
        timestamp: new Date().toLocaleString("es-EC"),
        sourceLink: tab === "link" ? linkInput.trim() : null,
      };
      setResult(entry);
      addToHistory(entry);
    } catch (err) {
      setError(err.message || "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Parser KML en el navegador (regex global — captura TODOS los polígonos)
  // Estrategia: escanear el KML completo buscando <coordinates> en cualquier
  // nesting (Placemark, MultiGeometry, Folder, etc.) para no perder zonas.
  // ─────────────────────────────────────────────────────────────────────────
  function parseKMLFast(kmlString) {
    const zones    = [];
    const coordReg = /<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/g;
    let cm;
    while ((cm = coordReg.exec(kmlString)) !== null) {
      // Parsear puntos lon,lat,alt separados por espacios/saltos
      const coords = cm[1].trim().split(/\s+/).filter(Boolean).map(p => {
        const pts = p.split(",");
        return [parseFloat(pts[0]), parseFloat(pts[1])];
      }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

      // Saltar puntos simples (<Point>) y líneas (<LineString>)
      if (coords.length < 3) continue;

      // Buscar el <name> más cercano ANTES de este bloque de coordenadas
      // (ventana de 2000 chars es suficiente para cubrir cualquier Placemark)
      const before      = kmlString.substring(Math.max(0, cm.index - 2000), cm.index);
      const nameMatches = before.match(/<name>\s*([\s\S]*?)\s*<\/name>/g);
      let name = "Sin nombre";
      if (nameMatches && nameMatches.length > 0) {
        name = nameMatches[nameMatches.length - 1]
          .replace(/<!\[CDATA\[|\]\]>/g, "")
          .replace(/<\/?name>/g, "")
          .trim();
      }

      zones.push({ name, coordinates: coords });
    }
    return zones;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cargar KML / KMZ — procesa en el navegador, envía por lotes al servidor
  // El servidor NUNCA recibe el archivo grande, solo JSON pequeño
  // ─────────────────────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      // 1. Leer el archivo en el navegador
      setUploadMsg({ type: "info", text: "📂 Leyendo archivo..." });
      const arrayBuffer = await selectedFile.arrayBuffer();

      // 2. Extraer KML del KMZ (o leer directo si es .kml)
      let kmlText;
      if (selectedFile.name.toLowerCase().endsWith(".kmz")) {
        const zip      = await JSZip.loadAsync(arrayBuffer);
        const kmlFile  = Object.values(zip.files).find(f => f.name.endsWith(".kml"));
        if (!kmlFile) throw new Error("No se encontró doc.kml dentro del KMZ");
        kmlText = await kmlFile.async("string");
      } else {
        kmlText = new TextDecoder().decode(arrayBuffer);
      }

      // 3. Parsear zonas en el navegador con regex
      setUploadMsg({ type: "info", text: "🔍 Extrayendo zonas..." });
      const zones = parseKMLFast(kmlText);
      if (zones.length === 0) throw new Error("No se encontraron polígonos en el archivo.");

      // 4. Enviar al servidor en lotes de 200 (sin saturar la memoria del servidor)
      const BATCH   = 200;
      const total   = Math.ceil(zones.length / BATCH);
      let   enviadas = 0;

      for (let i = 0; i < zones.length; i += BATCH) {
        const lote      = zones.slice(i, i + BATCH);
        const isFirst   = i === 0;
        const isFinal   = i + BATCH >= zones.length;
        enviadas += lote.length;

        setUploadMsg({ type: "info", text: `📤 Enviando... ${enviadas}/${zones.length} zonas (lote ${Math.ceil((i+1)/BATCH)}/${total})` });

        const res = await fetch(`${API_URL}/load-batch`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            zones:    lote,
            fileName: selectedFile.name,
            isFirst,
            isFinal,
            total:    zones.length,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error al enviar lote");
      }

      setUploadMsg({ type: "ok", text: `✅ ${zones.length} zonas cargadas y guardadas correctamente` });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setUploadMsg({ type: "err", text: `❌ ${err.message}` });
    } finally {
      setUploading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Exportar historial a CSV
  // ─────────────────────────────────────────────────────────────────────────
  function exportCSV() {
    if (!history.length) return;
    const headers = ["Latitud", "Longitud", "Cobertura", "Zona", "Fecha/Hora", "Enlace origen"];
    const rows = history.map((h) => [
      h.lat?.toFixed(6) ?? "",
      h.lon?.toFixed(6) ?? "",
      h.hasCoverage ? "Sí" : "No",
      h.zoneName || "—",
      h.timestamp,
      h.sourceLink || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cobertura-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in-up pb-10">
      {/* ── Header ── */}
      <div className="mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            🗺️ Consulta de Cobertura
          </h1>
          <p className="text-slate-500 mt-1">
            Verifica si una ubicación tiene cobertura de internet
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
            apiStatus === "online"
              ? "bg-green-100 text-green-700"
              : apiStatus === "offline"
              ? "bg-red-100 text-red-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              apiStatus === "online" ? "bg-green-500" : apiStatus === "offline" ? "bg-red-500" : "bg-slate-400"
            }`}
          />
          {apiStatus === "online" ? "API activa" : apiStatus === "offline" ? "API inactiva" : "Verificando…"}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Panel izquierdo: formulario ── */}
        <div className="lg:col-span-1 space-y-5">
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            {[
              { key: "link", label: "📎 Pegar enlace" },
              { key: "coords", label: "📍 Coordenadas" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setTab(key); setError(""); setResult(null); setParsedCoords(null); setParseError(""); }}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                  tab === key
                    ? "bg-blue-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Formulario de enlace */}
          {tab === "link" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-slate-700">Enlace de ubicación</h2>
              <p className="text-xs text-slate-400">
                Pega el enlace de WhatsApp, Google Maps o Apple Maps, o escribe las
                coordenadas directamente (ej: <code>-2.4189, -79.3459</code>).
              </p>

              <textarea
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  setParsedCoords(null);
                  setParseError("");
                }}
                placeholder={
                  "Ejemplos:\nhttps://maps.google.com/?q=-2.4189,-79.3459\nhttps://maps.app.goo.gl/xxxxx\n-2.4189, -79.3459"
                }
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
              />

              <button
                onClick={handleParseLink}
                disabled={!linkInput.trim() || parsing}
                className="w-full py-2.5 bg-slate-700 text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-40"
              >
                {parsing ? "⏳ Resolviendo enlace…" : "🔍 Extraer coordenadas"}
              </button>

              {parseError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  ❌ {parseError}
                </p>
              )}

              {parsedCoords && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm space-y-1">
                  <p className="font-semibold text-blue-700">✅ Coordenadas extraídas</p>
                  <p className="text-slate-700 font-mono">
                    Lat: <strong>{parsedCoords.lat.toFixed(6)}</strong> &nbsp;|&nbsp; Lon:{" "}
                    <strong>{parsedCoords.lon.toFixed(6)}</strong>
                  </p>
                  <a
                    href={`https://maps.google.com/?q=${parsedCoords.lat},${parsedCoords.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    🗺 Ver en Google Maps
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Formulario de coordenadas manuales */}
          {tab === "coords" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-slate-700">Coordenadas decimales</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Latitud <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    placeholder="-2.4189"
                    step="0.0001"
                    min="-90"
                    max="90"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Longitud <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="number"
                    value={manualLon}
                    onChange={(e) => setManualLon(e.target.value)}
                    placeholder="-79.3459"
                    step="0.0001"
                    min="-180"
                    max="180"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              {manualLat && manualLon && (
                <a
                  href={`https://maps.google.com/?q=${manualLat},${manualLon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-blue-500 hover:underline"
                >
                  🗺 Ver en Google Maps
                </a>
              )}
            </div>
          )}

          {/* Botón verificar cobertura */}
          <button
            onClick={handleCheck}
            disabled={loading || (tab === "link" && !parsedCoords) || (tab === "coords" && (!manualLat || !manualLon))}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold shadow hover:shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "⏳ Verificando…" : "🔍 Consultar Cobertura"}
          </button>

          {/* Carga KML/KMZ — solo ADMINISTRADOR */}
          {isAdmin ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-slate-700">📁 Cargar zonas KML / KMZ</h2>
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                  Solo admin
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Carga el archivo con las zonas de cobertura. Máx. 200 MB.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
                onDragLeave={() => setDragover(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragover(false);
                  const f = e.dataTransfer.files[0];
                  if (f && (f.name.endsWith(".kml") || f.name.endsWith(".kmz"))) {
                    setSelectedFile(f);
                    setUploadMsg(null);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
                  dragover ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".kml,.kmz"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files[0];
                    if (f) { setSelectedFile(f); setUploadMsg(null); }
                  }}
                />
                <p className="text-sm text-slate-600 font-medium">
                  {selectedFile ? `📄 ${selectedFile.name}` : "📤 Arrastra o haz clic para seleccionar"}
                </p>
              </div>

              {selectedFile && (
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="w-full py-2 bg-teal-600 text-white rounded-lg text-sm font-semibold hover:bg-teal-700 transition disabled:opacity-40"
                >
                  {uploading ? "⏳ Subiendo…" : `📤 Subir ${selectedFile.name}`}
                </button>
              )}

              {uploadMsg && (
                <p
                  className={`text-xs rounded-lg px-3 py-2 ${
                    uploadMsg.type === "ok"
                      ? "bg-green-50 text-green-700"
                      : uploadMsg.type === "err"
                      ? "bg-red-50 text-red-700"
                      : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {uploadMsg.text}
                </p>
              )}
            </div>
          ) : null}
        </div>

        {/* ── Panel derecho: resultado + historial ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Error global */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              ❌ {error}
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div
              className={`rounded-2xl border-l-4 p-6 ${
                result.hasCoverage
                  ? "bg-green-50 border-green-500"
                  : "bg-red-50 border-red-500"
              }`}
            >
              <h3
                className={`text-2xl font-bold mb-4 ${
                  result.hasCoverage ? "text-green-700" : "text-red-700"
                }`}
              >
                {result.hasCoverage ? "✅ SÍ tiene cobertura" : "❌ NO tiene cobertura"}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Latitud", val: result.lat?.toFixed(6) },
                  { label: "Longitud", val: result.lon?.toFixed(6) },
                  { label: "Zona", val: result.zoneName },
                  { label: "Hora", val: result.timestamp },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-white rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className="font-semibold text-slate-800 text-sm break-words">{val}</p>
                  </div>
                ))}
              </div>
              {result.lat && result.lon && (
                <a
                  href={`https://maps.google.com/?q=${result.lat},${result.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-3 text-xs text-blue-500 hover:underline"
                >
                  🗺 Abrir en Google Maps
                </a>
              )}
            </div>
          )}

          {/* Historial */}
          {history.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="font-semibold text-slate-700">
                  📋 Historial ({history.length})
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={exportCSV}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition"
                  >
                    ⬇ CSV
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("¿Limpiar historial?")) {
                        setHistory([]);
                        localStorage.removeItem("coverageHistory");
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-red-100 hover:text-red-700 transition"
                  >
                    🗑 Limpiar
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {["Latitud", "Longitud", "Cobertura", "Zona", "Fecha/Hora"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold text-xs">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr
                        key={item.id}
                        className={`border-t border-slate-100 hover:bg-slate-50 ${
                          item.hasCoverage ? "bg-green-50/40" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs">{item.lat?.toFixed(4)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{item.lon?.toFixed(4)}</td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              item.hasCoverage
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {item.hasCoverage ? "✅ Sí" : "❌ No"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">{item.zoneName}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{item.timestamp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Estado vacío cuando no hay historial ni resultado */}
          {!result && history.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 shadow-sm">
              <div className="text-5xl mb-3">🗺️</div>
              <p className="font-medium text-slate-500">Sin consultas aún</p>
              <p className="text-sm mt-1">
                Pega un enlace de WhatsApp o ingresa coordenadas para comenzar.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
