// ============================================================
// scripts/importar_ventas_excel.js
// ------------------------------------------------------------
// Carga masiva de ventas de UN asesor desde un Excel hacia la
// tabla `ventas_registros` (módulo VENTAS FORMULARIO).
//
// SOLO se cargan las columnas del Excel que tienen un campo
// equivalente ya existente en `ventas_registros`. Las columnas
// que no tienen campo en la tabla (CÓDIGO DEL ASESOR, NOMBRE
// ASESOR, Nombres, Apellidos, ESTADO DE REGULARIZACIÓN INTERNA)
// se IGNORAN a propósito, tal como se pidió.
//
// Mapeo aplicado:
//   ID DE NEGOCIACION DE BITRIX        -> id_bitrix
//   ESTADO DE VENTA DE NETLIFE         -> estado
//   FECHA REGISTRO                     -> fecha_ingreso
//   FECHA REGISTRO TELCOS              -> ingreso_telcos
//   Plan                               -> plan
//   INICIAR SESIÓN NETLIFE             -> login
//   FORMA DE PAGO                      -> pago (normalizado a EFEC/TC/CA)
//   DETALLE DE REGULARIZACIÓN          -> observacion
//
// El asesor (usuario_id) y la empresa NO vienen en el Excel,
// así que se indican por parámetro al ejecutar el script.
//
// USO:
//   cd backend
//   node scripts/importar_ventas_excel.js --file="C:\ruta\ventas_hilary.xlsx" --usuario_id=17 --empresa=NOVONET
//
//   // o localizando al asesor por su usuario de login en vez del id:
//   node scripts/importar_ventas_excel.js --file="C:\ruta\ventas_hilary.xlsx" --usuario="hilary.ayala" --empresa=NOVONET
//
//   // simular sin escribir en la BD:
//   node scripts/importar_ventas_excel.js --file="..." --usuario_id=17 --empresa=NOVONET --dry-run
// ============================================================

const path = require("path");
const XLSX = require("xlsx");
const db   = require("../src/config/db");

// ── Config fija del módulo (igual que ventas.controller.js) ──
const ESTADOS_VALIDOS = ["ACTIVO", "DETENIDO", "RE-PLANIFICADO", "FACTIBLE", "PLANIFICADO", "ASIGNADO"];
const PAGOS_VALIDOS   = ["EFEC", "TC", "CA"];

// ── Parseo de argumentos CLI (--clave=valor) ──────────────────
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a.startsWith("--")) args[a.slice(2)] = true; // flags tipo --dry-run
  });
  return args;
}

