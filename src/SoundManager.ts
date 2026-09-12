import type { StampId } from './types';

type DrawingSparkleProfile = 'twinkle' | 'bubble' | 'swoosh' | 'magic';

interface DrawingSoundPreset {
    name: string;
    leadType: OscillatorType;
    harmonyType: OscillatorType;
    baseNotes: readonly number[];
    harmonyRatio: number;
    lfoRate: number;
    lfoDepth: number;
    leadPeak: number;
    harmonyPeak: number;
    attack: number;
    glideTo?: number;
    sparkleProfile: DrawingSparkleProfile;
    sparkleDelay: {
        min: number;
        max: number;
    };
}

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
    drawStart: ['draw-start-magic-1', 'draw-start-magic-2', 'rainbow-glitter-1'],
    drawTwinkle: ['draw-twinkle-1', 'draw-twinkle-2'],
    drawBubble: ['draw-bubble-1', 'draw-bubble-2'],
    drawSwoosh: ['draw-swoosh-1', 'draw-swoosh-2'],
    drawMagic: ['draw-magic-1', 'draw-magic-2'],
    strokeEnd: ['stroke-finish-ding', 'stroke-finish-spark', 'stroke-finish-pop'],
} as const;

class SoundManager {
    private static readonly OUTPUT_BOOST = 4;
    private static readonly DRAWING_PRESETS: readonly DrawingSoundPreset[] = [
        {
            name: 'fluffy',
            leadType: 'triangle',
            harmonyType: 'sine',
            baseNotes: [196, 220, 247, 262, 294, 330],
            harmonyRatio: 1.5,
            lfoRate: 2.4,
            lfoDepth: 18,
            leadPeak: 0.038,
            harmonyPeak: 0.024,
            attack: 0.1,
            sparkleProfile: 'twinkle',
            sparkleDelay: { min: 180, max: 280 },
        },
        {
            name: 'sparkle',
            leadType: 'sine',
            harmonyType: 'triangle',
            baseNotes: [330, 392, 440, 494, 523, 587],
            harmonyRatio: 2,
            lfoRate: 5.2,
            lfoDepth: 12,
            leadPeak: 0.034,
            harmonyPeak: 0.02,
            attack: 0.06,
            sparkleProfile: 'twinkle',
            sparkleDelay: { min: 110, max: 210 },
        },
        {
            name: 'zoom',
            leadType: 'sawtooth',
            harmonyType: 'sine',
            baseNotes: [165, 196, 220, 247, 262],
            harmonyRatio: 1.25,
            lfoRate: 1.8,
            lfoDepth: 28,
            leadPeak: 0.026,
            harmonyPeak: 0.028,
            attack: 0.08,
            glideTo: 1.35,
            sparkleProfile: 'swoosh',
            sparkleDelay: { min: 210, max: 340 },
        },
        {
            name: 'bubble',
            leadType: 'square',
            harmonyType: 'triangle',
            baseNotes: [147, 165, 175, 196, 220, 247],
            harmonyRatio: 1.75,
            lfoRate: 3.6,
            lfoDepth: 20,
            leadPeak: 0.022,
            harmonyPeak: 0.026,
            attack: 0.05,
            sparkleProfile: 'bubble',
            sparkleDelay: { min: 150, max: 260 },
        },
        {
            name: 'magic',
            leadType: 'triangle',
            harmonyType: 'sine',
            baseNotes: [220, 262, 311, 370, 415, 494],
            harmonyRatio: 1.68,
            lfoRate: 6,
            lfoDepth: 34,
            leadPeak: 0.032,
            harmonyPeak: 0.026,
            attack: 0.07,
            glideTo: 0.88,
            sparkleProfile: 'magic',
            sparkleDelay: { min: 130, max: 240 },
        },
    ];

    private audioCtx: AudioContext | null = null;
    private outputGain: GainNode | null = null;
    private drawLeadOsc: OscillatorNode | null = null;
    private drawHarmonyOsc: OscillatorNode | null = null;
    private drawLfoOsc: OscillatorNode | null = null;
    private drawLfoGain: GainNode | null = null;
    private drawLeadGain: GainNode | null = null;
    private drawHarmonyGain: GainNode | null = null;
    private drawGain: GainNode | null = null;
    private currentDrawingPreset: DrawingSoundPreset | null = null;
    private sparkleTimer: number | null = null;
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
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        if (this.drawLeadOsc) return; // Already playing

