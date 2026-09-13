const listeners = new Set<() => void>();
export function phonebookChanged() {
  for (const listener of listeners) listener();
}
export function observePhonebook(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
