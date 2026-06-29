/**
 * nodeDefs.js — Catálogo de tipos de nodo del bot, alineado 1:1 con
 * backend/src/services/FlowEngine.js (switch de node.type).
 *
 * Si agregas un tipo nuevo aquí, agrega también su `case` en FlowEngine.js,
 * o el nodo se ejecutará como "desconocido" (pasa al siguiente sin hacer nada).
 */

export const NODE_DEFS = [
  {
    type: "startNode",
    label: "Inicio",
    icon: "🚀",
    color: "#16a34a",
    hasInput: false,
    hasOutput: true,
    description: "Punto de entrada del flujo. Debe existir exactamente uno.",
    fields: [],
    summary: () => "Inicio del flujo",
  },
  {
    type: "messageNode",
    label: "Enviar mensaje",
    icon: "💬",
    color: "#2563eb",
    hasInput: true,
    hasOutput: true,
    description: "Envía un texto al cliente. Soporta variables {{nombre}}.",
    fields: [
      { key: "text", label: "Texto del mensaje", type: "textarea", placeholder: "¡Hola {{nombre}}! ¿En qué puedo ayudarte?" },
    ],
    summary: (d) => d?.text || "(sin texto)",
  },
  {
    type: "waitResponseNode",
    label: "Esperar respuesta",
    icon: "⌨️",
    color: "#7c3aed",
    hasInput: true,
    hasOutput: true,
    description: "Envía una pregunta y espera la respuesta libre del cliente, guardándola en una variable.",
    fields: [
      { key: "question", label: "Pregunta a enviar", type: "textarea", placeholder: "¿Cuál es tu nombre completo?" },
      { key: "variable", label: "Guardar respuesta en variable", type: "text", placeholder: "respuesta" },
    ],
    summary: (d) => `${d?.question || "(sin pregunta)"} → {{${d?.variable || "respuesta"}}}`,
  },
  {
    type: "pollNode",
    label: "Menú / Encuesta",
    icon: "📋",
    color: "#d97706",
    hasInput: true,
    hasOutput: "options",
    description: "Muestra opciones al cliente (imagen + lista interactiva). Cada opción puede ir a un nodo distinto.",
    fields: [
      { key: "title", label: "Título / pregunta", type: "text", placeholder: "Elige una opción:" },
      { key: "options", label: "Opciones", type: "options" },
    ],
    summary: (d) => `${(d?.options || []).length} opción(es)`,
  },
  {
    type: "conditionNode",
    label: "Condición",
    icon: "🔀",
    color: "#dc2626",
    hasInput: true,
    hasOutput: "conditions",
    description: "Evalúa la última respuesta del cliente contra reglas y enruta a distintos nodos.",
    fields: [
      { key: "conditions", label: "Reglas", type: "conditions" },
    ],
    summary: (d) => `${(d?.conditions || []).length} regla(s)`,
  },
  {
    type: "waitNode",
    label: "Esperar (delay)",
    icon: "⏱️",
    color: "#0891b2",
    hasInput: true,
    hasOutput: true,
    description: "Pausa el flujo N segundos antes de continuar.",
    fields: [
      { key: "seconds", label: "Segundos de espera", type: "number", placeholder: "3" },
    ],
    summary: (d) => `${d?.seconds || 1}s`,
  },
  {
    type: "mediaNode",
    label: "Enviar multimedia",
    icon: "📎",
    color: "#65a30d",
    hasInput: true,
    hasOutput: true,
    description: "Envía un archivo (imagen, video, documento o audio) desde el servidor.",
    fields: [
      { key: "mediaType", label: "Tipo", type: "select", options: ["image", "video", "document", "audio"] },
      { key: "filePath", label: "Ruta del archivo en servidor", type: "text", placeholder: "/uploads/catalogo.pdf" },
      { key: "mimetype", label: "Mimetype", type: "text", placeholder: "application/pdf" },
      { key: "filename", label: "Nombre a mostrar", type: "text", placeholder: "catalogo.pdf" },
      { key: "caption", label: "Texto / caption", type: "textarea" },
    ],
    summary: (d) => d?.filename || d?.filePath || "(sin archivo)",
  },
  {
    type: "emailNode",
    label: "Enviar email",
    icon: "📧",
    color: "#0d9488",
    hasInput: true,
    hasOutput: true,
    description: "Envía un correo (vía email.service) al destinatario indicado.",
    fields: [
      { key: "to", label: "Para", type: "text", placeholder: "destino@correo.com" },
      { key: "subject", label: "Asunto", type: "text" },
      { key: "body", label: "Cuerpo", type: "textarea" },
    ],
    summary: (d) => d?.subject || d?.to || "(sin asunto)",
  },
  {
    type: "webhookNode",
    label: "Webhook",
    icon: "🌐",
    color: "#4338ca",
    hasInput: true,
    hasOutput: true,
    description: "Llama a una URL externa (API, CRM, etc.). La respuesta queda en {{_webhookResponse}}.",
    fields: [
      { key: "url", label: "URL", type: "text", placeholder: "https://api.miempresa.com/lead" },
      { key: "method", label: "Método", type: "select", options: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
      { key: "headers", label: "Headers (JSON)", type: "json", placeholder: '{ "Authorization": "Bearer ..." }' },
      { key: "payload", label: "Payload (JSON, soporta {{variables}})", type: "json", placeholder: '{ "telefono": "{{_waNumber}}" }' },
    ],
    summary: (d) => `${d?.method || "POST"} ${d?.url || "(sin URL)"}`,
  },
  {
    type: "notifyWaNode",
    label: "Notificar por WhatsApp",
    icon: "📲",
    color: "#15803d",
    hasInput: true,
    hasOutput: true,
    description: "Envía un WhatsApp interno (a un supervisor, por ejemplo) sin interrumpir el flujo del cliente.",
    fields: [
      { key: "targetNumber", label: "Número destino", type: "text", placeholder: "593987654321" },
      { key: "message", label: "Mensaje", type: "textarea" },
    ],
    summary: (d) => d?.targetNumber || "(sin número)",
  },
  {
    type: "saveDataNode",
    label: "Guardar dato",
    icon: "💾",
    color: "#854d0e",
    hasInput: true,
    hasOutput: true,
    description: "Guarda un valor en el contexto de la conversación y en metadata del contacto.",
    fields: [
      { key: "key", label: "Nombre de variable", type: "text", placeholder: "interes" },
      { key: "value", label: "Valor (soporta {{variables}})", type: "text", placeholder: "{{_lastInput}}" },
    ],
    summary: (d) => `${d?.key || "?"} = ${d?.value || ""}`,
  },
  {
    type: "tagNode",
    label: "Etiquetar contacto",
    icon: "🏷️",
    color: "#9333ea",
    hasInput: true,
    hasOutput: true,
    description: "Agrega una etiqueta al contacto (para segmentación/campañas).",
    fields: [
      { key: "tag", label: "Etiqueta", type: "text", placeholder: "interesado-plan-fibra" },
    ],
    summary: (d) => d?.tag || "(sin etiqueta)",
  },
  {
    type: "endNode",
    label: "Fin del flujo",
    icon: "🏁",
    color: "#475569",
    hasInput: true,
    hasOutput: false,
    description: "Cierra la conversación. Puede enviar un mensaje de despedida.",
    fields: [
      { key: "farewellText", label: "Mensaje de despedida (opcional)", type: "textarea" },
    ],
    summary: (d) => d?.farewellText || "Cierra la conversación",
  },
];

export const NODE_DEF_MAP = Object.fromEntries(NODE_DEFS.map((n) => [n.type, n]));

export const getNodeDef = (type) => NODE_DEF_MAP[type] || {
  type, label: type, icon: "❓", color: "#94a3b8", hasInput: true, hasOutput: true, fields: [], summary: () => "",
};

export const genId = (prefix = "n") =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const defaultDataForType = (type) => {
  switch (type) {
    case "waitNode": return { seconds: 1 };
    case "mediaNode": return { mediaType: "image" };
    case "webhookNode": return { method: "POST", headers: {}, payload: {} };
    case "pollNode": return { title: "Elige una opción:", options: [{ label: "Opción 1" }, { label: "Opción 2" }] };
    case "conditionNode": return { conditions: [{ operator: "contains", value: "" }] };
    default: return {};
  }
};

export const OPERATORS = [
  { value: "equals", label: "es igual a" },
  { value: "contains", label: "contiene" },
  { value: "starts", label: "empieza con" },
  { value: "regex", label: "regex" },
  { value: "any", label: "cualquier valor (default)" },
];
