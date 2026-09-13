export type DeletionJob = { id: string; user_id: string; lease: string };
export type DeletionObject = { id: string; bucket: 'avatars' | 'chat-media'; object_path: string };
export interface DeletionQueue {
  claim(): Promise<DeletionJob | null>;
  prepare(job: DeletionJob): Promise<boolean>;
  objects(job: DeletionJob): Promise<DeletionObject[]>;
  removed(job: DeletionJob, ids: string[]): Promise<void>;
  ready(job: DeletionJob): Promise<boolean>;
  defer(job: DeletionJob): Promise<void>;
  finish(job: DeletionJob, complete: boolean): Promise<void>;
}
export type DeleteOutcome = 'deleted' | 'missing' | 'retry' | 'failed';
export async function deleteAuthWithRetry(
  remove: () => Promise<DeleteOutcome>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await remove();
    if (result === 'deleted' || result === 'missing') return;
    if (result === 'failed' || attempt === 2) throw new Error('DELETION_RETRY_REQUIRED');
    await wait(attempt === 0 ? 250 : 750);
  }
}
export async function processAccountDeletion(
  queue: DeletionQueue,
  storage: { remove(bucket: DeletionObject['bucket'], paths: string[]): Promise<void> },
  auth: { remove(actor: string): Promise<DeleteOutcome> },
) {
  const job = await queue.claim();
  if (!job) return 'idle' as const;
  const started = Date.now();
  try {
    if (!(await queue.prepare(job))) {
      await queue.defer(job);
      return 'processing' as const;
    }
    for (let batch = 0; batch < 10 && Date.now() - started < 60000; batch++) {
      const objects = await queue.objects(job);
      if (!objects.length) break;
      for (const bucket of ['avatars', 'chat-media'] as const) {
        const items = objects.filter((o) => o.bucket === bucket);
        if (!items.length) continue;
        await storage.remove(
          bucket,
          items.map((o) => o.object_path),
        );
        await queue.removed(
          job,
          items.map((o) => o.id),
        );
      }
    }
    // Rescan after removals; still-pending uploads or call eviction keep the account alive.
    if (!(await queue.prepare(job)) || !(await queue.ready(job))) {
      await queue.defer(job);
      return 'processing' as const;
    }
    await deleteAuthWithRetry(() => auth.remove(job.user_id));
    await queue.finish(job, true);
    return 'deleted' as const;
  } catch {
    await queue.finish(job, false);
    throw new Error('DELETION_RETRY_REQUIRED');
  }
}
