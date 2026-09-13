import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedBody, response } from '../../supabase/functions/_shared/http';
function streaming(body: ReadableStream<Uint8Array>) {
  return new Request('http://127.0.0.1/development-fixture', {
    method: 'POST',
    body,
    duplex: 'half',
  } as RequestInit);
}
test('an unfinished request expires even if the sender stalls cancellation', async () => {
  let cancelled = false;
  const request = streaming(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
        return new Promise(() => undefined);
      },
    }),
  );
  await assert.rejects(boundedBody(request, 10, 30), /REQUEST_TIMEOUT/);
  assert.equal(cancelled, true);
});
test('chunked input cannot bypass the size limit without a content-length header', async () => {
  const request = streaming(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
        controller.close();
      },
    }),
  );
  await assert.rejects(boundedBody(request, 10), /INVALID/);
});
test('bounded input is preserved exactly and private errors cannot be cached', async () => {
  const bytes = new TextEncoder().encode('Development input');
  assert.deepEqual(
    await boundedBody(new Request('http://127.0.0.1/fixture', { method: 'POST', body: bytes }), 40),
    bytes,
  );
  assert.equal(response('FORBIDDEN', 403).headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response('FORBIDDEN', 403).json(), { code: 'FORBIDDEN' });
});
