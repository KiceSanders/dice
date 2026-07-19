import { AUDIO_TUNING } from './audioTuning';
import type { PlaySpec } from './cues';
import { audioUrl, SOUND_MANIFEST } from './sampleManifest';

/**
 * The one impure audio module: owns the Web Audio graph. Everything that
 * decides WHAT to play lives in the pure modules (cues/impactRules/
 * poseImpacts); this only realizes PlaySpecs. Per-play chain:
 * source → voice gain → stereo panner → effects/recordings bus → master → destination.
 *
 * Browser autoplay policy: the context starts suspended until a user
 * gesture. `unlock()` is called from a gesture listener (TableAudio);
 * plays before that are silently dropped — never an error. All entry
 * points are no-ops outside the browser so imports stay node-test-safe.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private effectsBus: GainNode | null = null;
  private recordingsBus: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private customData = new Map<string, Uint8Array>();
  private customBuffers = new Map<string, AudioBuffer>();
  private customLoading = new Map<string, Promise<AudioBuffer | null>>();
  private liveVoices = 0;
  private rattleGain: GainNode | null = null;
  private effectsVolume = AUDIO_TUNING.settings.defaultVolume;
  private recordingsVolume = AUDIO_TUNING.settings.defaultVolume;
  private muted = false;
  private hidden = false;
  private watchingVisibility = false;

  /** Create/resume the context from a user gesture; idempotent. */
  unlock(): void {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return;
    if (this.ctx === null) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.effectsBus = this.ctx.createGain();
      this.recordingsBus = this.ctx.createGain();
      this.effectsBus.connect(this.master);
      this.recordingsBus.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.applyBusGains();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    if (!this.watchingVisibility && typeof document !== 'undefined') {
      this.watchingVisibility = true;
      // Duck to silence in hidden tabs so the rattle loop can't drone on.
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.visibilityState === 'hidden';
        this.applyBusGains();
      });
    }
    this.preload();
    this.preloadCustom();
  }

  /** Fetch + decode every manifest sample (~1 MB total); safe to re-call. */
  preload(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    for (const sample of Object.values(SOUND_MANIFEST)) {
      for (const file of sample.files) {
        if (this.buffers.has(file) || this.loading.has(file)) continue;
        this.loading.add(file);
        fetch(audioUrl(file))
          .then((res) => res.arrayBuffer())
          .then((data) => ctx.decodeAudioData(data))
          .then((buffer) => {
            this.buffers.set(file, buffer);
          })
          .catch(() => {
            // Missing/undecodable file: stay silent for this sample.
          })
          .finally(() => {
            this.loading.delete(file);
          });
      }
    }
  }

  /** Play a resolved cue. `spec.whenMs` is on the performance.now() clock. */
  play(spec: PlaySpec): void {
    const ctx = this.ctx;
    const bus = this.effectsBus;
    if (ctx === null || bus === null || ctx.state !== 'running') return;
    if (this.muted || this.hidden || this.effectsVolume <= 0) return;
    const file = SOUND_MANIFEST[spec.soundId].files[spec.fileIndex];
    const buffer = file !== undefined ? this.buffers.get(file) : undefined;
    if (buffer === undefined) return;

    this.playBuffer(buffer, bus, spec.gain, spec.playbackRate, spec.pan, spec.whenMs);
  }

  /** Register/replace one room-scoped player recording for later playback. */
  registerCustomSound(key: string, bytes: Uint8Array): void {
    this.customData.set(key, bytes);
    this.customBuffers.delete(key);
    this.customLoading.delete(key);
    if (this.ctx !== null) void this.decodeCustom(key, bytes);
  }

  unregisterCustomSound(key: string): void {
    this.customData.delete(key);
    this.customBuffers.delete(key);
    this.customLoading.delete(key);
  }

  clearCustomSounds(): void {
    this.customData.clear();
    this.customBuffers.clear();
    this.customLoading.clear();
  }

  /**
   * Play a registered player recording. `true` means a custom clip owns this
   * moment (including when muted); `false` lets the caller use a built-in fallback.
   */
  async playCustom(key: string): Promise<boolean> {
    const bytes = this.customData.get(key);
    if (!bytes) return false;
    const ctx = this.ctx;
    const bus = this.recordingsBus;
    if (ctx === null || bus === null || ctx.state !== 'running') return true;
    const buffer = this.customBuffers.get(key) ?? (await this.decodeCustom(key, bytes));
    if (!buffer || this.customData.get(key) !== bytes) return false;
    if (this.muted || this.hidden || this.recordingsVolume <= 0) return true;
    this.playBuffer(buffer, bus, 1, 1, 0);
    return true;
  }

  private playBuffer(
    buffer: AudioBuffer,
    bus: GainNode,
    volume: number,
    playbackRate: number,
    pan: number,
    whenMs?: number,
  ): void {
    const ctx = this.ctx;
    if (ctx === null || this.liveVoices >= AUDIO_TUNING.impact.maxVoices) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(bus);

    this.liveVoices++;
    source.onended = () => {
      this.liveVoices--;
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    const startAt =
      whenMs === undefined ? 0 : ctx.currentTime + Math.max(0, (whenMs - performance.now()) / 1000);
    source.start(startAt);
  }

  private preloadCustom(): void {
    for (const [key, bytes] of this.customData) void this.decodeCustom(key, bytes);
  }

  private decodeCustom(key: string, bytes: Uint8Array): Promise<AudioBuffer | null> {
    const existing = this.customLoading.get(key);
    if (existing) return existing;
    const ctx = this.ctx;
    if (ctx === null) return Promise.resolve(null);
    const encoded = bytes.slice().buffer;
    const loading = ctx
      .decodeAudioData(encoded)
      .then((buffer) => {
        if (this.customData.get(key) === bytes) this.customBuffers.set(key, buffer);
        return buffer;
      })
      .catch(() => null)
      .finally(() => {
        if (this.customLoading.get(key) === loading) this.customLoading.delete(key);
      });
    this.customLoading.set(key, loading);
    return loading;
  }

  /**
   * Follow the rattle level (0–1): one persistent looping source whose gain
   * ramps toward `level * loopGainMax`. The source keeps running at gain 0
   * between shakes — cheaper and clickless vs. stop/start.
   */
  setRattleGain(level: number): void {
    const ctx = this.ctx;
    const bus = this.effectsBus;
    if (ctx === null || bus === null || ctx.state !== 'running') return;
    if (this.rattleGain === null) {
      const sample = SOUND_MANIFEST['cup-rattle-loop'];
      const file = sample.files[0];
      const buffer = file !== undefined ? this.buffers.get(file) : undefined;
      if (buffer === undefined) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      this.rattleGain = ctx.createGain();
      this.rattleGain.gain.value = 0;
      source.connect(this.rattleGain);
      this.rattleGain.connect(bus);
      source.start();
    }
    const target =
      Math.min(Math.max(level, 0), 1) *
      AUDIO_TUNING.rattle.loopGainMax *
      SOUND_MANIFEST['cup-rattle-loop'].baseGain;
    const gain = this.rattleGain.gain;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(gain.value, ctx.currentTime);
    gain.linearRampToValueAtTime(target, ctx.currentTime + 0.05);
  }

  setEffectsVolume(volume: number): void {
    this.effectsVolume = Math.min(Math.max(volume, 0), 1);
    this.applyBusGains();
  }

  setRecordingsVolume(volume: number): void {
    this.recordingsVolume = Math.min(Math.max(volume, 0), 1);
    this.applyBusGains();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyBusGains();
  }

  private applyBusGains(): void {
    const ctx = this.ctx;
    const master = this.master;
    const effectsBus = this.effectsBus;
    const recordingsBus = this.recordingsBus;
    if (ctx === null || master === null || effectsBus === null || recordingsBus === null) return;
    master.gain.setTargetAtTime(this.muted || this.hidden ? 0 : 1, ctx.currentTime, 0.02);
    effectsBus.gain.setTargetAtTime(this.effectsVolume, ctx.currentTime, 0.02);
    recordingsBus.gain.setTargetAtTime(this.recordingsVolume, ctx.currentTime, 0.02);
  }
}

/** One page, one audio graph — module singleton like tableEvents/audioBus. */
export const audioEngine = new AudioEngine();
