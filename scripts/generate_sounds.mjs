import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_RATE = 44100;
const OUT_DIR = join(process.cwd(), 'public', 'sounds');
const TWO_PI = Math.PI * 2;

const sounds = [
  { name: 'color-chime-1', duration: 0.22, tones: [[560, 840, 0, 0.11, 0.55, 'sine'], [760, 1080, 0.06, 0.13, 0.4, 'triangle']] },
  { name: 'color-chime-2', duration: 0.2, tones: [[420, 680, 0, 0.12, 0.52, 'triangle'], [920, 1180, 0.08, 0.08, 0.28, 'sine']] },
  { name: 'color-plink-1', duration: 0.16, tones: [[720, 620, 0, 0.09, 0.5, 'sine'], [980, 1320, 0.05, 0.08, 0.32, 'sine']] },
  { name: 'rainbow-rise-1', duration: 0.32, tones: [[523, 640, 0, 0.11, 0.36, 'sine'], [659, 805, 0.055, 0.11, 0.36, 'sine'], [784, 960, 0.11, 0.11, 0.36, 'sine'], [1046, 1320, 0.17, 0.12, 0.34, 'triangle']] },
  { name: 'rainbow-rise-2', duration: 0.36, tones: [[392, 784, 0, 0.22, 0.38, 'triangle'], [587, 1174, 0.08, 0.2, 0.3, 'sine'], [988, 1480, 0.18, 0.12, 0.25, 'sine']] },
  { name: 'rainbow-glitter-1', duration: 0.34, tones: [[880, 1320, 0, 0.08, 0.24, 'sine'], [660, 1140, 0.04, 0.09, 0.28, 'sine'], [1046, 1560, 0.09, 0.1, 0.26, 'triangle'], [784, 1280, 0.16, 0.11, 0.26, 'sine']] },
  { name: 'brush-pop-small', duration: 0.14, tones: [[560, 360, 0, 0.11, 0.48, 'triangle'], [900, 620, 0.02, 0.08, 0.22, 'sine']] },
  { name: 'brush-pop-medium', duration: 0.16, tones: [[390, 250, 0, 0.13, 0.5, 'triangle'], [620, 430, 0.025, 0.09, 0.24, 'sine']] },
  { name: 'brush-pop-big', duration: 0.18, tones: [[250, 160, 0, 0.15, 0.54, 'triangle'], [360, 260, 0.03, 0.1, 0.26, 'sine']] },
  { name: 'eraser-wipe-1', duration: 0.2, noise: [[0, 0.18, 0.42, 'highpass', 1700]], tones: [[520, 300, 0.02, 0.11, 0.2, 'sine']] },
  { name: 'eraser-wipe-2', duration: 0.22, noise: [[0, 0.2, 0.36, 'bandpass', 1300]], tones: [[360, 520, 0.04, 0.1, 0.18, 'triangle']] },
  { name: 'undo-rewind-1', duration: 0.24, tones: [[820, 420, 0, 0.14, 0.42, 'triangle'], [540, 320, 0.06, 0.13, 0.34, 'sine']] },
  { name: 'undo-rewind-2', duration: 0.28, tones: [[980, 500, 0, 0.12, 0.28, 'sine'], [720, 360, 0.07, 0.14, 0.34, 'triangle'], [480, 260, 0.14, 0.1, 0.24, 'sine']] },
  { name: 'clear-cascade-1', duration: 0.46, noise: [[0, 0.24, 0.28, 'bandpass', 2400]], tones: [[392, 460, 0, 0.13, 0.28, 'triangle'], [523, 620, 0.06, 0.13, 0.28, 'sine'], [659, 780, 0.12, 0.13, 0.28, 'triangle'], [784, 960, 0.18, 0.14, 0.26, 'sine'], [1046, 1320, 0.26, 0.14, 0.24, 'triangle']] },
  { name: 'clear-cascade-2', duration: 0.42, noise: [[0, 0.2, 0.22, 'highpass', 2200]], tones: [[880, 620, 0, 0.12, 0.27, 'sine'], [660, 980, 0.08, 0.13, 0.3, 'triangle'], [990, 1480, 0.19, 0.16, 0.25, 'sine']] },
  { name: 'stamp-boop-1', duration: 0.16, tones: [[430, 240, 0, 0.12, 0.6, 'square']] },
  { name: 'stamp-bounce-1', duration: 0.22, tones: [[250, 420, 0, 0.1, 0.5, 'triangle'], [420, 300, 0.07, 0.11, 0.36, 'sine']] },
  { name: 'stamp-spring-1', duration: 0.2, tones: [[780, 1220, 0, 0.11, 0.42, 'sine'], [560, 260, 0.02, 0.13, 0.3, 'saw']] },
  { name: 'stamp-shape-punch', duration: 0.14, noise: [[0, 0.08, 0.28, 'bandpass', 850]], tones: [[300, 190, 0, 0.1, 0.45, 'square']] },
  { name: 'stamp-rabbit-hop', duration: 0.28, tones: [[360, 620, 0, 0.11, 0.42, 'triangle'], [460, 780, 0.11, 0.12, 0.36, 'triangle']] },
  { name: 'stamp-bird-chirp', duration: 0.22, tones: [[1120, 1460, 0, 0.08, 0.34, 'sine'], [980, 1320, 0.055, 0.08, 0.32, 'sine'], [1320, 1680, 0.12, 0.07, 0.24, 'sine']] },
  { name: 'stamp-train-toot', duration: 0.36, noise: [[0.03, 0.17, 0.18, 'bandpass', 760]], tones: [[220, 180, 0, 0.18, 0.48, 'square'], [260, 210, 0.14, 0.16, 0.4, 'square']] },
  { name: 'draw-start-magic-1', duration: 0.24, tones: [[420, 720, 0, 0.16, 0.28, 'triangle'], [840, 1180, 0.06, 0.13, 0.22, 'sine']] },
  { name: 'draw-start-magic-2', duration: 0.24, tones: [[300, 500, 0, 0.16, 0.3, 'sine'], [900, 640, 0.04, 0.13, 0.2, 'triangle']] },
  { name: 'draw-twinkle-1', duration: 0.13, tones: [[920, 1380, 0, 0.1, 0.28, 'sine']] },
  { name: 'draw-twinkle-2', duration: 0.15, tones: [[660, 1040, 0, 0.1, 0.24, 'triangle'], [1040, 1480, 0.045, 0.08, 0.22, 'sine']] },
  { name: 'draw-bubble-1', duration: 0.12, tones: [[260, 520, 0, 0.09, 0.3, 'sine']] },
  { name: 'draw-bubble-2', duration: 0.14, tones: [[340, 610, 0, 0.1, 0.28, 'triangle']] },
  { name: 'draw-swoosh-1', duration: 0.18, noise: [[0, 0.14, 0.22, 'bandpass', 1500]], tones: [[440, 920, 0.02, 0.12, 0.18, 'triangle']] },
  { name: 'draw-swoosh-2', duration: 0.2, noise: [[0, 0.16, 0.24, 'highpass', 1800]], tones: [[620, 980, 0.04, 0.12, 0.16, 'sine']] },
  { name: 'draw-magic-1', duration: 0.17, tones: [[720, 1120, 0, 0.09, 0.24, 'sine'], [520, 880, 0.055, 0.09, 0.2, 'triangle']] },
  { name: 'draw-magic-2', duration: 0.16, tones: [[980, 1480, 0, 0.09, 0.22, 'sine'], [620, 980, 0.04, 0.09, 0.2, 'triangle']] },
  { name: 'stroke-finish-ding', duration: 0.24, tones: [[640, 980, 0, 0.11, 0.38, 'sine'], [820, 1180, 0.07, 0.11, 0.3, 'triangle']] },
  { name: 'stroke-finish-spark', duration: 0.24, noise: [[0, 0.1, 0.16, 'bandpass', 2200]], tones: [[420, 300, 0.03, 0.12, 0.36, 'triangle']] },
  { name: 'stroke-finish-pop', duration: 0.2, tones: [[320, 520, 0, 0.13, 0.44, 'triangle'], [520, 760, 0.04, 0.1, 0.3, 'sine']] },
];

