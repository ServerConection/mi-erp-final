import { useState, useMemo } from "react";

// ============================================================
// DATA — EXTRAÍDA 100% DEL EXCEL PRECIOS_ABRIL_2026_NETLIFE
// ============================================================
const ZONAS_CERO = [
  "El Oro", "Machala", "Balsas", "Marcabeli", "Piñas", "Portovelo", "Zaruma",
  "Guayas", "Daule", "Duran", "Milagro", "Samborondon", "Coronel Marcelino Maridueña",
  "Manabi", "24 de Mayo", "Manta", "Portoviejo", "Rocafuerte", "Santa Ana", "Chone", "Jipijapa",
  "Los Rios", "Quinsaloma", "Vinces", "Salinas",
  "Santa Elena",
  "Cotopaxi", "Latacunga", "Salcedo",
  "Loja", "Calvas", "Celica", "Chaguarpamba",
  "Imbabura", "Antonio Ante", "Cotacachi", "Ibarra", "Otavalo", "San Miguel de Urcuchi",
  "Azuay", "Cuenca", "Nabon", "Oña", "San Fernando",
  "Carchi", "Bolivar", "Montufar", "Tulcán",
  "Bolivar", "Montufar",
  "Chimborazo", "Alausí", "Chambo", "Chunchi", "Colta", "Guamote", "Guano", "Riobamba",
  "Tungurahua", "Ambato", "Baños de Agua Santa", "Cevallos", "Mocha", "Patate", "Quero", "San Pedro de Pelileo",
  "Cañar",
  "Napo", "Tena", "Mera",
  "Pichincha",
  "Quito", "Rumiñahui", "Iñaquito", "Cumbaya", "Calderon", "San Juan", "Carapungo", "Kennedy",
  "Conocoto", "Carcelen", "Puengasi", "Ponceano", "Belisario Quevedo", "Cochapamba", "Cotocollao",
  "La Concepcion", "Tumbaco", "La Magdalena", "Mariscal Sucre", "Pomasqui", "San Isidro del Inca",
  "Nayon", "Puembo", "Alangasi", "Zambiza", "Gungopolo", "La Merced", "Itchimbia", "Amaguaña",
  "San Antonio", "Sangolqui", "Rumipamba", "La Floresta",
  "Morona Santiago", "Pastaza"
];

const PLANES_HOME_TC = [
  { nombre: "GI Net-Defense 400Mbps", velocidad: 400, tipo: "Simétrica", precioSinIva: 22.9, precioConIva: 26.34, precioPromo: 20.61, descuento: 10, facturas: 6, router: "WiFi 5 + Defense", addons: [], color: "#10b981", badge: "BÁSICO" },
  { nombre: "GI Initial-Defense 575Mbps", velocidad: 575, tipo: "Simétrica", precioSinIva: 25.5, precioConIva: 29.33, precioPromo: 22.95, descuento: 10, facturas: 6, router: "WiFi 6 + Defense", addons: ["1 Extender Dual Band","Netlife Play Básico","Assistance Pro","Paramount+"], color: "#3b82f6", badge: "POPULAR" },
  { nombre: "GI Learner-Defense 750Mbps", velocidad: 750, tipo: "Simétrica", precioSinIva: 25.75, precioConIva: 29.61, precioPromo: 23.18, descuento: 10, facturas: 6, router: "WiFi 6 + Defense", addons: ["1 Extender Dual Band","Netlife Play Básico","Assistance Pro","Paramount+"], color: "#8b5cf6", badge: "RECOMENDADO" },
  { nombre: "GI Vader-Defense 850Mbps", velocidad: 850, tipo: "Simétrica", precioSinIva: 27.5, precioConIva: 31.63, precioPromo: 22, descuento: 20, facturas: 9, router: "WiFi 6 + Defense", addons: ["1 Extender Dual Band","Netlife Play Básico","Assistance Pro","Paramount+"], color: "#f59e0b", badge: "OFERTA" },
  { nombre: "GI Vader-Defense+ 850Mbps", velocidad: 850, tipo: "Simétrica", precioSinIva: 29.5, precioConIva: 33.93, precioPromo: 17.7, descuento: 40, facturas: 9, router: "WiFi 6 + Defense", addons: ["2 Extenders Dual Band","Ass Pro + 1 Ext DB","Ass Pro + Paramount","1 Ext DB + Paramount"], color: "#f59e0b", badge: "DOBLE ADDON" },
  { nombre: "GI Sith-Defense 950Mbps", velocidad: 950, tipo: "Simétrica", precioSinIva: 31.5, precioConIva: 36.23, precioPromo: 22.05, descuento: 30, facturas: 9, router: "WiFi 6 + Defense", addons: ["2 Extenders Dual Band","Ass Pro + 1 Ext DB","Ass Pro + Paramount","1 Ext DB + Paramount"], color: "#ef4444", badge: "ALTA VELOCIDAD" },
  { nombre: "GI Spirit-Defense 1000Mbps", velocidad: 1000, tipo: "Simétrica", precioSinIva: 33, precioConIva: 37.95, precioPromo: 19.8, descuento: 40, facturas: 9, router: "WiFi 6 + Defense", addons: ["2 Extenders Dual Band","Ass Pro + 1 Ext DB","Ass Pro + Paramount","1 Ext DB + Paramount"], color: "#ec4899", badge: "PREMIUM" },
  { nombre: "1075 Mbps Asimétrico", velocidad: 1075, tipo: "Asimétrica", precioSinIva: 34.99, precioConIva: 40.24, precioPromo: 24.49, descuento: 30, facturas: 9, router: "WiFi 6", addons: ["Ass Pro + 2 Extenders DB","Ass Pro + 1 Ext + Paramount","Ass Pro + Paramount + Netlife Play"], color: "#06b6d4", badge: "FIBRA+" },
  { nombre: "1075 Mbps", velocidad: 1075, tipo: "Simétrica", precioSinIva: 37.15, precioConIva: 42.72, precioPromo: 22.29, descuento: 40, facturas: 9, router: "WiFi 6", addons: [], color: "#06b6d4", badge: "FIBRA+" },
  { nombre: "1150 Mbps", velocidad: 1150, tipo: "Simétrica", precioSinIva: 41.5, precioConIva: 47.73, precioPromo: 24.9, descuento: 40, facturas: 9, router: "WiFi 6", addons: [], color: "#0ea5e9", badge: "ULTRA" },
  { nombre: "1300 Mbps", velocidad: 1300, tipo: "Simétrica", precioSinIva: 46.15, precioConIva: 53.07, precioPromo: 27.69, descuento: 40, facturas: 9, router: "WiFi 6", addons: [], color: "#6366f1", badge: "ULTRA" },
  { nombre: "1500 Mbps", velocidad: 1500, tipo: "Simétrica", precioSinIva: 54.99, precioConIva: 63.24, precioPromo: 32.99, descuento: 40, facturas: 9, router: "WiFi 6", addons: [], color: "#7c3aed", badge: "ULTRA+" },
  { nombre: "1700 Mbps", velocidad: 1700, tipo: "Simétrica", precioSinIva: 65, precioConIva: 74.75, precioPromo: 39, descuento: 40, facturas: 9, router: "WiFi 6", addons: [], color: "#9333ea", badge: "GIGABIT" },
  { nombre: "1850 Mbps", velocidad: 1850, tipo: "Simétrica", precioSinIva: 75, precioConIva: 86.25, precioPromo: 45, descuento: 40, facturas: 9, router: "WiFi 6", addons: [], color: "#a855f7", badge: "GIGABIT" },
  { nombre: "2000 Mbps", velocidad: 2000, tipo: "Simétrica", precioSinIva: 99.99, precioConIva: 114.99, precioPromo: 49.99, descuento: 50, facturas: 12, router: "WiFi 6", addons: [], color: "#d946ef", badge: "MÁXIMO" },
];

