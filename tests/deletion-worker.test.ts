import {
  deleteAuthWithRetry,
  processAccountDeletion,
  type DeletionQueue,
} from '../supabase/functions/_shared/deletion';
const job = { id: 'local-job', user_id: 'local-user', lease: 'local-lease' };
function queue(): DeletionQueue {
  return {
    claim: jest.fn().mockResolvedValue(job),
    prepare: jest.fn().mockResolvedValue(true),
    objects: jest.fn().mockResolvedValue([]),
    removed: jest.fn(),
    ready: jest.fn().mockResolvedValue(true),
    defer: jest.fn(),
    finish: jest.fn(),
  };
}
test('transient Auth failures such as a wrapped 40P01 retry only three times', async () => {
  const remove = jest.fn().mockResolvedValue('retry'),
    wait = jest.fn();
  await expect(deleteAuthWithRetry(remove, wait)).rejects.toThrow('DELETION_RETRY_REQUIRED');
  expect(remove).toHaveBeenCalledTimes(3);
  expect(wait.mock.calls.map((c) => c[0])).toEqual([250, 750]);
});
test('an uncertain successful deletion can be retried idempotently when Auth reports missing', async () => {
  const remove = jest.fn().mockResolvedValueOnce('retry').mockResolvedValueOnce('missing');
  await expect(deleteAuthWithRetry(remove, jest.fn())).resolves.toBeUndefined();
  expect(remove).toHaveBeenCalledTimes(2);
});
test('permanent authorization failure is never treated as account deletion', async () => {
  const remove = jest.fn().mockResolvedValue('failed');
  await expect(deleteAuthWithRetry(remove, jest.fn())).rejects.toThrow();
  expect(remove).toHaveBeenCalledTimes(1);
});
test('storage failure preserves the Auth account and records retry, never completion', async () => {
  const q = queue();
  jest
    .mocked(q.objects)
    .mockResolvedValue([{ id: 'file', bucket: 'avatars', object_path: 'local-user/image' }]);
  const auth = { remove: jest.fn() },
    storage = { remove: jest.fn().mockRejectedValue(new Error('offline')) };
  await expect(processAccountDeletion(q, storage, auth)).rejects.toThrow('DELETION_RETRY_REQUIRED');
  expect(auth.remove).not.toHaveBeenCalled();
  expect(q.removed).not.toHaveBeenCalled();
  expect(q.finish).toHaveBeenCalledWith(job, false);
});
test('unsettled uploads or outstanding call eviction defer without deleting Auth', async () => {
  const q = queue();
  jest.mocked(q.ready).mockResolvedValue(false);
  const auth = { remove: jest.fn() };
  await expect(processAccountDeletion(q, { remove: jest.fn() }, auth)).resolves.toBe('processing');
  expect(q.defer).toHaveBeenCalledWith(job);
  expect(q.finish).not.toHaveBeenCalled();
  expect(auth.remove).not.toHaveBeenCalled();
});
test('completion follows acknowledged private-file cleanup and confirmed Auth deletion', async () => {
  const q = queue();
  jest
    .mocked(q.objects)
    .mockResolvedValueOnce([{ id: 'file', bucket: 'chat-media', object_path: 'local-user/file' }])
    .mockResolvedValue([]);
  const removed: string[] = [];
  const storage = {
    remove: jest.fn(async () => {
      removed.push('storage');
    }),
  };
  const auth = {
    remove: jest.fn(async () => {
      expect(removed).toEqual(['storage']);
      return 'deleted' as const;
    }),
  };
  await expect(processAccountDeletion(q, storage, auth)).resolves.toBe('deleted');
  expect(q.removed).toHaveBeenCalledWith(job, ['file']);
  expect(q.finish).toHaveBeenCalledWith(job, true);
});
