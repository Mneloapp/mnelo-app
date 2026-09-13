export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
export function response(code: string, status: number) {
  return Response.json({ code }, { status, headers: cors });
}
export async function boundedBody(
  request: Request,
  limit: number,
  timeoutMs = 30000,
): Promise<Uint8Array> {
  if (!request.body || Number(request.headers.get('content-length')) > limit)
    throw new Error('INVALID');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), timeoutMs);
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('INVALID');
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    // Cancellation of a malicious/failed stream can itself stall. Never await it unboundedly.
    void reader.cancel().catch(() => undefined);
  }
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
