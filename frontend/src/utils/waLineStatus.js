export const estadoEfectivoLinea = (linea) =>
  linea?.rt_status || linea?.status || "disconnected";

export const lineaEstaConectada = (linea) =>
  estadoEfectivoLinea(linea) === "connected";
