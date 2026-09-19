import type { DeviceMessenger, ChatCursor, ChatFilter } from './engine';
import type { Chat } from './model';
import { sharedContactText } from './contact-share';

// Read-only presentation. Address-book aliases never enter protocol packets,
// profile updates, group membership data or the persistent contact identity.
export class ContactView {
  constructor(
    private readonly engine: DeviceMessenger,
    private readonly names:
      ReadonlyMap<string, string> | (() => Promise<ReadonlyMap<string, string>>),
  ) {}
  private async displayNames() {
    const [names, phoneNames] = await Promise.all([
      this.engine.contactDisplayNames(),
      typeof this.names === 'function' ? this.names() : this.names,
    ]);
    for (const [peer, name] of phoneNames) names.set(peer, name);
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
    const page = await this.engine.chatPage(filter, search, before, (chat) =>
      this.title(chat, names),
    );
    if (!page.rows.some((chat) => chat.previewKind === 'contact')) return page;
    const contacts = await this.contacts();
    return {
      ...page,
      rows: page.rows.map((chat) =>
        chat.previewKind === 'contact'
          ? { ...chat, preview: sharedContactText(chat.preview, contacts) }
          : chat,
      ),
    };
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
    if (!preview) return null;
    return {
      ...preview,
      name: names.get(preview.sender) ?? preview.name,
      ...(preview.kind === 'contact'
        ? { body: sharedContactText(preview.body, await this.contacts()) }
        : {}),
    };
  }
  async callHistory(before?: number) {
    const [calls, names] = await Promise.all([
      this.engine.callHistory(before),
      this.displayNames(),
    ]);
    return calls.map((c) => ({
      ...c,
      name: c.group ? c.name : (names.get(c.peer) ?? c.name),
    }));
  }
  async messageInfo(chat: string, id: string) {
    const [info, names] = await Promise.all([
      this.engine.messageInfo(chat, id),
      this.displayNames(),
    ]);
    return info
      ? {
          ...info,
          recipients: info.recipients.map((recipient) => ({
            ...recipient,
            name: names.get(recipient.peer) ?? recipient.name,
          })),
        }
      : null;
  }
}
