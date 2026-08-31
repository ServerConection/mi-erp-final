export function crearBaseApiNexo(apiUrl) {
  const base = String(apiUrl || '').replace(/\/+$/, '');
  return `${base}/api/nexo-ia`;
}

export async function leerJsonNexo(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('El servidor no devolvió datos válidos de NEXO IA.');
  }

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'No se pudo completar la solicitud de NEXO IA.');
  }
  return payload.data;
}
