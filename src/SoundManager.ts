import type { StampId } from './types';

import { DRAWING_NOTES, DRAWING_PRESETS, renderDrawingTimbre } from './drawingTimbres';
import type { DrawingSoundPreset, DrawingTimbre } from './drawingTimbres';

const SAMPLE_GROUPS = {
    color: ['color-chime-1', 'color-chime-2', 'color-plink-1'],
    rainbow: ['rainbow-rise-1', 'rainbow-rise-2', 'rainbow-glitter-1'],
    brushSmall: ['brush-pop-small', 'color-plink-1'],
    brushMedium: ['brush-pop-medium', 'stamp-bounce-1'],
    brushBig: ['brush-pop-big', 'stamp-boop-1'],
    eraser: ['eraser-wipe-1', 'eraser-wipe-2'],
    undo: ['undo-rewind-1', 'undo-rewind-2'],
    clear: ['clear-cascade-1', 'clear-cascade-2'],
    stampShape: ['stamp-boop-1', 'stamp-bounce-1', 'stamp-spring-1', 'stamp-shape-punch'],
    stampRabbit: ['stamp-rabbit-hop', 'stamp-bounce-1'],
    stampBird: ['stamp-bird-chirp', 'draw-twinkle-1'],
    stampTrain: ['stamp-train-toot', 'stamp-shape-punch'],
} as const;

class SoundManager {
    private static readonly OUTPUT_BOOST = 4;
    private audioCtx: AudioContext | null = null;
    private outputGain: GainNode | null = null;
    private currentDrawingPreset: DrawingSoundPreset | null = null;
    private drawingTimer: number | null = null;
    private drawingVoices = new Map<AudioBufferSourceNode, { gain: GainNode; endAt: number }>();
    private drawingRequested = false;
    private drawingSession = 0;
    private timbreIndex = 0;
    private drawingBuffers = new Map<DrawingTimbre, AudioBuffer>();
    private phraseIndex = 0;
    private noteIndex = 0;
    private endingPreset: DrawingSoundPreset | null = null;
    private sampleBuffers: Map<string, AudioBuffer> = new Map();
    private sampleLoadPromises: Map<string, Promise<void>> = new Map();
    private samplePreloadStarted = false;
    private isUnlocked: boolean = false;
    private enabled: boolean = false;
    private volume: number = 1.2;
    private readonly sampleBasePath = `${import.meta.env.BASE_URL}sounds/`;

    constructor() {
        // Lazy init
    }

