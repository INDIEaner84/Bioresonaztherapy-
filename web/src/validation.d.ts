export interface ControlInput {
  frequency: string;
  amplitude: string;
  duration: string;
}

export type ValidationError = string | null;

export function validateControl(input: ControlInput): ValidationError;
export function validateProgram(code: string): ValidationError;
export function validatePasses(value: string): ValidationError;
