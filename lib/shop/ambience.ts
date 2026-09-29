/**
 * The shop's sound, synthesised on the spot with Web Audio — rain on the
 * window, the crackle of a needle in the groove, sleeves being flicked, the
 * cat. Nothing is downloaded, so there is nothing for the CSP to allow.
 *
 * Browsers only let audio start from a user gesture, so nothing is created
 * until `start()` is called from one.
 */

type Ctx = AudioContext;

/** White noise, filtered by the caller into whatever it needs. */
function noiseBuffer(ctx: Ctx, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Surface noise: mostly silence, with sparse clicks of random size and the odd
 * pop. Kept pure so its character can be checked without an audio device.
 */
export function crackleSamples(
  length: number,
  random: () => number = Math.random,
): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const roll = random();
    if (roll < 0.0009) {
      // A click: a few samples decaying fast.
      const size = (random() * 0.5 + 0.2) * (random() < 0.08 ? 1.4 : 1);
      const sign = random() < 0.5 ? -1 : 1;
      for (let k = 0; k < 6 && i + k < length; k++) {
        // Overlapping clicks add up; keep the sum inside full scale.
        const sum = data[i + k] + sign * size * Math.exp(-k * 0.9);
        data[i + k] = Math.max(-1, Math.min(1, sum));
      }
    } else {
      data[i] = Math.max(-1, Math.min(1, data[i] + (random() * 2 - 1) * 0.012));
    }
  }
  return data;
}

export class Ambience {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private crackle: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private playing = false;

  /** Safe to call on every gesture; only the first one does anything. */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }

    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;

    const ctx = new AudioCtor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);
    this.noise = noiseBuffer(ctx, 3);

    this.startRain(ctx, this.master);

    const crackleBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    crackleBuffer.copyToChannel(
      crackleSamples(crackleBuffer.length) as Float32Array<ArrayBuffer>,
      0,
    );
    const crackleSource = ctx.createBufferSource();
    crackleSource.buffer = crackleBuffer;
    crackleSource.loop = true;
    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = "highpass";
    crackleFilter.frequency.value = 900;
    this.crackle = ctx.createGain();
    this.crackle.gain.value = this.playing ? 0.35 : 0;
    crackleSource.connect(crackleFilter).connect(this.crackle).connect(this.master);
    crackleSource.start();
  }

  /** Steady rain against glass: pink-ish noise, band-limited, gently swelling. */
  private startRain(ctx: Ctx, out: AudioNode) {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 2400;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 300;

    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    // A slow swell, as gusts push the rain against the window.
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.07;
    const depth = ctx.createGain();
    depth.gain.value = 0.025;
    swell.connect(depth).connect(gain.gain);
    swell.start();

    source.connect(high).connect(low).connect(gain).connect(out);
    source.start();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.1);
    }
  }

  /** The needle is down: bring the crackle up. */
  setPlaying(playing: boolean): void {
    this.playing = playing;
    if (this.ctx && this.crackle) {
      this.crackle.gain.setTargetAtTime(playing ? 0.35 : 0, this.ctx.currentTime, 0.4);
    }
  }

  /** The papery swish of a sleeve going past. */
  flick(): void {
    this.burst({ duration: 0.12, frequency: 2800, q: 0.8, level: 0.28 });
  }

  /** A sleeve pulled clear of the crate. */
  lift(): void {
    this.burst({ duration: 0.3, frequency: 1600, q: 0.6, level: 0.22 });
  }

  /** The record settling onto the platter. */
  thunk(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  /** The bell over the door as you come in. */
  bell(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    [1318.5, 1760].forEach((frequency, i) => {
      const start = now + i * 0.14;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.4);
      osc.connect(gain).connect(this.master!);
      osc.start(start);
      osc.stop(start + 1.5);
    });
  }

  /** A contented cat: a low buzz fluttering at purring speed. */
  purr(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 26;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const flutter = ctx.createOscillator();
    flutter.frequency.value = 2.2; // breaths in and out
    const flutterDepth = ctx.createGain();
    flutterDepth.gain.value = 0.12;
    flutter.connect(flutterDepth).connect(gain.gain);

    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(1, now + 0.3);
    envelope.gain.setValueAtTime(1, now + 1.6);
    envelope.gain.linearRampToValueAtTime(0, now + 2.2);

    osc.connect(filter).connect(gain).connect(envelope).connect(this.master);
    osc.start(now);
    flutter.start(now);
    osc.stop(now + 2.3);
    flutter.stop(now + 2.3);
  }

  private burst(options: {
    duration: number;
    frequency: number;
    q: number;
    level: number;
  }) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(options.frequency, now);
    filter.frequency.exponentialRampToValueAtTime(
      options.frequency * 0.5,
      now + options.duration,
    );
    filter.Q.value = options.q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(options.level, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + options.duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 2);
    source.stop(now + options.duration + 0.05);
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.crackle = null;
  }
}
