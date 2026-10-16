import test from 'node:test';
import assert from 'node:assert/strict';
import { conversacionCoincideFiltros, crearParametrosInbox } from './waInboxFilters.js';

const base = {
  id: 10,
  line_id: 7,
  status: 'active',
  contact_name: 'Cliente Uno',
  wa_number: '593999001122',
  bitrix_deal_id: '674031',
  line_name: 'Sergio Almeida',
  contact_metadata: { real_phone: '0999001122' },
};

test('combina búsqueda, línea y estado sin perder ninguno', () => {
  assert.equal(conversacionCoincideFiltros(base, { search: '674031', lineFilter: '7', filter: 'active' }), true);
  assert.equal(conversacionCoincideFiltros(base, { search: '674031', lineFilter: '8', filter: 'active' }), false);
  assert.equal(conversacionCoincideFiltros(base, { search: 'otro', lineFilter: '7', filter: 'active' }), false);
  assert.equal(conversacionCoincideFiltros(base, { search: '674031', lineFilter: '7', filter: 'closed' }), false);
});

test('reconoce filtros Activos, Humano y Cerrados', () => {
  assert.equal(conversacionCoincideFiltros({ ...base, status: 'active' }, { filter: 'active' }), true);
  assert.equal(conversacionCoincideFiltros({ ...base, status: 'human' }, { filter: 'human_takeover' }), true);
  assert.equal(conversacionCoincideFiltros({ ...base, status: 'human_takeover' }, { filter: 'human_takeover' }), true);
  assert.equal(conversacionCoincideFiltros({ ...base, status: 'closed' }, { filter: 'closed' }), true);
});

test('la consulta al backend conserva simultáneamente línea, búsqueda y estado', () => {
  const p = crearParametrosInbox({ search: '674031', lineFilter: '7', filter: 'human_takeover' });
  assert.equal(p.get('search'), '674031');
  assert.equal(p.get('line_id'), '7');
  assert.equal(p.get('status'), 'human_takeover');
  assert.equal(p.get('limit'), '500');
});

test('la búsqueda acepta nombre, teléfono real, teléfono WhatsApp e ID Bitrix', () => {
  for (const search of ['cliente uno', '0999001122', '593999001122', '674031', 'sergio']) {
    assert.equal(conversacionCoincideFiltros(base, { search }), true, search);
  }
});
