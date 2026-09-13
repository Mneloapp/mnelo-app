import { create } from 'zustand';
import type { Interpretation, NeedMode, Profile, Session } from '@/types/domain';
type SessionState = {
  session: Session | null;
  restored: boolean;
  phone: string;
  draft: { mode: NeedMode; interpretation: Interpretation } | null;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile) => void;
  setRestored: () => void;
  setPhone: (phone: string) => void;
  setDraft: (draft: SessionState['draft']) => void;
};
// Tokens are never kept in this UI store. Auth persistence belongs to SecureStore.
export const useSession = create<SessionState>((set) => ({
  session: null,
  restored: false,
  phone: '',
  draft: null,
  setSession: (session) => set({ session, phone: '', draft: null }),
  setProfile: (profile) =>
    set((state) => ({ session: state.session ? { ...state.session, profile } : null })),
  setRestored: () => set({ restored: true }),
  setPhone: (phone) => set({ phone }),
  setDraft: (draft) => set({ draft }),
}));
