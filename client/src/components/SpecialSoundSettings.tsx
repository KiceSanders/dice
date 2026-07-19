import {
  SPECIAL_MOMENT_DEFINITIONS,
  SPECIAL_SOUND_MAX_DURATION_MS,
  type SpecialMomentKind,
} from '@dice/shared';
import { useEffect, useRef, useState } from 'react';
import { useAudioSettings } from '../table3d/audio/audioSettings';
import {
  type ActiveSpecialSoundRecorder,
  beginSpecialSoundRecording,
} from '../table3d/audio/specialSoundRecorder';
import { setSpecialSound, useSpecialSoundPack } from '../table3d/audio/specialSoundStorage';
import { specialSoundDataUrl } from '../table3d/audio/specialSoundWav';
import AudioSettingsControls from './AudioSettingsControls';

interface Props {
  showAudioControls?: boolean;
}

export default function SpecialSoundSettings({ showAudioControls = false }: Props) {
  const pack = useSpecialSoundPack();
  const audioSettings = useAudioSettings();
  const mountedRef = useRef(true);
  const recorderRef = useRef<ActiveSpecialSoundRecorder | null>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [recordingKind, setRecordingKind] = useState<SpecialMomentKind | null>(null);
  const [requestingKind, setRequestingKind] = useState<SpecialMomentKind | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!recordingKind) return;
    const timer = window.setInterval(() => {
      const startedAt = recorderRef.current?.startedAt ?? performance.now();
      setElapsedMs(Math.min(performance.now() - startedAt, SPECIAL_SOUND_MAX_DURATION_MS));
    }, 100);
    return () => window.clearInterval(timer);
  }, [recordingKind]);

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.volume = audioSettings.muted ? 0 : audioSettings.recordingsVolume;
    }
  }, [audioSettings.muted, audioSettings.recordingsVolume]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      recorderRef.current?.cancel();
      previewRef.current?.pause();
    };
  }, []);

  async function startRecording(kind: SpecialMomentKind) {
    previewRef.current?.pause();
    setStatus('');
    setRequestingKind(kind);
    try {
      const recorder = await beginSpecialSoundRecording();
      if (!mountedRef.current) {
        recorder.cancel();
        return;
      }
      recorderRef.current = recorder;
      setRecordingKind(kind);
      setElapsedMs(0);
      const wavBase64 = await recorder.done;
      if (!mountedRef.current || recorderRef.current !== recorder) return;
      recorderRef.current = null;
      setRecordingKind(null);
      if (!wavBase64) {
        setStatus('No audio was captured. Try recording again.');
        return;
      }
      const persisted = setSpecialSound(kind, wavBase64);
      setStatus(
        persisted
          ? `${labelFor(kind)} recording saved on this device.`
          : `${labelFor(kind)} is available in this tab, but browser storage was unavailable.`,
      );
    } catch (error) {
      if (mountedRef.current) setStatus(recordingError(error));
    } finally {
      if (mountedRef.current) setRequestingKind(null);
    }
  }

  function preview(kind: SpecialMomentKind) {
    const wavBase64 = pack[kind];
    if (!wavBase64) return;
    previewRef.current?.pause();
    const audio = new Audio(specialSoundDataUrl(wavBase64));
    audio.volume = audioSettings.muted ? 0 : audioSettings.recordingsVolume;
    previewRef.current = audio;
    void audio.play().catch(() => setStatus('The browser could not play that recording.'));
  }

  function remove(kind: SpecialMomentKind) {
    if (recordingKind === kind) recorderRef.current?.cancel();
    setSpecialSound(kind, null);
    setStatus(`${labelFor(kind)} recording removed.`);
  }

  return (
    <section className="card special-sound-settings">
      <h3>Special moment recordings</h3>
      <p className="muted special-sound-intro">
        Record up to {SPECIAL_SOUND_MAX_DURATION_MS / 1_000} seconds for each moment. Your device
        keeps the recordings across player names; only ephemeral copies are shared with your current
        room.
      </p>
      {showAudioControls && <AudioSettingsControls />}
      <div className="special-sound-list">
        {SPECIAL_MOMENT_DEFINITIONS.map((definition) => {
          const hasSound = Boolean(pack[definition.kind]);
          const active = recordingKind === definition.kind;
          const requesting = requestingKind === definition.kind;
          const busy = recordingKind !== null || requestingKind !== null;
          return (
            <div className="special-sound-row" key={definition.kind}>
              <div className="special-sound-copy">
                <strong>{definition.label}</strong>
                <small>{definition.description}</small>
              </div>
              <div className="special-sound-actions">
                {active ? (
                  <button
                    type="button"
                    className="recording-stop"
                    onClick={() => recorderRef.current?.stop()}
                  >
                    Stop ({(elapsedMs / 1_000).toFixed(1)}s)
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void startRecording(definition.kind)}
                  >
                    {requesting ? 'Allow microphone…' : hasSound ? 'Re-record' : 'Record'}
                  </button>
                )}
                <button
                  type="button"
                  className="secondary"
                  disabled={!hasSound || busy}
                  onClick={() => preview(definition.kind)}
                >
                  Preview
                </button>
                {hasSound && (
                  <button
                    type="button"
                    className="link-button special-sound-remove"
                    disabled={busy}
                    onClick={() => remove(definition.kind)}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {status && (
        <p className="special-sound-status" role="status">
          {status}
        </p>
      )}
    </section>
  );
}

function labelFor(kind: SpecialMomentKind): string {
  return SPECIAL_MOMENT_DEFINITIONS.find((definition) => definition.kind === kind)?.label ?? kind;
}

function recordingError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was denied. Allow it in your browser settings and try again.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone was found on this device.';
  }
  return error instanceof Error ? error.message : 'The microphone could not be opened.';
}
