// Eventos en tiempo real hacia el navegador (Server-Sent Events)
const clients = new Set(); // { res, agent }

function subscribe(req, res, agent) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client = { res, agent };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

// filter(agent) => boolean decide quién recibe el evento
function publish(type, data, filter = () => true) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) if (filter(c.agent)) c.res.write(msg);
}

const onlineAgents = () => [...new Set([...clients].map(c => c.agent.id))];

module.exports = { subscribe, publish, onlineAgents };
