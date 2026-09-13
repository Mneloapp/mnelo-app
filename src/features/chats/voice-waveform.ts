export const VOICE_METER_INTERVAL = 100;
export const MAX_VOICE_SAMPLES = 6000; // Existing ten-minute recording limit.

export function voiceLevel(decibels?: number) {
  if (decibels === undefined || !Number.isFinite(decibels)) return 0;
  // Both native Expo recorders report dBFS. Quiet input stays quiet; no invented waves.
  return Math.pow(Math.min(1, Math.max(0, (decibels + 60) / 60)), 1.5);
}

export function waveformBars(samples: readonly number[], count: number, live = false) {
  if (live) {
    const recent = samples.slice(-count);
    return [...Array<number>(count - recent.length).fill(0), ...recent];
  }
  // Keep the whole draft visible, retaining brief peaks when condensing long recordings.
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * samples.length) / count);
    const end = Math.min(
      samples.length,
      Math.max(start + 1, Math.floor(((index + 1) * samples.length) / count)),
    );
    let peak = 0;
    for (let i = start; i < end; i++) peak = Math.max(peak, samples[i] ?? 0);
    return peak;
  });
}

export function voiceTime(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
