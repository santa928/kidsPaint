class SoundManager {
    private static readonly OUTPUT_BOOST = 1.5;
    private audioCtx: AudioContext | null = null;
    private outputGain: GainNode | null = null;
    private drawLeadOsc: OscillatorNode | null = null;
    private drawHarmonyOsc: OscillatorNode | null = null;
    private drawLfoOsc: OscillatorNode | null = null;
    private drawLfoGain: GainNode | null = null;
    private drawLeadGain: GainNode | null = null;
    private drawHarmonyGain: GainNode | null = null;
    private drawGain: GainNode | null = null;
    private sparkleTimer: number | null = null;
    private isUnlocked: boolean = false;
    private enabled: boolean = false;
    private volume: number = 1.2;

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
        return Math.min(3, Math.max(0, volume * SoundManager.OUTPUT_BOOST));
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
            } catch (e) {
                console.error('Audio resume failed', e);
            }
        } else {
            this.isUnlocked = true;
        }
    }

    private getPlayableContext() {
        if (!this.enabled) return null;
        if (!this.isUnlocked) {
            void this.unlock();
            return null;
        }
        this.initCtx();
        return this.audioCtx;
    }

    public startDrawingSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        if (this.drawLeadOsc) return; // Already playing

        const notes = [220, 247, 262, 294, 330, 349, 392];
        const base = notes[Math.floor(Math.random() * notes.length)];
        const leadOsc = ctx.createOscillator();
        const harmonyOsc = ctx.createOscillator();
        const lfoOsc = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const leadGain = ctx.createGain();
        const harmonyGain = ctx.createGain();
        const masterGain = ctx.createGain();
        const now = ctx.currentTime;

        leadOsc.type = 'triangle';
        leadOsc.frequency.setValueAtTime(base, now);
        leadOsc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);

        harmonyOsc.type = 'sine';
        harmonyOsc.frequency.setValueAtTime(base * 1.5, now);
        harmonyOsc.detune.setValueAtTime((Math.random() - 0.5) * 12, now);

        lfoOsc.type = 'sine';
        lfoOsc.frequency.setValueAtTime(2.8 + Math.random() * 1.8, now);
        lfoGain.gain.setValueAtTime(24 + Math.random() * 10, now);

        leadGain.gain.setValueAtTime(0.04, now);
        harmonyGain.gain.setValueAtTime(0.022, now);

        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.linearRampToValueAtTime(1, now + 0.08);

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

        this.scheduleNextSparkle();
    }

    private scheduleNextSparkle() {
        this.clearSparkleTimer();
        if (!this.drawLeadOsc) return;
        this.sparkleTimer = window.setTimeout(() => {
            this.playDrawingSparkle();
            this.scheduleNextSparkle();
        }, 170 + Math.random() * 230);
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
        const spark = ctx.createOscillator();
        const sparkGain = ctx.createGain();
        const tones = [660, 784, 880, 988, 1046, 1174];
        const startFreq = tones[Math.floor(Math.random() * tones.length)];

        spark.type = 'sine';
        spark.frequency.setValueAtTime(startFreq, now);
        spark.frequency.exponentialRampToValueAtTime(startFreq * 1.25, now + 0.08);

        sparkGain.gain.setValueAtTime(0.0001, now);
        sparkGain.gain.linearRampToValueAtTime(0.035, now + 0.015);
        sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

        spark.connect(sparkGain);
        sparkGain.connect(this.getOutputGain(ctx));
        spark.start(now);
        spark.stop(now + 0.13);

        spark.onended = () => {
            spark.disconnect();
            sparkGain.disconnect();
        };
    }

    private clearDrawingNodes() {
        this.drawLeadOsc = null;
        this.drawHarmonyOsc = null;
        this.drawLfoOsc = null;
        this.drawLfoGain = null;
        this.drawLeadGain = null;
        this.drawHarmonyGain = null;
        this.drawGain = null;
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

    public playStampSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const variants = [
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
        const variant = variants[Math.floor(Math.random() * variants.length)];
        variant();
    }

    public playStrokeEndSound() {
        const ctx = this.getPlayableContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        this.playOneShotTone(ctx, now, 'triangle', 320, 520, { peak: 0.065, attack: 0.008, release: 0.14 });
        this.playOneShotTone(ctx, now + 0.03, 'sine', 520, 760, { peak: 0.045, attack: 0.006, release: 0.11 });
    }
}

export const soundManager = new SoundManager();
