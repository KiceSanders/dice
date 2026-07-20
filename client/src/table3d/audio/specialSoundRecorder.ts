import { SPECIAL_SOUND_MAX_DURATION_MS } from '@dice/shared';
import { bytesToBase64, encodeSpecialSoundWav } from './specialSoundWav';

export interface ActiveSpecialSoundRecorder {
  startedAt: number;
  /** Resolves with a canonical WAV string, or null when capture was cancelled/empty. */
  done: Promise<string | null>;
  stop: () => void;
  cancel: () => void;
}

/**
 * Capture microphone PCM through Web Audio so every browser sends the same
 * portable WAV format instead of browser-specific MediaRecorder containers.
 */
export async function beginSpecialSoundRecording(): Promise<ActiveSpecialSoundRecorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof window.AudioContext === 'undefined') {
    throw new Error('Microphone recording is not supported in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  let context: AudioContext;
  try {
    context = new AudioContext();
    await context.resume();
  } catch (error) {
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4_096, 1, 1);
  const silent = context.createGain();
  silent.gain.value = 0;
  const chunks: Float32Array[] = [];
  processor.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };
  source.connect(processor);
  processor.connect(silent);
  silent.connect(context.destination);

  let finished = false;
  let resolveDone: (value: string | null) => void = () => {};
  const done = new Promise<string | null>((resolve) => {
    resolveDone = resolve;
  });

  const finish = (save: boolean) => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timer);
    processor.onaudioprocess = null;
    source.disconnect();
    processor.disconnect();
    silent.disconnect();
    for (const track of stream.getTracks()) track.stop();
    void context.close();
    if (!save || chunks.length === 0) {
      resolveDone(null);
      return;
    }
    const wav = encodeSpecialSoundWav(chunks, context.sampleRate);
    resolveDone(wav.byteLength > 44 ? bytesToBase64(wav) : null);
  };

  const timer = window.setTimeout(() => finish(true), SPECIAL_SOUND_MAX_DURATION_MS);
  return {
    startedAt: performance.now(),
    done,
    stop: () => finish(true),
    cancel: () => finish(false),
  };
}
