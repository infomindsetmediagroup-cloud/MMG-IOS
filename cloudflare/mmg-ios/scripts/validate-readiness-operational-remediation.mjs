import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);
const script = await readFile(new URL("web/kairos-dashboard/scripts/readiness-operational-remediation.js", root), "utf8");
const style = await readFile(new URL("web/kairos-dashboard/styles/readiness-operational-remediation.css", root), "utf8");
const index = await readFile(new URL("web/kairos-dashboard/index.html", root), "utf8");

assert.match(script, /command-center-operational-remediation/);
assert.match(script, /Confirm assurance drift/);
assert.match(script, /Assign corrective owners/);
assert.match(script, /Execute bounded remediation/);
assert.match(script, /Verify restored operating posture/);
assert.match(script, /Close remediation receipt/);
assert.match(script, /data-create-operational-remediation/);
assert.match(script, /data-open-operational-remediation/);
assert.doesNotMatch(script, /MutationObserver/);
assert.doesNotMatch(script, /setInterval/);
assert.match(style, /readiness-operational-remediation/);
assert.match(index, /readiness-operational-remediation\.css/);
assert.match(index, /readiness-operational-remediation\.js/);

console.log("Readiness operational remediation validation passed.");