    public setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) {
            this.stopDrawingSound();
        }
    }

    public setVolume(volume: number) {
        const clamped = Math.min(2, Math.max(0, volume));
        this.volume = clamped;
        if (!this.audioCtx || !this.outputGain) return;

        const now = this.audioCtx.currentTime;
        this.outputGain.gain.cancelScheduledValues(now);
        this.outputGain.gain.setValueAtTime(this.toEffectiveOutputGain(clamped), now);
    }

    private toEffectiveOutputGain(volume: number) {
        return Math.min(6, Math.max(0, volume * SoundManager.OUTPUT_BOOST));
    }

    private pickOne<T>(items: readonly T[]) {
        return items[Math.floor(Math.random() * items.length)]!;
    }

    private randomBetween(min: number, max: number) {
        return min + Math.random() * (max - min);
    }

    private initCtx() {
        if (!this.audioCtx) {
            const Ctx = window.AudioContext
                || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (Ctx) {
                this.audioCtx = new Ctx();
                this.outputGain = this.audioCtx.createGain();
                this.outputGain.gain.setValueAtTime(
                    this.toEffectiveOutputGain(this.volume),
                    this.audioCtx.currentTime,
                );
                this.outputGain.connect(this.audioCtx.destination);
            }
        }
    }

    private getOutputGain(ctx: AudioContext) {
        if (!this.outputGain) {
            this.outputGain = ctx.createGain();
            this.outputGain.gain.setValueAtTime(this.toEffectiveOutputGain(this.volume), ctx.currentTime);
            this.outputGain.connect(ctx.destination);
        }
        return this.outputGain;
    }

    public async unlock() {
        this.initCtx();
        if (!this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
                this.isUnlocked = true;
                this.preloadSamples(this.audioCtx);
            } catch (e) {
                console.error('Audio resume failed', e);
            }
        } else {
            this.isUnlocked = true;
            this.preloadSamples(this.audioCtx);
        }
    }

    private getPlayableContext() {
        if (!this.enabled) return null;
        if (!this.isUnlocked) {
            void this.unlock();
            return null;
        }
        this.initCtx();
        if (this.audioCtx) {
            this.preloadSamples(this.audioCtx);
        }
        return this.audioCtx;
    }

    private preloadSamples(ctx: AudioContext) {
        if (this.samplePreloadStarted) return;
        this.samplePreloadStarted = true;
        const sampleNames = [...new Set(Object.values(SAMPLE_GROUPS).flat())];
        sampleNames.forEach((sampleName) => {
            void this.loadSample(ctx, sampleName);
        });
    }

    private loadSample(ctx: AudioContext, sampleName: string) {
        if (this.sampleBuffers.has(sampleName)) {
            return Promise.resolve();
        }
        const existing = this.sampleLoadPromises.get(sampleName);
        if (existing) return existing;

        const loadPromise = fetch(`${this.sampleBasePath}${sampleName}.wav`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Failed to load ${sampleName}.wav: ${response.status}`);
                }
                return response.arrayBuffer();
            })
            .then((buffer) => ctx.decodeAudioData(buffer))
            .then((audioBuffer) => {
                this.sampleBuffers.set(sampleName, audioBuffer);
            })
            .catch((error: unknown) => {
                console.warn('Audio sample load failed', sampleName, error);
            });

        this.sampleLoadPromises.set(sampleName, loadPromise);
        return loadPromise;
    }

    private playSample(
        ctx: AudioContext,
        sampleNames: readonly string[],
        {
            gain = 0.75,
            playbackRate = 1,
            jitter = 0.04,
        }: { gain?: number; playbackRate?: number; jitter?: number } = {},
    ) {
        const sampleName = this.pickOne(sampleNames);
        const buffer = this.sampleBuffers.get(sampleName);
        if (!buffer) {
            void this.loadSample(ctx, sampleName);
            return false;
        }

        const now = ctx.currentTime;
        const source = ctx.createBufferSource();
        const sampleGain = ctx.createGain();
        const rate = playbackRate * this.randomBetween(1 - jitter, 1 + jitter);

        source.buffer = buffer;
        source.playbackRate.setValueAtTime(Math.max(0.5, Math.min(1.8, rate)), now);
        sampleGain.gain.setValueAtTime(gain, now);

        source.connect(sampleGain);
        sampleGain.connect(this.getOutputGain(ctx));
        source.start(now);

        source.onended = () => {
            source.disconnect();
            sampleGain.disconnect();
        };
        return true;
    }

    public startDrawingSound() {
        if (!this.enabled || this.drawingRequested) return;
        this.drawingRequested = true;
        const session = ++this.drawingSession;
        this.endingPreset = null;
        this.releaseDrawingVoices();

        // resume() must begin in the pointer gesture. A released/muted stroke must
        // never start later if a mobile browser resolves that promise slowly.
        this.initCtx();
        if (!this.audioCtx) {
            this.drawingRequested = false;
            return;
        }
        if (!this.isUnlocked || this.audioCtx.state !== 'running') {
            void this.unlock().then(() => {
                if (session !== this.drawingSession || !this.drawingRequested || !this.enabled) return;
                if (this.audioCtx?.state === 'running') this.beginDrawingPhrase(this.audioCtx);
                else this.drawingRequested = false;
            });
            return;
        }
        this.beginDrawingPhrase(this.audioCtx);
    }

    private beginDrawingPhrase(ctx: AudioContext) {
        this.currentDrawingPreset = DRAWING_PRESETS[this.timbreIndex++ % DRAWING_PRESETS.length]!;
        this.phraseIndex = 0;
        this.noteIndex = 0;
        this.playNextDrawingNote(ctx);
    }

    private playNextDrawingNote(ctx: AudioContext) {
        this.drawingTimer = null;
        if (!this.drawingRequested || !this.currentDrawingPreset) return;
        // Share the same round-robin across strokes and held-finger phrases.
        // Change at the next phrase onset so a release during a rest lands in the last voice.
        if (this.noteIndex === 0 && this.phraseIndex > 0 && this.phraseIndex % 2 === 0) {
            this.currentDrawingPreset = DRAWING_PRESETS[this.timbreIndex++ % DRAWING_PRESETS.length]!;
        }
        const preset = this.currentDrawingPreset;
        // Do not keep timers or a held note alive in a suspended/background tab.
        if (ctx.state !== 'running') {
            this.stopDrawingSound();
            return;
        }
        const phrase = preset.phrases[this.phraseIndex % preset.phrases.length]!;
        this.playDrawingNote(ctx, preset, DRAWING_NOTES[phrase[this.noteIndex]!]!);
        this.noteIndex += 1;
        let delay = preset.rhythm[(this.noteIndex - 1) % 2]!;
        if (this.noteIndex === phrase.length) {
            delay = preset.rest;
            this.noteIndex = 0;
            this.phraseIndex += 1;
        }
        this.drawingTimer = window.setTimeout(() => this.playNextDrawingNote(ctx), delay);
    }

    private playDrawingNote(ctx: AudioContext, preset: DrawingSoundPreset, frequency: number, ending = false) {
        const now = ctx.currentTime;
        let buffer = this.drawingBuffers.get(preset.timbre);
        if (!buffer) {
            const samples = renderDrawingTimbre(preset, ctx.sampleRate);
            buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
            buffer.getChannelData(0).set(samples);
            this.drawingBuffers.set(preset.timbre, buffer);
        }
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const rate = frequency / DRAWING_NOTES[0];
        const duration = ending ? Math.min(0.24, buffer.duration / rate) : buffer.duration / rate;
        const level = ending ? 0.75 : 1;
        source.buffer = buffer;
        source.playbackRate.setValueAtTime(rate, now);
        // The buffer contains the instrument's own attack, body and decay.
        gain.gain.setValueAtTime(level, now);
        if (ending) {
            gain.gain.setValueAtTime(level, now + duration - 0.025);
            gain.gain.linearRampToValueAtTime(0, now + duration);
        }
        source.connect(gain);
        gain.connect(this.getOutputGain(ctx));
        this.drawingVoices.set(source, { gain, endAt: now + duration });
        source.onended = () => {
            source.onended = null;
            source.disconnect();
            gain.disconnect();
            this.drawingVoices.delete(source);
        };
        source.start(now);
        if (ending && duration < buffer.duration / rate) source.stop(now + duration);
    }

    private releaseDrawingVoices() {
        if (!this.audioCtx) return;
        const now = this.audioCtx.currentTime;
        for (const [source, { gain, endAt }] of this.drawingVoices) {
            if (typeof gain.gain.cancelAndHoldAtTime === 'function') {
                gain.gain.cancelAndHoldAtTime(now);
            } else {
                // Firefox lacks cancelAndHoldAtTime; preserve the current level
                // before cancelling automation so release cannot interrupt saving.
                const level = gain.gain.value;
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(level, now);
            }
            gain.gain.linearRampToValueAtTime(0, now + 0.025);
            // Buffers already end naturally. Do not reschedule an end past that
            // boundary: Chromium can emit ended twice for such a stop.
            if (now + 0.03 < endAt) source.stop(now + 0.03);
        }
    }

    public stopDrawingSound() {
        this.drawingRequested = false;
        this.drawingSession += 1;
        if (this.drawingTimer !== null) {
            window.clearTimeout(this.drawingTimer);
            this.drawingTimer = null;
        }
        this.endingPreset = this.enabled ? this.currentDrawingPreset : null;
        this.currentDrawingPreset = null;
        this.releaseDrawingVoices();
    }

    private playOneShotTone(
        ctx: AudioContext,
        startTime: number,
        type: OscillatorType,
        startFreq: number,
        endFreq: number,
        {
            peak = 0.06,
            attack = 0.01,
            release = 0.12,
        }: { peak?: number; attack?: number; release?: number } = {},
    ) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(40, startFreq), startTime);
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startTime + release);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(peak, startTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + release);

        osc.connect(gain);
        gain.connect(this.getOutputGain(ctx));
        osc.start(startTime);
        osc.stop(startTime + release + 0.03);

        osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
        };
    }

    private playNoiseBurst(
        ctx: AudioContext,
        startTime: number,
        {
            duration,
            peak,
            filterFrequency,
            filterType,
        }: { duration: number; peak: number; filterFrequency: number; filterType: BiquadFilterType },
    ) {
        const sampleRate = ctx.sampleRate;
        const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
        const channel = buffer.getChannelData(0);
        for (let index = 0; index < channel.length; index += 1) {
            channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
        }

        const source = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        source.buffer = buffer;
        filter.type = filterType;
        filter.frequency.setValueAtTime(filterFrequency, startTime);
        filter.Q.setValueAtTime(4, startTime);

        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.linearRampToValueAtTime(peak, startTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.getOutputGain(ctx));
        source.start(startTime);
        source.stop(startTime + duration + 0.02);

        source.onended = () => {
            source.disconnect();
            filter.disconnect();
            gain.disconnect();
        };
    }

    /** Plays a short bright chirp when the active drawing color changes. */
    public playColorSelectSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (this.playSample(ctx, SAMPLE_GROUPS.color, { gain: 0.58, jitter: 0.06 })) return;
        const variants = [
            () => {
                this.playOneShotTone(ctx, now, 'sine', 560, 840, { peak: 0.05, attack: 0.006, release: 0.08 });
                this.playOneShotTone(ctx, now + 0.035, 'triangle', 760, 1080, { peak: 0.04, attack: 0.005, release: 0.08 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'triangle', 420, 680, { peak: 0.052, attack: 0.008, release: 0.1 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'sine', 720, 620, { peak: 0.046, attack: 0.006, release: 0.08 });
                this.playOneShotTone(ctx, now + 0.04, 'sine', 920, 1180, { peak: 0.032, attack: 0.004, release: 0.07 });
            },
        ];
        this.pickOne(variants)();
    }

    /** Plays an ascending sparkle flourish for rainbow mode. */
    public playRainbowSelectSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (this.playSample(ctx, SAMPLE_GROUPS.rainbow, { gain: 0.58, jitter: 0.04 })) return;
        [523, 659, 784, 1046].forEach((freq, index) => {
            this.playOneShotTone(ctx, now + index * 0.035, 'sine', freq, freq * 1.22, {
                peak: 0.036,
                attack: 0.004,
                release: 0.09,
            });
        });
    }

    /** Plays a rounded pop whose pitch follows the selected brush size. */
    /** Match the three artwork-space brush sizes with distinct sound pitches. */
    public playBrushSizeSound(size: number) {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const base = size <= 8 ? 520 : size <= 16 ? 380 : 260;
        const sampleGroup = size <= 8
            ? SAMPLE_GROUPS.brushSmall
            : size <= 16
                ? SAMPLE_GROUPS.brushMedium
                : SAMPLE_GROUPS.brushBig;
        if (this.playSample(ctx, sampleGroup, { gain: 0.54, jitter: 0.05 })) return;
        this.playOneShotTone(ctx, now, 'triangle', base, base * 0.72, { peak: 0.055, attack: 0.006, release: 0.1 });
        this.playOneShotTone(ctx, now + 0.025, 'sine', base * 1.45, base * 1.12, {
            peak: 0.028,
            attack: 0.004,
            release: 0.08,
        });
    }

    /** Plays a soft wipe sound when the eraser is toggled. */
    public playEraserSound(enabled: boolean) {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (this.playSample(ctx, SAMPLE_GROUPS.eraser, { gain: enabled ? 0.52 : 0.42, jitter: 0.04 })) return;
        this.playNoiseBurst(ctx, now, {
            duration: 0.16,
            peak: enabled ? 0.04 : 0.026,
            filterFrequency: enabled ? 1800 : 1200,
            filterType: 'highpass',
        });
        this.playOneShotTone(ctx, now + 0.015, 'sine', enabled ? 540 : 360, enabled ? 320 : 520, {
            peak: 0.026,
            attack: 0.006,
            release: 0.1,
        });
    }

    /** Plays a quick rewind gesture for undo. */
    public playUndoSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (this.playSample(ctx, SAMPLE_GROUPS.undo, { gain: 0.5, jitter: 0.04 })) return;
        this.playOneShotTone(ctx, now, 'triangle', 780, 430, { peak: 0.046, attack: 0.005, release: 0.1 });
        this.playOneShotTone(ctx, now + 0.045, 'sine', 520, 360, { peak: 0.034, attack: 0.004, release: 0.09 });
    }

    /** Plays a small magical burst after a successful clear-all action. */
    public playClearAllSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (this.playSample(ctx, SAMPLE_GROUPS.clear, { gain: 0.58, jitter: 0.03 })) return;
        this.playNoiseBurst(ctx, now, {
            duration: 0.2,
            peak: 0.036,
            filterFrequency: 2400,
            filterType: 'bandpass',
        });
        [392, 523, 659, 784, 1046].forEach((freq, index) => {
            this.playOneShotTone(ctx, now + index * 0.035, index % 2 === 0 ? 'triangle' : 'sine', freq, freq * 1.18, {
                peak: 0.036,
                attack: 0.004,
                release: 0.1,
            });
        });
    }

    /** Plays a random stamp effect, with special colors for animal and train stamps. */
    public playStampSound(stampId?: StampId) {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const sampleGroup = stampId === 'rabbit'
            ? SAMPLE_GROUPS.stampRabbit
            : stampId === 'bird'
                ? SAMPLE_GROUPS.stampBird
                : stampId === 'train'
                    ? SAMPLE_GROUPS.stampTrain
                    : SAMPLE_GROUPS.stampShape;
        if (this.playSample(ctx, sampleGroup, { gain: 0.62, jitter: 0.08 })) return;
        const shapeVariants = [
            () => {
                this.playOneShotTone(ctx, now, 'square', 430, 240, { peak: 0.075, attack: 0.008, release: 0.11 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'triangle', 250, 420, { peak: 0.062, attack: 0.012, release: 0.09 });
                this.playOneShotTone(ctx, now + 0.06, 'sine', 420, 300, { peak: 0.045, attack: 0.008, release: 0.1 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'sine', 780, 1220, { peak: 0.055, attack: 0.006, release: 0.1 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'sawtooth', 560, 260, { peak: 0.058, attack: 0.01, release: 0.12 });
                this.playOneShotTone(ctx, now + 0.015, 'sine', 830, 620, { peak: 0.032, attack: 0.005, release: 0.08 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'sine', 340, 520, { peak: 0.052, attack: 0.008, release: 0.08 });
                this.playOneShotTone(ctx, now + 0.04, 'sine', 430, 640, { peak: 0.048, attack: 0.008, release: 0.09 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'triangle', 980, 1350, { peak: 0.046, attack: 0.004, release: 0.08 });
                this.playOneShotTone(ctx, now + 0.05, 'triangle', 1180, 1520, { peak: 0.04, attack: 0.004, release: 0.08 });
            },
        ];
        const themedVariants: Partial<Record<StampId, readonly (() => void)[]>> = {
            rabbit: [
                () => {
                    this.playOneShotTone(ctx, now, 'triangle', 360, 620, { peak: 0.054, attack: 0.006, release: 0.1 });
                    this.playOneShotTone(ctx, now + 0.07, 'triangle', 460, 760, { peak: 0.046, attack: 0.006, release: 0.1 });
                },
            ],
            bird: [
                () => {
                    this.playOneShotTone(ctx, now, 'sine', 1120, 1460, { peak: 0.038, attack: 0.004, release: 0.08 });
                    this.playOneShotTone(ctx, now + 0.04, 'sine', 980, 1320, { peak: 0.034, attack: 0.004, release: 0.08 });
                },
            ],
            train: [
                () => {
                    this.playOneShotTone(ctx, now, 'square', 220, 180, { peak: 0.052, attack: 0.008, release: 0.16 });
                    this.playOneShotTone(ctx, now + 0.1, 'square', 260, 210, { peak: 0.046, attack: 0.008, release: 0.14 });
                    this.playNoiseBurst(ctx, now + 0.03, {
                        duration: 0.14,
                        peak: 0.02,
                        filterFrequency: 760,
                        filterType: 'bandpass',
                    });
                },
            ],
        };
        this.pickOne([...(themedVariants[stampId ?? 'circle'] ?? []), ...shapeVariants])();
    }

    /** Resolve the last phrase quietly to its tonic, once per completed stroke. */
    public playStrokeEndSound() {
        const preset = this.endingPreset;
        this.endingPreset = null;
        if (!preset || !this.enabled || this.audioCtx?.state !== 'running') return;
        this.playDrawingNote(this.audioCtx, preset, DRAWING_NOTES[0], true);
    }
}

export const soundManager = new SoundManager();
