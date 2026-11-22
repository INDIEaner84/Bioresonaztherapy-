import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const publicDir = new URL("../public/", import.meta.url);

test("PWA manifest points to valid local PNG icons and a standalone app shell", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.webmanifest", publicDir), "utf8"),
  );
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.icons.length, 2);

  for (const icon of manifest.icons) {
    assert.equal(icon.type, "image/png");
    assert.equal(icon.purpose, "any");
    const file = await readFile(new URL(icon.src.slice(1), publicDir));
    assert.deepEqual(
      file.subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    const dimensions = `${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`;
    assert.equal(dimensions, icon.sizes);
  }
});
