import { voiceLevel, voiceTime, waveformBars } from '@/features/chats/voice-waveform';

test('native microphone levels are bounded, with quiet and missing input staying silent', () => {
  for (const value of [undefined, NaN, Infinity, -160, -60]) expect(voiceLevel(value)).toBe(0);
  expect(voiceLevel(-20)).toBeGreaterThan(voiceLevel(-40));
  expect(voiceLevel(0)).toBe(1);
  expect(voiceLevel(20)).toBe(1);
});
test('live bars show only the recent input, while preview covers the whole recording', () => {
  expect(waveformBars([0.5, 1], 4, true)).toEqual([0, 0, 0.5, 1]);
  expect(waveformBars([1, 0, 0.2, 0.3], 2, true)).toEqual([0.2, 0.3]);
  expect(waveformBars([1, 0, 0.2, 0.3], 2)).toEqual([1, 0.3]);
  expect(waveformBars([0.5, 1], 4)).toEqual([0.5, 0.5, 1, 1]);
  expect(waveformBars([], 4)).toEqual([0, 0, 0, 0]);
});
test('recording time is compact across minute boundaries', () => {
  expect(voiceTime(0)).toBe('0:00');
  expect(voiceTime(65.8)).toBe('1:05');
  expect(voiceTime(600)).toBe('10:00');
});
