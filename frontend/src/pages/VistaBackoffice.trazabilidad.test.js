import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fuente = fs.readFileSync(new URL("./VistaBackoffice.jsx", import.meta.url), "utf8");

test("las tablas de Backoffice permiten reafirmar Estatus Netlife", () => {
  assert.match(
    fuente,
    /edicion\.valor === edicion\.original && edicion\.campo !== "netlife_estatus_real"/
  );
});

test("los guardados de celda envían exclusivamente el campo editado", () => {
  const coincidencias = fuente.match(/body:\s*JSON\.stringify\(\{ \[campo\]: valorEnviar \}\)/g) || [];
  assert.equal(coincidencias.length, 3);
});

test("el detalle solo reafirma Estatus Netlife mediante una acción explícita", () => {
  assert.match(
    fuente,
    /if \(reafirmarEstadoNetlife && detail\?\.netlife_estatus_real\)[\s\S]*?payload\.netlife_estatus_real = detail\.netlife_estatus_real/
  );
  assert.match(fuente, /Reafirmar estado actual:/);
});
