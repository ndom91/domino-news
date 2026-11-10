/** A playback position or length in seconds as "4:05"; "0:00" when it isn't known yet. */
export function audioClock(seconds: number): string {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 0.75]

/** The next playback speed in the cycle 1×, 1.25×, 1.5×, 2×, 0.75×, then back to 1×. */
export function nextPlaybackRate(rate: number): number {
  return PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length] ?? 1
}
