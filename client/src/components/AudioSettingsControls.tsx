import { setAudioSettings, useAudioSettings } from '../table3d/audio/audioSettings';

export default function AudioSettingsControls({ compact = false }: { compact?: boolean }) {
  const { effectsVolume, recordingsVolume, muted } = useAudioSettings();
  return (
    <div className={`audio-settings-controls${compact ? ' audio-settings-controls--compact' : ''}`}>
      <button
        type="button"
        className="hud-audio-mute"
        aria-label={muted ? 'Unmute all sounds' : 'Mute all sounds'}
        aria-pressed={muted}
        onClick={() => setAudioSettings({ muted: !muted })}
      >
        {muted || (effectsVolume === 0 && recordingsVolume === 0) ? '🔇' : '🔊'}
      </button>
      <label className="audio-volume-field">
        <span>Effects</span>
        <input
          type="range"
          className="hud-audio-volume"
          aria-label="Effects volume"
          min={0}
          max={1}
          step={0.05}
          value={effectsVolume}
          disabled={muted}
          onChange={(event) => setAudioSettings({ effectsVolume: Number(event.target.value) })}
        />
      </label>
      <label className="audio-volume-field">
        <span>Player recordings</span>
        <input
          type="range"
          className="hud-audio-volume"
          aria-label="Player recordings volume"
          min={0}
          max={1}
          step={0.05}
          value={recordingsVolume}
          disabled={muted}
          onChange={(event) => setAudioSettings({ recordingsVolume: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}
