import { useEffect, useRef, useState } from "react";
import logoUrl from "../assets/netlife-cartel.png";
import { cartelPdf } from "../utils/cartelPdf";

export default function FotoCartel({ form }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const empresa = form.tipo_documento === "RUC EMPRESA";
  const nombre = (empresa ? form.representante_legal : `${form.nombres_cliente || ""} ${form.apellidos_cliente || ""}`).trim();
  const identificacion = (form.numero_identificacion || "").trim();
  const plazo = form.plazo_contrato_meses || "36";
  const ETIQUETA_DOCUMENTO = {
    "CÉDULA DE IDENTIDAD": "CÉDULA DE IDENTIDAD",
    "NÚMERO DE PASAPORTE": "PASAPORTE",
    "RUC PERSONAL": "RUC PERSONAL",
    "RUC EMPRESA": "RUC EMPRESARIAL",
  };
  const tipo = ETIQUETA_DOCUMENTO[form.tipo_documento] || "DOCUMENTO DE IDENTIDAD";
  const razonSocial = empresa ? (form.nombre_cliente_completo || "").trim() : "";
  const fecha = new Date().toLocaleDateString("es-EC", { day: "2-digit", month: "2-digit", year: "numeric" });
  const completo = Boolean(nombre && identificacion && (!empresa || razonSocial));

  useEffect(() => {
    let active = true;
    const logo = new Image();
    logo.onload = () => {
      if (!active) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const W = canvas.width;   // 1684
      const H = canvas.height;  // 1191
      const CX = W / 2;
      const ANCHO = W - 200;    // ancho útil del párrafo
      const NEGRO = "#000000";

      // Fondo blanco
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);

      // Logo centrado arriba
      const logoW = 600;
      const logoH = logoW * (128 / 494);
      ctx.drawImage(logo, CX - logoW / 2, 70, logoW, logoH);

      ctx.fillStyle = NEGRO;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      // Párrafo principal: letra normal, lo más grande que quepa, centrado
      const texto = `YO, ${(nombre || "[NOMBRE COMPLETO]").toUpperCase()}${empresa ? `, REPRESENTANTE LEGAL DE ${(razonSocial || "[EMPRESA]").toUpperCase()},` : ""} CONTRATO EL SERVICIO DE INTERNET DE NETLIFE A ${plazo} MESES, CON FIRMA ELECTRÓNICA SIMPLE.`;

      const BLOQUE_TOP = 290;
      const BLOQUE_ALTO = 540;   // de y=290 a y=830
      const INTERLINEADO = 1.22;
      let lines = [];
      let size = 100;
      do {
        ctx.font = `${size}px Arial`;
        lines = [""];
        texto.split(/\s+/).forEach(word => {
          const i = lines.length - 1;
          const next = lines[i] ? `${lines[i]} ${word}` : word;
          if (ctx.measureText(next).width > ANCHO && lines[i]) lines.push(word);
          else lines[i] = next;
        });
        if (lines.length * size * INTERLINEADO <= BLOQUE_ALTO) break;
        size -= 2;
      } while (size > 20);

      const alturaTexto = lines.length * size * INTERLINEADO;
      const inicioY = BLOQUE_TOP + (BLOQUE_ALTO - alturaTexto) / 2;
      lines.forEach((line, i) => ctx.fillText(line, CX, inicioY + i * size * INTERLINEADO));

      // Identificación en negrita
      ctx.font = "bold 92px Arial";
      ctx.fillText(identificacion || "[IDENTIFICACIÓN]", CX, 870, ANCHO);

      // Tipo de documento y fecha (con espacios alrededor de las barras)
      ctx.font = "62px Arial";
      ctx.fillText(tipo, CX, 985, ANCHO);
      ctx.fillText(fecha.replace(/\//g, " / "), CX, 1070, ANCHO);

      setError("");
      setReady(true);
    };
    logo.onerror = () => { if (active) { setReady(false); setError("No se pudo cargar el logo del cartel. Recarga la página."); } };
    logo.src = logoUrl;
    return () => { active = false; };
  }, [nombre, identificacion, plazo, tipo, razonSocial, empresa, fecha]);

  const nombreArchivo = `cartel-netlife-${identificacion.replace(/[^a-zA-Z0-9_-]/g, "") || "cliente"}`;

  const downloadPdf = () => {
    try {
      const url = URL.createObjectURL(cartelPdf(canvasRef.current));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${nombreArchivo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setError("No se pudo generar el PDF. Intenta nuevamente.");
    }
  };

  const downloadPng = () => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Canvas no disponible");
      canvas.toBlob((blob) => {
        if (!blob) {
          setError("No se pudo generar la imagen. Intenta nuevamente.");
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${nombreArchivo}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }, "image/png");
    } catch {
      setError("No se pudo generar la imagen. Intenta nuevamente.");
    }
  };

  return (
    <div>
      <canvas ref={canvasRef} width={1684} height={1191} role="img" aria-label={`Vista previa del cartel Netlife de ${nombre || "cliente"}`}
        style={{ width: "100%", height: "auto", background: "white", border: "1px solid #ddd", borderRadius: 8 }} />
      {!completo && <p style={{ fontSize: 12, marginTop: 8 }}>Completa {empresa ? "el representante legal, la empresa y el RUC" : "el nombre y la identificación del cliente"} para descargar el cartel.</p>}
      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        <button type="button" className="nv-btn-reset" disabled={!ready || !completo} onClick={downloadPdf}
          style={{ width: "auto", padding: "8px 16px", opacity: ready && completo ? 1 : 0.5 }}>
          Descargar PDF
        </button>
        <button type="button" className="nv-btn-reset" disabled={!ready || !completo} onClick={downloadPng}
          style={{ width: "auto", padding: "8px 16px", opacity: ready && completo ? 1 : 0.5 }}>
          Descargar PNG
        </button>
      </div>
    </div>
  );
}
