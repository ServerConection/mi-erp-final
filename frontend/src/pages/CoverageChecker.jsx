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
import MapaCobertura, { LeyendaMapa } from "../components/MapaCobertura";
import TarjetaCliente from "../components/TarjetaCliente";

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

// ─────────────────────────────────────────────────────────────────────────────
// Coordenadas en GRADOS, MINUTOS Y SEGUNDOS (DMS)
// Es el formato que muestra Google Maps al hacer clic derecho sobre un punto:
//   2°10'22.4"S 79°53'20.9"W
// ─────────────────────────────────────────────────────────────────────────────
function dmsAdecimal(g, m, s, hemisferio) {
  let d = Math.abs(parseFloat(g) || 0) + (parseFloat(m) || 0) / 60 + (parseFloat(s) || 0) / 3600;
  const h = (hemisferio || "").toUpperCase();
  if (h === "S" || h === "W" || h === "O") d = -d;
  else if (!h && String(g).trim().startsWith("-")) d = -d;
  return d;
}

function parseDMS(text) {
  if (!text) return null;
  const t = String(text)
    .replace(/[’′]/g, "'")
    .replace(/[”″]/g, '"')
    .replace(/º/g, "°")
    .trim();

  const parte = String.raw`(-?\d{1,3})\s*°?\s*(\d{1,2})\s*'?\s*(\d{1,2}(?:[.,]\d+)?)\s*"?\s*([NSEWO])?`;
  const re = new RegExp(parte + String.raw`[\s,;]+` + parte, "i");
  const m = t.match(re);
  if (!m) return null;

  const a = dmsAdecimal(m[1], m[2], String(m[3]).replace(",", "."), m[4]);
  const b = dmsAdecimal(m[5], m[6], String(m[7]).replace(",", "."), m[8]);

  const ha = (m[4] || "").toUpperCase(), hb = (m[8] || "").toUpperCase();
  let lat, lon;
  if (ha === "E" || ha === "W" || ha === "O" || hb === "N" || hb === "S") { lat = b; lon = a; }
  else { lat = a; lon = b; }

  if (isValidCoords(lat, lon)) return { lat, lon };
  return null;
}

/**
 * Extrae coordenadas de un enlace o texto.
 *
 * ORDEN DE PRIORIDAD — esto corrige el desfase de "unas cuadras":
 *   1. !3d!4d  → coordenadas EXACTAS del pin del lugar
 *   2. q= / ll= / geo:  → punto explícito (WhatsApp usa esto)
 *   3. /search/lat,lon
 *   4. @lat,lon → ÚLTIMO RECURSO: es el centro de la cámara del mapa, NO el pin.
 *      Si el usuario movió el mapa antes de compartir, cae a varias cuadras del
 *      punto real. Antes se leía primero, y por eso la ubicación salía corrida.
 *
 * Devuelve { lat, lon, exacta } — exacta:false avisa que es aproximada.
 */
