import { PhoneRequestQueue, phoneRequestScheduler } from '@/messenger/phone-request-queue';

test('a call queued during an upload overtakes bulk work and an idle handshake has no artificial delay', async () => {
  let clock = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = new PhoneRequestQueue(
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  const starts: { label: string; at: number }[] = [];
  const first = queue.run(async () => {
    starts.push({ label: 'in-flight', at: clock });
    await gate;
  });
  const bulk = Array.from({ length: 6 }, (_, index) =>
    queue.run(async () => {
      starts.push({ label: 'bulk-' + index, at: clock });
    }),
  );
  const call = queue.run(async () => {
    starts.push({ label: 'call-answer', at: clock });
  }, true);
  release();
  await Promise.all([first, ...bulk, call]);
  expect(starts.map((item) => item.label)).toEqual([
    'in-flight',
    'call-answer',
    ...Array.from({ length: 6 }, (_, index) => 'bulk-' + index),
  ]);
  expect(starts.map((item) => item.at)).toEqual(Array(8).fill(0));
});

test('a recovered backlog stays below the server budget, preserving four urgent tokens', async () => {
  let clock = 0;
  const queue = new PhoneRequestQueue(
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  const starts: number[] = [];
  let running = 0;
  await Promise.all(
    Array.from({ length: 120 }, () =>
      queue.run(async () => {
        expect(running++).toBe(0);
        starts.push(clock);
        await Promise.resolve();
        running--;
      }),
    ),
  );
  expect(starts.filter((time) => time < 60000)).toHaveLength(91);
  expect(starts[119]).toBeGreaterThanOrEqual(83333);
  expect(starts[119]).toBeLessThan(83434);
  const urgent: number[] = [];
  await Promise.all(
    Array.from({ length: 4 }, () =>
      queue.run(async () => {
        urgent.push(clock);
      }, true),
    ),
  );
  expect(urgent).toEqual(Array(4).fill(starts[119]));
});

test('a rate rejection pauses queued retries and does not poison later requests', async () => {
  let clock = 0;
  const queue = new PhoneRequestQueue(
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  await expect(
    queue.run(async () => {
      throw new Error('PHONE_RATE_LIMITED');
    }),
  ).rejects.toThrow('PHONE_RATE_LIMITED');
  await expect(queue.run(async () => clock)).resolves.toBe(60000);
  expect(phoneRequestScheduler('https://identity.example', 'a')).toBe(
    phoneRequestScheduler('https://identity.example', 'a'),
  );
  expect(phoneRequestScheduler('https://identity.example', 'b')).not.toBe(
    phoneRequestScheduler('https://identity.example', 'a'),
  );
});

test('an incoming call wakes a bulk-budget wait immediately and cancels its timer', async () => {
  jest.useFakeTimers();
  try {
    const queue = new PhoneRequestQueue();
    for (let i = 0; i < 20; i++) await queue.run(async () => undefined);
    let bulkFinished = false;
    const bulk = queue.run(async () => {
      bulkFinished = true;
    });
    await Promise.resolve();
    expect(bulkFinished).toBe(false);
    await queue.run(async () => expect(bulkFinished).toBe(false), true);
    await jest.advanceTimersByTimeAsync(1667);
    await bulk;
    expect(bulkFinished).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('even an all-urgent backlog cannot exceed 96 starts in a rolling minute', async () => {
  let clock = 0;
  const queue = new PhoneRequestQueue(
    () => clock,
    async (ms) => {
      clock += ms;
    },
  );
  const starts: number[] = [];
  await Promise.all(
    Array.from({ length: 200 }, () =>
      queue.run(async () => {
        starts.push(clock);
      }, true),
    ),
  );
  for (const start of starts)
    expect(
      starts.filter((time) => time >= start && time < start + 60000).length,
    ).toBeLessThanOrEqual(96);
});
