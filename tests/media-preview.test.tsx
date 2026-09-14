import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MessageBubble } from '@/messenger/components/MessageBubble';
import { ChatPhoto } from '@/messenger/components/ChatPhoto';
import { AppText } from '@/components/AppText';
import { mediaPreviewSize, visualMediaKind } from '@/messenger/media-preview';
jest.mock('@/messenger/components/PhotoGallery', () => ({ PhotoGallery: () => null }));

test('portrait, landscape, square and extreme previews fit the bubble and phone', () => {
  expect(mediaPreviewSize({ width: 1200, height: 1600 }, 300)).toEqual({ width: 300, height: 400 });
  expect(mediaPreviewSize({ width: 1600, height: 900 }, 300)).toEqual({
    width: 300,
    height: 168.75,
  });
  expect(mediaPreviewSize({ width: 1200, height: 1200 }, 248)).toEqual({ width: 248, height: 248 });
  for (const dimensions of [
    { width: 1, height: 100 },
    { width: 100, height: 1 },
    { width: 0, height: 0 },
  ]) {
    const size = mediaPreviewSize(dimensions, 248);
    expect(size.width).toBeLessThanOrEqual(248);
    expect(size.height).toBeLessThanOrEqual(400);
    expect(size.width).toBeGreaterThan(100);
    expect(Number.isFinite(size.height)).toBe(true);
  }
});

test('only supported photos/videos use visual bubbles; files and voice retain their controls', () => {
  expect(visualMediaKind('image/png')).toBe('photo');
  expect(visualMediaKind('video/quicktime')).toBe('video');
  expect(visualMediaKind('video/mp4')).toBe('video');
  expect(visualMediaKind('application/pdf')).toBeNull();
  expect(visualMediaKind('audio/mp4')).toBeNull();
});

test('photo fills the bubble; timestamp overlays bare media but follows a caption; long press stays separate', async () => {
  const select = jest.fn();
  function Photo({ caption = '' }: { caption?: string }) {
    const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
    const size = mediaPreviewSize(dimensions, 300);
    return (
      <MessageBubble
        own
        status="read"
        sentAt={60000}
        media
        visual
        overlayMetadata={!caption}
        containerStyle={{ width: size.width }}
      >
        <ChatPhoto
          uri="data:image/png;base64,YQ=="
          name="sample.png"
          size={size}
          onDimensions={setDimensions}
          onLongPress={select}
          share={() => {}}
          busy={false}
          error={null}
        />
        {Boolean(caption) && <AppText>{caption}</AppText>}
      </MessageBubble>
    );
  }
  const view = await render(<Photo />);
  await fireEvent(screen.getByLabelText('sample.png'), 'load', {
    nativeEvent: { source: { width: 1200, height: 1600 } },
  });
  expect(screen.getByRole('button', { name: 'Open photo' })).toHaveStyle({
    width: 300,
    height: 400,
  });
  expect(screen.getByTestId('message-bubble')).toHaveStyle({ padding: 0, overflow: 'hidden' });
  expect(screen.getByTestId('message-metadata')).toHaveStyle({
    position: 'absolute',
    right: 6,
    bottom: 6,
  });
  expect(screen.getByRole('image', { name: 'Read on their device' })).toBeOnTheScreen();
  await fireEvent(screen.getByRole('button', { name: 'Open photo' }), 'longPress');
  expect(select).toHaveBeenCalledTimes(1);
  await view.rerender(<Photo caption="A caption that remains below the full-width photo" />);
  expect(screen.getByText('A caption that remains below the full-width photo')).toBeOnTheScreen();
  expect(screen.getByTestId('message-metadata')).not.toHaveStyle({ position: 'absolute' });
});