const PLANES_HOME_CCAH = PLANES_HOME_TC.map((p, i) => ({
  ...p, descuento: 10, facturas: i < 7 ? 3 : (i >= 13 ? 12 : 3),
  precioPromo: parseFloat((p.precioConIva * 0.9).toFixed(2)),
  formaPago: "CCAH"
}));

const PLANES_HOME_EF = PLANES_HOME_TC.map(p => ({
  ...p, descuento: 0, facturas: 0, precioPromo: 0, formaPago: "EFECTIVO"
}));

// Provincias con oferta especial efectivo
const PLANES_HOME_PROV = [
  { nombre: "GI Net-Defense 400Mbps", velocidad: 400, tipo: "Normal", precioConIva: 26.34, precioPromo: 16.33, descuento: 38, facturas: "3ra factura", formaPago: "EF", plaza: "Sucumbíos, Orellana, Napo, Carchi y Santo Domingo", color: "#10b981", badge: "PROVINCIAL" },
  { nombre: "GI Initial-Defense 575Mbps + Ass PRO", velocidad: 575, tipo: "Normal", precioConIva: 29.33, precioPromo: 19.60, descuento: 33.8, facturas: "3ra factura", formaPago: "EF", plaza: "Sucumbíos, Orellana, Napo, Carchi y Santo Domingo", color: "#8b5cf6", badge: "PROVINCIAL" },
  { nombre: "GI Learner-Defense 750Mbps + Ass PRO", velocidad: 750, tipo: "Normal", precioConIva: 29.61, precioPromo: 28.46, descuento: 10, facturas: "12 facturas", formaPago: "CCAH/EF", plaza: "Machala", color: "#f59e0b", badge: "MACHALA" },
];

const PLANES_GAMER = [
  { nombre: "GAMER LITE 550Mbps", velocidad: 550, tipo: "Simétrica", precioSinIva: 26.5, precioConIva: 30.48, router: "WiFi 7 Certificado", servicios: "NAT Abierto Pro / Router WiFi 7 / Cable UTP CAT 6", color: "#22c55e", badge: "ENTRY GAMER" },
  { nombre: "GAMER CORE 750Mbps", velocidad: 750, tipo: "Simétrica", precioSinIva: 29.5, precioConIva: 33.93, router: "WiFi 7 Certificado Puerto 2.5Gbps", servicios: "NAT Abierto Pro / Router WiFi 7 / Cable UTP CAT 6", color: "#f59e0b", badge: "MID GAMER" },
  { nombre: "GAMER HEAVY 1000Mbps", velocidad: 1000, tipo: "Simétrica", precioSinIva: 36, precioConIva: 41.4, router: "WiFi 7 Certificado Puerto 2.5Gbps", servicios: "NAT Abierto Pro / Router WiFi 7 / Cable UTP CAT 6", color: "#ef4444", badge: "PRO GAMER" },
];

const PLANES_PRO = [
  { nombre: "PRO GI Initial 550", velocidad: 550, precioConIva: 26.45, precioSinIva: 23, servicios: "WiFi 6, Assistance Pro", color: "#3b82f6", badge: "STARTER" },
  { nombre: "PRO GI Nexus 575 + Extender", velocidad: 575, precioConIva: 29.61, precioSinIva: 25.75, servicios: "WiFi 6, Extender", color: "#6366f1", badge: "CONECTADO" },
  { nombre: "PRO GI Nexus 575 + Defense", velocidad: 575, precioConIva: 29.61, precioSinIva: 25.75, servicios: "WiFi 6, Defense", color: "#6366f1", badge: "SEGURO" },
  { nombre: "PRO GI Productivo 800 + Extender", velocidad: 800, precioConIva: 32.78, precioSinIva: 28.5, servicios: "WiFi 6+, Extender", color: "#8b5cf6", badge: "PRODUCTIVO" },
  { nombre: "PRO GI Productivo 800 + Defense", velocidad: 800, precioConIva: 32.78, precioSinIva: 28.5, servicios: "WiFi 6+, Defense", color: "#8b5cf6", badge: "PRODUCTIVO" },
  { nombre: "PRO GI Novice 900 + Extender", velocidad: 900, precioConIva: 36.79, precioSinIva: 31.99, servicios: "WiFi 6+, Extender", color: "#a855f7", badge: "AVANZADO" },
  { nombre: "PRO GI Novice 900 + Defense", velocidad: 900, precioConIva: 36.79, precioSinIva: 31.99, servicios: "WiFi 6+, Defense", color: "#a855f7", badge: "AVANZADO" },
  { nombre: "PRO GI Gamer 950 + Extender", velocidad: 950, precioConIva: 37.94, precioSinIva: 32.99, servicios: "WiFi 6+, Extender", color: "#ec4899", badge: "GAMER PRO" },
  { nombre: "PRO GI Gamer 950 + Defense", velocidad: 950, precioConIva: 37.94, precioSinIva: 32.99, servicios: "WiFi 6+, Defense", color: "#ec4899", badge: "GAMER PRO" },
  { nombre: "PRO GI Fusion 1010 + Extender", velocidad: 1010, precioConIva: 40.83, precioSinIva: 35.5, servicios: "WiFi 6+, Extender", color: "#f97316", badge: "FUSIÓN" },
  { nombre: "PRO GI Fusion 1010 + Defense", velocidad: 1010, precioConIva: 40.83, precioSinIva: 35.5, servicios: "WiFi 6+, Defense", color: "#f97316", badge: "FUSIÓN" },
  { nombre: "PRO GI Spirit 1100 + Extender", velocidad: 1100, precioConIva: 43.7, precioSinIva: 38, servicios: "WiFi 6+, Extender", color: "#ef4444", badge: "SPIRIT" },
  { nombre: "PRO GI Spirit 1100 + Defense", velocidad: 1100, precioConIva: 43.7, precioSinIva: 38, servicios: "WiFi 6+, Defense", color: "#ef4444", badge: "SPIRIT" },
  { nombre: "PRO GI Digital 1250 + Extender", velocidad: 1250, precioConIva: 48.88, precioSinIva: 42.5, servicios: "WiFi 6+, Extender", color: "#dc2626", badge: "DIGITAL" },
  { nombre: "PRO GI Digital 1250 + Defense", velocidad: 1250, precioConIva: 48.88, precioSinIva: 42.5, servicios: "WiFi 6+, Defense", color: "#dc2626", badge: "DIGITAL" },
  { nombre: "PRO GI Xtreme 1350 + Extender", velocidad: 1350, precioConIva: 52.33, precioSinIva: 45.5, servicios: "WiFi 6+, Extender", color: "#b91c1c", badge: "EXTREMO" },
  { nombre: "PRO GI Xtreme 1350 + Defense", velocidad: 1350, precioConIva: 52.33, precioSinIva: 45.5, servicios: "WiFi 6+, Defense", color: "#b91c1c", badge: "EXTREMO" },
  { nombre: "PRO GI Revolution 1500 + Extender", velocidad: 1500, precioConIva: 60.94, precioSinIva: 52.99, servicios: "WiFi 6+, Extender", color: "#7f1d1d", badge: "REVOLUCIÓN" },
  { nombre: "PRO GI Revolution 1500 + Defense", velocidad: 1500, precioConIva: 60.94, precioSinIva: 52.99, servicios: "WiFi 6+, Defense", color: "#7f1d1d", badge: "REVOLUCIÓN" },
];

