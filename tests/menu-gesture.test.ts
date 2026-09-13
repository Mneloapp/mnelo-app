import { menuHit, menuTouchPoint } from '@/messenger/menu-gesture';
test('native touch-end coordinates select the last touched row even without top-level coordinates', () => {
  const target = { x: 100, y: 300, width: 240, height: 48 };
  const previous = { x: 130, y: 280 };
  const end = menuTouchPoint({ changedTouches: [{ pageX: 140, pageY: 320 }] }, previous);
  expect(menuHit(end, target)).toBe(true);
  expect(menuHit(menuTouchPoint({}, end), target)).toBe(true);
  expect(menuHit(menuTouchPoint({ changedTouches: [{ pageX: 20, pageY: 20 }] }, end), target)).toBe(
    false,
  );
  expect(menuHit(menuTouchPoint({}), target)).toBe(false);
});
