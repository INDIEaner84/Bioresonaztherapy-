import test from "node:test";
import assert from "node:assert/strict";
import {
  validateControl,
  validatePasses,
  validateProgram,
} from "../src/validation.js";

const validControl = { frequency: "1000", amplitude: "5", duration: "2" };

test("control validation accepts documented inclusive setpoint boundaries", () => {
  assert.equal(
    validateControl({ frequency: "0", amplitude: "0", duration: "0.001" }),
    null,
  );
  assert.equal(
    validateControl({
      frequency: "5000000",
      amplitude: "40",
      duration: "7200",
    }),
    null,
  );
});

test("control validation rejects empty, non-finite and out-of-range inputs", () => {
  assert.match(
    validateControl({ ...validControl, frequency: "" }),
    /Enter a value/,
  );
  assert.match(
    validateControl({ ...validControl, frequency: "NaN" }),
    /frequency/,
  );
  assert.match(
    validateControl({ ...validControl, frequency: "5000000.1" }),
    /frequency/,
  );
  assert.match(
    validateControl({ ...validControl, amplitude: "-0.1" }),
    /amplitude/,
  );
  assert.match(
    validateControl({ ...validControl, amplitude: "40.1" }),
    /amplitude/,
  );
  assert.match(validateControl({ ...validControl, duration: "0" }), /duration/);
  assert.match(
    validateControl({ ...validControl, duration: "Infinity" }),
    /duration/,
  );
});

test("program validator accepts only supported plain-Hertz steps", () => {
  assert.equal(validateProgram("0=0.01,5000000=0.1"), null);
  assert.equal(validateProgram("1000-2000=0.5"), null);
  assert.equal(validateProgram("1000, 2000=0.1"), null);
  assert.equal(validateProgram("1000"), null);
});

test("program validator rejects empty steps, unsupported fields and invalid ranges", () => {
  assert.match(validateProgram(""), /Add one or more/);
  assert.match(validateProgram("1000,,2000"), /plain-Hertz/);
  assert.match(validateProgram("1000=0"), /durations/);
  assert.match(validateProgram("5000001=1"), /frequencies/);
  assert.match(validateProgram("B0=1"), /plain-Hertz/);
  assert.match(validateProgram("A5=1"), /plain-Hertz/);
  assert.match(validateProgram("1000=NaN"), /plain-Hertz/);
});

test("finite pass validation accepts positive safe integers and rejects loops/invalid counts", () => {
  assert.equal(validatePasses("1"), null);
  assert.equal(validatePasses(String(Number.MAX_SAFE_INTEGER)), null);
  for (const value of [
    "",
    "0",
    "-1",
    "1.5",
    "Infinity",
    "9007199254740992",
    "1e2",
  ]) {
    assert.match(validatePasses(value), /positive whole number/);
  }
});
