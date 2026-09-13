import type { DeviceMessenger } from './engine';
import type { ContactView } from './contact-view';
import type { NativeConversationSuggestions } from './share-native';
import { avatarUri } from './profile-avatar';

// Only real send/receive events donate; opening a screen never manufactures activity.
// Serialize donations and removals so a pending donation cannot undo a history clear.
let suggestionQueue = Promise.resolve();

export function observeConversationSuggestions(
  engine: DeviceMessenger,
  view: ContactView,
  native: NativeConversationSuggestions,
) {
  let alive = true;
  const unsubscribe = engine.subscribeConversationActivity((event) => {
    suggestionQueue = suggestionQueue
      .then(async () => {
        if (event.type === 'forget') {
          await native.forgetConversation(event.chat);
          return;
        }
        if (!alive) return;
        const [chat, members, contacts] = await Promise.all([
          view.chat(event.chat),
          view.members(event.chat),
          view.contacts(),
        ]);
        const own = engine.currentIdentity();
        if (
          !own ||
          !chat ||
          chat.left_group ||
          members.length < 2 ||
          !members.some((member) => member.key === own.key) ||
          members.some((member) =>
            contacts.some((contact) => contact.key === member.key && contact.blocked),
          )
        )
          return;
        const profile =
          chat.kind === 'direct' && chat.peer ? await engine.contactProfile(chat.peer) : null;
        if (alive)
          await native.donateConversation(
            chat.id,
            chat.title,
            avatarUri(profile?.avatar ?? '') ?? null,
            event.outgoing,
          );
      })
      .catch(() => undefined);
  });
  return () => {
    alive = false;
    unsubscribe();
  };
}
