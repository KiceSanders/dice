import { AUDIO_TUNING } from './audioTuning';
import type { PlaySpec } from './cues';
import { audioUrl, SOUND_MANIFEST } from './sampleManifest';

/**
 * The one impure audio module: owns the Web Audio graph. Everything that
 * decides WHAT to play lives in the pure modules (cues/impactRules/
 * poseImpacts); this only realizes PlaySpecs. Per-play chain:
 * source → gain → stereo panner → master gain → destination.
 *
 * Browser autoplay policy: the context starts suspended until a user
 * gesture. `unlock()` is called from a gesture listener (TableAudio);
 * plays before that are silently dropped — never an error. All entry
 * points are no-ops outside the browser so imports stay node-test-safe.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private loading = new Set<string>();
  private liveVoices = 0;
  private rattleGain: GainNode | null = null;
  private volume = AUDIO_TUNING.settings.defaultVolume;
  private muted = false;
  private hidden = false;
  private watchingVisibility = false;

  /** Create/resume the context from a user gesture; idempotent. */
  unlock(): void {
    if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return;
    if (this.ctx === null) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyMasterGain();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    if (!this.watchingVisibility && typeof document !== 'undefined') {
      this.watchingVisibility = true;
      // Duck to silence in hidden tabs so the rattle loop can't drone on.
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.visibilityState === 'hidden';
        this.applyMasterGain();
      });
    }
    this.preload();
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
    const master = this.master;
    if (ctx === null || master === null || ctx.state !== 'running') return;
    if (this.muted || this.hidden || this.volume <= 0) return;
    if (this.liveVoices >= AUDIO_TUNING.impact.maxVoices) return;
    const file = SOUND_MANIFEST[spec.soundId].files[spec.fileIndex];
    const buffer = file !== undefined ? this.buffers.get(file) : undefined;
    if (buffer === undefined) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = spec.playbackRate;
    const gain = ctx.createGain();
    gain.gain.value = spec.gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = spec.pan;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(master);

    this.liveVoices++;
    source.onended = () => {
      this.liveVoices--;
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    const startAt =
      spec.whenMs === undefined
        ? 0
        : ctx.currentTime + Math.max(0, (spec.whenMs - performance.now()) / 1000);
    source.start(startAt);
  }

  /**
   * Follow the rattle level (0–1): one persistent looping source whose gain
   * ramps toward `level * loopGainMax`. The source keeps running at gain 0
   * between shakes — cheaper and clickless vs. stop/start.
   */
  setRattleGain(level: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null || ctx.state !== 'running') return;
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
      this.rattleGain.connect(master);
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

  setVolume(volume: number): void {
    this.volume = Math.min(Math.max(volume, 0), 1);
    this.applyMasterGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMasterGain();
  }

  private applyMasterGain(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const target = this.muted || this.hidden ? 0 : this.volume;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
  }
}

/** One page, one audio graph — module singleton like tableEvents/audioBus. */
export const audioEngine = new AudioEngine();
