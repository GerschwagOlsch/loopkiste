# Loopkiste

Mobiles Loop-Studio im Browser für die Nocturne-Instrumente: **DollyDrumz** (TR-909 + Simmons SDS-V/SDS7),
**PuSS-30**, **Sonique 4x20** und **Pierrette 101**. Vier Spuren (Drums, Bass, Akkorde, Lead), Step / Roll / Pads,
Szenen A–D, Halte-Effekte, Export als WAV, Einzelspuren und 9:16-Video.

- `public/` — die komplette App (statisch, keine Build-Stufe). `public/engines/*.js` sind die Instrument-Engines;
  ihre DSP-Teile sind wortgleich aus der Nocturne Workbench übernommen (`ENGINE_CONTRACT.md`).
- `tools/build_puss.js` — erzeugt `public/engines/puss.js` aus `puss30.html`.
- Deploy: Cloudflare Workers Builds (`wrangler.jsonc`, statische Assets aus `public/`), jeder Push auf `main` geht live.
- Lokal testen: `cd public && python -m http.server 8080` → http://localhost:8080
