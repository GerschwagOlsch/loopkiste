# Loopkiste — Engine-Vertrag

Jede Engine ist ein ES-Modul `public/engines/<id>.js` mit
`export default async function create(ctx, { out })`.
`ctx` ist ein (Online-)AudioContext, `out` ein AudioNode, an den die Engine ihr Stereo-Signal hängt.
Die DSP-Quelle wird **unverändert** aus dem NWB-Instrument übernommen (Worklet-Code wortgleich kopiert,
keine Klangänderung). Nur Hülle/Steuerung ist neu.

```js
{
  id: 'puss' | 'sonique' | 'pierrette' | 'dolly',
  kind: 'synth' | 'drums',
  ready: Promise<void>,                 // aufgelöst, wenn Worklet geladen und spielbereit

  // Klänge
  presets(): [{ id, name, cat }],       // Werksbank des Instruments (echte Daten, nicht erfunden)
  loadPreset(id): void,
  getPatch(): object,                   // natives NWB-Format des Instruments (z. B. PSS30-PATCH/1, sonique4x20-patch,
  setPatch(obj): void,                  //  Pierrette-Patch-JSON, dollydrumz-kit/v1) – kompatibel zur NWB-Zwischenablage
  macros(): [{ id, label, value }],     // 4–6 musikalisch sinnvolle Regler, value 0..1
  setMacro(id, v): void,

  // Echtzeit (time = ctx.currentTime-Basis, Sekunden; sample-genau geplant)
  noteOn(midi, vel, time): void,        // synth; vel 0..1
  noteOff(midi, time): void,            // synth
  lanes(): [{ id, name, role }],        // drums: Spuren der Maschine (bd, sd, ch, …)
  hit(laneId, vel, time): void,         // drums; vel 0..1 (>=0.9 = Akzent)
  allOff(time?): void,

  // Offline (Export): MUSS dieselbe DSP-Quelle nutzen wie live
  // events: synth → { t, midi, vel, dur }   drums → { t, lane, vel }   (t, dur in Sekunden ab 0)
  // patch: optional; ohne Angabe der aktuelle Patch/Kit
  renderStem({ sampleRate, durationSec, events, patch }): Promise<AudioBuffer>,  // stereo

  dispose(): void
}
```

Pegel: Ausgang so, dass ein typischer Preset-Loop Spitzen um −10 … −6 dBFS hat (Engine-interner Ausgangs-Gain erlaubt,
DSP selbst unverändert).

Test (Render-Gate, Pflicht): headless Chromium (Playwright, /opt/pw-browsers) über einen lokalen HTTP-Server.
1. Live: ein paar Noten/Hits über `noteOn`/`hit` → Analyser zeigt Pegel > 0, keine Konsolenfehler.
2. Offline: `renderStem` mit 2 Takten Events → RMS > 0, kein NaN, Länge stimmt.
3. Gleichheit: dieselben Events durch den **Original-Renderpfad des NWB-Instruments** und durch `renderStem`
   → Abweichung dokumentieren (Ziel: bitgleich oder max. |diff| < 1e-4 bei gleichem Patch).
4. Ladezeit und CPU: Renderzeit für 8 Takte bei 120 BPM notieren.
