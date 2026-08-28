# tiramisu

A mobile-first lyric lookup prototype where semantic typography stays in the foreground and a direct Three.js scene supplies the atmosphere behind it.

The prototype previews three requested tracks with non-infringing placeholder copy. The lookup contract is provider-neutral so a licensed lyrics source can be added later without coupling its response format to the reader.

## Run locally

```bash
npm install
npm run dev
```

Vite serves the app from `http://127.0.0.1:5173` when that port is available.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Structure

- `src/domain/` defines normalized lyric and provider interfaces.
- `src/lookup/` owns fixture lookup and future provider adapters.
- `src/app/` owns deterministic lookup state.
- `src/presentation/` owns semantic lyric rendering and the isolated Three.js field.

The presentation layer never consumes provider response objects. WebGL is an enhancement: lookup, reading, focus mode, native scrolling, and accessibility remain available without it.
