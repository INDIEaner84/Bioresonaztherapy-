const MAX_FREQUENCY_HZ = 5_000_000;
const MAX_AMPLITUDE_V = 40;

/** @param {{ frequency: string, amplitude: string, duration: string }} input */
export function validateControl(input) {
  const values = [input.frequency, input.amplitude, input.duration];
  if (
    values.some((value) => typeof value !== "string" || value.trim() === "")
  ) {
    return "Enter a value for frequency, amplitude, and duration.";
  }

  const frequency = Number(input.frequency);
  const amplitude = Number(input.amplitude);
  const duration = Number(input.duration);

  if (
    !Number.isFinite(frequency) ||
    frequency < 0 ||
    frequency > MAX_FREQUENCY_HZ
  ) {
    return "Enter a frequency from 0 to 5,000,000 Hz.";
  }
  if (
    !Number.isFinite(amplitude) ||
    amplitude < 0 ||
    amplitude > MAX_AMPLITUDE_V
  ) {
    return "Enter an amplitude from 0 to 40 V.";
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return "Enter a positive, finite duration in seconds.";
  }
  return null;
}

/** @param {string} code */
export function validateProgram(code) {
  const text = code.trim();
  if (!text) return "Add one or more frequency steps.";

  const tokens = text.split(",").map((part) => part.trim());
  for (const token of tokens) {
    const match =
      /^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?(?:=(\d+(?:\.\d+)?))?$/.exec(token);
    if (!match) {
      return "Use plain-Hertz steps such as 1000=0.1,2000=0.1. Unsupported fields are rejected.";
    }
    const startHz = Number(match[1]);
    const endHz = match[2] === undefined ? startHz : Number(match[2]);
    const duration = match[3] === undefined ? undefined : Number(match[3]);
    if (
      ![startHz, endHz].every(
        (value) =>
          Number.isFinite(value) && value >= 0 && value <= MAX_FREQUENCY_HZ,
      )
    ) {
      return "Program frequencies must be from 0 to 5,000,000 Hz.";
    }
    if (
      duration !== undefined &&
      (!Number.isFinite(duration) || duration <= 0)
    ) {
      return "Program step durations must be positive and finite.";
    }
  }
  return null;
}

/** @param {string} value */
export function validatePasses(value) {
  if (!/^\d+$/.test(value.trim()))
    return "Choose a positive whole number of finite passes.";
  const passes = Number(value);
  if (!Number.isSafeInteger(passes) || passes < 1)
    return "Choose a positive whole number of finite passes.";
  return null;
}