function renderSound(definition) {
  const frameCount = Math.ceil(definition.duration * SAMPLE_RATE);
  const data = new Float32Array(frameCount);

  for (const tone of definition.tones ?? []) {
    const [startFreq, endFreq, start, duration, amplitude, wave] = tone;
    const startFrame = Math.floor(start * SAMPLE_RATE);
    const toneFrames = Math.max(1, Math.floor(duration * SAMPLE_RATE));
    for (let i = 0; i < toneFrames && startFrame + i < data.length; i += 1) {
      const t = i / SAMPLE_RATE;
      const progress = i / toneFrames;
      const freq = startFreq * (endFreq / startFreq) ** progress;
      const envelope = makeEnvelope(progress);
      data[startFrame + i] += oscillator(wave, t, freq) * envelope * amplitude;
    }
  }

  for (const noise of definition.noise ?? []) {
    const [start, duration, amplitude, filter, filterFrequency] = noise;
    addNoise(data, start, duration, amplitude, filter, filterFrequency);
  }

  return floatToWav(data);
}

function oscillator(wave, time, frequency) {
  const phase = (time * frequency) % 1;
  if (wave === 'square') return phase < 0.5 ? 1 : -1;
  if (wave === 'saw') return phase * 2 - 1;
  if (wave === 'triangle') return 1 - 4 * Math.abs(Math.round(phase - 0.25) - (phase - 0.25));
  return Math.sin(TWO_PI * phase);
}

function makeEnvelope(progress) {
  const attack = Math.min(progress / 0.12, 1);
  const release = Math.max(0, 1 - progress);
  return attack * release * release;
}

function addNoise(data, start, duration, amplitude, filter, filterFrequency) {
  const startFrame = Math.floor(start * SAMPLE_RATE);
  const frames = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  let previous = 0;
  let seed = 1337 + startFrame + frames;
  const smoothing = Math.min(0.98, Math.max(0.02, filterFrequency / SAMPLE_RATE));

  for (let i = 0; i < frames && startFrame + i < data.length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const raw = (seed / 0xffffffff) * 2 - 1;
    previous += (raw - previous) * smoothing;
    const shaped = filter === 'highpass' ? raw - previous : previous;
    const progress = i / frames;
    data[startFrame + i] += shaped * makeEnvelope(progress) * amplitude;
  }
}

function floatToWav(data) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = Buffer.alloc(44 + data.length * bytesPerSample);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + data.length * bytesPerSample, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(data.length * bytesPerSample, 40);

  for (let i = 0; i < data.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, data[i] * 0.85));
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * bytesPerSample);
  }

  return buffer;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const sound of sounds) {
  writeFileSync(join(OUT_DIR, `${sound.name}.wav`), renderSound(sound));
}

console.log(`Generated ${sounds.length} sounds in ${OUT_DIR}`);
