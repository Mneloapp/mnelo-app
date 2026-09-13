// Coalesce a burst without cancelling an in-flight snapshot. Events during a fetch
// schedule one more snapshot, so batching cannot lose a late database update.
export function createRefreshBatch(refresh: () => Promise<unknown>, delay = 150) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false,
    dirty = false,
    disposed = false;
  const schedule = () => {
    if (disposed || running || timer || !dirty) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (disposed) return;
      dirty = false;
      running = true;
      void refresh()
        .catch(() => undefined)
        .finally(() => {
          running = false;
          schedule();
        });
    }, delay);
  };
  return {
    request() {
      dirty = true;
      schedule();
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
