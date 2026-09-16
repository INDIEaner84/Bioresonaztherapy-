# Presets — P19 Production — 10/10

## Sammlung

Im Repo `presets/` liegen 3 Demo-Presets (Spooky2 Format List4):

- `Beispiel_Detox_Contact.txt` — 10,17,23,40,100,1000 Hz — Detox Contact, je 180s
- `Beispiel_Intestinal_Parasites.txt` — 20,120,2720,10000 Hz — Parasites
- `Beispiel_Sweep_10_1000.txt` — 10-1000 Hz Sweep LOG 30s — Test FFT Waterfall

Format:
```
"List2"="Detox (C) - BY"
"List4"="10=180,17=180,23=180,40=180,100=180,1000=180"
"Desc"="Beispiel: Detox Contact — 6 Frequenzen, je 180s"
```

## Parser — Production

`core/preset.js` — 157 LOC Production:

- **Spooky2 TXT:** `"Key"="Value"` multiline quotes, List4=Frequenzprogramme, List2=Beschreibung, Desc=LongDesc
- **Program Code:** `10=180,20=300,10-20=60` mit A= amplitude, W= waveform, `10-1000=30` sweep
- **Simple List:** `10, 17, 23, 40` -> 4 steps, je 180s default, safety clamp 0-1MHz
- **CSV:** `10,20,180\n20,30,180` oder JSON `{"programs":[...]}`
- **Validation:** `validatePreset()` prüft no programs, no steps, invalid freq, too high, invalid duration
- **Safety:** freq 0-1MHz, duration 0-36000s, sonst filtered

## Dashboard Integration — Production

**Modular Frontend `frontend/index.html`:**
- Uses `core/preset.js` via ESM import
- File Input + Beispiele Dropdown (fetch `../presets/...` mit fallback embedded Map)
- Erzeugt Generatoren `PRESET Gx` via real `GeneratorBus`
- Logs `PRESET OK • name • steps • Dauer`

**Legacy Dashboard `dashboard/index.html`:**
- Gleiches: File Input `presetFile` + Select `presetExamples`
- `handlePresetText(text,name)` parsed List4 via regex, erzeugt gens

**API:**
```js
import { parsePresetText, presetToExperiment, validatePreset } from '../core/preset.js';
const parsed=parsePresetText(txt);
const {ok, errors}=validatePreset(parsed);
const exp=presetToExperiment(parsed, {name:'Detox'});
```

## Experiment Mapping

```
Preset TXT -> parsePresetText -> {programs:[{code,description,steps:[{f1,f2,duration,waveform}]}]}
  -> presetToExperiment -> {id, version, metadata{source:'Spooky2 Preset',format}, programs, totalDuration, signals:[{freq,freq2,duration,wave}]}
    -> Experiment Engine (versioned, provenance, storage)
      -> Sequencer Timeline + GeneratorBus
```

## Zukunft

- `openspooky.db` (397KB) + `presets2.db` im Repo vorhanden, aber verschlüsselt — Reverse Lookup via `csharp/ExtractDatabase` möglich, aber nicht nötig für Demo
- Real DB Import: via `Spooky2Provider` C# -> JSON export -> `parsePresetText` JSON branch
