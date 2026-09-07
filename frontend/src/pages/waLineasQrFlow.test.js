import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./WaLineas.jsx", import.meta.url), "utf8");

test("opens the requested QR modal before waiting for the connect response", () => {
  const connectBody = source.match(/const connect = async \(id\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  const openAt = connectBody.indexOf("setQrModal({ lineId: id, qr: null })");
  const requestAt = connectBody.indexOf("fetch(`${API}/lines/${id}/connect`");

  assert.ok(openAt >= 0, "connect must open the QR modal");
  assert.ok(requestAt >= 0, "connect request must exist");
  assert.ok(openAt < requestAt, "the modal must open immediately, before the API request finishes");
});

test("listens only for the QR event of the line explicitly requested by the user", () => {
  assert.match(source, /const event = `line:qr:\$\{id\}`;/);
  assert.match(source, /socket\.on\(event, handler\);/);
  assert.doesNotMatch(source, /socket\.on\("line:qr"/);
});

test("polls immediately and then repeats while the QR is pending", () => {
  assert.match(source, /void pollQr\(id\);/);
  assert.match(source, /setInterval\(\(\) => \{ void pollQr\(id\); \}, 2000\)/);
});
