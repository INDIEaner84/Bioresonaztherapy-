# s2 — Spooky2-compatible device-control prototype

`s2` is a C++11 command-line application intended to communicate with Spooky2-compatible signal-generator hardware and read a pulse-sensor stream. The repository also contains a separate legacy C# Windows Forms solution; this README and the CMake CI path cover the C++ command-line application only.

> [!WARNING]
> **This is an experimental engineering tool, not a validated medical or clinical system.** This repository does not establish diagnostic accuracy, clinical efficacy, electrical safety, calibration, or the physical output delivered by a connected device. Do not use it to diagnose, prevent, monitor, or treat disease. Do not connect outputs to a person, a medical device, or an unapproved load on the basis of this repository. Follow the hardware manufacturer's instructions and applicable local requirements. Software attempts to turn outputs off on handled exits, but cannot guarantee a hardware-safe state after a process kill, power loss, device disconnect, or other fault. See [Scientific integrity and safety](docs/SCIENTIFIC_INTEGRITY.md).

## Scope and current status

This project sends setpoints; it does not independently measure generator output. A successful serial acknowledgement is not proof that the physical waveform matches the request. Imported program/preset names are unverified metadata, not evidence of a treatment effect.

- The C++ `control` command applies supported generator settings in order.
- The C++ `run` command schedules supported frequency steps from inline program text, a preset, or a local database entry. It applies an amplitude setpoint and output on/off states. Several vendor fields/options are not implemented; unsupported run options fail rather than being silently treated as supported.
- `simulation=on` uses software dummy streams and is the preferred mode for software-only tests. It does not validate a physical device.
- `scan` is an experimental pulse-change display, **not** a biofeedback scan. It prints one symbol per comparison (one comparison by default); `iterations=N` sets a finite comparison count and `loop=on` opts into continuous output. It does not command a generator, save results, resume sessions, or produce clinically interpretable findings.
- The repository contains unit tests using fake streams. It has no hardware-in-the-loop or clinical validation.
- `Powershell-GUI.ps1` is an experimental Windows Forms wrapper around the C++ CLI; it is not part of the CMake build or CI. It defaults to software simulation, filters arguments by command, and asks for confirmation before physical-device access. Its `scan` button remains disabled: a finite comparison count does not bound the time spent waiting for a device read, and the wrapper has no cooperative stop control. Do not close it while a command is active. Output-off behavior remains best effort, not a hardware guarantee.

See the [task catalog](docs/TASK_CATALOG.md) for what is implemented and what remains open. Claims and experiment requirements are defined in [Scientific integrity and safety](docs/SCIENTIFIC_INTEGRITY.md).

## Requirements

- CMake 3.10 or newer
- A C++11 compiler (GCC, Clang, or MSVC)
- Platform-specific Spooky2-compatible device drivers/permissions when using physical hardware

## Build and test

### Linux

```sh
sudo apt-get install git cmake g++
git clone <repository-url>
cd <repository-directory>
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
cmake --build . -- -j2
ctest --output-on-failure -C Release
```

The repository's `build.sh` builds the C++ CLI in a `build/` directory. It does not install drivers or validate connected hardware.

### macOS

Install Xcode Command Line Tools and CMake, then build as above. The CMake target links IOKit and CoreFoundation. Physical-device discovery and operation still require platform-specific verification.

### Windows

Install Visual Studio with C++ tools and CMake. For example, from the repository root:

```powershell
mkdir build
cd build
cmake -G "Visual Studio 17 2022" -A x64 ..
cmake --build . --config Release
ctest --output-on-failure -C Release
```

The C# solution is separate from this CMake build and is not covered by the C++ CI tests.

## Commands

Run `s2 help` for the current command summary.

### List detected devices

```sh
s2 status
```

Enumeration is platform-specific and does not establish that a device can safely or correctly produce an output.

### Software-only example

```sh
s2 control simulation=on generator=0 channel=1 frequency=54kHz amplitude=5V output=on duration=2s output=off
```

With simulation enabled, generator commands are handled by a dummy stream and no physical device should be opened. Use this only to exercise software behavior.

### Run a short inline program in simulation

```sh
s2 run simulation=on generator=0 channel=1 amplitude=5V iterations=2 code=1000=0.1,2000=0.1
```

The example requests two finite passes through two frequency steps. Durations in program text are seconds. `loop=off` is the default; `loop=on` repeats indefinitely until interrupted. Output is commanded off after each finite run and on handled interruption/error paths as a best-effort software action. For a database-backed run, the selected CSV record and supported program syntax are checked before a generator stream is opened. Hardware output must still be verified independently.

### Validate the local program database

```sh
s2 validate
```

