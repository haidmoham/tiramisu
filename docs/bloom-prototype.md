# bloom prototype — local review

iris mist and a single sans-serif family establish the reading surface. the p5 canopy spans the viewport with an original sweeping branch and oversized blossoms. a phone art band leaves an open view before search. complete blossoms never depend on rectangular text erasure. lyrics sit over one viewport-height sticky glass sheet; identity stays pinned below reader controls. moving particles fade before entering content bounds.

first-party prior art inspected:

- flowers: `astral/autumn.svg` and `studies/ivory-botanical/README.md`. adapted the sparse perimeter traces, quiet copper foliage, and open center. no SVG assets copied. autumn leaves use independent, non-reactive motion.
- astrsk: `src/magnetic-field.js` and `src/Atmosphere.jsx`. adapted velocity, local attraction, repulsive core, tangential force, and separation. petals have no assigned ring slots; rest gathers them, movement leaves a loose cloud.

multicolor petals use weighted dusty lilac, rose, cool blue, and occasional warm blush. light decorative token contrast ranges from 2.05:1 to 3.06:1 against iris paper; dark tokens range from 7.11:1 to 7.42:1. these are decorative colors, never lyric ink. base text contrast is 10.10:1 light and 13.35:1 dark.

petals live up to 32 seconds, capped at 30. ambient spawning stops at 10; interaction can recycle distant petals. native touch scrolling remains active. reduced motion keeps a still composition, and hidden pages pause the renderer.

browser evidence: desktop and 390px canopy visibility, pointer gathering after 28 seconds idle, moving-cloud lag, release into falling motion, native touch swipe, sticky song identity, comments states, palette enlargement, and horizontal bounds. removing the 24fps cap and per-frame layout reads improved an early active-canvas sample from 50ms median / 50.5ms p95 to 16.7ms median / 17.7ms p95. the final full-canvas reader with viewport-bounded glass measured 19.9ms median / 48.6ms p95, with canvas work at 0.6ms p95, during host contention. these are short local Chromium samples, not a stable 60fps or device-wide performance guarantee.

the featured “this modern love” entry now opens a verified LRCLIB record. old LrcMux links that return 404 recover through an exact title-and-artist LRCLIB match. API-backed browser tests use explicit fixtures, and the live local route was checked against the current lyric service. no publication is implied by this prototype.

## demo capture

the real local preview was recorded with `scripts/capture-bloom-demo.mjs` and cut with FFmpeg. to repeat the capture while `npm run dev` serves port 5189:

```sh
mkdir -p /tmp/tiramisu-bloom-capture ~/Desktop/demos
node scripts/capture-bloom-demo.mjs http://127.0.0.1:5189/ /tmp/tiramisu-bloom-capture
ffmpeg -ss 0.5 -i /tmp/tiramisu-bloom-capture/tiramisu-bloom-raw.webm -t 10 -vf 'fps=30,format=yuv420p' -c:v libx264 -crf 18 -preset medium -movflags +faststart ~/Desktop/demos/tiramisu-iris-mist.mp4
```

the demo has no added music or voice.
