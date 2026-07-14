import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const root=new URL("../../../",import.meta.url);
const [html,script,style,registry]=await Promise.all([
  readFile(new URL("web/kairos-dashboard/index.html",root),"utf8"),
  readFile(new URL("web/kairos-dashboard/scripts/decision-record-operations.js",root),"utf8"),
  readFile(new URL("web/kairos-dashboard/styles/decision-record-operations.css",root),"utf8"),
  readFile(new URL("cloudflare/mmg-ios/src/kairos-readiness-registry-v1.js",root),"utf8")
]);
assert.match(html,/decision-record-operations\.css/);
assert.match(html,/decision-record-operations\.js/);
assert.match(html,/kairos-command-hub-recovery-20260714-\d+/);
for(const marker of ["Decision Operations","Preserve Decision","Review trigger","kairos:decision-record:open","Open My Work","Check Governing Doctrine"])assert.ok(script.includes(marker),`missing ${marker}`);
assert.ok(style.includes(".decision-record-operations"));
assert.match(registry,/"decision-record":75/);
assert.ok(!script.includes("MutationObserver"));
assert.ok(!script.includes("setInterval"));
console.log("decision record operations validation passed");
