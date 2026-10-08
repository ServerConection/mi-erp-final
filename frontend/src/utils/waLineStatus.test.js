import test from "node:test";
import assert from "node:assert/strict";
import { estadoEfectivoLinea, lineaEstaConectada } from "./waLineStatus.js";

test("prioriza el estado vivo sobre el estado persistido", () => {
  const linea = { status: "disconnected", rt_status: "connected" };
  assert.equal(estadoEfectivoLinea(linea), "connected");
  assert.equal(lineaEstaConectada(linea), true);
});

test("usa el estado persistido cuando no hay estado vivo", () => {
  assert.equal(lineaEstaConectada({ status: "connected" }), true);
  assert.equal(lineaEstaConectada({ status: "logged_out" }), false);
});
