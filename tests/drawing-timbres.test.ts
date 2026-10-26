import { describe, expect, it } from 'vitest';
import { DRAWING_PRESETS, renderDrawingTimbre } from '../src/drawingTimbres';

const rate = 44100;
const render = (name: string) => renderDrawingTimbre(DRAWING_PRESETS.find(preset => preset.timbre === name)!, rate);
const rms = (samples: Float32Array, start: number, end: number) => {
  const chunk = samples.subarray(Math.floor(start * rate), Math.floor(end * rate));
  return Math.sqrt(chunk.reduce((sum, value) => sum + value * value, 0) / chunk.length);
};
const strength = (samples: Float32Array, frequency: number) => {
  let real = 0, imaginary = 0;
  for (let i = 0; i < samples.length; i++) {
    real += samples[i]! * Math.cos(2 * Math.PI * frequency * i / rate);
    imaginary += samples[i]! * Math.sin(2 * Math.PI * frequency * i / rate);
  }
  return Math.hypot(real, imaginary) / samples.length;
};

describe('material differences in generated drawing audio', () => {
  it('has silent edges, a bounded peak and repeatable noise at both browser sample rates', () => {
    for (const sampleRate of [44100, 48000]) for (const preset of DRAWING_PRESETS) {
      const samples = renderDrawingTimbre(preset, sampleRate);
      expect(samples).toEqual(renderDrawingTimbre(preset, sampleRate));
      expect(samples[0]).toBe(0); expect(Math.abs(samples.at(-1)!)).toBe(0);
      expect(Math.max(...samples.map(Math.abs))).toBeCloseTo(preset.peak, 6);
    }
  });

  it('makes two separated water drops, a slow wind attack, and a fast wooden decay', () => {
    const bubble = render('bubble');
    expect(rms(bubble, 0.105, 0.125)).toBeGreaterThan(0.003);
    expect(rms(bubble, 0.086, 0.099)).toBe(0);
    const flute = render('flute'), pluck = render('pluck'), wood = render('wood');
    expect(rms(flute, 0.09, 0.13) / rms(flute, 0.005, 0.02)).toBeGreaterThan(2);
    expect(rms(pluck, 0.09, 0.13) / rms(pluck, 0.005, 0.02)).toBeLessThan(0.5);
    expect(rms(wood, 0.09, 0.13) / rms(wood, 0.005, 0.02)).toBeLessThan(0.2);
  });

  it('gives the bell inharmonic metal partials, the string harmonics, and the drum a low noisy body', () => {
    const bell = render('bell'), pluck = render('pluck'), drum = render('drum');
    expect(strength(bell, 261.63 * 5.52)).toBeGreaterThan(strength(pluck, 261.63 * 5.52) * 10);
    expect(strength(pluck, 261.63 * 2)).toBeGreaterThan(strength(pluck, 261.63 * 2.76) * 5);
    expect(strength(drum, 120)).toBeGreaterThan(strength(drum, 261.63) * 3);
  });
});
