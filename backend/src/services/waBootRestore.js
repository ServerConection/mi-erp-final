// Limit setup work and space starts so restoring many sessions does not burst.
async function restoreLines(lines, { connect, shouldStop, onError,
  concurrency = 2, delayMs = 1000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let next = 0, started = 0, failed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, lines.length) }, async () => {
    while (next < lines.length && !shouldStop()) {
      const line = lines[next++];
      try { await connect(line); started++; }
      catch (error) { failed++; onError(line, error); }
      if (next < lines.length && !shouldStop()) await sleep(delayMs);
    }
  }));
  return { started, failed };
}

module.exports = { restoreLines };
