import { createBoundedFetch } from '@/lib/bounded-fetch';
function abortingTransport(): typeof fetch {
  return async (_input, init) =>
    new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) reject(new Error('ABORTED'));
      else init?.signal?.addEventListener('abort', () => reject(new Error('ABORTED')));
    });
}
it('bounds a stalled transport with an abort signal', async () => {
  const bounded = createBoundedFetch(abortingTransport(), 5);
  await expect(bounded('https://example.invalid')).rejects.toThrow('ABORTED');
});
it('preserves caller cancellation', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    createBoundedFetch(abortingTransport())('https://example.invalid', {
      signal: controller.signal,
    }),
  ).rejects.toThrow('ABORTED');
});
