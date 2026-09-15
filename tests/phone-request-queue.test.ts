import { PhoneRequestQueue, phoneRequestScheduler } from '@/messenger/phone-request-queue';

test('a call queued during an upload overtakes pending bulk requests without concurrent requests or bypassing pacing', async () => {
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
  expect(starts.map((item) => item.at)).toEqual(
    Array.from({ length: 8 }, (_, index) => index * 750),
  );
});

test('a recovered backlog shares request pacing with inbox and call traffic', async () => {
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
  expect(starts.filter((time) => time < 60000)).toHaveLength(80);
  expect(starts[119]).toBe(89250);
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
