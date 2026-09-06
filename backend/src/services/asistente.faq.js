/**
 * BASE DE CONOCIMIENTO DEL ASISTENTE — preguntas frecuentes de operacion
 *
 * El Asistente ERP ya respondia preguntas de DATOS ("cuantos descartes hoy").
 * Esto cubre lo otro: las dudas de PROCESO que los asesores preguntan todos los
 * dias y que hoy viven en la cabeza de un supervisor o en un PDF perdido.
 *
 * Se consulta ANTES que la IA y antes que el motor de reglas. Si la pregunta
 * calza con una ficha, la respuesta sale al instante: sin consultar la base,
 * sin llamar al modelo, sin costo, y —lo mas importante— siempre igual. Una
 * respuesta de requisitos o de penalidades no puede variar segun lo que
 * improvise un modelo: son reglas de negocio, no redaccion.
 *
 * Como se elige la ficha: se normaliza la pregunta (minusculas, sin tildes) y
 * se puntua cada ficha por las 'claves' que aparecen. Gana la de mayor puntaje
 * y solo si supera el umbral; si ninguna convence, la pregunta sigue su camino
 * normal hacia la IA. Vale mas no contestar que contestar cualquier cosa.
 *
 * Para agregar una ficha: copia el bloque, pon claves especificas (las palabras
 * que un asesor escribiria de verdad) y listo. No hace falta tocar nada mas.
 */

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // fuera tildes
    .replace(/\s+/g, ' ')
    .trim();

