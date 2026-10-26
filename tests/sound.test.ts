import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAWING_PRESETS } from '../src/drawingTimbres';

type Automation = { method: string; value: number; time: number };
class Param {
  value = 0;
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
class Buffer {
  samples: Float32Array;
  duration: number;
  constructor(length: number, sampleRate: number) { this.samples = new Float32Array(length); this.duration = length / sampleRate; }
  getChannelData() { return this.samples; }
}
class BufferSource extends Oscillator {
  playbackRate = new Param();
  buffer: Buffer | null = null;
  start = vi.fn((time: number) => {
    if (this.buffer) this.stop(time + this.buffer.duration / this.playbackRate.events[0]!.value);
  });
}
class Context {
  static initialState = 'running';
  static instances: Context[] = [];
  state = Context.initialState;
  destination = {};
  sampleRate = 44100;
  sources: BufferSource[] = [];
  oscillators: Oscillator[] = [];
  gains: Gain[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  decodeAudioData = vi.fn(async () => ({}));
  constructor() { Context.instances.push(this); }
  get currentTime() { return Date.now() / 1000; }
  createBuffer(_channels: number, length: number, sampleRate: number) { return new Buffer(length, sampleRate); }
  createBufferSource() { const source = new BufferSource(); this.sources.push(source); return source; }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  createOscillator() { const osc = new Oscillator(); this.oscillators.push(osc); return osc; }
}

let sound: (typeof import('../src/SoundManager'))['soundManager'];
const context = () => Context.instances[0]!;
const leadNotes = () => context().sources;
const pitches = () => leadNotes().map(source => Number((source.playbackRate.events[0]!.value * 261.63).toFixed(2)));
const timbres = () => leadNotes().map(source => DRAWING_PRESETS.find(preset => Math.abs(preset.duration - source.buffer!.duration) < 0.0001)!.timbre);
const active = () => context().sources.filter(source => source.disconnect.mock.calls.length === 0);

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
    await vi.advanceTimersByTimeAsync(559);
    expect(leadNotes()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(241);
    expect(pitches()).toEqual([261.63, 329.63, 392, 392, 329.63]);
    await vi.advanceTimersByTimeAsync(740);
    expect(pitches()).toEqual([261.63, 329.63, 392, 392, 329.63, 261.63, 392]);
    expect(timbres()).toEqual(['pluck', 'pluck', 'pluck', 'pluck', 'pluck', 'bubble', 'bubble']);
    expect(random).not.toHaveBeenCalled();
  });

  it('uses all six material voices on short strokes, caches their buffers, and retains output volume', async () => {
    for (let stroke = 0; stroke < 12; stroke++) {
      sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(20);
      sound.stopDrawingSound(); await vi.advanceTimersByTimeAsync(40);
    }
    expect(timbres()).toEqual([...DRAWING_PRESETS, ...DRAWING_PRESETS].map(preset => preset.timbre));
    for (let index = 0; index < 6; index++) expect(leadNotes()[index]!.buffer).toBe(leadNotes()[index + 6]!.buffer);
    expect(context().gains[0]!.gain.events[0]!.value).toBe(4.8);
    for (const source of leadNotes()) {
      const samples = source.buffer!.getChannelData();
      expect(Math.max(...samples.map(Math.abs))).toBeLessThanOrEqual(0.028001);
      expect(samples[0]).toBe(0);
      expect(Math.abs(samples.at(-1)!)).toBe(0);
    }
  });

  it('visits every voice while held and continues the shared sequence on the next stroke', async () => {
    sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(12000);
    const voices = [...new Set(timbres())];
    expect(voices).toEqual(DRAWING_PRESETS.map(preset => preset.timbre));
    const last = timbres().at(-1)!;
    sound.stopDrawingSound(); sound.startDrawingSound();
    expect(timbres().at(-1)).toBe(DRAWING_PRESETS[(DRAWING_PRESETS.findIndex(preset => preset.timbre === last) + 1) % 6]!.timbre);
    sound.stopDrawingSound(); await vi.advanceTimersByTimeAsync(1000);
    expect(active()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
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

  it('fades and releases voices when cancelAndHoldAtTime is unavailable', async () => {
    const hold = Param.prototype.cancelAndHoldAtTime;
    Object.defineProperty(Param.prototype, 'cancelAndHoldAtTime', { value: undefined, configurable: true });
    try {
      sound.startDrawingSound(); await vi.advanceTimersByTimeAsync(20);
      const gains = context().gains.slice(1);
      gains.forEach(gain => { gain.gain.value = 0.014; });
      expect(() => sound.stopDrawingSound()).not.toThrow();
      for (const gain of gains) {
        expect(gain.gain.events).toContainEqual({ method: 'set', value: 0.014, time: 0.02 });
        expect(gain.gain.events.at(-1)).toEqual({ method: 'linear', value: 0, time: 0.045 });
      }
      sound.playStrokeEndSound(); sound.setEnabled(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(active()).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      Object.defineProperty(Param.prototype, 'cancelAndHoldAtTime', { value: hold, configurable: true });
    }
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
