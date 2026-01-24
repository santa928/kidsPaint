class SoundManager {
    private audioCtx: AudioContext | null = null;
    private drawOsc: OscillatorNode | null = null;
    private drawGain: GainNode | null = null;
    private isUnlocked: boolean = false;
    private enabled: boolean = false;

    constructor() {
        // Lazy init
    }

    public setEnabled(enabled: boolean) {
        this.enabled = enabled;
        if (!enabled) {
            this.stopDrawingSound();
        }
    }

    private initCtx() {
        if (!this.audioCtx) {
            const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
            if (Ctx) {
                this.audioCtx = new Ctx();
            }
        }
    }

    public async unlock() {
        this.initCtx();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
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

    public startDrawingSound() {
        if (!this.enabled || !this.isUnlocked) return;
        this.initCtx();
        if (!this.audioCtx) return;

        if (this.drawOsc) return; // Already playing

        // Simple low frequency rumble/hum or pleasant sine
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, this.audioCtx.currentTime); // Base freq
        // Modulate freq slightly for fun? kept simple for now.

        gain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.audioCtx.currentTime + 0.1); // Fade in

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        this.drawOsc = osc;
        this.drawGain = gain;
    }

    public stopDrawingSound() {
        if (this.drawOsc && this.drawGain && this.audioCtx) {
            const osc = this.drawOsc;
            const gain = this.drawGain;

            this.drawOsc = null;
            this.drawGain = null;

            // Fade out
            const now = this.audioCtx.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.1);

            setTimeout(() => {
                osc.stop();
                osc.disconnect();
                gain.disconnect();
            }, 150);
        }
    }

    public playEndSound() {
        if (!this.enabled || !this.isUnlocked) return;
        this.initCtx();
        if (!this.audioCtx) return;

        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, this.audioCtx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.1, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.2);
    }
}

export const soundManager = new SoundManager();
