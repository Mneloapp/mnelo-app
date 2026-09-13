import type { PhoneClient } from '../phone-client';
import type { MediaJournal } from './media-journal';
import { bytesToBase64 } from './media-crypto';
import {
  MEDIA_CHUNK_BYTES,
  privateMediaDescriptor,
  type PrivateMediaDescriptor,
} from './media-schema';
import { deliveryResponse, type DeliveryCommand } from './schema';

// Each step transfers a bounded amount. The caller yields between steps so
// photo/voice transfers never occupy the entire message/control delivery loop.
export class MediaTransfer {
  private active = new Map<string, Promise<boolean>>();
  constructor(
    private readonly client: Pick<PhoneClient, 'execute'>,
    private readonly journal: MediaJournal,
  ) {}
  private async command(value: DeliveryCommand) {
    return deliveryResponse.parse((await this.client.execute(value)).delivery);
  }
  private single(key: string, work: () => Promise<boolean>) {
    const current = this.active.get(key);
    if (current) return current;
    const operation = work().finally(() => {
      if (this.active.get(key) === operation) this.active.delete(key);
    });
    this.active.set(key, operation);
    return operation;
  }
  uploadStep(id: string) {
    return this.single(`out:${id}`, async () => {
      const row = await this.journal.upload(id);
      if (!row) throw new Error('MEDIA_UNAVAILABLE');
      if (row.uploaded) return true;
      const descriptor = privateMediaDescriptor.parse(JSON.parse(row.descriptor));
      const { media } = await this.command({
        action: 'delivery-blob-begin',
        blob: descriptor.blob,
      });
      if (!media?.present || typeof media.complete !== 'boolean')
        throw new Error('DELIVERY_RESPONSE_INVALID');
      if (media.present.some((part) => part >= descriptor.blob.parts))
        throw new Error('DELIVERY_RESPONSE_INVALID');
      if (!media.complete) {
        const missing = Array.from({ length: descriptor.blob.parts }, (_, part) => part).filter(
          (part) => !media.present!.includes(part),
        );
        for (const part of missing.slice(0, 2)) {
          const chunk = row.cipher.subarray(
            part * MEDIA_CHUNK_BYTES,
            (part + 1) * MEDIA_CHUNK_BYTES,
          );
          const response = await this.command({
            action: 'delivery-blob-put',
            id,
            part,
            data: bytesToBase64(chunk),
          });
          if (!response.ok) throw new Error('DELIVERY_RESPONSE_INVALID');
        }
        if (missing.length > 2) return false;
        const response = await this.command({ action: 'delivery-blob-finish', id });
        if (!response.ok) throw new Error('DELIVERY_RESPONSE_INVALID');
      }
      await this.journal.uploaded(id);
      return true;
    });
  }
  downloadStep(sender: string, input: PrivateMediaDescriptor) {
    const descriptor = privateMediaDescriptor.parse(input);
    // The sender here comes from the authenticated Signal envelope, never the
    // claimed contact name or the attachment descriptor itself.
    if (descriptor.owner !== sender) throw new Error('MEDIA_UNAUTHORIZED');
    return this.single(`in:${sender}:${descriptor.blob.id}`, async () => {
      await this.journal.beginDownload(descriptor);
      const row = await this.journal.download(sender, descriptor.blob.id);
      if (row?.complete) return true; // Already committed to history before a crash.
      const existing = await this.journal.parts(sender, descriptor.blob.id);
      const missing = Array.from({ length: descriptor.blob.parts }, (_, part) => part).filter(
        (part) => !existing.includes(part),
      );
      for (const part of missing.slice(0, 2)) {
        const { media } = await this.command({
          action: 'delivery-blob-get',
          owner: sender,
          id: descriptor.blob.id,
          part,
        });
        if (!media?.data) throw new Error('DELIVERY_RESPONSE_INVALID');
        await this.journal.put(sender, descriptor.blob.id, part, media.data);
      }
      return missing.length <= 2;
    });
  }
  async acknowledge() {
    for (const { owner, id } of await this.journal.acknowledgements()) {
      const response = await this.command({ action: 'delivery-blob-ack', owner, id });
      if (!response.ok) throw new Error('DELIVERY_RESPONSE_INVALID');
      await this.journal.acknowledged(owner, id);
    }
  }
}