const FAQ = [
  {
    id: 'embudos-volver-llamar-vs-seguimiento',
    categoria: 'Proceso comercial',
    pregunta: 'Diferencia entre los embudos de "Volver a llamar" y "Seguimiento"',
    claves: ['volver a llamar', 'seguimiento', 'embudo', 'diferencia embudo'],
    respuesta:
      '*Volver a llamar:* cliente que NO ha tenido ningún tipo de comunicación, ni por chat ni por llamada. Todavía no existe ninguna negociación.\n\n' +
      '*Seguimiento de negociación:* cliente con el que YA se mantuvo una negociación previa y está a la espera de un nuevo contacto para su confirmación.',
  },
  {
    id: 'tiempo-instalacion',
    categoria: 'Instalación',
    pregunta: '¿Cuánto tarda la instalación del servicio?',
    claves: ['tiempo de instalacion', 'cuanto tarda la instalacion', 'demora la instalacion', 'fecha de instalacion'],
    respuesta:
      'En primera instancia lo correcto es *buscar agenda* y darle al cliente su fecha y hora de instalación en línea.\n\n' +
      'Si no se puede agendar, se le indica que en *24 a 48 horas hábiles* le contactará el área de coordinación para agendar fecha y hora, y que esté atento a las llamadas.',
  },
  {
    id: 'salida-antes-36-meses',
    categoria: 'Contrato',
    pregunta: '¿Qué paga el cliente si se retira antes de los 36 meses?',
    claves: ['36 meses', 'penalidad', 'retirarse antes', 'salir del servicio', 'valor a pagar si se retira'],
    respuesta:
      '*No se le pueden dar valores al cliente*, porque no se tiene fecha exacta de instalación, de retiro ni las promociones que reciba durante su estadía.\n\n' +
      'Siempre se menciona que *Netlife no mantiene penalidad*, y que si sale antes de los 36 meses únicamente se le calcularía un *valor proporcional de las promociones recibidas* por el tiempo faltante para cumplir el contrato.',
  },
  {
    id: 'extender-dual-band',
    categoria: 'Producto',
    pregunta: '¿Qué es el extender y qué significa dual band?',
    claves: ['extender', 'dual band', 'amplificador', 'repetidor wifi'],
    respuesta:
      'El *extender* es un amplificador de la señal wifi dentro del domicilio.\n\n' +
      '*Dual band* significa que mantiene las bandas de *2.4 GHz y 5 GHz*, lo que permite evitar la saturación del servicio.',
  },
  {
    id: 'clientes-discapacidad',
    categoria: 'Beneficios de ley',
    pregunta: '¿Qué hacer con los clientes con discapacidad?',
    claves: ['discapacidad', 'discapacitado', 'conadis', 'requisitos discapacidad'],
    respuesta:
      'Primero se indican todos los requisitos para el descuento por discapacidad. Si el cliente no los tiene, se ofrece un *plan Pro*, que no aplica a beneficios de ley.\n\n' +
      '*REQUISITOS NETLIFE — DISCAPACIDAD*\n' +
      '✅ Foto de la cédula (2 lados)\n' +
      '✅ Teléfono celular o convencional adicional\n' +
      '✅ Correo electrónico\n' +
      '✅ Dirección exacta: calle principal y secundaria 📌\n' +
      '✅ Foto de aceptación del servicio del cliente discapacitado\n' +
      '✅ Teléfono celular adicional\n\n' +
      '*MÉTODO DE PAGO*\n' +
      '✅ Cuenta bancaria o tarjeta de crédito a nombre del titular (discapacitado)\n\n' +
      '*REQUISITOS ADICIONALES*\n' +
      '✅ Fotocopia de servicio básico a nombre del titular que confirme la dirección de instalación.\n' +
      'Si no tiene planilla: contrato de arrendamiento firmado a nombre del titular del lugar donde se instalará.\n' +
      '✅ Adéndum firmado por el titular (discapacitado)\n\n' +
      '⚠️ Si el discapacitado es *menor de edad*, se necesita un *poder notariado* para contratación de servicios, y el titular será el apoderado.',
  },
  {
    id: 'requisitos-adulto-mayor',
    categoria: 'Beneficios de ley',
    pregunta: '¿Qué requisitos se solicitan a un cliente adulto mayor?',
    claves: ['adulto mayor', 'requisitos adulto mayor', 'tercera edad'],
    respuesta:
      'Además de los requisitos de un cliente normal, se solicita la *planilla de servicio básico* (agua o luz):\n\n' +
      '• Vigencia máxima de los últimos *3 meses*\n' +
      '• Debe ser de la dirección donde se instalará el servicio',
  },
  {
    id: 'beneficio-de-ley',
    categoria: 'Beneficios de ley',
    pregunta: '¿Qué significa "beneficio de ley"?',
    claves: ['beneficio de ley', 'descuento por ley'],
    respuesta: 'Cualquier descuento aplicable por ley: *Adulto Mayor* o *Discapacidad*.',
  },
  {
    id: 'fecha-maxima-pago',
    categoria: 'Facturación',
    pregunta: '¿Cuál es la fecha máxima de pago del cliente?',
    claves: ['fecha maxima de pago', 'hasta cuando puede pagar', 'corte del servicio', 'ciclo de pago'],
    respuesta:
      'El cliente tiene hasta *5 días antes de la finalización de su ciclo* para cancelar el valor pendiente sin caer en corte del servicio.',
  },
  {
    id: 'contenido-de-valor',
    categoria: 'Proceso comercial',
    pregunta: '¿Qué es un contenido de valor?',
    claves: ['contenido de valor'],
    respuesta:
      'Es toda información que se envía al cliente *sin detalle ni mención de compra*: resalta beneficios y características del producto que se está ofreciendo.',
  },
  {
    id: 'regla-3x3x3',
    categoria: 'Proceso comercial',
    pregunta: '¿Cuál es la regla 3x3x3?',
    claves: ['3x3x3', 'regla 3'],
    respuesta:
      'Buscar contactar al cliente por:\n\n• *3 canales* distintos\n• *3 horarios* distintos\n• *3 intentos*',
  },
  {
    id: 'que-conversaciones-finalizar',
    categoria: 'Proceso comercial',
    pregunta: '¿Qué conversaciones debo finalizar?',
    claves: ['finalizar conversacion', 'cerrar chat', 'que chats finalizar', 'conversaciones debo finalizar'],
    respuesta:
      'Todos los chats que ya no requieren una nueva interacción o respuesta.\n\n' +
      'Ejemplos: *ATC*, *Fuera de cobertura*, *Zonas peligrosas*, *Innegociables*, etc.',
  },
  {
    id: 'regularizacion',
    categoria: 'Proceso comercial',
    pregunta: '¿Qué significa la regularización?',
    claves: ['regularizacion', 'regularizar'],
    respuesta:
      'Es la solicitud de corrección de alguna gestión realizada en el proceso de la venta.\n\n' +
      'Ejemplos: resumen incorrecto, foto de cartel ilegible, ID de negociación incorrecto, etc.',
  },
  {
    id: 'estado-preservicio',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa que el cliente esté en Preservicio?',
    claves: ['preservicio', 'pre servicio'],
    respuesta: 'Cliente que *aún no realiza el proceso de validación biométrica*.',
  },
  {
    id: 'estado-prefactible-gis',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Prefactible o GIS?',
    claves: ['prefactible', 'gis', 'significa gis', 'que es gis', 'busqueda manual de cobertura'],
    respuesta:
      'Cliente que se va a *GIS por búsqueda manual de cobertura*. Es posible que la caja más cercana supere los *250 metros*.',
  },
  {
    id: 'estado-factible-documentos',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Factible por documentos?',
    claves: ['factible por documentos'],
    respuesta: 'Cliente que da factibilidad de instalación y se deben *cargar los documentos*.',
  },
  {
    id: 'estado-factible-pago',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Factible por pago de instalación?',
    claves: ['factible por pago', 'pago de instalacion'],
    respuesta: 'Se finalizó el ingreso y el cliente *debe pagar la instalación*.',
  },
  {
    id: 'estado-preplanificado',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Preplanificado?',
    claves: ['preplanificado'],
    respuesta:
      'Cliente ya firmado que *no debe pagar instalación* (por promoción de forma de pago o por sector), o que ya pagó la instalación.\n\n' +
      'Solo está a la espera de la llamada del área técnica para coordinar fecha y hora.',
  },
  {
    id: 'estado-asignado',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Asignado?',
    claves: ['asignado'],
    respuesta: 'Ya le llamaron al cliente y *establecieron fecha y hora de instalación*.',
  },
  {
    id: 'estado-detenido',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Detenido?',
    claves: ['detenido'],
    respuesta:
      'Ocurre cuando:\n\n' +
      '• Llaman al cliente para coordinar la instalación y *no responde*\n' +
      '• Van a visitarlo y *no responde*\n' +
      '• El cliente *posterga* la instalación en la llamada de coordinación de los técnicos',
  },
  {
    id: 'estado-en-verificacion',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa En verificación?',
    claves: ['en verificacion', 'verificacion'],
    respuesta: 'Cliente *en proceso de instalación*.',
  },
  {
    id: 'estado-replanificado',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Replanificado?',
    claves: ['replanificado'],
    respuesta: 'En la visita técnica se determinó que se requiere una *obra civil* para la instalación.',
  },
  {
    id: 'estado-planificado',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa Planificado?',
    claves: ['planificado'],
    respuesta: 'Una vez finalizada la obra civil, se *planifica de nuevo* la fecha de instalación.',
  },
  {
    id: 'estado-activo',
    categoria: 'Estados del cliente',
    pregunta: '¿Qué significa que el cliente esté Activo?',
    claves: ['cliente activo', 'estado activo'],
    respuesta: 'Cliente *instalado*.',
  },
  {
    id: 'descuento-adulto-mayor',
    categoria: 'Beneficios de ley',
    pregunta: '¿Cuál es el descuento para adulto mayor?',
    claves: ['descuento adulto mayor', 'cuanto descuento adulto mayor'],
    respuesta:
      '*$10 menos* del valor fijo del plan, sin IVA.\n\n' +
      'Se recomienda entregar estos planes de *850 Mbps para arriba*.',
  },
  {
    id: 'requisitos-pyme',
    categoria: 'Requisitos',
    pregunta: '¿Qué requisitos se piden para clientes Pyme?',
    claves: ['pyme', 'requisitos pyme', 'ruc'],
    respuesta:
      '*REQUISITOS NETLIFE — PYME*\n' +
      '✅ Foto de la cédula (2 lados) del representante legal\n' +
      '✅ Teléfono celular adicional\n' +
      '✅ Correo electrónico\n' +
      '✅ Dirección exacta: calle principal y secundaria 📌\n' +
      '✅ Foto de aceptación del servicio (el cartel debe llevar nombre y número de cédula del representante legal)\n\n' +
      '*TARJETA DE CRÉDITO* (a nombre del representante legal o de la empresa)\n' +
      '✅ Banco al que pertenece la TC\n' +
      '✅ Tipo: Visa, Master, Diners, American, etc.\n\n' +
      '*CUENTA BANCARIA* (a nombre del representante legal o de la empresa)\n' +
      '✅ Banco al que pertenece la cuenta\n' +
      '✅ Tipo: ahorros o corriente\n\n' +
      '*REQUISITOS ADICIONALES*\n' +
      '✅ Foto del RUC\n' +
      '✅ Registro mercantil\n' +
      '✅ Nombramiento del representante legal',
  },
  {
    id: 'acumular-descuentos',
    categoria: 'Beneficios de ley',
    pregunta: 'Si el cliente ya tiene un descuento de ley, ¿puede aplicar a otro?',
    claves: ['otro descuento', 'acumular descuento', 'dos descuentos', 'varios planes'],
    respuesta:
      'Cualquier cliente sin deuda puede contratar la cantidad de planes que requiera.\n\n' +
      'Pero si es *adulto mayor* o tiene *discapacidad igual o mayor al 30%*, solo puede recibir el descuento de ley en *uno* de los puntos solicitados. En el resto aplican plan y promociones vigentes.',
  },
  {
    id: 'netlifeplay-canales',
    categoria: 'Producto',
    pregunta: '¿Cuántos canales tiene NetlifePlay?',
    claves: ['netlifeplay', 'netlife play', 'canales', 'cuantos canales'],
    respuesta:
      '*61 canales*: 21 nacionales y 40 internacionales.\n\nEs una plataforma de streaming de entretenimiento.',
  },
  {
    id: 'netlifeplay-dispositivos',
    categoria: 'Producto',
    pregunta: '¿En cuántos dispositivos puedo usar NetlifePlay?',
    claves: ['cuantos dispositivos', 'dispositivos netlifeplay', 'simultaneo'],
    respuesta:
      'Se puede activar hasta en *5 dispositivos*, y visualizar de forma *simultánea hasta en 2*.',
  },
  {
    id: 'nat-abierta',
    categoria: 'Producto',
    pregunta: '¿Qué significa NAT abierta?',
    claves: ['nat abierta', 'nat', 'gamer'],
    respuesta:
      'Conexión extremo a extremo: matchmaking y party *sin bloqueos*, y hosteo de partidas sin trucos (sin doble NAT).',
  },
  {
    id: 'cantones-100-descuento',
    categoria: 'Cobertura y descuentos',
    pregunta: 'Cantones con 100% de descuento en instalación (cualquier forma de pago)',
    claves: ['cantones', 'cantones con 100', 'descuento instalacion cantones'],
    respuesta:
      '24 DE MAYO, ALAUSÍ, AMBATO, ANTONIO ANTE, AZOGUES, BALSAS, BAÑOS DE AGUA SANTA, BIBLIÁN, BOLÍVAR, CALVAS, CAÑAR, CELICA, CEVALLOS, CHAGUARPAMBA, CHAMBO, CHIMBO, CHONE, CHUNCHI, COLTA, CORONEL MARCELINO MARIDUEÑA, COTACACHI, CUENCA, DAULE, DURÁN, EL TAMBO, GUAMOTE, GUANO, GUARANDA, IBARRA, JIPIJAPA, LA LIBERTAD, LA TRONCAL, LATACUNGA, LOGROÑO, LOJA, MACHALA, MANTA, MARCABELÍ, MERA, MILAGRO, MOCHA, MONTÚFAR, NABÓN, OÑA, OTAVALO, PASTAZA, PATATE, PIÑAS, PORTOVELO, PORTOVIEJO, PUYANGO, QUERO, QUINSALOMA, RIOBAMBA, ROCAFUERTE, RUMIÑAHUI, SALCEDO, SALINAS, SAMBORONDÓN, SAN FERNANDO, SAN MIGUEL, SAN MIGUEL DE URCUQUÍ, SAN PEDRO DE PELILEO, SANTA ANA, SANTA ELENA, SARAGURO, SUSCAL, TENA, TULCÁN, VINCES, ZARUMA.',
  },
  {
    id: 'parroquias-quito-100-descuento',
    categoria: 'Cobertura y descuentos',
    pregunta: 'Parroquias de Quito con 100% de descuento en instalación (cualquier forma de pago)',
    claves: ['parroquias', 'quito', 'parroquias de quito'],
    respuesta:
      'IÑAQUITO, CALDERÓN (CARAPUNGO), CONOCOTO, CARCELÉN, CUMBAYÁ, SAN JUAN, BELISARIO QUEVEDO, COTOCOLLAO, TUMBACO, MARISCAL SUCRE, SAN ISIDRO DEL INCA, RUMIPAMBA, KENNEDY, JIPIJAPA, PUENGASÍ, PONCEANO, COCHAPAMBA, LA CONCEPCIÓN, LA MAGDALENA, POMASQUI, ITCHIMBÍA, SAN ANTONIO, NAYÓN, ALANGASÍ, LA FLORESTA, AMAGUAÑA, SANGOLQUÍ, PUEMBO, ZÁMBIZA, GUANGOPOLO, LA MERCED.',
  },
  {
    id: 'zonas-guayaquil-100-descuento',
    categoria: 'Cobertura y descuentos',
    pregunta: 'Zonas de Guayaquil con 100% de descuento (pago con cuenta de ahorro o corriente)',
    claves: ['guayaquil', 'zonas de guayaquil'],
    respuesta:
      'SAUCES, ALBORADA, SAMANES, FLORIDA NORTE, FLORIDA, CEIBOS, KENNEDY, URDESA CENTRAL, BELLAVISTA, GARZOTA, ATARAZANA, URDENOR, KENNEDY NORTE, URDESA NORTE, ACUARELAS DEL RÍO, GUAYACANES, URBANOR, JARDINES DEL SALADO, CEIBOS NORTE, MIRAFLORES, LOMAS DE URDESA, LA FAE, COLINAS DE LOS CEIBOS, SANTA CECILIA, FERROVIARIA, KENNEDY VIEJA, VERNAZA NORTE, CDLA. GIRASOLES, LAS CUMBRES, CDLA. EL PARAÍSO, ADACE, NUEVA KENNEDY, LOS OLIVOS 1-2-3, CENTRO, CHONGÓN, PUERTO AZUL, PUERTA AL SOL, VALLE ALTO, VÍA AL SOL, LOS OLIVOS, CENTENARIO, LAS ACACIAS, PRADERA, LOS ALMENDROS.',
  },
  {
    id: 'descuento-por-forma-de-pago',
    categoria: 'Cobertura y descuentos',
    pregunta: '¿Cuánto descuento de instalación aplica según la forma de pago?',
    claves: ['forma de pago', 'descuento instalacion', 'cuanto cuesta la instalacion', 'valor instalacion'],
    respuesta:
      'En el resto de cantones, parroquias y zonas aplica el descuento según la forma de pago:\n\n' +
      '• *Tarjeta de crédito:* 100% de descuento\n' +
      '• *Cuenta bancaria* (ahorro o corriente): 97% → paga $5\n' +
      '• *Efectivo:* 94% → paga $10.01',
  },
];

