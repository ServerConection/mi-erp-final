import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./VistaBackoffice.jsx", import.meta.url), "utf8");

assert.match(source, /socket\.on\("welcome:respuesta", actualizarRespuestas\)/);
assert.match(source, /Clientes que respondieron/);
assert.doesNotMatch(source, /disabled=\{respondieron === 0\}/);
assert.match(source, /bloquesWelcomeVisibles/);
assert.match(source, /Todavía ningún cliente ha respondido el mensaje Welcome/);
assert.match(source, /respuestaWelcome=\{bloque\.id === "NOTIFICADOS"/);
assert.match(source, /onAbrirChatWelcome=\{abrirChatRespuestaWelcome\}/);
assert.match(source, /initialConversationId=\{chatConversacionId\}/);
assert.match(source, /NOTIFICADOS: filtrarRespondieron/);
assert.match(source, /\ud83d\udcac Ir al chat/);
assert.match(source, /"Ver chat"/);
assert.match(source, /notificacionWelcome=\{bloque\.id === "NOTIFICADOS"/);
assert.doesNotMatch(source, /Chat Welcome/);
assert.match(source, /className="bo-welcome-chat-backdrop"/);
assert.match(source, /role="dialog"/);
assert.match(source, /aria-modal="true"/);
assert.match(source, /Cerrar \(Esc\)/);

const styles = fs.readFileSync(new URL("../styles/VistaBackoffice.css", import.meta.url), "utf8");
assert.match(styles, /width: min\(1540px, calc\(100vw - 48px\)\)/);
assert.match(styles, /\.bo-welcome-chat-modal__body > div[\s\S]*margin-left: 0 !important/);

console.log("OK Welcome: alerta, filtro de respuestas y acceso directo al chat");
