import {
  isValidSpecialSoundWav,
  SPECIAL_SOUND_MAX_DURATION_MS,
  SPECIAL_SOUND_SAMPLE_RATE,
  SPECIAL_SOUND_WAV_HEADER_BYTES,
} from '@dice/shared';

/** Join Web Audio callback chunks and clamp capture length before resampling. */
export function joinPcmChunks(
  chunks: readonly Float32Array[],
  inputSampleRate: number,
): Float32Array {
  const available = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const maxInputSamples = Math.ceil((inputSampleRate * SPECIAL_SOUND_MAX_DURATION_MS) / 1_000);
  const length = Math.min(available, maxInputSamples);
  const joined = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= length) break;
    const slice = chunk.subarray(0, Math.min(chunk.length, length - offset));
    joined.set(slice, offset);
    offset += slice.length;
  }
  return joined;
}

/** Linear mono resample to the one canonical wire/storage sample rate. */
export function resampleMono(
  samples: Float32Array,
  inputSampleRate: number,
  outputSampleRate = SPECIAL_SOUND_SAMPLE_RATE,
): Float32Array {
  if (samples.length === 0 || inputSampleRate <= 0 || outputSampleRate <= 0) {
    return new Float32Array();
  }
  const outputLength = Math.min(
    Math.round((samples.length * outputSampleRate) / inputSampleRate),
    Math.ceil((outputSampleRate * SPECIAL_SOUND_MAX_DURATION_MS) / 1_000),
  );
  const output = new Float32Array(outputLength);
  const ratio = inputSampleRate / outputSampleRate;
  for (let i = 0; i < output.length; i++) {
    const position = i * ratio;
    const left = Math.min(Math.floor(position), samples.length - 1);
    const right = Math.min(left + 1, samples.length - 1);
    const mix = position - left;
    output[i] = samples[left]! * (1 - mix) + samples[right]! * mix;
  }
  return output;
}

/** Encode canonical mono 22.05 kHz, 16-bit PCM WAV bytes. */
export function encodeSpecialSoundWav(
  chunks: readonly Float32Array[],
  inputSampleRate: number,
): Uint8Array {
  const pcm = resampleMono(joinPcmChunks(chunks, inputSampleRate), inputSampleRate);
  const dataBytes = pcm.length * 2;
  const bytes = new Uint8Array(SPECIAL_SOUND_WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(bytes.buffer);

  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SPECIAL_SOUND_SAMPLE_RATE, true);
  view.setUint32(28, SPECIAL_SOUND_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < pcm.length; i++) {
    const value = Math.min(Math.max(pcm[i]!, -1), 1);
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export function base64ToSpecialSoundBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return isValidSpecialSoundWav(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

export function specialSoundDataUrl(wavBase64: string): string {
  return `data:audio/wav;base64,${wavBase64}`;
}
