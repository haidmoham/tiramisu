# tiramisu

A mobile-first lyric lookup where semantic typography stays in the foreground and a direct Three.js scene supplies the atmosphere behind it.

Search and lyric presentation are separate layers. The browser searches LRCLIB first, uses lyrics.ovh only for metadata discovery when needed, and resolves lyric documents through LRCLIB or LrcMux. Provider responses are normalized before they reach the reader, so the sources can change without redesigning the presentation.

The three default searches are This Modern Love by Bloc Party, Melancholy by Driveways, and cbd by brakence.

**[Open tiramisu](https://tiramisu.shin86.dev)**

This is a lyric reader, not a music player or synchronized karaoke display. Community-provider lookup can fail for individual tracks.

## Run locally

```bash
npm install
npm run dev
```

Vite reports the localhost port it selects.

## Checks

```bash
npm run lint
npm test
npm run test:e2e
npm run test:catalog
npm run build
```

`test:e2e` runs the deterministic browser search flow. `test:catalog` is an opt-in live provider health check: it reports titles, providers, and line counts, but never writes or prints lyric text. Community API availability does not grant rights to the underlying lyric content; review source terms before using tiramisu beyond personal use.

## Structure

Keep the shared `← shin86.dev` link outside the route switch. Direct lyric links, loading states, and errors must retain the same route to the cluster. Use the existing geometric palette for clear hover, keyboard focus, pressed, and selected control states.

- `src/domain/` defines normalized lyric and provider interfaces.
- `src/lookup/` owns fixture, LRCLIB, LrcMux, and aggregate provider adapters.
- `src/app/` owns deterministic lookup state.
- `src/presentation/` owns semantic lyric rendering and the isolated Three.js field.

The presentation layer never consumes provider response objects. WebGL is an enhancement: lookup, reading, focus mode, native scrolling, and accessibility remain available without it.

## Optional Genius notes

The reader also has a separate comments/notes panel. `api/genius-comments/` serves it through a Vercel function; `server/genius-comments/` normalizes the response. Set `GENIUS_ACCESS_TOKEN` only on the server to enable it. Plain `npm run dev` serves the Vite frontend, not that production function. The panel can report unavailable notes and retain an explicit Genius source link; lyric lookup does not depend on it.
