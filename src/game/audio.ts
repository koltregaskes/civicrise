import { UserOptions } from "./types";

const DEFAULT_OPTIONS: UserOptions = {
  musicEnabled: true,
  soundEnabled: true,
  masterVolume: 0.74,
  reducedMotion: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function noteToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

export class CivicriseAudio {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private options: UserOptions = DEFAULT_OPTIONS;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private musicInterval: number | null = null;
  private started = false;

  async prime(): Promise<void> {
    if (!this.context) {
      const AudioCtor =
        window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        return;
      }
      this.context = new AudioCtor();
      this.masterGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.ambienceGain = this.context.createGain();
      this.ambienceFilter = this.context.createBiquadFilter();

      this.masterGain.connect(this.context.destination);
      this.musicGain.connect(this.masterGain);
      this.ambienceGain.connect(this.ambienceFilter);
      this.ambienceFilter.connect(this.masterGain);

      this.ambienceFilter.type = "lowpass";
      this.ambienceFilter.frequency.value = 920;
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    if (!this.started) {
      this.startSoundscape();
      this.started = true;
    }

    this.applyOptions();
  }

  setOptions(options: UserOptions): void {
    this.options = options;
    this.applyOptions();
  }

  updateMix(activeCars: number, servicePressure: number): void {
    if (!this.context || !this.ambienceGain || !this.ambienceFilter) {
      return;
    }

    const time = this.context.currentTime;
    const targetAmbience =
      this.options.musicEnabled || this.options.soundEnabled
        ? clamp(0.04 + activeCars * 0.006 + servicePressure * 0.001, 0.03, 0.22)
        : 0;
    this.ambienceGain.gain.cancelScheduledValues(time);
    this.ambienceGain.gain.linearRampToValueAtTime(targetAmbience * this.options.masterVolume, time + 0.6);
    this.ambienceFilter.frequency.cancelScheduledValues(time);
    this.ambienceFilter.frequency.linearRampToValueAtTime(700 + activeCars * 14, time + 0.7);
  }

  playCue(kind: "place" | "ui" | "warning" | "milestone" | "failure"): void {
    if (!this.context || !this.masterGain || !this.options.soundEnabled) {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.connect(gain);
    gain.connect(this.masterGain);

    const now = this.context.currentTime;
    const profile = {
      place: { start: 480, end: 760, wave: "triangle" as OscillatorType, decay: 0.08, level: 0.05 },
      ui: { start: 410, end: 520, wave: "sine" as OscillatorType, decay: 0.06, level: 0.04 },
      warning: { start: 250, end: 160, wave: "sawtooth" as OscillatorType, decay: 0.14, level: 0.05 },
      milestone: { start: 420, end: 720, wave: "triangle" as OscillatorType, decay: 0.26, level: 0.08 },
      failure: { start: 220, end: 140, wave: "square" as OscillatorType, decay: 0.24, level: 0.08 },
    }[kind];

    oscillator.type = profile.wave;
    oscillator.frequency.setValueAtTime(profile.start, now);
    oscillator.frequency.exponentialRampToValueAtTime(profile.end, now + profile.decay);
    gain.gain.setValueAtTime(profile.level * this.options.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.decay);

    oscillator.start(now);
    oscillator.stop(now + profile.decay + 0.02);
  }

  dispose(): void {
    if (this.musicInterval !== null) {
      window.clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    this.ambienceSource?.stop();
    this.ambienceSource = null;
    void this.context?.close();
    this.context = null;
    this.started = false;
  }

  private applyOptions(): void {
    if (!this.masterGain || !this.musicGain || !this.ambienceGain) {
      return;
    }

    const baseVolume = this.options.masterVolume;
    this.masterGain.gain.value = clamp(baseVolume, 0, 1);
    this.musicGain.gain.value = this.options.musicEnabled ? 0.11 * baseVolume : 0;
    if (!this.options.musicEnabled && this.ambienceGain) {
      this.ambienceGain.gain.value = 0;
    }
  }

  private startSoundscape(): void {
    if (!this.context || !this.masterGain || !this.musicGain || !this.ambienceGain || !this.ambienceFilter) {
      return;
    }

    const noise = this.context.createBufferSource();
    noise.buffer = createNoiseBuffer(this.context);
    noise.loop = true;
    noise.connect(this.ambienceGain);
    noise.start();
    this.ambienceSource = noise;

    const chordSets = [
      [50, 57, 62],
      [52, 59, 64],
      [47, 54, 59],
      [45, 52, 57],
    ];

    const playChord = (notes: number[], duration: number): void => {
      if (!this.context || !this.musicGain || !this.options.musicEnabled) {
        return;
      }

      const now = this.context.currentTime;
      notes.forEach((note, index) => {
        const oscillator = this.context!.createOscillator();
        const gain = this.context!.createGain();
        oscillator.connect(gain);
        gain.connect(this.musicGain!);

        oscillator.type = index === 0 ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(noteToFrequency(note), now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime((0.035 - index * 0.008) * this.options.masterVolume, now + 0.28);
        gain.gain.linearRampToValueAtTime(0.0001, now + duration);

        oscillator.start(now);
        oscillator.stop(now + duration + 0.08);
      });
    };

    this.musicInterval = window.setInterval(() => {
      const chord = chordSets[Math.floor(Math.random() * chordSets.length)];
      playChord(chord, 2.4);
    }, 2100);
  }
}