const PLANES_PYME = [
  { nombre: "Pyme GI Tech 600 + Defense / Ass PRO", velocidad: 600, precioConIva: 37.38, precioSinIva: 32.5, servicios: "WiFi 6, Defense, Assistance Pro", color: "#3b82f6", badge: "TECH" },
  { nombre: "Pyme GI Tech 600 + Extender", velocidad: 600, precioConIva: 37.38, precioSinIva: 32.5, servicios: "WiFi 6, Defense, Extender Dual Band", color: "#3b82f6", badge: "TECH" },
  { nombre: "Pyme GI Digital 700 + Ass PRO", velocidad: 700, precioConIva: 40.83, precioSinIva: 35.5, servicios: "WiFi 6, Defense, Assistance Pro", color: "#8b5cf6", badge: "DIGITAL" },
  { nombre: "Pyme GI Digital 700 + Extender", velocidad: 700, precioConIva: 40.83, precioSinIva: 35.5, servicios: "WiFi 6, Defense, Extender Dual Band", color: "#8b5cf6", badge: "DIGITAL" },
  { nombre: "Pyme GI Productivo 800 + Ass PRO", velocidad: 800, precioConIva: 45.43, precioSinIva: 39.5, servicios: "WiFi 6, Defense, Assistance Pro", color: "#f59e0b", badge: "PRODUCTIVO" },
  { nombre: "Pyme GI Productivo 800 + Extender", velocidad: 800, precioConIva: 45.43, precioSinIva: 39.5, servicios: "WiFi 6, Defense, Extender Dual Band", color: "#f59e0b", badge: "PRODUCTIVO" },
  { nombre: "Pyme GI Evolution 1000 + Ass PRO", velocidad: 1000, precioConIva: 51.75, precioSinIva: 45, servicios: "WiFi 6, Defense, Assistance Pro", color: "#ef4444", badge: "EVOLUCIÓN" },
  { nombre: "Pyme GI Evolution 1000 + Extender", velocidad: 1000, precioConIva: 51.75, precioSinIva: 45, servicios: "WiFi 6, Defense, Extender Dual Band", color: "#ef4444", badge: "EVOLUCIÓN" },
  { nombre: "Pyme GI Spirit 1100 + Ass PRO", velocidad: 1100, precioConIva: 59.79, precioSinIva: 51.99, servicios: "WiFi 6, Defense, Assistance Pro", color: "#ec4899", badge: "SPIRIT" },
  { nombre: "Pyme GI Spirit 1100 + Extender", velocidad: 1100, precioConIva: 59.79, precioSinIva: 51.99, servicios: "WiFi 6, Defense, Extender Dual Band", color: "#ec4899", badge: "SPIRIT" },
  { nombre: "Pyme GI Digital 1300 + Ass PRO", velocidad: 1300, precioConIva: 71.29, precioSinIva: 61.99, servicios: "WiFi 6, Defense, Assistance Pro, Constructor Web", color: "#7c3aed", badge: "DIGITAL+" },
  { nombre: "Pyme GI Digital 1300 + Extender", velocidad: 1300, precioConIva: 71.29, precioSinIva: 61.99, servicios: "WiFi 6, Defense, Extender Dual Band, Constructor Web", color: "#7c3aed", badge: "DIGITAL+" },
  { nombre: "Pyme GI Exponencial 1500 + Ass PRO", velocidad: 1500, precioConIva: 81.65, precioSinIva: 71, servicios: "WiFi 6, Defense, Assistance Pro, Constructor Web", color: "#9333ea", badge: "EXPONENCIAL" },
  { nombre: "Pyme GI Exponencial 1500 + Extender", velocidad: 1500, precioConIva: 81.65, precioSinIva: 71, servicios: "WiFi 6, Defense, Extender Dual Band, Constructor Web", color: "#9333ea", badge: "EXPONENCIAL" },
  { nombre: "Pyme GI Tech 1750 + Ass PRO", velocidad: 1750, precioConIva: 100.05, precioSinIva: 87, servicios: "WiFi 6, Defense, Assistance Pro, Constructor Web", color: "#a855f7", badge: "ULTRA" },
  { nombre: "Pyme GI Tech 1750 + Extender", velocidad: 1750, precioConIva: 100.05, precioSinIva: 87, servicios: "WiFi 6, Defense, Extender Dual Band, Constructor Web", color: "#a855f7", badge: "ULTRA" },
  { nombre: "Pyme GI Xtreme 1850 + Ass PRO", velocidad: 1850, precioConIva: 117.3, precioSinIva: 102, servicios: "WiFi 6, Defense, Assistance Pro, Constructor Web", color: "#d946ef", badge: "XTREME" },
  { nombre: "Pyme GI Xtreme 1850 + Extender", velocidad: 1850, precioConIva: 117.3, precioSinIva: 102, servicios: "WiFi 6, Defense, Extender Dual Band, Constructor Web", color: "#d946ef", badge: "XTREME" },
  { nombre: "Pyme GI Infinity 2000 + Ass PRO", velocidad: 2000, precioConIva: 134.55, precioSinIva: 117, servicios: "WiFi 6, Defense, Assistance Pro, Constructor Web", color: "#e11d48", badge: "INFINITY" },
  { nombre: "Pyme GI Infinity 2000 + Extender", velocidad: 2000, precioConIva: 134.55, precioSinIva: 117, servicios: "WiFi 6, Defense, Extender Dual Band, Constructor Web", color: "#e11d48", badge: "INFINITY" },
];

