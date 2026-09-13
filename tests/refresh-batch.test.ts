import { createRefreshBatch } from '@/lib/refresh-batch';
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('a realtime burst coalesces and events during a fetch get a later snapshot', async () => {
  let complete!: () => void;
  const refresh = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const batch = createRefreshBatch(refresh);
  for (let i = 0; i < 100; i++) batch.request();
  await jest.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 100; i++) batch.request();
  await jest.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(1);
  complete();
  await jest.advanceTimersByTimeAsync(150);
  expect(refresh).toHaveBeenCalledTimes(2);
  complete();
  await jest.advanceTimersByTimeAsync(10000);
  expect(refresh).toHaveBeenCalledTimes(2);
  batch.dispose();
});
test('navigation cancels pending refresh and cannot schedule after disposal', async () => {
  const refresh = jest.fn(async () => undefined);
  const batch = createRefreshBatch(refresh);
  batch.request();
  batch.dispose();
  batch.request();
  await jest.advanceTimersByTimeAsync(5000);
  expect(refresh).not.toHaveBeenCalled();
});