// ── Normaliza encabezados: sin tildes, mayúsculas, sin espacios extra ──
function normalizarHeader(h) {
  return String(h || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // quita tildes
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Ubica, dentro de las llaves de una fila, la que coincide con un patrón
function buscarCampo(rowKeys, incluye, excluye = []) {
  return rowKeys.find(k => {
    const h = normalizarHeader(k);
    if (excluye.some(x => h.includes(x))) return false;
    return incluye.every(inc => h.includes(inc));
  });
}

// dd/mm/aaaa -> aaaa-mm-dd (para columnas DATE de Postgres)
function normalizarFecha(valor) {
  if (valor === undefined || valor === null || valor === "") return null;

  // Si Excel entregó un objeto Date (celda con formato fecha)
  if (valor instanceof Date && !isNaN(valor)) {
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const s = String(valor).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/aaaa
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // ya viene aaaa-mm-dd
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  console.warn(`  ⚠️  Fecha no reconocida: "${s}" → se guarda como null`);
  return null;
}

// Normaliza estado contra la lista válida del módulo
function normalizarEstado(valor) {
  if (!valor) return null;
  const e = String(valor).trim().toUpperCase();
  if (!ESTADOS_VALIDOS.includes(e)) {
    console.warn(`  ⚠️  Estado "${e}" no está en la lista válida (${ESTADOS_VALIDOS.join(", ")}). Se guarda igual.`);
  }
  return e;
}

// "EFECTIVO." / "TARJETA DE CREDITO." / "CUENTA DE AHORRO." / "CUENTA CORRIENTE." -> EFEC/TC/CA
function normalizarPago(valor) {
  if (!valor) return null;
  const p = String(valor).trim().toUpperCase();
  if (p.includes("EFECTIVO"))                 return "EFEC";
  if (p.includes("TARJETA"))                  return "TC";
  if (p.includes("CUENTA"))                   return "CA"; // ahorro o corriente
  console.warn(`  ⚠️  Forma de pago no reconocida: "${valor}" → se guarda como null`);
  return null;
}

function limpiarTexto(valor) {
  if (valor === undefined || valor === null) return null;
  const t = String(valor).trim();
  return t === "" ? null : t;
}

// ── Lee el Excel y devuelve filas mapeadas a columnas de ventas_registros ──
function leerExcel(rutaArchivo) {
  const wb = XLSX.readFile(rutaArchivo);
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: "", raw: true });

  if (filas.length === 0) return [];

  const keys = Object.keys(filas[0]);

  const colIdBitrix = buscarCampo(keys, ["BITRIX"]);
  const colEstado   = buscarCampo(keys, ["ESTADO", "VENTA"], ["REGULARIZ"]);
  const colFechaReg = buscarCampo(keys, ["FECHA", "REGISTR"], ["TELCOS"]);
  const colFechaTel = buscarCampo(keys, ["TELCOS"]);
  const colPlan      = keys.find(k => normalizarHeader(k) === "PLAN");
  const colLogin     = buscarCampo(keys, ["INICIAR", "SESI"]);
  const colPago      = buscarCampo(keys, ["FORMA", "PAGO"]);
  const colObs       = buscarCampo(keys, ["DETALLE", "REGULARIZ"]);

  console.log("── Columnas detectadas en el Excel ──");
  console.log({
    id_bitrix:      colIdBitrix || "(no encontrada)",
    estado:         colEstado   || "(no encontrada)",
    fecha_ingreso:  colFechaReg || "(no encontrada)",
    ingreso_telcos: colFechaTel || "(no encontrada)",
    plan:           colPlan     || "(no encontrada)",
    login:          colLogin    || "(no encontrada)",
    pago:           colPago     || "(no encontrada)",
    observacion:    colObs      || "(no encontrada)",
  });
  console.log("(CÓDIGO DEL ASESOR, NOMBRE ASESOR, Nombres, Apellidos y ESTADO DE REGULARIZACIÓN INTERNA se ignoran: no existen en ventas_registros)\n");

  return filas.map(f => ({
    id_bitrix:      colIdBitrix ? limpiarTexto(f[colIdBitrix])      : null,
    estado:         colEstado   ? normalizarEstado(f[colEstado])    : null,
    fecha_ingreso:  colFechaReg ? normalizarFecha(f[colFechaReg])   : null,
    ingreso_telcos: colFechaTel ? normalizarFecha(f[colFechaTel])   : null,
    plan:           colPlan     ? limpiarTexto(f[colPlan])          : null,
    login:          colLogin    ? limpiarTexto(f[colLogin])         : null,
    pago:           colPago     ? normalizarPago(f[colPago])        : null,
    observacion:    colObs      ? limpiarTexto(f[colObs])           : null,
  }));
}

async function main() {
  const args = parseArgs();

  if (!args.file || (!args.usuario_id && !args.usuario) || !args.empresa) {
    console.log(`
Uso:
  node scripts/importar_ventas_excel.js --file="ruta.xlsx" --usuario_id=17 --empresa=NOVONET [--dry-run]
  node scripts/importar_ventas_excel.js --file="ruta.xlsx" --usuario="login.asesor" --empresa=NOVONET [--dry-run]
`);
    process.exit(1);
  }

  const rutaArchivo = path.resolve(args.file);
  const empresa     = String(args.empresa).toUpperCase();
  const dryRun      = Boolean(args["dry-run"]);

  if (!["NOVONET", "VELSA"].includes(empresa)) {
    console.warn(`⚠️  Empresa "${empresa}" no es NOVONET ni VELSA. Verifica el valor.`);
  }

  // ── Resolver usuario_id ──
  let usuarioId = args.usuario_id ? Number(args.usuario_id) : null;
  if (!usuarioId && args.usuario) {
    const { rows } = await db.query(`SELECT id FROM usuarios WHERE usuario = $1`, [args.usuario]);
    if (rows.length === 0) {
      console.error(`❌ No se encontró un usuario con login "${args.usuario}"`);
      process.exit(1);
    }
    usuarioId = rows[0].id;
  }

  console.log(`Archivo:    ${rutaArchivo}`);
  console.log(`Asesor:     usuario_id=${usuarioId}`);
  console.log(`Empresa:    ${empresa}`);
  console.log(`Modo:       ${dryRun ? "DRY-RUN (no escribe en BD)" : "REAL"}\n`);

  const filas = leerExcel(rutaArchivo);
  console.log(`Filas leídas del Excel: ${filas.length}\n`);

  // Siguiente número de venta para ese asesor
  const { rows: numRows } = await db.query(
    `SELECT COALESCE(MAX(numero_venta), 0) AS actual FROM ventas_registros WHERE usuario_id = $1`,
    [usuarioId]
  );
  let siguienteNumero = numRows[0].actual;

  let insertados = 0, duplicados = 0, errores = 0;

  for (const [i, f] of filas.entries()) {
    try {
      if (!f.id_bitrix) {
        console.warn(`  ⏭️  Fila ${i + 2}: sin ID Bitrix, se omite.`);
        continue;
      }

      // Evitar duplicados: mismo id_bitrix + mismo asesor
      const { rows: existe } = await db.query(
        `SELECT id FROM ventas_registros WHERE id_bitrix = $1 AND usuario_id = $2`,
        [f.id_bitrix, usuarioId]
      );
      if (existe.length > 0) {
        console.log(`  ⏭️  Fila ${i + 2}: ID Bitrix ${f.id_bitrix} ya existe para este asesor, se omite.`);
        duplicados++;
        continue;
      }

      siguienteNumero += 1;

      if (dryRun) {
        console.log(`  [DRY-RUN] #${siguienteNumero} id_bitrix=${f.id_bitrix} estado=${f.estado} plan="${f.plan}"`);
        insertados++;
        continue;
      }

      await db.query(
        `INSERT INTO ventas_registros
           (numero_venta, id_bitrix, plan, login, ingreso_telcos, fecha_ingreso,
            estado, pago, observacion, usuario_id, empresa)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          siguienteNumero,
          f.id_bitrix,
          f.plan,
          f.login,
          f.ingreso_telcos,
          f.fecha_ingreso,
          f.estado,
          f.pago,
          f.observacion,
          usuarioId,
          empresa,
        ]
      );
      insertados++;
    } catch (err) {
      errores++;
      console.error(`  ❌ Fila ${i + 2} (id_bitrix=${f.id_bitrix}): ${err.message}`);
    }
  }

  console.log(`\n── Resumen ──`);
  console.log(`Insertados:  ${insertados}`);
  console.log(`Duplicados:  ${duplicados}`);
  console.log(`Errores:     ${errores}`);

  process.exit(0);
}

main().catch(err => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
