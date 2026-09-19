import { fireEvent, render, screen } from '@testing-library/react-native';
import { LocationComposer } from '@/messenger/components/LocationComposer';
import { coordinateBody } from '@/messenger/location-coordinate';
import { mapLink } from '@/messenger/map-link';

test('an arbitrary place requires valid coordinates and explicit send; zero coordinates remain valid', async () => {
  const send = jest.fn();
  const close = jest.fn();
  await render(<LocationComposer send={send} close={close} busy={false} error={null} />);
  expect(screen.getByRole('button', { name: 'Send location' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Latitude'), '41.78926470418552');
  await fireEvent.changeText(screen.getByLabelText('Longitude'), '181');
  expect(screen.getByRole('button', { name: 'Send location' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Longitude'), '44.85182930648795');
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Send location' }));
  expect(send).toHaveBeenLastCalledWith('41.789265,44.851829');
  await fireEvent.changeText(screen.getByLabelText('Latitude'), '0');
  await fireEvent.changeText(screen.getByLabelText('Longitude'), '0');
  await fireEvent.press(screen.getByRole('button', { name: 'Send location' }));
  expect(send).toHaveBeenLastCalledWith('0,0');
});

test('coordinates from native/GPS pickers are bounded before entering the encrypted message', () => {
  for (const point of [
    { latitude: NaN, longitude: 1 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: Infinity },
    { latitude: 0, longitude: -181 },
  ])
    expect(() => coordinateBody(point)).toThrow('LOCATION_INVALID');
  const body = coordinateBody({ latitude: -90, longitude: 180 });
  expect(mapLink('apple', body)).toBe('https://maps.apple.com/?ll=-90%2C180');
});