const PLANES_TERCERA_EDAD = [
  { nombre: "GI Trainee-Defense 400", velocidad: 400, precioSinIva: 12.9, precioConIva: 14.83, addons: [], color: "#10b981" },
  { nombre: "GI Initial-Defense 575", velocidad: 575, precioSinIva: 15.5, precioConIva: 17.83, addons: ["1 Extender Dual Band","Netlife Play Básico","Assistance Pro","Paramount+"], color: "#3b82f6" },
  { nombre: "GI Learner-Defense 750", velocidad: 750, precioSinIva: 15.75, precioConIva: 18.11, addons: ["1 Extender Dual Band","Netlife Play Básico","Assistance Pro","Paramount+"], color: "#8b5cf6" },
  { nombre: "GI Vader-Defense 850", velocidad: 850, precioSinIva: 17.5, precioConIva: 20.13, addons: ["1 Extender Dual Band","Netlife Play Básico","Assistance Pro","Paramount+"], color: "#f59e0b" },
  { nombre: "GI Vader-Defense 850+", velocidad: 850, precioSinIva: 19.5, precioConIva: 22.42, addons: ["2 Extenders Dual Band","Ass Pro + 1 Ext DB","Ass Pro + Paramount"], color: "#f59e0b" },
  { nombre: "GI Sith-Defense 950", velocidad: 950, precioSinIva: 21.5, precioConIva: 24.72, addons: ["2 Extenders Dual Band","Ass Pro + 1 Ext DB","Ass Pro + Paramount"], color: "#ef4444" },
  { nombre: "GI Spirit-Defense 1000", velocidad: 1000, precioSinIva: 23, precioConIva: 26.45, addons: ["2 Extenders Dual Band","Ass Pro + 1 Ext DB","Ass Pro + Paramount"], color: "#ec4899" },
  { nombre: "1075 Mbps Asimétrico", velocidad: 1075, precioSinIva: 24.99, precioConIva: 28.74, addons: ["Ass Pro + 2 Extenders DB"], color: "#06b6d4" },
  { nombre: "1075 Mbps", velocidad: 1075, precioSinIva: 27.15, precioConIva: 31.22, addons: [], color: "#06b6d4" },
  { nombre: "1150 Mbps", velocidad: 1150, precioSinIva: 31.5, precioConIva: 36.23, addons: [], color: "#0ea5e9" },
  { nombre: "1300 Mbps", velocidad: 1300, precioSinIva: 36.15, precioConIva: 41.57, addons: [], color: "#6366f1" },
  { nombre: "1500 Mbps", velocidad: 1500, precioSinIva: 44.99, precioConIva: 51.74, addons: [], color: "#7c3aed" },
  { nombre: "1700 Mbps", velocidad: 1700, precioSinIva: 55, precioConIva: 63.25, addons: [], color: "#9333ea" },
  { nombre: "1850 Mbps", velocidad: 1850, precioSinIva: 65, precioConIva: 74.75, addons: [], color: "#a855f7" },
  { nombre: "2000 Mbps", velocidad: 2000, precioSinIva: 89.99, precioConIva: 103.49, addons: [], color: "#d946ef" },
];

// ============================================================
// HELPERS
// ============================================================
const velLabel = (v) => v >= 1000 ? `${(v/1000).toFixed(1)} Gbps` : `${v} Mbps`;

const speedBar = (v, max = 2000) => {
  const pct = Math.min((v / max) * 100, 100);
  return pct;
};

const USOS_INTERNET = {
  "streaming": { label: "Streaming / Netflix", icon: "🎬", minVel: 25, ideal: 100 },
  "teletrabajo": { label: "Teletrabajo", icon: "💼", minVel: 50, ideal: 200 },
  "gamers": { label: "Gaming Online", icon: "🎮", minVel: 50, ideal: 300 },
  "videollamadas": { label: "Videollamadas", icon: "📹", minVel: 10, ideal: 50 },
  "smartHome": { label: "Smart Home IoT", icon: "🏠", minVel: 100, ideal: 500 },
  "descarga": { label: "Descargas Masivas", icon: "⬇️", minVel: 200, ideal: 500 },
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function GuiaPlanesMarzo() {
  const [panel, setPanel] = useState("smart"); // smart | filtros
  const [expandZonas, setExpandZonas] = useState(false);

  return (
    <div style={{ fontFamily: "'Syne', 'DM Sans', system-ui, sans-serif", minHeight: "100vh", background: "#070b14", color: "#fff" }}>
      {/* HEADER */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
        borderBottom: "1px solid rgba(99,102,241,0.3)",
        padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 12, padding: "10px 14px", fontSize: 22 }}>⚡</div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: "-0.5px", lineHeight: 1 }}>
                GUÍA PLANES <span style={{ color: "#818cf8" }}>ABRIL 2026</span>
              </div>
              <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 700, letterSpacing: "0.15em", marginTop: 2 }}>NETLIFE · HERRAMIENTA DE VENTAS</div>
            </div>
          </div>

          {/* TAB SWITCHER */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 4, gap: 4, border: "1px solid rgba(255,255,255,0.08)" }}>
            <TabBtn active={panel === "smart"} onClick={() => setPanel("smart")} icon="🧠" label="ASESOR INTELIGENTE" />
            <TabBtn active={panel === "filtros"} onClick={() => setPanel("filtros")} icon="🔍" label="EXPLORAR PLANES" />
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px 60px" }}>
        {panel === "smart" ? <PanelSmart /> : <PanelFiltros />}
      </div>

      {/* ZONAS CERO EXPANDIBLE - SIEMPRE VISIBLE AL PIE */}
      <div style={{
        background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))",
        border: "1px solid rgba(16,185,129,0.2)",
        borderRadius: 16,
        padding: "20px 24px",
        margin: "0 24px 24px",
        maxWidth: "1400px",
        marginLeft: "auto",
        marginRight: "auto"
      }}>
        <button onClick={() => setExpandZonas(!expandZonas)} style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#10b981",
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: "0.05em",
          marginBottom: expandZonas ? 16 : 0
        }}>
          <span style={{ fontSize: 28 }}>📍</span>
          <div style={{ textAlign: "left" }}>
            <div>ZONAS CON INSTALACIÓN GRATIS (TODAS LAS FORMAS DE PAGO)</div>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 2 }}>
              {expandZonas ? "Mostrar menos ▲" : `${ZONAS_CERO.length} ciudades · Click para expandir ▼`}
            </div>
          </div>
        </button>

        {expandZonas && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 10,
            marginTop: 12
          }}>
            {ZONAS_CERO.map((zona, idx) => (
              <div key={idx} style={{
                background: "rgba(16,185,129,0.1)",
                border: "1px solid rgba(16,185,129,0.3)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 12,
                color: "#e2e8f0",
                fontWeight: 600,
                textAlign: "center"
              }}>
                {zona}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "transparent",
      border: "none", borderRadius: 9, padding: "8px 18px", cursor: "pointer",
      color: active ? "#fff" : "#94a3b8", fontSize: 11, fontWeight: 800,
      letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 6,
      transition: "all 0.2s", boxShadow: active ? "0 4px 15px rgba(99,102,241,0.4)" : "none"
    }}>
      <span>{icon}</span>{label}
    </button>
  );
}