        const preset = this.pickOne(SoundManager.DRAWING_PRESETS);
        const base = this.pickOne(preset.baseNotes);
        const leadOsc = ctx.createOscillator();
        const harmonyOsc = ctx.createOscillator();
        const lfoOsc = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const leadGain = ctx.createGain();
        const harmonyGain = ctx.createGain();
        const masterGain = ctx.createGain();
        const now = ctx.currentTime;

        this.playSample(ctx, SAMPLE_GROUPS.drawStart, { gain: 0.38, jitter: 0.08 });

        leadOsc.type = preset.leadType;
        leadOsc.frequency.setValueAtTime(base, now);
        if (preset.glideTo) {
            leadOsc.frequency.exponentialRampToValueAtTime(base * preset.glideTo, now + 0.24);
        }
        leadOsc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

        harmonyOsc.type = preset.harmonyType;
        harmonyOsc.frequency.setValueAtTime(base * preset.harmonyRatio, now);
        if (preset.glideTo) {
            harmonyOsc.frequency.exponentialRampToValueAtTime(base * preset.harmonyRatio * preset.glideTo, now + 0.28);
        }
        harmonyOsc.detune.setValueAtTime((Math.random() - 0.5) * 12, now);

        lfoOsc.type = 'sine';
        lfoOsc.frequency.setValueAtTime(preset.lfoRate + Math.random() * 0.8, now);
        lfoGain.gain.setValueAtTime(preset.lfoDepth + Math.random() * 8, now);

        leadGain.gain.setValueAtTime(preset.leadPeak, now);
        harmonyGain.gain.setValueAtTime(preset.harmonyPeak, now);

        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.linearRampToValueAtTime(1, now + preset.attack);

        lfoOsc.connect(lfoGain);
        lfoGain.connect(leadOsc.frequency);
        lfoGain.connect(harmonyOsc.frequency);

        leadOsc.connect(leadGain);
        harmonyOsc.connect(harmonyGain);
        leadGain.connect(masterGain);
        harmonyGain.connect(masterGain);
        masterGain.connect(this.getOutputGain(ctx));

        leadOsc.start(now);
        harmonyOsc.start(now);
        lfoOsc.start(now);

        this.drawLeadOsc = leadOsc;
        this.drawHarmonyOsc = harmonyOsc;
        this.drawLfoOsc = lfoOsc;
        this.drawLfoGain = lfoGain;
        this.drawLeadGain = leadGain;
        this.drawHarmonyGain = harmonyGain;
        this.drawGain = masterGain;
        this.currentDrawingPreset = preset;

