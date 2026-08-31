const test = require('node:test');
const assert = require('node:assert/strict');
const { construirPrompt, parsearSalida } = require('../src/nexoIa/nexoIa.prompt');
const { crearCola } = require('../src/nexoIa/nexoIa.queue');

test('el prompt delimita documentos como datos no confiables y exige salida estructurada', () => {
  const texto = construirPrompt({ config:{prompt_negocio:'Vende con empatia',personalidad:'Directa',longitud_maxima:500,usar_emojis:false}, lead:{empresa:'NOVONET',etapa_nombre:'DESCARTE'}, conversacion:[{emisor_tipo:'CLIENTE',texto:'Cuanto cuesta?'}], documentos:['PLAN 100: $20'], tipo:'RESPUESTA_AL_CLIENTE' });
  assert.match(texto, /FUENTE NO CONFIABLE/);
  assert.match(texto, /No inventes/);
  assert.match(texto, /respuesta_sugerida/);
});

test('parsea JSON aun si el proveedor lo envuelve en markdown', () => {
  const salida = parsearSalida('```json\n{"diagnostico":"precio","respuesta_sugerida":"Hola","tecnica_aplicada":"pregunta","siguiente_accion":"responder","alertas":[]}\n```');
  assert.equal(salida.respuesta_sugerida, 'Hola');
});

test('la cola deduplica y reclama tiempo real antes que historico', async () => {
  const memoria=[]; const cola=crearCola({ insertar: async j => { if(memoria.some(x=>x.clave===j.clave)) return null; memoria.push({...j,id:memoria.length+1}); return memoria.at(-1); }, reclamar: async()=>memoria.sort((a,b)=>b.prioridad-a.prioridad).shift() });
  await cola.encolar({empresa:'NOVONET',id_bitrix:'1',mensaje_disparador_id:'m1',tipo:'AUDITORIA_HISTORICA',config_version:1});
  await cola.encolar({empresa:'NOVONET',id_bitrix:'2',mensaje_disparador_id:'m2',tipo:'RESPUESTA_AL_CLIENTE',config_version:1});
  assert.equal((await cola.siguiente()).id_bitrix, '2');
});
