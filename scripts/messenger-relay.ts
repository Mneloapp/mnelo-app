import { startRelay } from '../relay/server';
const relay = startRelay(8084);
relay.server.on('listening', () =>
  process.stdout.write(
    'Mnelo transient signaling relay listening on loopback port 8084. No message storage.\n',
  ),
);
relay.server.on('error', () => {
  process.stderr.write('RELAY_UNAVAILABLE\n');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void relay.close();
  });
