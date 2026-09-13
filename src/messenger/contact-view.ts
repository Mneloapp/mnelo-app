import type { DeviceMessenger, ChatCursor, ChatFilter } from './engine';
import type { Chat } from './model';

// Read-only presentation. Address-book aliases never enter protocol packets,
// profile updates, group membership data or the persistent contact identity.
export class ContactView {
  constructor(
    private readonly engine: DeviceMessenger,
    private readonly names: ReadonlyMap<string, string>,
  ) {}
  private title = (chat: Chat) =>
    chat.kind === 'direct' && chat.peer ? (this.names.get(chat.peer) ?? chat.title) : chat.title;
  async contacts() {
    return (await this.engine.contacts()).map((c) => ({
      ...c,
      name: this.names.get(c.key) ?? c.name,
    }));
  }
  chatPage(filter: ChatFilter = 'all', search = '', before?: ChatCursor) {
    return this.engine.chatPage(filter, search, before, this.title);
  }
  async chats() {
    return (await this.chatPage()).rows;
  }
  async chat(id: string) {
    const chat = await this.engine.chat(id);
    return chat ? { ...chat, title: this.title(chat) } : null;
  }
  async members(id: string) {
    return (await this.engine.members(id)).map((m) => ({
      ...m,
      name: this.names.get(m.key) ?? m.name,
    }));
  }
  async replyPreview(chat: string, id: string) {
    const preview = await this.engine.replyPreview(chat, id);
    return preview ? { ...preview, name: this.names.get(preview.sender) ?? preview.name } : null;
  }
  async callHistory(before?: number) {
    return (await this.engine.callHistory(before)).map((c) => ({
      ...c,
      name: this.names.get(c.peer) ?? c.name,
    }));
  }
}
