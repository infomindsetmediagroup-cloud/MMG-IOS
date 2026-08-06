import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const entryURL = new URL(
  "../src/kairos-production-entry-canonical-publishing-v1.js",
  import.meta.url,
);
const wranglerURL = new URL("../wrangler.toml", import.meta.url);

test("canonical publishing entry exports every Wrangler-bound class", async () => {
  const [entrySource, wranglerSource] = await Promise.all([
    readFile(entryURL, "utf8"),
    readFile(wranglerURL, "utf8"),
  ]);

  const configuredClasses = [
    ...wranglerSource.matchAll(/^class_name\s*=\s*"([^"]+)"/gm),
  ].map((match) => match[1]);

  assert.ok(configuredClasses.length > 0, "wrangler.toml must bind classes");

  for (const className of configuredClasses) {
    assert.equal(
      isNamedExport(entrySource, className),
      true,
      `${className} must be exported by the configured Worker entry`,
    );
  }
});

function isNamedExport(source, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`export\\s+class\\s+${escaped}\\b`).test(source)) return true;

  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\};/g)) {
    const exportedNames = match[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => value.split(/\s+as\s+/i).at(-1));
    if (exportedNames.includes(className)) return true;
  }
  return false;
}
