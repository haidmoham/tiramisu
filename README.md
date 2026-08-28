# tiramisu

A mobile-first lyric lookup where semantic typography stays in the foreground and a direct Three.js scene supplies the atmosphere behind it.

Search and lyric presentation are separate layers. The browser searches LRCLIB first, uses lyrics.ovh only for metadata discovery when needed, and resolves lyric documents through LRCLIB or LrcMux. Provider responses are normalized before they reach the reader, so the sources can change without redesigning the presentation.

The three default searches are This Modern Love by Bloc Party, Melancholy by Driveways, and cbd by brakence.

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

- `src/domain/` defines normalized lyric and provider interfaces.
- `src/lookup/` owns fixture, LRCLIB, LrcMux, and aggregate provider adapters.
- `src/app/` owns deterministic lookup state.
- `src/presentation/` owns semantic lyric rendering and the isolated Three.js field.

The presentation layer never consumes provider response objects. WebGL is an enhancement: lookup, reading, focus mode, native scrolling, and accessibility remain available without it.