// ============================================================
// PANEL SMART — ASESOR INTELIGENTE
// ============================================================
function PanelSmart() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [resultado, setResultado] = useState(null);

  const PREGUNTAS = [
    {
      id: "tipo",
      pregunta: "¿Para quién es el internet?",
      subtitulo: "Esto define el portafolio correcto",
      tipo: "cards",
      opciones: [
        { valor: "hogar", label: "Mi Hogar", icon: "🏠", desc: "Casa / Familia", color: "#10b981" },
        { valor: "pyme", label: "Mi Negocio", icon: "🏢", desc: "Empresa / Local", color: "#3b82f6" },
        { valor: "gamer", label: "Gaming", icon: "🎮", desc: "Alta performance", color: "#f59e0b" },
        { valor: "tercera_edad", label: "Tercera Edad", icon: "👴", desc: "Descuento especial 45%", color: "#ec4899" },
      ]
    },
    {
      id: "uso",
      pregunta: "¿Qué hace principalmente en internet?",
      subtitulo: "Selecciona todo lo que aplique",
      tipo: "multicheck",
      opciones: Object.entries(USOS_INTERNET).map(([k, v]) => ({ valor: k, label: v.label, icon: v.icon }))
    },
    {
      id: "personas",
      pregunta: "¿Cuántos usuarios/dispositivos simultáneos?",
      subtitulo: "Esto afecta directamente la velocidad necesaria",
      tipo: "cards",
      opciones: [
        { valor: 1, label: "1–2 personas", icon: "👤", desc: "Uso individual", color: "#10b981" },
        { valor: 3, label: "3–4 personas", icon: "👨‍👩‍👧", desc: "Familia pequeña", color: "#3b82f6" },
        { valor: 6, label: "5–6 personas", icon: "👨‍👩‍👧‍👦", desc: "Familia grande", color: "#f59e0b" },
        { valor: 10, label: "7+ / Oficina", icon: "🏢", desc: "Múltiples equipos", color: "#ef4444" },
      ]
    },
    {
      id: "pago",
      pregunta: "¿Tiene tarjeta de crédito?",
      subtitulo: "Accede a descuentos exclusivos con TC",
      tipo: "cards",
      opciones: [
        { valor: "TC", label: "Sí, Tarjeta de Crédito", icon: "💳", desc: "Hasta 50% descuento", color: "#10b981" },
        { valor: "CCAH", label: "Cuenta o Débito", icon: "🏦", desc: "10% descuento", color: "#3b82f6" },
        { valor: "EFECTIVO", label: "Efectivo", icon: "💵", desc: "Precio fijo", color: "#94a3b8" },
      ]
    },
    {
      id: "presupuesto",
      pregunta: "¿Cuánto puede pagar mensualmente? (con IVA)",
      subtitulo: "Precio final que pagaría",
      tipo: "slider",
      min: 14, max: 135, step: 1, default: 35
    },
  ];

  const preguntas = useMemo(() => {
    if (answers.tipo === "pyme") return [PREGUNTAS[0], PREGUNTAS[2], PREGUNTAS[4]];
    if (answers.tipo === "gamer") return [PREGUNTAS[0], PREGUNTAS[4]];
    if (answers.tipo === "tercera_edad") return [PREGUNTAS[0], PREGUNTAS[1], PREGUNTAS[2], PREGUNTAS[4]];
    return PREGUNTAS;
  }, [answers.tipo]);

  const preguntaActual = preguntas[step];

  const calcularVelocidadNecesaria = () => {
    const usos = answers.uso || [];
    const personas = answers.personas || 1;
    let base = 50;
    usos.forEach(u => { if (USOS_INTERNET[u]) base = Math.max(base, USOS_INTERNET[u].ideal); });
    return base * personas * 0.3;
  };

  const generarResultados = (ans) => {
    const tipo = ans.tipo;
    const pago = ans.pago || "TC";
    const presupuesto = ans.presupuesto || 35;
    const velMin = calcularVelocidadNecesaria();

    let plansFiltrados = [];

    if (tipo === "gamer") {
      plansFiltrados = PLANES_GAMER.filter(p => p.precioConIva <= presupuesto * 1.1);
    } else if (tipo === "pyme") {
      plansFiltrados = PLANES_PYME.filter(p => p.precioConIva <= presupuesto * 1.15 && p.velocidad >= Math.max(velMin, 200));
    } else if (tipo === "tercera_edad") {
      plansFiltrados = PLANES_TERCERA_EDAD.filter(p => p.precioConIva <= presupuesto * 1.1 && p.velocidad >= velMin);
    } else {
      const planes = pago === "TC" ? PLANES_HOME_TC : pago === "CCAH" ? PLANES_HOME_CCAH : PLANES_HOME_EF;
      const precioRef = pago === "TC" ? "precioPromo" : pago === "CCAH" ? "precioPromo" : "precioConIva";
      plansFiltrados = planes.filter(p => {
        const precio = p[precioRef] || p.precioConIva;
        return precio <= presupuesto * 1.1 && p.velocidad >= velMin;
      });
    }

    if (plansFiltrados.length === 0) {
      const baseSet = tipo === "gamer" ? PLANES_GAMER : tipo === "pyme" ? PLANES_PYME : tipo === "tercera_edad" ? PLANES_TERCERA_EDAD : PLANES_HOME_TC;
      plansFiltrados = [...baseSet].sort((a, b) => a.precioConIva - b.precioConIva).slice(0, 3);
    }

    return plansFiltrados.slice(0, 6);
  };

  const responder = (id, valor) => {
    const nuevas = { ...answers, [id]: valor };
    setAnswers(nuevas);
    if (step < preguntas.length - 1) {
      setStep(step + 1);
    } else {
      setResultado(generarResultados(nuevas));
      setStep(preguntas.length);
    }
  };

  const reiniciar = () => { setStep(0); setAnswers({}); setResultado(null); };

  if (resultado) {
    return <Resultado planes={resultado} answers={answers} onReset={reiniciar} />;
  }

  if (step >= preguntas.length) return null;

  const progreso = ((step) / preguntas.length) * 100;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* PROGRESS */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em" }}>PASO {step + 1} DE {preguntas.length}</span>
          <span style={{ fontSize: 11, color: "#475569", fontWeight: 700 }}>{Math.round(progreso)}% COMPLETADO</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 99, height: 4 }}>
          <div style={{ background: "linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius: 99, height: 4, width: `${progreso}%`, transition: "width 0.4s ease" }} />
        </div>
        {/* Steps dots */}
        <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "center" }}>
          {preguntas.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 24 : 8, height: 8, borderRadius: 99,
              background: i < step ? "#6366f1" : i === step ? "linear-gradient(90deg,#6366f1,#ec4899)" : "rgba(255,255,255,0.1)",
              transition: "all 0.3s"
            }} />
          ))}
        </div>
      </div>

      {/* QUESTION CARD */}
      <div style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.05) 100%)",
        border: "1px solid rgba(99,102,241,0.2)", borderRadius: 20, padding: "36px 40px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8, letterSpacing: "-0.5px" }}>{preguntaActual.pregunta}</h2>
          <p style={{ color: "#94a3b8", fontSize: 13, fontWeight: 500 }}>{preguntaActual.subtitulo}</p>
        </div>

        {preguntaActual.tipo === "cards" && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${preguntaActual.opciones.length <= 2 ? 2 : 4}, 1fr)`, gap: 12 }}>
            {preguntaActual.opciones.map(op => (
              <button key={op.valor} onClick={() => responder(preguntaActual.id, op.valor)} style={{
                background: "rgba(255,255,255,0.03)", border: `2px solid rgba(255,255,255,0.08)`,
                borderRadius: 16, padding: "20px 12px", cursor: "pointer", transition: "all 0.2s",
                color: "#fff", textAlign: "center"
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = op.color; e.currentTarget.style.background = `${op.color}15`; e.currentTarget.style.transform = "translateY(-3px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{op.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{op.label}</div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{op.desc}</div>
              </button>
            ))}
          </div>
        )}

        {preguntaActual.tipo === "multicheck" && (
          <MultiCheck pregunta={preguntaActual} onDone={(vals) => responder(preguntaActual.id, vals)} />
        )}

        {preguntaActual.tipo === "slider" && (
          <SliderPregunta pregunta={preguntaActual} onDone={(val) => responder(preguntaActual.id, val)} />
        )}
      </div>

      {step > 0 && (
        <button onClick={() => setStep(step - 1)} style={{
          marginTop: 16, background: "transparent", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "8px 20px", color: "#64748b", fontSize: 11,
          fontWeight: 700, cursor: "pointer", letterSpacing: "0.08em"
        }}>← VOLVER</button>
      )}
    </div>
  );
}

function MultiCheck({ pregunta, onDone }) {
  const [selected, setSelected] = useState([]);
  const toggle = (v) => setSelected(s => s.includes(v) ? s.filter(x => x !== v) : [...s, v]);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {pregunta.opciones.map(op => {
          const on = selected.includes(op.valor);
          return (
            <button key={op.valor} onClick={() => toggle(op.valor)} style={{
              background: on ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.03)",
              border: `2px solid ${on ? "#6366f1" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 12, padding: "14px 10px", cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s"
            }}>
              <span style={{ fontSize: 18 }}>{op.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{op.label}</span>
              {on && <span style={{ marginLeft: "auto", color: "#6366f1", fontSize: 14 }}>✓</span>}
            </button>
          );
        })}
      </div>
      <button onClick={() => onDone(selected.length ? selected : ["streaming"])} style={{
        width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        border: "none", borderRadius: 12, padding: "14px", color: "#fff",
        fontSize: 13, fontWeight: 800, cursor: "pointer", letterSpacing: "0.05em"
      }}>VER PLANES RECOMENDADOS →</button>
    </div>
  );
}

