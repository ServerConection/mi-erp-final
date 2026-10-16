import test from "node:test";
import assert from "node:assert/strict";
import { filtrarRegistrosBackoffice } from "./filtrosBackoffice.js";

const filas = [
  { id: 1, codigo_asesor: "4340", nombre_cliente_completo: "Cliente correcto", telf_celular_pin: "0991111111" },
  { id: 2, codigo_asesor: "4095LK", nombre_cliente_completo: "Otro cliente", telf_celular_pin: "0994340000" },
  { id: 3, codigo_asesor: "4285", nombre_cliente_completo: "Cliente 4340 mencionado", ciudad: "Quito" },
];

test("un código exacto de asesor no coincide con teléfonos ni otros campos", () => {
  assert.deepEqual(filtrarRegistrosBackoffice(filas, "4340").map((row) => row.id), [1]);
});

test("la búsqueda global conserva coincidencias parciales cuando no es un código exacto", () => {
  assert.deepEqual(filtrarRegistrosBackoffice(filas, "otro cliente").map((row) => row.id), [2]);
  assert.deepEqual(filtrarRegistrosBackoffice(filas, "099434").map((row) => row.id), [2]);
});

test("normaliza mayúsculas, espacios y tildes", () => {
  const datos = [{ id: 9, nombre_cliente_completo: "  José Pérez  " }];
  assert.equal(filtrarRegistrosBackoffice(datos, "jose perez").length, 1);
});

