#!/bin/sh
# Video 2 — "how": three screen recordings in a phone frame under a caption
# bar, between two title cards. No narration; music under everything.
#
#   0–2     start card
#   2–12    scene a  (seller: upload, make a lot, copy the link)   16.0s raw
#   12–22   scene b  (buyer: pick the lion, send the list)         12.0s raw
#   22–27   scene c  (seller: the request, mark it paid)            9.5s raw
#   27–30   end card
# Each recording is sped up to fit its slot; captions change at fixed times.
set -e
dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
start() { python3 -c "import json;print(json.load(open('$1'))['start'])"; }
SA=$(start out/scene-a.json); SB=$(start out/scene-b.json); SC=$(start out/scene-c.json)
A=$(echo "$(dur out/scene-a.webm) - $SA" | bc); B=$(echo "$(dur out/scene-b.webm) - $SB" | bc); C=$(echo "$(dur out/scene-c.webm) - $SC" | bc)
ffmpeg -v error -y \
  -loop 1 -t 2.4 -i out/how-start.png \
  -i out/scene-a.webm -i out/scene-b.webm -i out/scene-c.webm \
  -loop 1 -t 3.4 -i out/how-end.png \
  -loop 1 -t 25 -i out/mask.png \
  -i out/cap1.png -i out/cap2.png -i out/cap3.png -i out/cap4.png -i out/cap5.png -i out/cap6.png \
  -i music/happy-ukulele.mp3 \
  -filter_complex "\
    [5]format=rgba,split=2[m1][m2];[m1]alphaextract[ma];[m2]alphaextract,scale=786:1566[mb];\
    [1]trim=start=$SA,setpts=(PTS-STARTPTS)*(10/$A),fps=30,format=rgba[a0];\
    [2]trim=start=$SB,setpts=(PTS-STARTPTS)*(10/$B),fps=30,format=rgba[b0];\
    [3]trim=start=$SC,setpts=(PTS-STARTPTS)*(5/$C),fps=30,format=rgba[c0];\
    [a0][b0][c0]concat=n=3:v=1:a=0[demo];\
    [demo][ma]alphamerge[phone];\
    color=c=#FCFBF7:s=1080x1920:d=25:r=30[bg];\
    color=c=#1B1815:s=786x1566:d=25:r=30,format=rgba[edge];[edge][mb]alphamerge[frame];\
    [bg][frame]overlay=147:297[bg1];\
    [bg1][phone]overlay=150:300[bg2];\
    [bg2][6]overlay=0:40:enable='between(t,0,3.5)'[d1];\
    [d1][7]overlay=0:40:enable='between(t,3.5,7.5)'[d2];\
    [d2][8]overlay=0:40:enable='between(t,7.5,10)'[d3];\
    [d3][9]overlay=0:40:enable='between(t,10,15)'[d4];\
    [d4][10]overlay=0:40:enable='between(t,15,20)'[d5];\
    [d5][11]overlay=0:40:enable='between(t,20,25)',format=yuv420p[demoF];\
    [0]fps=30,format=yuv420p[s];[4]fps=30,format=yuv420p[e];\
    [s][demoF]xfade=transition=fade:duration=0.4:offset=2.0[v1];\
    [v1][e]xfade=transition=fade:duration=0.4:offset=26.6,fade=t=out:st=29.1:d=0.5[v];\
    [12:a]loudnorm=I=-20:TP=-2:LRA=11,atrim=0:29.6,afade=t=in:d=0.6,afade=t=out:st=28.1:d=1.5[a]" \
  -map "[v]" -map "[a]" -r 30 -c:v libx264 -preset slow -crf 20 -c:a aac -b:a 160k -movflags +faststart \
  out/how.mp4
