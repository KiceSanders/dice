# Audio credits

All samples are **CC0 (public domain)** — credit not required, given anyway.
Every file was processed with the pipeline in `scripts/normalize-audio.sh`
(mono, silence trim, RMS normalize to −20 dBFS / peak cap −1.5 dBFS, 5 ms
fades, 16-bit 44.1 kHz WAV). To replace a sound, run any new sample through
that script and drop it here under the same name — `sampleManifest.ts` is the
only place filenames are referenced.

| File(s) | Source pack | Original file(s) |
|---|---|---|
| `die-clack-1..4.wav` | [Kenney — Impact Sounds](https://kenney.nl/assets/impact-sounds) (CC0) | `impactWood_light_000..003.ogg` |
| `die-felt-1..4.wav` | [Kenney — Casino Audio](https://kenney.nl/assets/casino-audio) (CC0) | `die-throw-1..4.ogg` |
| `die-rail-1..2.wav` | Kenney — Impact Sounds | `impactSoft_heavy_000..001.ogg` |
| `cup-pour-1..2.wav` | Kenney — Casino Audio | `dice-throw-1..2.ogg` |
| `cup-rattle-loop.wav` | Kenney — Casino Audio | `dice-shake-1..3.ogg`, equal-power crossfaded with an end→start wrap for seamless looping |
| `chip-stack-1..3.wav` | Kenney — Casino Audio | `chips-stack-1..3.ogg` |
| `chip-collide-1..3.wav` | Kenney — Casino Audio | `chips-collide-1..3.ogg` |
| `straight-bell-1.wav` | Kenney — Impact Sounds | `impactBell_heavy_000.ogg` |

Format note: WAV (not OGG/MP3) because Safari's `decodeAudioData` cannot decode
OGG Vorbis, and MP3 encoder padding breaks the gapless rattle loop.
