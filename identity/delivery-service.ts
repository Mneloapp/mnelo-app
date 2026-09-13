import { deliveryCommand, type DeliveryResponse } from '../src/messenger/delivery/schema';
import type { DeliveryStore } from './delivery-store';
import type { SignalDirectory } from './signal-directory';
import type { MediaStore } from './media-store';
import { mediaCommand } from '../src/messenger/delivery/media-schema';

// The PhoneService authenticates a one-use signed challenge and verified phone
// registration before entering here. No caller-supplied sender/owner is accepted.
export class DeliveryService {
  onAccepted: ((sender: string, recipient: string) => void) | undefined;
  constructor(
    readonly store: DeliveryStore,
    readonly directory: SignalDirectory,
    readonly media?: MediaStore,
  ) {}
  execute(actor: string, input: unknown): DeliveryResponse {
    const command = deliveryCommand.parse(input);
    if (command.action.startsWith('delivery-blob-')) {
      if (!this.media) throw new Error('MEDIA_UNAVAILABLE');
      if (!this.directory.identity(actor)) throw new Error('SIGNAL_REGISTRATION_REQUIRED');
      const value = mediaCommand.parse(command);
      switch (value.action) {
        case 'delivery-blob-begin':
          return { version: 2, media: this.media.begin(actor, value.blob) };
        case 'delivery-blob-put':
          this.media.put(actor, value.id, value.part, value.data);
          return { version: 2, ok: true };
        case 'delivery-blob-finish':
          this.media.finish(actor, value.id);
          return { version: 2, ok: true };
        case 'delivery-blob-get':
          return {
            version: 2,
            media: { data: this.media.get(actor, value.owner, value.id, value.part) },
          };
        case 'delivery-blob-ack':
          this.media.acknowledge(actor, value.owner, value.id);
          return { version: 2, ok: true };
      }
    }
    switch (command.action) {
      case 'delivery-status':
        return { version: 2, availableKeys: this.directory.count(actor) };
      case 'delivery-publish':
        return {
          version: 2,
          availableKeys: this.directory.publish(actor, command.keys, command.signature),
        };
      case 'delivery-identity':
        return {
          version: 2,
          identity: this.store.allowed(actor, command.peer)
            ? this.directory.identity(command.peer)
            : null,
        };
      case 'delivery-keys':
        // Require sender support before leasing somebody else's finite one-time key.
        if (!this.directory.identity(actor)) throw new Error('SIGNAL_REGISTRATION_REQUIRED');
        return {
          version: 2,
          keys: this.store.allowed(actor, command.peer)
            ? this.directory.take(command.peer, {
                actor,
                request: command.request,
                now: Date.now(),
              })
            : null,
        };
      case 'delivery-submit': {
        if (!this.directory.identity(actor) || !this.directory.identity(command.envelope.recipient))
          throw new Error('DELIVERY_UNAVAILABLE');
        const accepted = this.store.submit(actor, command.envelope);
        // Immediate online hint only after the durable commit. Reconnect/poll
        // still finds the envelope if this ephemeral hint is lost.
        this.onAccepted?.(actor, command.envelope.recipient);
        return { version: 2, accepted };
      }
      case 'delivery-inbox':
        return { version: 2, inbox: this.store.fetch(actor, command.after) };
      case 'delivery-ack':
        this.store.acknowledge(actor, command.sender, command.id);
        return { version: 2, ok: true };
      case 'delivery-block':
        this.store.block(actor, command.peer, command.blocked);
        if (command.blocked) this.media?.block(actor, command.peer);
        return { version: 2, ok: true };
      default:
        throw new Error('DELIVERY_REQUEST_INVALID');
    }
  }
  unlink(actor: string) {
    this.store.unlink(actor);
    this.directory.unlink(actor);
    this.media?.unlink(actor);
  }
  close() {
    this.store.close();
    this.directory.close();
    this.media?.close();
  }
}