function SliderPregunta({ pregunta, onDone }) {
  const [val, setVal] = useState(pregunta.default);
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 52, fontWeight: 900, color: "#6366f1", letterSpacing: "-2px" }}>${val}</div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>DÓLARES / MES (CON IVA)</div>
      </div>
      <input type="range" min={pregunta.min} max={pregunta.max} step={pregunta.step} value={val}
        onChange={e => setVal(Number(e.target.value))}
        style={{ width: "100%", marginBottom: 24, accentColor: "#6366f1" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569", marginBottom: 24, fontWeight: 700 }}>
        <span>${pregunta.min} MÍNIMO</span>
        <span>${pregunta.max} MÁXIMO</span>
      </div>
      {/* Quick select */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {[20, 30, 40, 50, 70, 100].map(v => (
          <button key={v} onClick={() => setVal(v)} style={{
            background: val === v ? "#6366f1" : "rgba(255,255,255,0.05)", border: `1px solid ${val === v ? "#6366f1" : "rgba(255,255,255,0.1)"}`,
            borderRadius: 8, padding: "6px 14px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer"
          }}>${v}</button>
        ))}
      </div>
      <button onClick={() => onDone(val)} style={{
        width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        border: "none", borderRadius: 12, padding: "14px", color: "#fff",
        fontSize: 13, fontWeight: 800, cursor: "pointer"
      }}>VER MIS PLANES RECOMENDADOS →</button>
    </div>
  );
}

// ============================================================
// RESULTADO DEL ASESOR
// ============================================================
function Resultado({ planes, answers, onReset }) {
  const [selected, setSelected] = useState(null);

  const tipoLabel = { hogar: "HOGAR", pyme: "NEGOCIO", gamer: "GAMING", tercera_edad: "TERCERA EDAD" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 4 }}>
            PLANES RECOMENDADOS · {tipoLabel[answers.tipo] || "HOGAR"}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.5px" }}>
            {planes.length} planes perfectos para ti 🎯
          </h2>
          <p style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
            Basado en tu perfil · Presupuesto ${answers.presupuesto}/mes · {answers.pago || "—"}
          </p>
        </div>
        <button onClick={onReset} style={{
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "8px 18px", color: "#94a3b8", fontSize: 11,
          fontWeight: 700, cursor: "pointer"
        }}>🔄 NUEVA CONSULTA</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {planes.map((plan, idx) => (
          <PlanCard
            key={idx}
            plan={plan}
            tipo={answers.tipo}
            pago={answers.pago}
            destacado={idx === 0}
            selected={selected === idx}
            onClick={() => setSelected(selected === idx ? null : idx)}
          />
        ))}
      </div>

      {selected !== null && (
        <PlanDetalle plan={planes[selected]} tipo={answers.tipo} pago={answers.pago} />
      )}
    </div>
  );
}

