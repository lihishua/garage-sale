#!/bin/sh
# Video 1 — "why": five stills cross-faded on the beat of the narration.
# Scene onsets (s): 0 / 2.3 / 6.0 / 10.2 / 15.2, end 17.7 — set from the
# pauses in voice/why.m4a (silencedetect). Each still runs its scene length
# plus the 0.4s fade into the next. The music sits well under the voice
# and is pushed down further whenever she speaks (sidechain), so it only
# really comes up on the logo at the end.
set -e
F=0.4
ffmpeg -v error -y \
  -loop 1 -t 2.7 -i out/why-1.png \
  -loop 1 -t 4.1 -i out/why-2.png \
  -loop 1 -t 4.6 -i out/why-3.png \
  -loop 1 -t 5.4 -i out/why-4.png \
  -loop 1 -t 2.5 -i out/why-5.png \
  -i voice/why.m4a \
  -i music/happy-ukulele.mp3 \
  -filter_complex "\
    [0][1]xfade=transition=fade:duration=$F:offset=2.3[v1];\
    [v1][2]xfade=transition=fade:duration=$F:offset=6.0[v2];\
    [v2][3]xfade=transition=fade:duration=$F:offset=10.2[v3];\
    [v3][4]xfade=transition=fade:duration=$F:offset=15.2,fade=t=out:st=17.2:d=0.5,format=yuv420p[v];\
    [5:a]loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:17.7,asplit[voice][key];\
    [6:a]loudnorm=I=-25:TP=-3:LRA=11,atrim=0:17.7,afade=t=in:d=0.6,afade=t=out:st=16.4:d=1.3[bed];\
    [bed][key]sidechaincompress=threshold=0.015:ratio=6:attack=40:release=500:makeup=1[duck];\
    [voice][duck]amix=inputs=2:normalize=0:duration=first[a]" \
  -map "[v]" -map "[a]" -r 30 -c:v libx264 -preset slow -crf 20 -c:a aac -b:a 160k -movflags +faststart \
  out/why.mp4
