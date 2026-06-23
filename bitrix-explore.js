/**
 * BITRIX24 — EXPLORADOR v3 — etapas Cat:8 + campos UF_
 * Ejecutar: node bitrix-explore.js
 */

const WEBHOOK = "https://aclopecuador.bitrix24.es/rest/34852/00em2r3oa8igj2yt";

const call = async (method, params = {}) => {
  const qs = new URLSearchParams();
  const flatten = (obj, prefix = "") => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        flatten(v, key);
      } else if (Array.isArray(v)) {
        v.forEach((item, i) => qs.append(`${key}[${i}]`, item));
      } else {
        qs.append(key, v);
      }
    }
  };
  flatten(params);
  const url = `${WEBHOOK}/${method}.json?${qs.toString()}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(`[${method}]: ${json.error} — ${json.error_description}`);
  return json;
};

const sep = (t) => { console.log("\n" + "═".repeat(65)); console.log(`  ${t}`); console.log("═".repeat(65)); };

(async () => {

  // ── 1. TODAS LAS CATEGORÍAS (fix: revisamos la respuesta raw) ────────────────
  sep("1. CATEGORÍAS RAW — estructura completa");
  try {
    const r = await call("crm.category.list", { entityTypeId: 2 });
    console.log(JSON.stringify(r, null, 2));
  } catch(e) { console.log("  ERROR:", e.message); }

  // ── 2. ETAPAS DE CATEGORÍA 8 (pipeline activo) ───────────────────────────────
  sep("2. ETAPAS CATEGORÍA 8 — via crm.status.list");
  try {
    const r = await call("crm.status.list", { filter: { ENTITY_ID: "DEAL_STAGE_8" } });
    (r.result || []).forEach(s =>
      console.log(`  ${s.STATUS_ID}  →  "${s.NAME}"  (sort:${s.SORT})`)
    );
    if (!(r.result||[]).length) console.log("  Sin resultados con DEAL_STAGE_8");
  } catch(e) { console.log("  ERROR:", e.message); }

  // Intento alternativo con id de categoría directa
  sep("2b. ETAPAS CAT 8 — via crm.deal.list agrupando stages existentes");
  try {
    const r = await call("crm.deal.list", {
      filter: { CATEGORY_ID: 8 },
      select: ["STAGE_ID"],
      start: 0,
    });
    const stages = [...new Set((r.result || []).map(d => d.STAGE_ID))].sort();
    console.log("  Stages únicos encontrados en Cat:8:");
    stages.forEach(s => console.log(`    ${s}`));
  } catch(e) { console.log("  ERROR:", e.message); }

  // ── 3. NOMBRES DE CAMPOS UF_ ─────────────────────────────────────────────────
  sep("3. CAMPOS PERSONALIZADOS (UF_) — labels y tipos");
  try {
    const r = await call("crm.deal.userfield.list", { order: { FIELD_NAME: "ASC" } });
    (r.result || []).forEach(f =>
      console.log(`  ${f.FIELD_NAME}  →  "${f.EDIT_FORM_LABEL?.es || f.EDIT_FORM_LABEL?.en || f.EDIT_FORM_LABEL || f.FIELD_NAME}"  [${f.USER_TYPE_ID}]`)
    );
  } catch(e) { console.log("  ERROR:", e.message); }

  // ── 4. DEAL DE CAT 8 COMPLETO (todos los campos) ─────────────────────────────
  sep("4. DEAL DE CAT:8 COMPLETO — todos los campos");
  try {
    const r = await call("crm.deal.list", {
      filter: { CATEGORY_ID: 8 },
      order: { DATE_CREATE: "DESC" },
      select: ["*", "UF_*"],
      start: 0,
    });
    const d = (r.result || [])[0];
    if (d) {
      Object.entries(d).forEach(([k, v]) => {
        if (v !== null && v !== "" && v !== "0" && v !== "0.00000000") {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      });
    }
  } catch(e) { console.log("  ERROR:", e.message); }

  // ── 5. CONTEO POR STAGE EN CAT 8 (mes actual) ───────────────────────────────
  sep("5. CONTEO POR ETAPA EN CAT 8 — MES ACTUAL");
  try {
    const hoy = new Date();
    const primerDia = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
    let todos = [];
    let start = 0;
    while (true) {
      const r = await call("crm.deal.list", {
        filter: { CATEGORY_ID: 8, ">=DATE_CREATE": primerDia },
        select: ["ID","STAGE_ID","ASSIGNED_BY_ID"],
        start,
      });
      const batch = r.result || [];
      todos = todos.concat(batch);
      if (batch.length < 50 || !r.next) break;
      start = r.next;
    }
    const conteo = {};
    todos.forEach(d => { conteo[d.STAGE_ID] = (conteo[d.STAGE_ID] || 0) + 1; });
    Object.entries(conteo)
      .sort((a,b) => b[1]-a[1])
      .forEach(([k,v]) => console.log(`  ${k}: ${v} deals`));
    console.log(`\n  TOTAL MES (Cat:8): ${todos.length} deals`);
  } catch(e) { console.log("  ERROR:", e.message); }

  sep("✅ LISTO — pega el output aquí");
})();
