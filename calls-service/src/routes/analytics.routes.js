// Analítica comercial: contactabilidad, productividad, conversión y costo
const router = require('express').Router();
const { q, getSetting } = require('../db');
const { buildFilters } = require('./calls.routes');
const hub = require('../hub');

router.get('/', async (req, res) => {
  const { where, p } = buildFilters(req);
  const outcomes = (await getSetting('outcomes')) || [];
  const positive = outcomes.filter(o => o.positive).map(o => o.key);
  const pp = [...p, positive];
  const posIdx = `$${pp.length}`;

  const base = `FROM calls_log c ${where}`;
  const metrics = `
    count(*)::int AS calls,
    count(*) FILTER (WHERE c.direction='outbound')::int AS outbound,
    count(*) FILTER (WHERE c.direction='inbound')::int AS inbound,
    count(*) FILTER (WHERE c.connected_at IS NOT NULL)::int AS answered,
    count(*) FILTER (WHERE c.direction='outbound' AND c.connected_at IS NOT NULL)::int AS outbound_answered,
    count(*) FILTER (WHERE c.direction='inbound' AND c.connected_at IS NULL)::int AS inbound_missed,
    count(*) FILTER (WHERE c.status='failed')::int AS failed,
    COALESCE(sum(c.duration_sec),0)::int AS talk_sec,
    COALESCE(round(avg(c.duration_sec) FILTER (WHERE c.connected_at IS NOT NULL)),0)::int AS avg_sec,
    COALESCE(sum(c.pulses),0)::int AS pulses,
    COALESCE(sum(c.cost),0)::float AS cost,
    count(*) FILTER (WHERE c.outcome='venta')::int AS sales,
    count(*) FILTER (WHERE c.outcome = ANY(${posIdx}))::int AS positive,
    count(*) FILTER (WHERE c.connected_at IS NOT NULL AND c.outcome IS NULL)::int AS untyped,
    count(DISTINCT c.phone)::int AS unique_phones`;

  const [tot, byAgent, byHour, byDay, byOutcome] = await Promise.all([
    q(`SELECT ${metrics} ${base}`, pp),
    q(`SELECT c.agent_id, COALESCE(max(c.agent_name),'Sin asignar') AS agent, ${metrics} ${base} GROUP BY 1 ORDER BY sales DESC, answered DESC`, pp),
    q(`SELECT extract(hour FROM c.started_at)::int AS hour, count(*)::int AS calls,
              count(*) FILTER (WHERE c.connected_at IS NOT NULL)::int AS answered,
              count(*) FILTER (WHERE c.outcome='venta')::int AS sales
       ${base} GROUP BY 1 ORDER BY 1`, p),
    q(`SELECT to_char(c.started_at,'YYYY-MM-DD') AS day, count(*)::int AS calls,
              count(*) FILTER (WHERE c.connected_at IS NOT NULL)::int AS answered,
              count(*) FILTER (WHERE c.outcome='venta')::int AS sales,
              COALESCE(sum(c.cost),0)::float AS cost
       ${base} GROUP BY 1 ORDER BY 1`, p),
    q(`SELECT COALESCE(c.outcome,'sin_tipificar') AS outcome, count(*)::int AS n ${base} GROUP BY 1 ORDER BY 2 DESC`, p),
  ]);

  res.json({
    totals: tot.rows[0],
    by_agent: byAgent.rows,
    by_hour: byHour.rows,
    by_day: byDay.rows,
    by_outcome: byOutcome.rows,
    outcomes,
    online_agents: hub.onlineAgents().length,
  });
});

module.exports = router;