This checks the per-user `programs.csv` records, their required fields and the supported program-code syntax. Invalid records produce a nonzero exit status and diagnostics with the file path and physical starting line; CSV parsing errors also identify the column. The parser supports quoted fields with commas, doubled quotes, legacy backslash-escaped quotes, CRLF and multiline quoted values. At least eight fields are required; the first eight are used and additional fields are ignored. Empty numeric cells retain the legacy value `0`. This checks software syntax only: it does not establish compatibility with every vendor export, the provenance or license of imported data, or any scientific or medical validity.

### Read pulse-sensor values

```sh
s2 pulse simulation=on iterations=5
```

Without `loop=on`, `pulse` reads one value by default; `iterations=N` selects a finite count. With `loop=on`, it continues until interrupted. This sensor output is not a medical measurement.

### Experimental pulse-change display

```sh
s2 scan simulation=on iterations=10
```

Each comparison uses two pulse readings, so `iterations=10` produces ten symbols from eleven readings; the default is one comparison. `loop=on` opts into an indefinite stream until interruption. The fixed thresholds are legacy display heuristics, not a validated sensor-quality, physiological, or clinical algorithm. This is not a generator scan and it does not save or resume results. Device reads may block, so a finite comparison count is not a wall-clock timeout.

## Options and units

Options use `name=value` syntax. Command-line options override values from the per-user settings file. An `@FILE` argument reads one option per line; blank lines and lines beginning with `#` are ignored.

| Option | Accepted by / purpose | Default and constraints |
|---|---|---|
| `generator=N` | `control`, `run`; device identifier | `0` selects the first available device; simulation uses a dummy device |
| `channel=N` | `control`, `run`; channel selection | `0` = synchronized/both, `1` = channel 1, `2` = channel 2 |
| `pulse=N` | `pulse`, `scan`; sensor selection | `0` selects the first available sensor |
| `simulation=on\|off` | `control`, `run`, `pulse`, `scan` | `off`; `on` isolates the command from physical device enumeration |
| `amplitude=NV` | `control`, `run` | `10 V` default setpoint; accepted range `0–40 V`; suffix required (for example `V` or `mV`); out-of-range values are rejected |
| `frequency=NHz` | `control` setpoint | `0–5 MHz`; suffix required; SI prefix is case-sensitive (`kHz`, `MHz`, `mHz`, `uHz`) |
| `duration=N[s\|m\|h]` | `control` pause | `0` seconds default; nonnegative; examples `2s`, `1m`, `0.5h` |
| `output=on\|off` | `control` | Must be explicit to enable output in a control script; output is turned off best-effort at command end |
| `loop=on\|off` | `pulse`, `scan`, `run` | `off`; `on` means indefinite repetition (scan emits comparison symbols) |
| `iterations=N` | `pulse`, `scan`, `run` | `1` by default; for `scan`, counts pulse-change comparisons (each uses two readings) |
| `preset=PATH` | `run` | Preset text file |
| `program=ID` | `run` | Row identifier from `programs.csv` in the data directory |
| `code=TEXT` | `run` | Inline program text, for example `1000=1,2000=1` |
| `waveform=NAME` | `control` | Built-in waveform names or custom file; `run` waveform application is not implemented |
| `duty=PCT`, `offset=PCT` | `control` | Parsed as fractions from `0` to `1` (or `-1` to `1` for offset); synchronized/both-channel offset is rejected pending a verified mapping, and all physical semantics require independent verification |

The `amplitude` and `frequency` values are software setpoints, not metrological measurements. The current C++ `run` subset accepts plain-Hertz numeric steps, `-` frequency ramps, `=duration`, and an `A<voltage>` amplitude override. Derived-frequency markers (`B`, `M`, `L`) and waveform/offset/factor fields (`W`, `O`, `F`, `C`) are rejected until their format and conversions are independently specified; do not assume arbitrary vendor presets are compatible. For a custom waveform file, the C++ loader requires exactly 1024 finite numeric samples in the normalized interval `[-1, 1]`.

### User files

- Linux/macOS: `~/.s2/settings.txt` and `~/.s2/programs.csv`
- Windows: `%APPDATA%\.s2\settings.txt` and `%APPDATA%\.s2\programs.csv`

`settings.txt` stores the selected generator and channel. `programs.csv` is user-supplied/imported data; its provenance, license, format version, and scientific validity are not established by this project. The current CSV reader requires at least eight fields, uses the first eight and ignores additional fields; empty numeric cells are interpreted as `0` for legacy compatibility. See [`s2 validate`](#validate-the-local-program-database) for the supported syntax checks. Vendor-schema compatibility is not established.

## Development and verification

```sh
mkdir build
cd build
cmake -DCMAKE_BUILD_TYPE=Debug ..
cmake --build . -- -j2
ctest --output-on-failure
```

Tests use fake streams and software simulation. Passing them does not verify a physical generator, calibrate a sensor, establish electrical safety, or demonstrate biological/clinical efficacy. Do not describe simulation or unit-test success as hardware or medical validation.
