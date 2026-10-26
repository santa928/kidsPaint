import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Automation = { method: string; value: number; time: number };
class Param {
  events: Automation[] = [];
  setValueAtTime(value: number, time: number) { this.events.push({ method: 'set', value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ method: 'linear', value, time }); }
  exponentialRampToValueAtTime(value: number, time: number) { this.events.push({ method: 'exponential', value, time }); }
  cancelAndHoldAtTime(time: number) { this.events.push({ method: 'hold', value: 0, time }); }
  cancelScheduledValues() { /* Output volume only. */ }
}
class Gain {
  gain = new Param();
  connect = vi.fn();
  disconnect = vi.fn();
}
class Oscillator {
  type = 'sine';
  frequency = new Param();
  connect = vi.fn();
  disconnect = vi.fn();
  onended: (() => void) | null = null;
  start = vi.fn();
  endTimer: ReturnType<typeof setTimeout> | undefined;
  stop = vi.fn((time: number) => {
    clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => this.onended?.(), Math.max(0, time * 1000 - Date.now()));
  });
}
class Context {
  static initialState = 'running';
  static instances: Context[] = [];
  state = Context.initialState;
  destination = {};
  oscillators: Oscillator[] = [];
  gains: Gain[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  decodeAudioData = vi.fn(async () => ({}));
  constructor() { Context.instances.push(this); }
  get currentTime() { return Date.now() / 1000; }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  createOscillator() { const osc = new Oscillator(); this.oscillators.push(osc); return osc; }
}

let sound: (typeof import('../src/SoundManager'))['soundManager'];
const context = () => Context.instances[0]!;
const leadNotes = () => context().oscillators.filter((_, index) => index % 2 === 0);
const pitches = () => leadNotes().map(osc => osc.frequency.events[1]!.value);
const active = () => context().oscillators.filter(osc => osc.disconnect.mock.calls.length === 0);

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.resetModules();
  Context.initialState = 'running';
  Context.instances = [];
  vi.stubGlobal('window', { AudioContext: Context, setTimeout, clearTimeout });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })));
  sound = (await import('../src/SoundManager')).soundManager;
  sound.setEnabled(true);
});
afterEach(() => { sound.setEnabled(false); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('drawing music', () => {
  it('plays a repeatable swung phrase, a rest, then a different answer without randomness', async () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('drawing must be deterministic'); });
    sound.startDrawingSound();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(239);
    expect(pitches()).toEqual([261.63]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(160);
    expect(pitches()).toEqual([261.63, 329.63, 392]);
    await vi.advanceTimersByTimeAsync(639);
    expect(leadNotes()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(241);
    expect(pitches()).toEqual([261.63, 329.63, 392, 392, 329.63]);
    await vi.advanceTimersByTimeAsync(1040);
    expect(pitches()).toEqual([261.63, 329.63, 392, 392, 329.63, 329.63, 392, 440]);
    expect(random).not.toHaveBeenCalled();
  });

  it('cycles distinct marimba, bubble and bell timbres at the existing output volume', async () => {
    for (let stroke = 0; stroke < 3; stroke++) {
      sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(0);
      sound.stopDrawingSound(); await vi.advanceTimersByTimeAsync(40);
    }
    const [marimba, bubble, bell] = leadNotes();
    expect(marimba!.type).toBe('triangle');
    expect(bubble!.type).toBe('sine');
    expect(bubble!.frequency.events[0]!.value).toBeCloseTo(261.63 * 1.35);
    expect(bell!.type).toBe('sine');
    expect(context().oscillators[5]!.frequency.events[0]!.value).toBeCloseTo(261.63 * 2.76);
    expect(context().gains[0]!.gain.events[0]!.value).toBe(4.8);
    for (const gain of context().gains.slice(1)) {
      expect(Math.max(...gain.gain.events.map(event => event.value))).toBeLessThanOrEqual(0.032);
      expect(gain.gain.events[0]!.value).toBe(0);
    }
  });

  it('makes repeated start/end calls idempotent, lands once and frees every node', async () => {
    sound.startDrawingSound(); sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(0);
    expect(leadNotes()).toHaveLength(1);
    sound.stopDrawingSound(); sound.playStrokeEndSound(); sound.playStrokeEndSound();
    expect(pitches()).toEqual([261.63, 261.63]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(active()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    for (const gain of context().gains.slice(1)) expect(gain.disconnect).toHaveBeenCalledOnce();
    sound.stopDrawingSound(); sound.playStrokeEndSound();
    expect(leadNotes()).toHaveLength(2);
  });

  it('mutes active notes and the landing without starting more notes', async () => {
    sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(0);
    sound.stopDrawingSound(); sound.playStrokeEndSound();
    sound.setEnabled(false); sound.playStrokeEndSound(); sound.startDrawingSound();
    await vi.advanceTimersByTimeAsync(1000);
    expect(active()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(leadNotes()).toHaveLength(2);
    expect(context().gains.slice(1).every(gain => gain.gain.events.some(event => event.method === 'hold'))).toBe(true);
  });

  it('survives rapid strokes and a long stroke with bounded overlap and no residual timer', async () => {
    for (let stroke = 0; stroke < 30; stroke++) {
      sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(40);
      sound.stopDrawingSound(); sound.playStrokeEndSound();
      expect(active().length).toBeLessThanOrEqual(6);
    }
    sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(30000);
    expect(active().length).toBeLessThanOrEqual(4);
    sound.stopDrawingSound(); await vi.advanceTimersByTimeAsync(1000);
    expect(active()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['stop', 'mute', 'restart'] as const)('does not revive stale mobile audio after %s while resume is pending', async action => {
    Context.initialState = 'suspended';
    const unlocking = sound.unlock();
    await unlocking;
    context().state = 'suspended';
    const resumes: (() => void)[] = [];
    context().resume.mockImplementation(() => new Promise<void>(resolve => { resumes.push(() => { context().state = 'running'; resolve(); }); }));
    sound.startDrawingSound();
    if (action === 'mute') sound.setEnabled(false);
    else sound.stopDrawingSound();
    if (action === 'restart') sound.startDrawingSound();
    resumes.forEach(resume => resume()); await vi.advanceTimersByTimeAsync(0);
    expect(leadNotes()).toHaveLength(action === 'restart' ? 1 : 0);
  });

  it('starts the first stroke after mobile resume and stops scheduling if suspended again', async () => {
    Context.initialState = 'suspended';
    sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(0);
    expect(context().resume).toHaveBeenCalledOnce(); expect(leadNotes()).toHaveLength(1);
    context().state = 'suspended'; await vi.advanceTimersByTimeAsync(1000);
    expect(leadNotes()).toHaveLength(1); expect(vi.getTimerCount()).toBe(0);
  });
});
