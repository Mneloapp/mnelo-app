import { act, renderHook } from '@testing-library/react-native';
import { useLocalAction } from '@/messenger/screens/shared';
import { MediaBatchError } from '@/messenger/media-send-error';

test('video preparation and size failures show actionable messages instead of the generic history warning', async () => {
  const { result } = await renderHook(useLocalAction);
  await act(async () => {
    await result.current.run(async () => {
      throw new Error('VIDEO_SIZE_LIMIT');
    });
  });
  expect(result.current.error).toContain('10 MB');
  expect(result.current.error).toContain('Trim it in Photos');
  await act(async () => {
    await result.current.run(async () => {
      throw new Error('MEDIA_PICKER_FAILED');
    });
  });
  expect(result.current.error).toContain('Open it in Photos');
  expect(result.current.busy).toBe(false);
  await act(async () => {
    await result.current.run(async () => {});
  });
  expect(result.current.error).toBeNull();
});
test('partial batch explains exactly what committed and unknown failures never expose raw diagnostics', async () => {
  const { result } = await renderHook(useLocalAction);
  await act(async () => {
    await result.current.run(async () => {
      throw new MediaBatchError(2, 4, new Error('private path'));
    });
  });
  expect(result.current.error).toBe(
    '2 of 4 items were saved to the chat. Select the remaining items to send them.',
  );
  await act(async () => {
    await result.current.run(async () => {
      throw new Error('private path');
    });
  });
  expect(result.current.error).not.toContain('private path');
});
