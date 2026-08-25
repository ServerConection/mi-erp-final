const test = require('node:test');
const assert = require('node:assert/strict');

const { crearRepositorioContactabilidad } = require('../src/contactabilidad/contactabilidad.repository');

function clienteRegistrador() {
  const llamadas = [];
  return {
    llamadas,
    query: async (sql, params) => {
      llamadas.push({ sql, params });
      return { rows: [{ id: 1 }], rowCount: 1 };
    },
  };
}

test('inserta mensajes con la clave idempotente aprobada', async () => {
  const client = clienteRegistrador();
  const repository = crearRepositorioContactabilidad();
  const mensaje = {
    empresa: 'NOVONET', id_bitrix: '2525654', chat_id: '99', mensaje_externo_id: '123',
    emisor_tipo: 'CLIENTE', emisor_id: '10', emisor_nombre: 'Cliente',
    mensaje_at: new Date('2026-08-24T10:00:00Z'), etapa_id: 'ATC',
  };

  await repository.insertarMensaje(client, mensaje);

  assert.match(client.llamadas[0].sql, /ON CONFLICT \(empresa, chat_id, mensaje_externo_id\) DO NOTHING/);
  assert.match(client.llamadas[0].sql, /RETURNING id/);
  assert.deepEqual(client.llamadas[0].params.slice(0, 4), ['NOVONET', '2525654', '99', '123']);
  assert.equal(client.llamadas[0].sql.includes('2525654'), false);
});

test('actualiza el lead sin borrar contadores calculados', async () => {
  const client = clienteRegistrador();
  const repository = crearRepositorioContactabilidad();

  await repository.upsertLead(client, {
    empresa: 'VELSA', id_bitrix: '77', nombre_cliente: 'María', asesor_id: '5',
    asesor_nombre: 'Ana', origen_id: 'WEB', origen_nombre: 'Web',
    fecha_creacion: new Date('2026-08-01T10:00:00Z'), etapa_id: 'NUEVO', etapa_nombre: 'Nuevo',
  });

  assert.match(client.llamadas[0].sql, /ON CONFLICT \(empresa, id_bitrix\) DO UPDATE/);
  assert.doesNotMatch(client.llamadas[0].sql, /mensajes_cliente_total\s*=/);
  assert.equal(client.llamadas[0].params[0], 'VELSA');
});