        this.scheduleNextSparkle();
    }

    private scheduleNextSparkle() {
        this.clearSparkleTimer();
        if (!this.drawLeadOsc) return;
        const delay = this.currentDrawingPreset?.sparkleDelay ?? { min: 170, max: 230 };
        this.sparkleTimer = window.setTimeout(() => {
            this.playDrawingSparkle();
            this.scheduleNextSparkle();
        }, this.randomBetween(delay.min, delay.max));
    }

    private clearSparkleTimer() {
        if (this.sparkleTimer !== null) {
            clearTimeout(this.sparkleTimer);
            this.sparkleTimer = null;
        }
    }

    private playDrawingSparkle() {
        if (!this.drawLeadOsc) return;
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const profile = this.currentDrawingPreset?.sparkleProfile ?? 'twinkle';

        if (profile === 'bubble') {
            if (Math.random() < 0.8 && this.playSample(ctx, SAMPLE_GROUPS.drawBubble, { gain: 0.42, jitter: 0.1 })) return;
            this.playOneShotTone(ctx, now, 'sine', this.randomBetween(240, 380), this.randomBetween(420, 620), {
                peak: 0.03,
                attack: 0.006,
                release: 0.09,
            });
            return;
        }

        if (profile === 'swoosh') {
            if (Math.random() < 0.75 && this.playSample(ctx, SAMPLE_GROUPS.drawSwoosh, { gain: 0.38, jitter: 0.08 })) return;
            this.playNoiseBurst(ctx, now, {
                duration: 0.12,
                peak: 0.025,
                filterFrequency: this.randomBetween(900, 1800),
                filterType: 'bandpass',
            });
            this.playOneShotTone(ctx, now + 0.02, 'triangle', this.randomBetween(420, 620), this.randomBetween(760, 980), {
                peak: 0.026,
                attack: 0.004,
                release: 0.09,
            });
            return;
        }

        if (profile === 'magic') {
            if (Math.random() < 0.8 && this.playSample(ctx, SAMPLE_GROUPS.drawMagic, { gain: 0.4, jitter: 0.08 })) return;
            this.playOneShotTone(ctx, now, 'sine', this.randomBetween(720, 980), this.randomBetween(1120, 1480), {
                peak: 0.026,
                attack: 0.004,
                release: 0.08,
            });
            this.playOneShotTone(ctx, now + 0.045, 'triangle', this.randomBetween(520, 680), this.randomBetween(880, 1180), {
                peak: 0.022,
                attack: 0.004,
                release: 0.08,
            });
            return;
        }

        if (Math.random() < 0.8 && this.playSample(ctx, SAMPLE_GROUPS.drawTwinkle, { gain: 0.42, jitter: 0.1 })) return;
        this.playOneShotTone(ctx, now, 'sine', this.randomBetween(660, 1180), this.randomBetween(920, 1540), {
            peak: 0.032,
            attack: 0.006,
            release: 0.11,
        });
    }

    private clearDrawingNodes() {
        this.drawLeadOsc = null;
        this.drawHarmonyOsc = null;
        this.drawLfoOsc = null;
        this.drawLfoGain = null;
        this.drawLeadGain = null;
        this.drawHarmonyGain = null;
        this.drawGain = null;
        this.currentDrawingPreset = null;
    }

    public stopDrawingSound() {
        this.clearSparkleTimer();
        if (!this.audioCtx) return;
        if (
            !this.drawLeadOsc ||
            !this.drawHarmonyOsc ||
            !this.drawLfoOsc ||
            !this.drawLfoGain ||
            !this.drawLeadGain ||
            !this.drawHarmonyGain ||
            !this.drawGain
        ) {
            this.clearDrawingNodes();
            return;
        }

        const leadOsc = this.drawLeadOsc;
        const harmonyOsc = this.drawHarmonyOsc;
        const lfoOsc = this.drawLfoOsc;
        const lfoGain = this.drawLfoGain;
        const leadGain = this.drawLeadGain;
        const harmonyGain = this.drawHarmonyGain;
        const masterGain = this.drawGain;
        const now = this.audioCtx.currentTime;
        const stopAt = now + 0.12;

        this.clearDrawingNodes();

        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(Math.max(masterGain.gain.value, 0.0001), now);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, stopAt);

        leadOsc.stop(stopAt);
        harmonyOsc.stop(stopAt);
        lfoOsc.stop(stopAt);

        window.setTimeout(() => {
            leadOsc.disconnect();
            harmonyOsc.disconnect();
            lfoOsc.disconnect();
            lfoGain.disconnect();
            leadGain.disconnect();
            harmonyGain.disconnect();
            masterGain.disconnect();
        }, 170);
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

    /** Plays one of several cheerful stroke-ending flourishes. */
    public playStrokeEndSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        if (this.playSample(ctx, SAMPLE_GROUPS.strokeEnd, { gain: 0.5, jitter: 0.06 })) return;
        const variants = [
            () => {
                this.playOneShotTone(ctx, now, 'triangle', 320, 520, { peak: 0.065, attack: 0.008, release: 0.14 });
                this.playOneShotTone(ctx, now + 0.03, 'sine', 520, 760, { peak: 0.045, attack: 0.006, release: 0.11 });
            },
            () => {
                this.playOneShotTone(ctx, now, 'sine', 640, 980, { peak: 0.048, attack: 0.004, release: 0.09 });
                this.playOneShotTone(ctx, now + 0.055, 'triangle', 820, 1180, { peak: 0.038, attack: 0.004, release: 0.08 });
            },
            () => {
                this.playNoiseBurst(ctx, now, {
                    duration: 0.11,
                    peak: 0.022,
                    filterFrequency: 2200,
                    filterType: 'bandpass',
                });
                this.playOneShotTone(ctx, now + 0.025, 'triangle', 420, 300, { peak: 0.042, attack: 0.006, release: 0.1 });
            },
        ];
        this.pickOne(variants)();
    }
}

export const soundManager = new SoundManager();