function parseLocationUrl(text) {
  text = (text || "").trim();

  // Coordenadas decimales escritas directamente
  const direct = parseCoordPair(text);
  if (direct) return { ...direct, exacta: true };

  // Grados, minutos y segundos
  const dms = parseDMS(text);
  if (dms) return { ...dms, exacta: true };

  // 1. Pin exacto del lugar (bloque "data" de Google Maps)
  const lugar = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (lugar) {
    const lat = parseFloat(lugar[1]);
    const lon = parseFloat(lugar[2]);
    if (isValidCoords(lat, lon)) return { lat, lon, exacta: true };
  }

  // geo:lat,lon (Android)
  const geo = text.match(/^geo:(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
  if (geo) {
    const lat = parseFloat(geo[1]);
    const lon = parseFloat(geo[2]);
    if (isValidCoords(lat, lon)) return { lat, lon, exacta: true };
  }

  try {
    const url = new URL(text);
    const params = new URLSearchParams(url.search);

    // 2. Punto explícito
    for (const clave of ["q", "query", "ll", "sll", "daddr", "destination", "center"]) {
      if (!params.has(clave)) continue;
      const v = (params.get(clave) || "").replace(/^loc:/i, "").trim();
      const r = parseCoordPair(v) || parseDMS(v);
      if (r) return { ...r, exacta: true };
    }
    if (params.has("mlat") && params.has("mlon")) {
      const lat = parseFloat(params.get("mlat"));
      const lon = parseFloat(params.get("mlon"));
      if (isValidCoords(lat, lon)) return { lat, lon, exacta: true };
    }

    // 3. /search/LAT,+LNG
    const searchMatch = url.pathname.match(/\/search\/(-?\d+\.?\d*)(?:,\+?|,\s*)(-?\d+\.?\d*)/);
    if (searchMatch) {
      const lat = parseFloat(searchMatch[1]);
      const lon = parseFloat(searchMatch[2]);
      if (isValidCoords(lat, lon)) return { lat, lon, exacta: true };
    }

    // 4. ÚLTIMO RECURSO: centro de la cámara (aproximado)
    const camara = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (camara) {
      const lat = parseFloat(camara[1]);
      const lon = parseFloat(camara[2]);
      if (isValidCoords(lat, lon)) return { lat, lon, exacta: false };
    }
  } catch {
    // no es una URL válida
  }

  // 5. Búsqueda general (mínimo 4 decimales para evitar falsos positivos)
  const general = text.match(/(-?\d{1,2}\.\d{4,})[,\s]+(-?\d{1,3}\.\d{4,})/);
  if (general) {
    const lat = parseFloat(general[1]);
    const lon = parseFloat(general[2]);
    if (isValidCoords(lat, lon)) return { lat, lon, exacta: true };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zonas de peligro
// El backend las clasifica geométricamente (point-in-polygon contra la capa de
// zonas de peligro) y devuelve `esZonaPeligrosa` + `peligroTipo`. Aquí solo se
// presenta. Antes se adivinaba por el NOMBRE de la zona de cobertura con una
// lista fija ["AZ4","OPU","GIS"], lo que dejaba fuera las zonas nuevas
// ("Bloqueado" / "Horario restringido") — la gran mayoría.
// ─────────────────────────────────────────────────────────────────────────────

const PELIGRO_ESTILOS = {
  BLOQUEADO: {
    etiqueta:  "ZONA BLOQUEADA",
    icono:     "⛔",
    mensaje:   "NO INGRESAR. Zona bloqueada por seguridad.",
    caja:      "bg-red-100 border-red-500 text-red-900",
    chip:      "bg-red-600 text-white",
    texto:     "text-red-700",
  },
  HORARIO_RESTRINGIDO: {
    etiqueta:  "HORARIO RESTRINGIDO",
    icono:     "🕒",
    mensaje:   "Ingreso permitido SOLO en horario autorizado. Confirmar con supervisión.",
    caja:      "bg-amber-100 border-amber-500 text-amber-900",
    chip:      "bg-amber-500 text-white",
    texto:     "text-amber-700",
  },
  RESTRINGIDA: {
    etiqueta:  "ZONA RESTRINGIDA",
    icono:     "⚠️",
    mensaje:   "Zona clasificada como peligrosa. Proceder con precaución.",
    caja:      "bg-orange-100 border-orange-500 text-orange-900",
    chip:      "bg-orange-500 text-white",
    texto:     "text-orange-700",
  },
};

function estiloPeligro(tipo) {
  return PELIGRO_ESTILOS[tipo] || PELIGRO_ESTILOS.RESTRINGIDA;
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

  // ── Estado de zonas activas en el servidor ──────────────────────────────────
  // Persiste en PostgreSQL: sobrevive reinicios del servidor.
  // Se muestra a TODOS los usuarios para que sepan si el sistema está listo.
  const [coverageStatus, setCoverageStatus] = useState(null); // {zonesLoaded, fileName, loadedAt}
  const [retryingLinks, setRetryingLinks] = useState(false);
  // Modo de carga: "sumar" agrega al acervo existente (por defecto, porque la
  // cobertura está repartida en muchos archivos y ninguno tiene el total);
  // "reemplazar" borra todo lo anterior y deja solo este archivo.
  const [modoCarga, setModoCarga] = useState("sumar");

  // ── Mapa ────────────────────────────────────────────────────────────────────
  const [zonasMapa, setZonasMapa]       = useState([]);   // zonas del área visible
  const [mapaTruncado, setMapaTruncado] = useState(false);
  const [cargandoMapa, setCargandoMapa] = useState(false);
  const [verTarjeta, setVerTarjeta]     = useState(false); // modal vista cliente
  const [vistaMapaGeneral, setVistaMapaGeneral] = useState(false);
  const peticionMapaRef = useRef(0);

  // Trae solo las zonas del área visible del mapa. Nunca las trae todas:
  // con miles de zonas el navegador de operación no lo soportaría.
  async function cargarZonasDelArea({ minLon, minLat, maxLon, maxLat }) {
    const id = ++peticionMapaRef.current;
    setCargandoMapa(true);
    try {
      const qs = new URLSearchParams({
        minLon: minLon.toFixed(6), minLat: minLat.toFixed(6),
        maxLon: maxLon.toFixed(6), maxLat: maxLat.toFixed(6),
        limit: "1500",
      });
      const r = await fetch(`${API_URL}/zones-in-view?${qs}`, { headers: authHeaders() });
      if (!r.ok) return;
      const data = await r.json();
      // Descartar respuestas viejas si el usuario siguió moviendo el mapa
      if (id !== peticionMapaRef.current) return;
      setZonasMapa(data.zones || []);
      setMapaTruncado(!!data.truncado);
    } catch {
      /* silencioso — el mapa es complementario, no debe romper la consulta */
    } finally {
      if (id === peticionMapaRef.current) setCargandoMapa(false);
    }
  }

  // ── Verificar estado de la API ──────────────────────────────────────────────
  useEffect(() => {
    checkAPIStatus();
    fetchCoverageStatus();
    const timer = setInterval(checkAPIStatus, 30_000);
    return () => clearInterval(timer);
  }, []);

  // Mientras se están resolviendo NetworkLinks (mapas externos) en el backend,
  // refresca el estado cada 5s para que el contador de "resueltos" avance solo.
  useEffect(() => {
    if (!coverageStatus?.networkLinks?.loading) return;
    const timer = setInterval(fetchCoverageStatus, 5_000);
    return () => clearInterval(timer);
  }, [coverageStatus?.networkLinks?.loading]);

  async function checkAPIStatus() {
    try {
      const r = await fetch(`${API_URL}/status`);
      setApiStatus(r.ok ? "online" : "offline");
    } catch {
      setApiStatus("offline");
    }
  }

  // Consulta al servidor cuántas zonas hay cargadas y desde qué archivo.
  // Se llama al montar y tras cada subida exitosa de KMZ/KML.
  async function fetchCoverageStatus() {
    try {
      const r = await fetch(`${API_URL}/status`, { headers: authHeaders() });
      if (r.ok) {
        const data = await r.json();
        setCoverageStatus({
          zonesLoaded:  data.zonesLoaded || 0,
          fileName:     data.fileName   || null,
          loadedAt:     data.loadedAt   || null,
          byType:       data.byType     || {},
          byDanger:     data.byDanger   || {},
          dangerTotal:  data.dangerTotal || 0,
          networkLinks: data.networkLinks || null, // { total, resolved, failed, loading }
        });
      }
    } catch {
      // silencioso — no crítico
    }
  }

  // ── Reintentar NetworkLinks fallidos (solo admin) ───────────────────────────
  async function retryLinks() {
    setRetryingLinks(true);
    try {
      const r = await fetch(`${API_URL}/retry-links`, {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Error al reintentar enlaces");
      // Refrescar estado: el polling cada 5s se activa solo cuando loading=true
      await fetchCoverageStatus();
    } catch (err) {
      setUploadMsg({ type: "err", text: `❌ ${err.message}` });
    } finally {
      setRetryingLinks(false);
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

    // Intento en el navegador primero (más rápido).
    // Si solo se pudo sacar el centro del mapa (exacta:false), NO se corta acá:
    // se le pide al servidor que resuelva el enlace, porque el HTML de Google
    // suele traer el pin exacto y así se evita el desfase de varias cuadras.
    const local = parseLocationUrl(text);
    if (local && local.exacta !== false) {
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
          setParsedCoords({ lat: data.lat, lon: data.lon, exacta: data.exacta !== false });
        } else {
          setParseError(data.message || "No se pudo extraer coordenadas.");
        }
      } catch {
        setParseError("Error de conexión al resolver el enlace.");
      } finally {
        setParsing(false);
      }
    } else if (local) {
      // Solo se tenía el centro del mapa y no se pudo resolver: se usa igual,
      // pero avisando que es aproximada.
      setParsedCoords(local);
    } else {
      setParseError(
        'No se pudo extraer coordenadas. Pega un enlace de ubicación de WhatsApp o Google Maps, ' +
        'o escribe las coordenadas: decimales (-2.4189, -79.3459) o en grados (2°10\'22.4"S 79°53\'20.9"W).'
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
      // El campo acepta tanto decimales (-2.4189) como grados (2°10'22.4"S).
      // Si el usuario pegó el par completo en un solo campo, también se admite.
      const juntos = parseDMS(`${manualLat} ${manualLon}`) ||
                     parseDMS(manualLat) ||
                     parseCoordPair(`${manualLat},${manualLon}`);
      if (juntos) {
        lat = juntos.lat;
        lon = juntos.lon;
      } else {
        lat = parseFloat(String(manualLat).replace(",", "."));
        lon = parseFloat(String(manualLon).replace(",", "."));
      }

      if (isNaN(lat) || isNaN(lon)) {
        setError('Coordenadas no válidas. Usa decimales (-2.4189 y -79.3459) o grados (2°10\'22.4"S y 79°53\'20.9"W).');
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
        // Pregunta 1 — cobertura
        hasCoverage: data.hasCoverage,
        zoneName: data.zoneName || "—",
        // Pregunta 2 — peligro (independiente de la cobertura)
        esZonaPeligrosa: !!data.esZonaPeligrosa,
        peligroTipo:     data.peligroTipo     || null,
        peligroEtiqueta: data.peligroEtiqueta || null,
        peligroZonas:    data.peligroZonas    || [],
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
  // Parser KML en el navegador (regex global — captura TODOS los elementos)
  // Estrategia: escanear el KML completo buscando <coordinates> en cualquier
  // nesting (Placemark, MultiGeometry, Folder, etc.) para no perder ninguno.
  // Antes se descartaba todo lo que tuviera menos de 3 coordenadas (Point,
  // LineString), lo que dejaba fuera ~65k de los ~88k elementos del KMZ.
  // Ahora se clasifican por tipo y se conservan todos; además se recolectan
  // los <NetworkLink> (mapas externos enlazados) para resolverlos en el backend.
  // ─────────────────────────────────────────────────────────────────────────
  function classifyGeometry(beforeSnippet) {
    const pointIdx = beforeSnippet.lastIndexOf("<Point>");
    const lineIdx  = beforeSnippet.lastIndexOf("<LineString>");
    const ringIdx  = beforeSnippet.lastIndexOf("<LinearRing>");
    const max = Math.max(pointIdx, lineIdx, ringIdx);
    if (max === -1) return "Polygon";
    if (max === pointIdx) return "Point";
    if (max === lineIdx) return "LineString";
    return "Polygon";
  }

  function parseKMLFast(kmlString) {
    const zones    = [];
    const coordReg = /<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/g;
    let cm;

    // Carpeta contenedora de cada zona. Se envía al servidor para que pueda
    // reconocer zonas de peligro cuyo nombre no siga ninguna convención pero
    // que vivan en una carpeta "Zonas_Peligro_*". La clasificación en sí la
    // hace SIEMPRE el servidor: es información de seguridad y no debe depender
    // del navegador.
    const folderMarks = [];
    const folderReg = /<(?:Folder|Document)>\s*(?:<[^>]+>\s*)*?<name>\s*([\s\S]*?)\s*<\/name>/g;
    let fm;
    while ((fm = folderReg.exec(kmlString)) !== null) {
      folderMarks.push({
        idx:  fm.index,
        name: fm[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim(),
      });
    }
    function folderAt(pos) {
      let lo = 0, hi = folderMarks.length - 1, res = "";
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (folderMarks[mid].idx <= pos) { res = folderMarks[mid].name; lo = mid + 1; }
        else hi = mid - 1;
      }
      return res;
    }

    while ((cm = coordReg.exec(kmlString)) !== null) {
      // Parsear puntos lon,lat,alt separados por espacios/saltos
      const coords = cm[1].trim().split(/\s+/).filter(Boolean).map(p => {
        const pts = p.split(",");
        return [parseFloat(pts[0]), parseFloat(pts[1])];
      }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));

      if (coords.length === 0) continue;

      const type = classifyGeometry(kmlString.substring(Math.max(0, cm.index - 300), cm.index));

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

      // Se envía la carpeta para que el servidor pueda clasificar el peligro.
      // Solo se incluye si parece relevante, para no inflar el payload.
      const folder = folderAt(cm.index);
      const z = { name, coordinates: coords, type };
      // Se envía la carpeta cuando sugiere zona de riesgo, en cualquiera de las
      // formas conocidas: "Zonas_Peligro_*" (archivos originales) o ya agrupadas
      // por tipo ("Bloqueado", "Horario restringido", "Zona restringida").
      if (folder && /PELIGRO|BLOQUEAD|RESTRINGID|HORARIO/i.test(folder)) z.folder = folder;
      zones.push(z);
    }

    // NetworkLinks: enlaces a mapas externos (Google My Maps, Telcodrive, etc.)
    // No se pueden resolver desde el navegador por CORS — se le pasan al backend.
    const networkLinks = [];
    const nlReg = /<NetworkLink>[\s\S]*?<href>\s*([\s\S]*?)\s*<\/href>/g;
    let nm;
    while ((nm = nlReg.exec(kmlString)) !== null) {
      const href = nm[1].replace(/&amp;/g, "&").trim();
      if (href) networkLinks.push(href);
    }

    return { zones, networkLinks };
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

      // 3. Parsear zonas en el navegador con regex (Point + LineString + Polygon)
      setUploadMsg({ type: "info", text: "🔍 Extrayendo elementos..." });
      const { zones, networkLinks } = parseKMLFast(kmlText);

      if (zones.length === 0 && networkLinks.length === 0) {
        throw new Error("No se encontraron elementos con coordenadas ni enlaces externos en el archivo.");
      }

      // 3b. Archivo SOLO-ENLACES (ej: "COBERTURA SMB_LINK.kml", que apunta al KMZ
      // real en TelcoDrive). No trae coordenadas: se manda un único request para
      // que el backend descargue la cobertura desde el origen externo.
      if (zones.length === 0) {
        setUploadMsg({ type: "info", text: `🔗 Archivo de enlaces — solicitando descarga de ${networkLinks.length} origen(es)...` });

        const res = await fetch(`${API_URL}/load-batch`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            zones:    [],
            fileName: selectedFile.name,
            isFirst:  true,
            isFinal:  true,
            total:    0,
            modo:     modoCarga,
            networkLinks,
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error al enviar el archivo de enlaces");

        setUploadMsg({
          type: "ok",
          text: `✅ Archivo de enlaces cargado. Descargando cobertura desde ${networkLinks.length} origen(es) externo(s) en segundo plano (puede tardar varios minutos)...`,
        });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await fetchCoverageStatus();
        return;
      }

      // 4. Enviar al servidor en lotes de 200 (sin saturar la memoria del servidor)
      const BATCH   = 200;
      const total   = Math.ceil(zones.length / BATCH);
      let   enviadas = 0;
      let   totalFinal = 0; // acervo total que reporta el servidor al terminar

      for (let i = 0; i < zones.length; i += BATCH) {
        const lote      = zones.slice(i, i + BATCH);
        const isFirst   = i === 0;
        const isFinal   = i + BATCH >= zones.length;
        enviadas += lote.length;

        setUploadMsg({ type: "info", text: `📤 Enviando... ${enviadas}/${zones.length} elementos (lote ${Math.ceil((i+1)/BATCH)}/${total})` });

        const res = await fetch(`${API_URL}/load-batch`, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            zones:    lote,
            fileName: selectedFile.name,
            isFirst,
            isFinal,
            total:    zones.length,
            modo:     modoCarga,
            // Solo se manda en el lote final, para que el backend dispare la
            // resolución de mapas externos (NetworkLinks) una sola vez.
            ...(isFinal ? { networkLinks } : {}),
          }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Error al enviar lote");
        if (isFinal) totalFinal = data.zonesLoaded ?? 0;
      }

      const resumen = modoCarga === "sumar"
        ? `✅ ${zones.length} elementos procesados — acervo total: ${totalFinal.toLocaleString()} zonas`
        : `✅ ${zones.length} elementos cargados (reemplazo completo)`;
      setUploadMsg({
        type: "ok",
        text: networkLinks.length > 0
          ? `${resumen}. Resolviendo ${networkLinks.length} enlaces externos en segundo plano (puede tardar varios minutos)...`
          : resumen,
      });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Actualizar el indicador de zonas activas para reflejar el nuevo archivo
      await fetchCoverageStatus();
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
    const headers = ["Latitud", "Longitud", "Cobertura", "Zona", "Zona peligrosa", "Tipo de restricción", "Fecha/Hora", "Enlace origen"];
    const rows = history.map((h) => [
      h.lat?.toFixed(6) ?? "",
      h.lon?.toFixed(6) ?? "",
      h.hasCoverage ? "Sí" : "No",
      h.zoneName || "—",
      h.esZonaPeligrosa ? "Sí" : "No",
      h.esZonaPeligrosa ? estiloPeligro(h.peligroTipo).etiqueta : "Sin restricción",
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

      {/* ── Banner: estado de zonas activas ── */}
      {coverageStatus !== null && (
        <div
          className={`mb-4 flex items-center gap-3 rounded-xl px-4 py-3 text-sm border ${
            coverageStatus.zonesLoaded > 0
              ? "bg-teal-50 border-teal-200 text-teal-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {coverageStatus.zonesLoaded > 0 ? (
            <>
              <span className="text-xl">📡</span>
              <div>
                <span className="font-semibold">
                  {coverageStatus.zonesLoaded.toLocaleString()} elementos activos
                </span>
                {coverageStatus.byType && Object.keys(coverageStatus.byType).length > 0 && (
                  <span className="ml-2 text-teal-600 text-xs">
                    ({Object.entries(coverageStatus.byType)
                      .map(([t, n]) => `${t}: ${n.toLocaleString()}`)
                      .join(" · ")})
                  </span>
                )}
                {coverageStatus.fileName && (
                  <span className="ml-2 text-teal-600">
                    — {coverageStatus.fileName}
                  </span>
                )}
                {coverageStatus.dangerTotal > 0 && (
                  <div className="text-xs mt-1 font-semibold text-red-700">
                    ⛔ Zonas de peligro activas: {coverageStatus.dangerTotal.toLocaleString()}
                    {coverageStatus.byDanger && (
                      <span className="font-normal ml-1">
                        ({[
                          coverageStatus.byDanger.BLOQUEADO && `Bloqueado: ${coverageStatus.byDanger.BLOQUEADO}`,
                          coverageStatus.byDanger.HORARIO_RESTRINGIDO && `Horario restringido: ${coverageStatus.byDanger.HORARIO_RESTRINGIDO}`,
                          coverageStatus.byDanger.RESTRINGIDA && `Restringida: ${coverageStatus.byDanger.RESTRINGIDA}`,
                        ].filter(Boolean).join(" · ")})
                      </span>
                    )}
                  </div>
                )}
                {coverageStatus.loadedAt && (
                  <span className="ml-2 opacity-60 text-xs">
                    (cargadas el{" "}
                    {new Date(coverageStatus.loadedAt).toLocaleString("es-EC")})
                  </span>
                )}
                {coverageStatus.networkLinks && coverageStatus.networkLinks.total > 0 && (
                  <div className="text-xs mt-1">
                    {coverageStatus.networkLinks.loading ? "🔄" : "✅"} Enlaces externos:{" "}
                    {coverageStatus.networkLinks.resolved}/{coverageStatus.networkLinks.total} resueltos
                    {coverageStatus.networkLinks.zonesAdded > 0 && (
                      <span className="text-teal-700"> (+{coverageStatus.networkLinks.zonesAdded.toLocaleString()} zonas)</span>
                    )}
                    {coverageStatus.networkLinks.failed > 0 && (
                      <span className="text-amber-600"> ({coverageStatus.networkLinks.failed} fallidos)</span>
                    )}
                    {isAdmin && !coverageStatus.networkLinks.loading && coverageStatus.networkLinks.failed > 0 && (
                      <button
                        onClick={retryLinks}
                        disabled={retryingLinks}
                        className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold hover:bg-amber-200 disabled:opacity-50"
                      >
                        {retryingLinks ? "Reintentando..." : "🔁 Reintentar fallidos"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="text-xl">⚠️</span>
              <span>
                <span className="font-semibold">Sin zonas cargadas.</span>{" "}
                {isAdmin
                  ? "Carga un archivo KML/KMZ en el panel de abajo."
                  : "Pide al administrador que cargue el archivo de cobertura."}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Cambio entre CONSULTAR y MAPA GENERAL ────────────────────────────
          El mapa general reemplaza a Google Earth para los PCs de operación:
          en vez de abrir archivos pesados, dibuja solo las zonas del área
          visible. El peso no depende de cuántas zonas haya cargadas en total. */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setVistaMapaGeneral(false)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
            !vistaMapaGeneral ? "bg-blue-600 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          🔍 Consultar dirección
        </button>
        <button
          onClick={() => setVistaMapaGeneral(true)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
            vistaMapaGeneral ? "bg-blue-600 text-white shadow" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          🗺 Mapa de coberturas
        </button>
      </div>

      {/* ── MAPA GENERAL ─────────────────────────────────────────────────── */}
      {vistaMapaGeneral && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-semibold text-slate-700">Mapa de coberturas y zonas de riesgo</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Navega y acerca el mapa. Se dibujan solo las zonas del área visible.
              </p>
            </div>
            <div className="text-xs text-slate-500">
              {cargandoMapa
                ? "Cargando zonas…"
                : `${zonasMapa.length.toLocaleString()} zonas en pantalla`}
            </div>
          </div>

          <MapaCobertura
            key="mapa-general"
            lat={result?.lat ?? -1.8312}
            lon={result?.lon ?? -78.1834}
            zonas={zonasMapa}
            modo="interno"
            zoom={result?.lat ? 14 : 7}
            alto={560}
            onMoveEnd={cargarZonasDelArea}
            etiquetaMarcador="Última consulta"
          />
          <LeyendaMapa />

          {mapaTruncado && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              ⚠️ Esta área tiene más zonas de las que se pueden dibujar de una vez.
              Acerca el mapa para ver el detalle completo.
            </p>
          )}

          {coverageStatus && coverageStatus.zonesLoaded === 0 && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mt-2">
              No hay zonas cargadas en el servidor todavía.
            </p>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${vistaMapaGeneral ? "hidden" : ""}`}>
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
                <div className={`border rounded-xl p-4 text-sm space-y-1 ${
                  parsedCoords.exacta === false
                    ? "bg-amber-50 border-amber-300"
                    : "bg-blue-50 border-blue-200"
                }`}>
                  {parsedCoords.exacta === false ? (
                    <>
                      <p className="font-bold text-amber-800">⚠️ Ubicación APROXIMADA</p>
                      <p className="text-xs text-amber-800">
                        El enlace solo traía el encuadre del mapa, no el punto marcado.
                        Puede estar a varias cuadras del lugar real.
                        <strong> Pídele al cliente que comparta su ubicación desde WhatsApp</strong> para
                        obtener el punto exacto.
                      </p>
                    </>
                  ) : (
                    <p className="font-semibold text-blue-700">✅ Coordenadas exactas extraídas</p>
                  )}
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
                    🗺 Verificar en Google Maps
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Formulario de coordenadas manuales */}
          {tab === "coords" && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="font-semibold text-slate-700">Coordenadas geográficas</h2>
              <p className="text-xs text-slate-400">
                Acepta <strong>decimales</strong> (<code>-2.4189</code>) o{" "}
                <strong>grados, minutos y segundos</strong> (<code>2°10&apos;22.4&quot;S</code>),
                que es lo que muestra Google Maps al hacer clic derecho sobre un punto.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Latitud <span className="text-red-400">*</span>
                  </label>
                  {/* type="text" a propósito: type="number" rechaza los símbolos ° ' " */}
                  <input
                    type="text"
                    inputMode="text"
                    value={manualLat}
                    onChange={(e) => setManualLat(e.target.value)}
                    placeholder={`-2.4189  ó  2°10'22.4"S`}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Longitud <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="text"
                    value={manualLon}
                    onChange={(e) => setManualLon(e.target.value)}
                    placeholder={`-79.3459  ó  79°53'20.9"W`}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Vista previa de la conversión, para detectar errores antes de consultar */}
              {(() => {
                if (!manualLat || !manualLon) return null;
                const r = parseDMS(`${manualLat} ${manualLon}`) ||
                          parseDMS(manualLat) ||
                          parseCoordPair(`${manualLat},${manualLon}`) ||
                          (() => {
                            const a = parseFloat(String(manualLat).replace(",", "."));
                            const b = parseFloat(String(manualLon).replace(",", "."));
                            return isValidCoords(a, b) ? { lat: a, lon: b } : null;
                          })();
                if (!r) {
                  return (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      ❌ No se reconoce el formato. Ejemplos válidos: <code>-2.4189</code> ·{" "}
                      <code>2°10&apos;22.4&quot;S</code>
                    </p>
                  );
                }
                return (
                  <div className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
                    <p className="text-slate-600">
                      Se consultará: <strong className="font-mono">{r.lat.toFixed(6)}, {r.lon.toFixed(6)}</strong>
                    </p>
                    <a
                      href={`https://maps.google.com/?q=${r.lat},${r.lon}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      🗺 Verificar en Google Maps antes de consultar
                    </a>
                  </div>
                );
              })()}
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

              {/* Acervo actualmente cargado en el servidor */}
              {coverageStatus && coverageStatus.zonesLoaded > 0 && (
                <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs text-teal-800">
                  <span>✅</span>
                  <div>
                    <span className="font-semibold">Acervo actual:</span>{" "}
                    <span className="font-bold">{coverageStatus.zonesLoaded.toLocaleString()} zonas</span>
                    {coverageStatus.fileName && (
                      <span className="opacity-70"> — última carga: {coverageStatus.fileName}</span>
                    )}
                  </div>
                </div>
              )}

              {/* ── MODO DE CARGA ────────────────────────────────────────────
                  La cobertura está repartida en muchos archivos y mapas
                  externos; ninguno tiene el total. Por eso "Sumar" es el modo
                  por defecto: antes cada carga borraba todo lo anterior y se
                  perdía cobertura que ya estaba validada. */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600">¿Qué hacer con lo ya cargado?</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      key: "sumar",
                      titulo: "➕ Sumar al acervo",
                      desc: "Agrega estas zonas a las que ya existen. No borra nada. Las repetidas se omiten automáticamente.",
                      rec: true,
                    },
                    {
                      key: "reemplazar",
                      titulo: "🔄 Reemplazar todo",
                      desc: "Borra TODA la cobertura actual y deja solo este archivo. Úsalo únicamente para empezar de cero.",
                      rec: false,
                    },
                  ].map(({ key, titulo, desc, rec }) => (
                    <label
                      key={key}
                      className={`flex items-start gap-2 rounded-lg border-2 px-3 py-2 cursor-pointer transition ${
                        modoCarga === key
                          ? (key === "sumar"
                              ? "border-teal-500 bg-teal-50"
                              : "border-red-400 bg-red-50")
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="modoCarga"
                        className="mt-0.5"
                        checked={modoCarga === key}
                        onChange={() => setModoCarga(key)}
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-700">
                          {titulo}
                          {rec && <span className="ml-1 text-[10px] font-semibold text-teal-600">(recomendado)</span>}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {modoCarga === "reemplazar" && coverageStatus?.zonesLoaded > 0 && (
                  <p className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
                    ⚠️ Se borrarán las {coverageStatus.zonesLoaded.toLocaleString()} zonas actuales.
                  </p>
                )}
              </div>
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

              {/* ── ALERTA DE ZONA DE PELIGRO ──────────────────────────────
                  Se evalúa SIEMPRE, tenga o no cobertura: son dos preguntas
                  independientes. El estilo y el texto cambian según el tipo
                  (Bloqueado ≠ Horario restringido). */}
              {result.esZonaPeligrosa && (() => {
                const est = estiloPeligro(result.peligroTipo);
                return (
                  <div className={`mb-4 flex items-start gap-3 border-2 rounded-xl px-4 py-3 ${est.caja}`}>
                    <span className="text-3xl leading-none">{est.icono}</span>
                    <div className="flex-1">
                      <p className="font-extrabold text-base tracking-wide">{est.etiqueta}</p>
                      <p className="text-sm mt-0.5 font-medium">{est.mensaje}</p>
                      {result.peligroZonas?.length > 0 && (
                        <p className="text-xs mt-1.5 opacity-80">
                          Zona{result.peligroZonas.length > 1 ? "s" : ""} afectada
                          {result.peligroZonas.length > 1 ? "s" : ""}:{" "}
                          {result.peligroZonas.map(z => z.etiqueta).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Latitud",  val: result.lat?.toFixed(6) },
                  { label: "Longitud", val: result.lon?.toFixed(6) },
                  { label: "Zona",     val: result.zoneName },
                  { label: "Seguridad", val: result.esZonaPeligrosa
                      ? estiloPeligro(result.peligroTipo).etiqueta
                      : "Sin restricción" },
                  { label: "Hora",     val: result.timestamp },
                ].map(({ label, val }) => {
                  const esSeg = label === "Seguridad";
                  const alerta = esSeg && result.esZonaPeligrosa;
                  const est = estiloPeligro(result.peligroTipo);
                  return (
                  <div
                    key={label}
                    className={`rounded-xl p-3 ${alerta ? est.caja + " border-2" : "bg-white"}`}
                  >
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className={`font-semibold text-sm break-words ${
                      alerta ? "font-extrabold" : esSeg ? "text-green-700" : "text-slate-800"
                    }`}>
                      {alerta ? `${est.icono} ${val}` : val}
                    </p>
                  </div>
                  );
                })}
              </div>
              {/* ── MAPA DE DETALLE (vista interna) ──────────────────────────
                  Muestra la ubicación con los polígonos de cobertura y las
                  zonas de peligro alrededor. Es información interna: para
                  enviarle algo al cliente se usa el botón de vista para cliente,
                  que genera una tarjeta sin ninguno de estos datos. */}
              {result.lat != null && result.lon != null && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-slate-700">
                      🗺 Ubicación en el mapa
                      {cargandoMapa && <span className="ml-2 text-xs font-normal text-slate-400">cargando zonas…</span>}
                    </h4>
                    <button
                      onClick={() => setVerTarjeta(true)}
                      className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition"
                    >
                      📤 Vista para cliente
                    </button>
                  </div>

                  <MapaCobertura
                    lat={result.lat}
                    lon={result.lon}
                    zonas={zonasMapa}
                    modo="interno"
                    zoom={15}
                    alto={300}
                    onMoveEnd={cargarZonasDelArea}
                  />
                  <LeyendaMapa />
                  {mapaTruncado && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      ⚠️ Hay más zonas de las que se pueden dibujar. Acerca el mapa para verlas todas.
                    </p>
                  )}

                  <a
                    href={`https://maps.google.com/?q=${result.lat},${result.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-xs text-blue-500 hover:underline"
                  >
                    🔗 Abrir en Google Maps
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Modal: tarjeta presentable para enviar al cliente */}
          {verTarjeta && result && (
            <TarjetaCliente
              lat={result.lat}
              lon={result.lon}
              hasCoverage={result.hasCoverage}
              onCerrar={() => setVerTarjeta(false)}
            />
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
                      {["Latitud", "Longitud", "Cobertura", "Zona", "Seguridad", "Fecha/Hora"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold text-xs">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => {
                      const est = estiloPeligro(item.peligroTipo);
                      return (
                      <tr
                        key={item.id}
                        className={`border-t border-slate-100 hover:bg-slate-50 ${
                          item.esZonaPeligrosa
                            ? (item.peligroTipo === "BLOQUEADO" ? "bg-red-50/70" : "bg-amber-50/70")
                            : item.hasCoverage
                            ? "bg-green-50/40"
                            : ""
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
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">
                          {item.zoneName}
                        </td>
                        <td className="px-4 py-2.5">
                          {item.esZonaPeligrosa ? (
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${est.chip}`}>
                              {est.icono} {est.etiqueta}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{item.timestamp}</td>
                      </tr>
                      );
                    })}
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
