import { render, screen } from '@testing-library/react-native';
import { Button } from '@/components/ui';
import { FocusedTab } from '@/components/FocusedTab';
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
test('inactive tab controls leave the accessible tree and return without unmounting content', async () => {
  const content = (
    <FocusedTab>
      <Button label="New message" onPress={jest.fn()} />
    </FocusedTab>
  );
  const rendered = await render(content);
  expect(screen.getByRole('button', { name: 'New message' })).toBeOnTheScreen();
  mockFocused = false;
  await rendered.rerender(
    <FocusedTab>
      <Button label="New message" onPress={jest.fn()} />
    </FocusedTab>,
  );
  expect(screen.queryByRole('button', { name: 'New message' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'New message', includeHiddenElements: true }),
  ).toBeDefined();
  mockFocused = true;
  await rendered.rerender(content);
  expect(screen.getByRole('button', { name: 'New message' })).toBeOnTheScreen();
});
