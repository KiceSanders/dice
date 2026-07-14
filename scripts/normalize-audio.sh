#!/usr/bin/env bash
# Normalize a sound sample for client/public/audio/ (see CREDITS.md there).
#
#   scripts/normalize-audio.sh <input> <output.wav>
#
# Pipeline (matches how the shipped set was processed): mono downmix,
# head/tail silence trim, loudness normalize to -18 LUFS with a -1.5 dBTP
# peak cap, 5 ms fade in/out, 16-bit 44.1 kHz WAV. WAV because Safari cannot
# decode OGG and MP3 padding breaks gapless loops.
#
# Requires ffmpeg (brew install ffmpeg).
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <input> <output.wav>" >&2
  exit 1
fi

in=$1
out=$2

duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
fade_out_start=$(awk -v d="$duration" 'BEGIN { print (d > 0.005) ? d - 0.005 : 0 }')

ffmpeg -y -v error -i "$in" \
  -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005,\
areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.005,areverse,\
loudnorm=I=-18:TP=-1.5:LRA=11,\
afade=t=in:d=0.005,afade=t=out:st=${fade_out_start}:d=0.005" \
  -ac 1 -ar 44100 -sample_fmt s16 "$out"

echo "wrote $out"