// Fichas ya normalizadas una sola vez al cargar el modulo.
const INDICE = FAQ.map((f) => ({
  ...f,
  _claves: f.claves.map(norm),
  _pregunta: norm(f.pregunta),
}));

// Puntaje: una clave suma sus caracteres cuando TODAS sus palabras estan en la
// pregunta, no necesariamente pegadas ni en orden — asi "requisitos para pyme"
// tambien encuentra la clave "requisitos pyme", que es como se pregunta de
// verdad. Las claves largas pesan mas que las cortas, y eso es lo que evita que
// una palabra suelta ("pago", "activo") secuestre la respuesta.
const UMBRAL = parseInt(process.env.ASISTENTE_FAQ_UMBRAL || '4', 10);

// ¿Estan todas las palabras de la clave dentro de la pregunta?
function claveCalza(q, clave) {
  if (q.includes(clave)) return true;                    // frase literal
  const palabras = clave.split(' ').filter(Boolean);
  if (palabras.length < 2) return false;                 // una sola palabra: ya se probo arriba
  return palabras.every((w) => q.includes(w));
}

function buscarFaq(pregunta) {
  const q = norm(pregunta);
  if (!q) return null;

  let mejor = null;
  let mejorPuntaje = 0;

  for (const ficha of INDICE) {
    let puntaje = 0;
    for (const clave of ficha._claves) {
      if (claveCalza(q, clave)) puntaje += clave.length;
    }
    // La pregunta escrita casi igual que la ficha es la senal mas fuerte.
    if (ficha._pregunta && q.includes(ficha._pregunta)) puntaje += 50;
    if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = ficha; }
  }

  if (!mejor || mejorPuntaje < UMBRAL) return null;   // mejor callar que inventar
  return { id: mejor.id, categoria: mejor.categoria, pregunta: mejor.pregunta, respuesta: mejor.respuesta };
}

