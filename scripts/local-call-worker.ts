import { localContext } from '../tests/integration/local-context';
const context = localContext();
let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});
process.on('SIGTERM', () => {
  stopped = true;
});
async function run() {
  while (!stopped) {
    const { error } = await context.admin.functions.invoke('call-cleanup', { body: {} });
    if (error) process.stderr.write('CALL_CLEANUP_UNAVAILABLE\n');
    if (process.argv.includes('--once')) {
      process.exitCode = error ? 1 : 0;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}
void run().catch(() => {
  process.stderr.write('CALL_CLEANUP_UNAVAILABLE\n');
  process.exitCode = 1;
});
