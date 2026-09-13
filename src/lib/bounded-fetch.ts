export function createBoundedFetch(transport: typeof fetch, timeoutMs = 15000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstream = init?.signal;
    const abort = () => controller.abort();
    if (upstream?.aborted) abort();
    else upstream?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      return await transport(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener('abort', abort);
    }
  };
}
