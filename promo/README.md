# promo/ — the two short videos

Not part of the app. Everything here regenerates the videos from the live
site, so they can be remade when the app changes.

- `script.md` — what each video says and shows.
- `cards/` — the title cards and captions, HTML in the app's own look.
- `login.mjs` — opens the recording browser so the demo seller can sign in
  once; the session lives in `.profile/` (ignored).
- `seed.mjs` / `reset.mjs` — put the demo board in its starting state.
- `record.mjs` — records the three demo scenes to `out/scene-*.webm`.
- `shots.mjs` / `shots-how.mjs` — render the cards to PNG.
- `build-why.sh` / `build-how.sh` — ffmpeg assembly to `out/why.mp4` and
  `out/how.mp4`.

Needs: `npm install` here, `npx playwright install chromium`, ffmpeg,
`voice/why.m4a` (the narration), `music/happy-ukulele.mp3` (see
`music/SOURCES.txt`), and the demo photos in `photos/`.

```
node login.mjs            # once
node seed.mjs             # once
node shots.mjs why 5 && ./build-why.sh
node reset.mjs && node record.mjs && node shots-how.mjs && ./build-how.sh
```
