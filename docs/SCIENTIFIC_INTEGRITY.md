# Scientific integrity, evidence boundaries, and safety

## Project status

This repository contains software for sending commands to Spooky2-compatible signal-generator hardware and reading a pulse-sensor stream. It is an engineering project, not a clinical research protocol. The repository contains no clinical study, independent bench-characterization report, calibration certificate, validated biological mechanism, or evidence that a preset produces a health benefit. Accordingly, this project cannot substantiate diagnostic, preventive, or therapeutic claims.

This statement describes the evidence present in this repository; it is not a conclusion about every external product, publication, or investigation. Regulatory classification also depends on the intended use and jurisdiction and has not been assessed here. Anyone proposing a medical intended use must obtain qualified clinical, safety, and regulatory review before making or relying on such a claim.

## What the software can and cannot establish

| Software output or feature | What it represents | What it does **not** establish |
|---|---|---|
| `frequency=...` | A value parsed and sent as a generator frequency setpoint | The calibrated frequency actually delivered at a particular load, its uncertainty, or a biological response |
| `amplitude=...` | A value parsed and sent as an amplitude setpoint | Delivered voltage/current, waveform distortion, power, tissue exposure, or safety |
| A successful serial acknowledgement | The device returned the expected protocol acknowledgement | That the physical output matched the command or that the output is safe |
| `pulse` | A pulse-sensor interval decoded by this software and converted to beats/minute | A medical-grade heart-rate measurement, diagnosis, or validated physiological endpoint |
| `scan` | An experimental display of changes between successive pulse readings, using fixed thresholds in `src/Scan.cpp` | A biofeedback scan, frequency search, disease/organism identification, validated result, saved result, or resumable session. It does not command the generator. |
| `run` and preset/database names | Parsed program text and its labels are scheduled by the application | The scientific validity of the program, the truth of a label, or any clinical efficacy |
| `simulation=on` | Commands are handled by software dummy streams | Hardware behavior, electrical output, calibration, safety, or clinical effects |

The C++ command-line runner currently applies frequency and amplitude values and turns its output state on/off. It does **not** apply every field present in a vendor program: in particular, waveform/modulation fields and several advanced options are not implemented in `run`. Use only the documented supported subset; unsupported options should fail rather than be interpreted as evidence of support.

## Safety boundary

- Do not use this software as a diagnostic or treatment tool, and do not use its labels or pulse-change output to make health decisions.
- Do not connect outputs to a person, a medical device, or an unapproved load on the basis of this repository. Follow the hardware manufacturer's instructions and applicable local requirements.
- The application now defaults to one finite run/reading (`loop=off`). `control` and `run` attempt to command outputs off on normal completion, C++ exceptions, and handled console interruption. This is a best-effort software action, **not** a certified interlock. It cannot guarantee the physical state after a process kill, power loss, operating-system failure, device disconnect, protocol fault, or hardware malfunction. Provide an independent means of removing power and verify the actual device state.
- `simulation=on` is the preferred mode for software tests; it must not be presented as hardware validation.
- Imported Spooky2 preset/database content is unverified input. A name such as a disease, organism, or “detox” label is metadata, not a supported scientific or clinical claim.

## Evidence and claims policy

Until a claim is independently supported, project text may describe only observable software behavior (for example, “sends a frequency setpoint” or “parses a preset file”). It must not say that a frequency diagnoses, kills, detoxifies, treats, prevents, or cures anything. Testimonials, vendor descriptions, and preset names are not clinical evidence.

Before making a scientific or clinical claim, create a versioned evidence record containing:

1. A precise question: intended population, intervention/device configuration, comparator, outcome, and follow-up period.
2. A reproducible literature search: databases and trial registries searched, exact query strings, date, inclusion/exclusion criteria, screening process, and source links/identifiers.
3. Critical appraisal of study design, bias, sample size, endpoints, adverse events, and conflicts of interest; distinguish mechanistic plausibility from demonstrated clinical benefit.
4. A transparent synthesis with uncertainty and limitations. For clinical efficacy, use appropriately designed controlled studies and independent review; do not infer benefit from uncontrolled observations.
5. Independent safety and regulatory review of the exact hardware/software configuration and intended use.

A reviewer should be able to reproduce the search and trace every material claim to a primary source. Record the review date and software/device version. Where evidence is absent, conflicting, indirect, or low-certainty, say so explicitly.

## Minimum bench-characterization protocol before hardware-performance claims

Simulation and unit tests verify software behavior only. Before publishing a claim about physical output, characterize the exact generator, firmware, cable, channel, waveform, and representative loads using appropriately rated, calibrated measurement equipment and a documented laboratory procedure. At minimum, retain:

- device model, serial/firmware identifiers, software commit/version, operating system, cable and load details;
- instrument model, calibration status/date, measurement bandwidth, sample rate, uncertainty, and connection diagram;
- commanded setpoint and measured voltage/current waveform, frequency, duty cycle, phase/synchronization, harmonic content, start/stop transitions, and channel-to-channel differences;
- repeated measurements across the intended operating range, test conditions, anomalies, and raw trace files;
- analysis code, units, exclusion rules, and a reviewer sign-off.

Do not infer exposure or biological effect from a command value alone. A bench report must separate the requested setpoint from the independently measured output and state the measurement uncertainty and load conditions.

## Requirements before human or clinical research

This codebase does not authorize human experimentation. Any proposed human study requires an independently reviewed protocol, informed consent, appropriate ethics approval, risk/benefit review, qualified investigators, adverse-event procedures, suitable comparator and blinding where feasible, preregistration, a justified sample-size/statistical plan, and jurisdiction-specific regulatory assessment. Keep identifiable health data out of this repository; establish an approved privacy, security, and retention plan before collecting any such data.

## Current verification level

The C++ unit suite uses fake streams and software-only simulation. CI can establish that the code builds and that those tests pass. It does **not** test a physical generator, measure output, validate sensor accuracy, establish a biological mechanism, or demonstrate clinical safety/effectiveness. The legacy C# applications and tests are not currently part of the CMake CI path. See [`TASK_CATALOG.md`](TASK_CATALOG.md) for the planned verification work and unresolved hazards.
