export type MenuPoint = { x: number; y: number };
export type MenuTouch = { phase: 'move' | 'release' | 'cancel'; point: MenuPoint };
export type MenuGesture = ReturnType<typeof createMenuGesture>;
export function createMenuGesture() {
  let listener: ((touch: MenuTouch) => void) | undefined;
  return {
    update(touch: MenuTouch) {
      listener?.(touch);
    },
    listen(next: (touch: MenuTouch) => void) {
      listener = next;
      return () => {
        if (listener === next) listener = undefined;
      };
    },
  };
}
export function menuHit(
  point: MenuPoint,
  rect: { x: number; y: number; width: number; height: number },
) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

// Touch-end events can omit top-level coordinates while retaining changedTouches.
// A responder release may then follow the bubbled touch-end; both use the same final point.
export function menuTouchPoint(
  event: {
    pageX?: number;
    pageY?: number;
    changedTouches?: readonly { pageX: number; pageY: number }[];
    touches?: readonly { pageX: number; pageY: number }[];
  },
  fallback: MenuPoint = { x: -1, y: -1 },
): MenuPoint {
  for (const point of [event, event.changedTouches?.[0], event.touches?.[0]]) {
    if (point && Number.isFinite(point.pageX) && Number.isFinite(point.pageY))
      return { x: point.pageX!, y: point.pageY! };
  }
  return fallback;
}