// ============================================================
// PLAN CARD
// ============================================================
function PlanCard({ plan, tipo, pago, destacado, selected, onClick }) {
  const precio = useMemo(() => {
    if (tipo === "gamer" || tipo === "pyme" || tipo === "tercera_edad") return plan.precioConIva;
    if (pago === "TC" && plan.precioPromo) return plan.precioPromo;
    if (pago === "CCAH" && plan.precioPromo) return plan.precioPromo;
    return plan.precioConIva;
  }, [plan, tipo, pago]);

  const ahorro = plan.precioConIva && precio < plan.precioConIva
    ? (plan.precioConIva - precio).toFixed(2) : null;

  return (
    <div onClick={onClick} style={{
      background: selected
        ? `linear-gradient(135deg, ${plan.color}25, ${plan.color}10)`
        : destacado
        ? "linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.06))"
        : "rgba(255,255,255,0.03)",
      border: `2px solid ${selected ? plan.color : destacado ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 18, padding: "20px", cursor: "pointer", transition: "all 0.25s", position: "relative",
      boxShadow: selected ? `0 8px 30px ${plan.color}40` : "none"
    }}
    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = plan.color + "80"; }}
    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = destacado ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.07)"; }}
    >
      {destacado && !selected && (
        <div style={{
          position: "absolute", top: -1, right: 16,
          background: "linear-gradient(90deg,#6366f1,#8b5cf6)",
          fontSize: 9, fontWeight: 900, padding: "4px 10px", borderRadius: "0 0 8px 8px",
          letterSpacing: "0.1em", color: "#fff"
        }}>⭐ MÁS RECOMENDADO</div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{
          background: `${plan.color}20`, border: `1px solid ${plan.color}40`,
          borderRadius: 8, padding: "3px 8px", fontSize: 9, fontWeight: 800,
          color: plan.color, letterSpacing: "0.08em"
        }}>{plan.badge || "PLAN"}</div>
        {ahorro && (
          <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "3px 8px", fontSize: 9, fontWeight: 800, color: "#10b981" }}>
            AHORRA ${ahorro}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 4, lineHeight: 1.3 }}>{plan.nombre}</div>
        {/* VELOCIDAD VISUAL */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: plan.color, letterSpacing: "-1px", lineHeight: 1 }}>
            {velLabel(plan.velocidad)}
          </div>
          <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, lineHeight: 1.3 }}>
            {plan.tipo || "Simétrica"}<br/>FIBRA ÓPTICA
          </div>
        </div>
        {/* Speed bar */}
        <div style={{ background: "rgba(255,255,255,0.05)", borderRadius: 99, height: 4, marginBottom: 8 }}>
          <div style={{
            background: `linear-gradient(90deg, ${plan.color}, ${plan.color}80)`,
            borderRadius: 99, height: 4, width: `${speedBar(plan.velocidad)}%`, transition: "width 0.5s"
          }} />
        </div>
      </div>

      {/* PRECIO */}
      <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: "12px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 700, marginBottom: 2 }}>
              {ahorro ? `PRECIO ${pago === "TC" ? "PROMO TC" : "CON DCTO"}` : "PRECIO MENSUAL"}
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", letterSpacing: "-1px", lineHeight: 1 }}>
              ${parseFloat(precio).toFixed(2)}
            </div>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>CON IVA · MENSUAL</div>
          </div>
          {plan.precioConIva && precio < plan.precioConIva && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#475569" }}>PRECIO NORMAL</div>
              <div style={{ fontSize: 14, color: "#475569", textDecoration: "line-through" }}>
                ${plan.precioConIva.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ROUTER */}
      {plan.router && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>📡</span>
          <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{plan.router}</span>
        </div>
      )}

      <div style={{ fontSize: 10, color: plan.color, fontWeight: 700, textAlign: "center", marginTop: 8, opacity: 0.8 }}>
        {selected ? "▲ VER MENOS" : "▼ VER DETALLE COMPLETO"}
      </div>
    </div>
  );
}

// ============================================================
// PLAN DETALLE EXPANDIDO
// ============================================================
function PlanDetalle({ plan, tipo, pago }) {
  const precio = tipo === "gamer" || tipo === "pyme" || tipo === "tercera_edad"
    ? plan.precioConIva
    : pago === "TC" && plan.precioPromo ? plan.precioPromo
    : pago === "CCAH" && plan.precioPromo ? plan.precioPromo
    : plan.precioConIva;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${plan.color}15, rgba(0,0,0,0.5))`,
      border: `1px solid ${plan.color}40`, borderRadius: 20, padding: "28px",
      marginTop: 8, animation: "fadeIn 0.3s ease"
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        {/* COL 1 — Info base */}
        <div>
          <div style={{ fontSize: 10, color: plan.color, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}>DETALLES DEL PLAN</div>
          <Row icon="⚡" label="Velocidad" value={velLabel(plan.velocidad)} />
          <Row icon="🔄" label="Tipo" value={plan.tipo || "Simétrica"} />
          <Row icon="📡" label="Router" value={plan.router || "WiFi 6"} />
          {plan.facturas > 0 && <Row icon="📅" label="Facturas con dcto" value={`${plan.facturas} meses`} />}
          {plan.descuento > 0 && <Row icon="🏷️" label="Descuento" value={`${plan.descuento * 100 || plan.descuento}%`} />}
        </div>

        {/* COL 2 — Precios */}
        <div>
          <div style={{ fontSize: 10, color: plan.color, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}>PRECIOS</div>
          {plan.precioSinIva && <Row icon="💰" label="Sin IVA" value={`$${plan.precioSinIva}`} />}
          <Row icon="💰" label="Con IVA (normal)" value={`$${plan.precioConIva}`} />
          {plan.precioPromo && plan.precioPromo > 0 && (
            <div style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
              <div style={{ fontSize: 9, color: "#10b981", fontWeight: 800, marginBottom: 2 }}>PRECIO PROMO</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#10b981" }}>${parseFloat(precio).toFixed(2)}</div>
              <div style={{ fontSize: 9, color: "#64748b" }}>POR {plan.facturas || "—"} FACTURAS</div>
            </div>
          )}
          {plan.servicios && <Row icon="🛠️" label="Servicios" value={plan.servicios} />}
        </div>

        {/* COL 3 — Argumentos de venta */}
        <div>
          <div style={{ fontSize: 10, color: plan.color, fontWeight: 800, letterSpacing: "0.1em", marginBottom: 12 }}>💬 ARGUMENTOS DE VENTA</div>
          <ArgVenta velocidad={plan.velocidad} tipo={tipo} precio={precio} plan={plan} />
          {plan.addons && plan.addons.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9, color: "#64748b", fontWeight: 700, marginBottom: 6 }}>ADDONS DISPONIBLES:</div>
              {plan.addons.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: 99, background: plan.color }} />
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-start" }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

function ArgVenta({ velocidad, tipo, precio, plan }) {
  const args = [];
  if (velocidad >= 1000) args.push("🔥 Velocidad GIGABIT — el tope del mercado");
  else if (velocidad >= 500) args.push("⚡ Alta velocidad para toda la familia simultánea");
  else args.push("✅ Velocidad ideal para uso cotidiano");

  if (precio < 25) args.push("💵 Precio más accesible del portafolio");
  else if (precio < 35) args.push("💰 Excelente relación velocidad / precio");
  else if (precio < 60) args.push("🏆 Plan premium con servicios adicionales incluidos");

  if (tipo === "gamer") args.push("🎮 NAT Abierto — 0 lag en partidas online");
  if (tipo === "tercera_edad") args.push("👴 Precio especial — 45% menos que el plan normal");
  if (tipo === "pyme") args.push("🏢 Incluye Defense empresarial + garantía de servicio");

  if (plan.addons && plan.addons.length > 0) args.push("🎁 Elija un servicio extra sin costo adicional");
  if (plan.descuento >= 40) args.push("🏷️ Descuento MÁXIMO disponible con TC");

  return (
    <div>
      {args.slice(0, 4).map((a, i) => (
        <div key={i} style={{
          background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "7px 10px",
          marginBottom: 6, fontSize: 10, color: "#cbd5e1", lineHeight: 1.4
        }}>{a}</div>
      ))}
    </div>
  );
}

// ============================================================
// PANEL FILTROS — EXPLORADOR JERÁRQUICO
// ============================================================
function PanelFiltros() {
  const [segmento, setSegmento] = useState(null);
  const [subCategoria, setSubCategoria] = useState(null);
  const [velMin, setVelMin] = useState(0);
  const [velMax, setVelMax] = useState(2000);
  const [presMax, setPresMax] = useState(135);
  const [addon, setAddon] = useState("todos");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [formaPago, setFormaPago] = useState("TC");

  const SEGMENTOS = [
    { id: "hogar", label: "HOGAR", icon: "🏠", color: "#10b981", sub: ["Tarjeta de Crédito", "Cuenta / Débito", "Efectivo", "Provincias Especiales"] },
    { id: "pyme", label: "PYMES 360", icon: "🏢", color: "#3b82f6", sub: ["Assistance Pro", "Extender Dual Band"] },
    { id: "gamer", label: "GAMER", icon: "🎮", color: "#f59e0b", sub: [] },
    { id: "pro", label: "NEGOCIO PRO", icon: "💼", color: "#6366f1", sub: ["Extender", "Defense"] },
    { id: "tercera_edad", label: "3RA EDAD", icon: "👴", color: "#ec4899", sub: [] },
  ];

  const planes = useMemo(() => {
    if (!segmento) return [];
    let lista = [];
    if (segmento === "hogar") {
      if (subCategoria === "Tarjeta de Crédito") lista = PLANES_HOME_TC;
      else if (subCategoria === "Cuenta / Débito") lista = PLANES_HOME_CCAH;
      else if (subCategoria === "Efectivo") lista = PLANES_HOME_EF;
      else if (subCategoria === "Provincias Especiales") lista = PLANES_HOME_PROV;
      else lista = PLANES_HOME_TC;
    } else if (segmento === "pyme") {
      lista = PLANES_PYME;
      if (subCategoria === "Assistance Pro") lista = lista.filter(p => p.servicios && p.servicios.includes("Assistance"));
      else if (subCategoria === "Extender Dual Band") lista = lista.filter(p => p.servicios && p.servicios.includes("Extender"));
    } else if (segmento === "gamer") {
      lista = PLANES_GAMER;
    } else if (segmento === "pro") {
      lista = PLANES_PRO;
      if (subCategoria === "Extender") lista = lista.filter(p => p.nombre.includes("Extender"));
      else if (subCategoria === "Defense") lista = lista.filter(p => p.nombre.includes("Defense"));
    } else if (segmento === "tercera_edad") {
      lista = PLANES_TERCERA_EDAD;
    }
    return lista.filter(p => {
      const vel = p.velocidad || 0;
      const precio = p.precioConIva || 0;
      return vel >= velMin && vel <= velMax && precio <= presMax;
    });
  }, [segmento, subCategoria, velMin, velMax, presMax, formaPago]);

  const segActivo = SEGMENTOS.find(s => s.id === segmento);

  return (
    <div>
      {/* NIVEL 1: SEGMENTO */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 800, letterSpacing: "0.12em", marginBottom: 12 }}>
          01 · SELECCIONA EL SEGMENTO
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {SEGMENTOS.map(s => (
            <button key={s.id} onClick={() => { setSegmento(s.id); setSubCategoria(null); setSelectedPlan(null); }} style={{
              background: segmento === s.id ? `linear-gradient(135deg, ${s.color}40, ${s.color}20)` : "rgba(255,255,255,0.03)",
              border: `2px solid ${segmento === s.id ? s.color : "rgba(255,255,255,0.08)"}`,
              borderRadius: 14, padding: "12px 20px", cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
              boxShadow: segmento === s.id ? `0 0 20px ${s.color}40` : "none"
            }}>
              <span style={{ fontSize: 20 }}>{s.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.05em" }}>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* NIVEL 2: SUB-CATEGORÍA */}
      {segActivo && segActivo.sub.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 800, letterSpacing: "0.12em", marginBottom: 12 }}>
            02 · FORMA DE PAGO / VARIANTE
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setSubCategoria(null)} style={{
              background: !subCategoria ? `rgba(99,102,241,0.3)` : "rgba(255,255,255,0.03)",
              border: `2px solid ${!subCategoria ? "#6366f1" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 10, padding: "8px 16px", cursor: "pointer", color: "#fff",
              fontSize: 11, fontWeight: 700
            }}>TODOS</button>
            {segActivo.sub.map(sb => (
              <button key={sb} onClick={() => { setSubCategoria(sb); setSelectedPlan(null); }} style={{
                background: subCategoria === sb ? `rgba(99,102,241,0.3)` : "rgba(255,255,255,0.03)",
                border: `2px solid ${subCategoria === sb ? "#6366f1" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 10, padding: "8px 16px", cursor: "pointer", color: "#fff",
                fontSize: 11, fontWeight: 700
              }}>{sb}</button>
            ))}
          </div>
        </div>
      )}

      {/* NIVEL 3: FILTROS AVANZADOS */}
      {segmento && (
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 16, padding: "20px", marginBottom: 24,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24
        }}>
          <div>
            <div style={{ fontSize: 9, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>
              VELOCIDAD MÍNIMA: {velMin} Mbps
            </div>
            <input type="range" min={0} max={2000} step={50} value={velMin}
              onChange={e => setVelMin(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6366f1" }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#475569", marginTop: 4 }}>
              <span>0 Mbps</span><span>2000 Mbps</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>
              VELOCIDAD MÁXIMA: {velMax === 2000 ? "Sin límite" : velMax + " Mbps"}
            </div>
            <input type="range" min={100} max={2000} step={50} value={velMax}
              onChange={e => setVelMax(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6366f1" }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em", marginBottom: 8 }}>
              PRECIO MÁXIMO (CON IVA): ${presMax}
            </div>
            <input type="range" min={14} max={135} step={1} value={presMax}
              onChange={e => setPresMax(Number(e.target.value))}
              style={{ width: "100%", accentColor: "#6366f1" }} />
          </div>
        </div>
      )}

      {/* RESULTADOS */}
      {segmento && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 10, color: "#6366f1", fontWeight: 800, letterSpacing: "0.1em" }}>03 · </span>
              <span style={{ fontSize: 14, fontWeight: 900 }}>{planes.length} PLANES DISPONIBLES</span>
              {subCategoria && <span style={{ fontSize: 10, color: "#64748b", marginLeft: 8 }}>· {subCategoria}</span>}
            </div>
            <div style={{ fontSize: 9, color: "#475569", fontWeight: 600 }}>CLICK EN UN PLAN PARA VER DETALLE</div>
          </div>

          {planes.length === 0 ? (
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, padding: "40px", textAlign: "center"
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 14, color: "#64748b", fontWeight: 600 }}>No se encontraron planes con esos filtros</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>Intenta ampliar el rango de velocidad o precio</div>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(planes.length, 4)}, 1fr)`,
              gap: 12
            }}>
              {planes.map((plan, idx) => (
                <PlanCardFiltro
                  key={idx}
                  plan={plan}
                  segmento={segmento}
                  selected={selectedPlan === idx}
                  onClick={() => setSelectedPlan(selectedPlan === idx ? null : idx)}
                />
              ))}
            </div>
          )}

          {selectedPlan !== null && planes[selectedPlan] && (
            <div style={{ marginTop: 16 }}>
              <PlanDetalle plan={planes[selectedPlan]} tipo={segmento} pago={subCategoria?.includes("Tarjeta") ? "TC" : subCategoria?.includes("Débito") ? "CCAH" : "EFECTIVO"} />
            </div>
          )}
        </>
      )}

      {!segmento && (
        <div style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.05), rgba(0,0,0,0.3))",
          border: "1px dashed rgba(99,102,241,0.2)", borderRadius: 20, padding: "60px",
          textAlign: "center"
        }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#94a3b8", marginBottom: 8 }}>SELECCIONA UN SEGMENTO</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Elige el tipo de cliente para explorar los planes disponibles</div>
        </div>
      )}
    </div>
  );
}

function PlanCardFiltro({ plan, segmento, selected, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: selected
        ? `linear-gradient(135deg, ${plan.color}20, ${plan.color}08)`
        : "rgba(255,255,255,0.02)",
      border: `2px solid ${selected ? plan.color : "rgba(255,255,255,0.06)"}`,
      borderRadius: 14, padding: "16px", cursor: "pointer", transition: "all 0.2s",
      boxShadow: selected ? `0 4px 20px ${plan.color}30` : "none"
    }}
    onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = plan.color + "60"; }}
    onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; }}
    >
      {plan.badge && (
        <div style={{
          background: `${plan.color}20`, border: `1px solid ${plan.color}40`,
          borderRadius: 6, padding: "2px 7px", fontSize: 8, fontWeight: 800,
          color: plan.color, letterSpacing: "0.08em", marginBottom: 8, display: "inline-block"
        }}>{plan.badge}</div>
      )}
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 6, lineHeight: 1.3 }}>
        {plan.nombre}
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: plan.color, marginBottom: 4, letterSpacing: "-0.5px" }}>
        {velLabel(plan.velocidad)}
      </div>
      <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 99, height: 3, marginBottom: 10 }}>
        <div style={{ background: plan.color, borderRadius: 99, height: 3, width: `${speedBar(plan.velocidad)}%` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 8, color: "#475569", fontWeight: 700 }}>CON IVA</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>${plan.precioConIva}</div>
        </div>
        {plan.precioSinIva && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 8, color: "#475569", fontWeight: 700 }}>SIN IVA</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>${plan.precioSinIva}</div>
          </div>
        )}
      </div>
      {plan.servicios && (
        <div style={{ fontSize: 9, color: "#64748b", marginTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8 }}>
          {plan.servicios}
        </div>
      )}
    </div>
  );
}