export type DrawingTimbre = 'pluck' | 'bubble' | 'bell' | 'flute' | 'drum' | 'wood';

export interface DrawingSoundPreset {
    timbre: DrawingTimbre;
    duration: number;
    peak: number;
    phrases: readonly (readonly number[])[];
    rhythm: readonly [number, number];
    rest: number;
}

export const DRAWING_NOTES = [261.63, 293.66, 329.63, 392, 440] as const;
export const DRAWING_PRESETS: readonly DrawingSoundPreset[] = [
    { timbre: 'pluck', duration: 0.42, peak: 0.028, phrases: [[0, 2, 3], [3, 2]], rhythm: [240, 160], rest: 560 },
    { timbre: 'bubble', duration: 0.24, peak: 0.026, phrases: [[0, 3], [2, 4, 1]], rhythm: [180, 260], rest: 440 },
    { timbre: 'bell', duration: 0.64, peak: 0.022, phrases: [[2, 4], [3, 2, 0]], rhythm: [360, 240], rest: 720 },
    { timbre: 'flute', duration: 0.4, peak: 0.016, phrases: [[0, 1, 2], [3, 2]], rhythm: [340, 300], rest: 520 },
    { timbre: 'drum', duration: 0.23, peak: 0.026, phrases: [[0, 0, 3, 0], [0, 2, 0]], rhythm: [180, 120], rest: 480 },
    { timbre: 'wood', duration: 0.2, peak: 0.028, phrases: [[0, 3, 2], [4, 2]], rhythm: [200, 280], rest: 560 },
];

const TAU = Math.PI * 2;

/** Render once per voice/context. No fetch, random source, or persistent oscillator. */
export function renderDrawingTimbre(preset: DrawingSoundPreset, sampleRate: number): Float32Array {
    const samples = new Float32Array(Math.ceil(preset.duration * sampleRate));
    const base = DRAWING_NOTES[0];
    let seed = 928;
    let softNoise = 0;
    let peak = 0;
    const pop = (time: number, frequency: number) => {
        if (time < 0 || time > 0.085) return 0;
        // Integrate the descending frequency: two rounded water drops, no hard click.
        const slope = Math.log(0.36) / 0.085;
        const phase = TAU * frequency * Math.expm1(slope * time) / slope;
        return Math.sin(phase) * Math.min(1, time / 0.004) * (1 - time / 0.085) ** 2;
    };

    for (let i = 0; i < samples.length; i++) {
        const t = i / sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = (seed / 0xffffffff) * 2 - 1;
        softNoise += (noise - softNoise) * (1 - Math.exp(-TAU * 1800 / sampleRate));
        let value = 0;
        switch (preset.timbre) {
            case 'pluck':
                // A string's harmonic comb loses its bright upper partials first.
                for (let harmonic = 1; harmonic <= 6; harmonic++) {
                    value += Math.sin(TAU * base * harmonic * t) * Math.exp(-(7 + harmonic * 5) * t) / harmonic;
                }
                value *= Math.min(1, t / 0.003);
                break;
            case 'bubble':
                value = pop(t, base * 3.2) + pop(t - 0.1, base * 4.1) * 0.8;
                break;
            case 'bell':
                // Strong inharmonic partials and a longer tail distinguish metal from wood.
                value = (Math.sin(TAU * base * 2 * t) * Math.exp(-7 * t)
                    + 0.55 * Math.sin(TAU * base * 5.52 * t) * Math.exp(-10 * t)
                    + 0.25 * Math.sin(TAU * base * 10.8 * t) * Math.exp(-17 * t)) * Math.min(1, t / 0.005);
                break;
            case 'flute': {
                const breath = Math.min(1, t / 0.045) * Math.min(1, (preset.duration - t) / 0.2);
                const phase = TAU * base * t + base * 0.006 / 5 * Math.sin(TAU * 5 * t);
                value = (Math.sin(phase) + 0.12 * Math.sin(phase * 2) + softNoise * 0.08) * breath;
                break;
            }
            case 'drum': {
                const phase = TAU * (105 * t + 95 * 0.025 * (1 - Math.exp(-t / 0.025)));
                value = (Math.sin(phase) * Math.exp(-20 * t) + softNoise * 0.9 * Math.exp(-55 * t)) * Math.min(1, t / 0.004);
                break;
            }
            case 'wood':
                value = (Math.sin(TAU * base * t) * Math.exp(-24 * t)
                    + 0.35 * Math.sin(TAU * base * 4 * t) * Math.exp(-65 * t)) * Math.min(1, t / 0.004);
                break;
        }
        // Every sample has silent edges, including the softer wind and percussion.
        value *= Math.min(1, (samples.length - 1 - i) / (sampleRate * 0.015));
        samples[i] = value;
        peak = Math.max(peak, Math.abs(value));
    }
    // Lower than the previous drawing voice's combined peak; retain the output volume.
    if (peak > 0) for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * preset.peak / peak;
    return samples;
}
