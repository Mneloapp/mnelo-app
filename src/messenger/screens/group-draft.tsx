import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import type { Contact } from '../model';
import { emptyGroupProfile, type GroupProfile } from '../group-profile';

export type GroupDraft = { members: Contact[]; name: string; profile: GroupProfile };
const Context = createContext<{
  draft: GroupDraft;
  update: (patch: Partial<GroupDraft>) => void;
} | null>(null);
export function GroupDraftProvider({ children }: PropsWithChildren) {
  const [draft, setDraft] = useState<GroupDraft>(() => ({
    members: [],
    name: '',
    profile: emptyGroupProfile(),
  }));
  return (
    <Context value={{ draft, update: (patch) => setDraft((value) => ({ ...value, ...patch })) }}>
      {children}
    </Context>
  );
}
export function useGroupDraft() {
  const value = useContext(Context);
  if (!value) throw new Error('GROUP_DRAFT_REQUIRED');
  return value;
}
