import { create } from 'zustand';
// Only presentation state. The private receipt is held in the SecureStore-backed repository.
export const useDeletionState = create<{
  pending: boolean;
  setPending: (pending: boolean) => void;
}>((set) => ({ pending: false, setPending: (pending) => set({ pending }) }));
