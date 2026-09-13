import type { DeviceMessenger, ChatCursor, ChatFilter } from './engine';
import type { Chat } from './model';

// Read-only presentation. Address-book aliases never enter protocol packets,
// profile updates, group membership data or the persistent contact identity.
export class ContactView {
  constructor(
    private readonly engine: DeviceMessenger,
    private readonly names: ReadonlyMap<string, string>,
  ) {}
  private async displayNames() {
    const names = await this.engine.contactDisplayNames();
    for (const [peer, name] of this.names) names.set(peer, name);
    return names;
  }
  private title = (chat: Chat, names: ReadonlyMap<string, string>) =>
    chat.kind === 'direct' && chat.peer ? (names.get(chat.peer) ?? chat.title) : chat.title;
  async contacts() {
    const [contacts, names] = await Promise.all([this.engine.contacts(), this.displayNames()]);
    return contacts.map((c) => ({
      ...c,
      name: names.get(c.key) ?? c.name,
    }));
  }
  async chatPage(filter: ChatFilter = 'all', search = '', before?: ChatCursor) {
    const names = await this.displayNames();
    return this.engine.chatPage(filter, search, before, (chat) => this.title(chat, names));
  }
  async chats() {
    return (await this.chatPage()).rows;
  }
  async chat(id: string) {
    const [chat, names] = await Promise.all([this.engine.chat(id), this.displayNames()]);
    return chat ? { ...chat, title: this.title(chat, names) } : null;
  }
  async members(id: string) {
    const [members, names] = await Promise.all([this.engine.members(id), this.displayNames()]);
    return members.map((m) => ({
      ...m,
      name: names.get(m.key) ?? m.name,
    }));
  }
  async replyPreview(chat: string, id: string) {
    const [preview, names] = await Promise.all([
      this.engine.replyPreview(chat, id),
      this.displayNames(),
    ]);
    return preview ? { ...preview, name: names.get(preview.sender) ?? preview.name } : null;
  }
  async callHistory(before?: number) {
    const [calls, names] = await Promise.all([
      this.engine.callHistory(before),
      this.displayNames(),
    ]);
    return calls.map((c) => ({
      ...c,
      name: names.get(c.peer) ?? c.name,
    }));
  }
}
