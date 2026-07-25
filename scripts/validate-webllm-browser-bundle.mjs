import { readFileSync, statSync } from "node:fs";

const bundlePath = "web/kairos-dashboard/vendor/webllm-bundle.js";
const source = readFileSync(bundlePath, "utf8");
const size = statSync(bundlePath).size;

assert(size > 100_000, `WebLLM browser bundle is unexpectedly small (${size} bytes).`);
assert(source.includes("CreateMLCEngine"), "WebLLM browser bundle does not expose CreateMLCEngine.");
assert(!/from\s+["'](?:node:)?url["']/.test(source), "WebLLM browser bundle retains a Node url import.");
assert(!/require\(["'](?:node:)?url["']\)/.test(source), "WebLLM browser bundle retains a Node url require.");
assert(!/require\(["'](?:node:)?fs["']\)/.test(source), "WebLLM browser bundle retains a Node fs require.");

console.log(`Validated browser-safe WebLLM bundle (${size} bytes).`);

function assert(condition, message) {
  if (!condition) {
    console.error(`WebLLM browser bundle validation failed: ${message}`);
    process.exit(1);
  }
}
