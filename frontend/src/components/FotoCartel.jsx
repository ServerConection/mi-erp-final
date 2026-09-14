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
  const tipo = form.tipo_documento || "DOCUMENTO DE IDENTIDAD";
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
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(logo, 595, 100, 494, 128);
      ctx.fillStyle = "#151515";
      const texto = `YO, ${(nombre || "[NOMBRE COMPLETO]").toUpperCase()}${empresa ? `, REPRESENTANTE LEGAL DE ${(razonSocial || "[EMPRESA]").toUpperCase()},` : ""} CONTRATO EL SERVICIO DE INTERNET DE NETLIFE A ${plazo} MESES, CON FIRMA ELECTRÓNICA SIMPLE.`;
      let lines = [];
      let size = 48;
      do {
        ctx.font = `${size}px Arial`;
        lines = [""];
        texto.split(/\s+/).forEach(word => {
          const index = lines.length - 1;
          const next = lines[index] ? `${lines[index]} ${word}` : word;
          if (ctx.measureText(next).width > 1320 && lines[index]) lines.push(word);
          else lines[index] = next;
        });
        if (lines.length * size * 1.35 <= 380) break;
        size -= 2;
      } while (size > 16);
      ctx.textAlign = "left";
      lines.forEach((line, index) => ctx.fillText(line, 182, 365 + index * size * 1.35));
      ctx.textAlign = "center";
      ctx.font = "60px Arial";
      ctx.fillText(identificacion || "[IDENTIFICACIÓN]", 842, 875, 1320);
      ctx.font = "42px Arial";
      ctx.fillText(tipo, 842, 940);
      ctx.fillText(fecha, 842, 1030);
      setError("");
      setReady(true);
    };
    logo.onerror = () => { if (active) { setReady(false); setError("No se pudo cargar el logo del cartel. Recarga la página."); } };
    logo.src = logoUrl;
    return () => { active = false; };
  }, [nombre, identificacion, plazo, tipo, razonSocial, empresa, fecha]);

  const download = () => {
    try {
      const url = URL.createObjectURL(cartelPdf(canvasRef.current));
      const link = document.createElement("a");
      link.href = url;
      link.download = `cartel-netlife-${identificacion.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      setError("No se pudo generar el PDF. Intenta nuevamente.");
    }
  };

  return (
    <div>
      <canvas ref={canvasRef} width={1684} height={1191} role="img" aria-label={`Vista previa del cartel Netlife de ${nombre || "cliente"}`}
        style={{ width: "100%", height: "auto", background: "white", border: "1px solid #ddd", borderRadius: 8 }} />
      {!completo && <p style={{ fontSize: 12, marginTop: 8 }}>Completa {empresa ? "el representante legal, la empresa y el RUC" : "el nombre y la identificación del cliente"} para descargar el cartel.</p>}
      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 12 }}>{error}</p>}
      <button type="button" className="nv-btn-reset" disabled={!ready || !completo} onClick={download}
        style={{ marginTop: 8, width: "auto", padding: "8px 16px", opacity: ready && completo ? 1 : 0.5 }}>
        Descargar PDF
      </button>
    </div>
  );
}