/**
 * Fichas mas parecidas a la pregunta, ordenadas por puntaje y SIN exigir el
 * umbral. Sirven de contexto para la IA: aunque ninguna calce lo bastante para
 * responder sola, el modelo puede redactar con ellas en la mano en vez de
 * inventar. Es la diferencia entre un buscador y un asistente: si preguntan
 * "un cliente en silla de ruedas que necesita", ninguna clave calza exacto pero
 * la ficha de discapacidad es justo lo que hay que leer.
 */
function fichasRelevantes(pregunta, n = 3) {
  const q = norm(pregunta);
  if (!q) return [];
  return INDICE
    .map((f) => {
      let puntaje = 0;
      for (const clave of f._claves) if (claveCalza(q, clave)) puntaje += clave.length;
      return { ficha: f, puntaje };
    })
    .filter((x) => x.puntaje > 0)
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, n)
    .map(({ ficha }) => ({ pregunta: ficha.pregunta, respuesta: ficha.respuesta, categoria: ficha.categoria }));
}

// Listado para el panel de "Preguntas frecuentes" del asistente.
const listarFaq = () =>
  FAQ.map(({ id, categoria, pregunta, respuesta }) => ({ id, categoria, pregunta, respuesta }));

module.exports = { buscarFaq, fichasRelevantes, listarFaq, FAQ, norm };
