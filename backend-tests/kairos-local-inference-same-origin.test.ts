import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const packageJSON = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const index = readFileSync(new URL("../web/kairos-dashboard/index.html", import.meta.url), "utf8");
const loader = readFileSync(new URL("../web/kairos-dashboard/scripts/kairos-local-inference-same-origin.js", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/deploy-kairos-manuscript-runtime.yml", import.meta.url), "utf8");

describe("Kairos same-origin WebLLM delivery", () => {
  it("bundles the pinned WebLLM dependency for browser delivery", () => {
    expect(packageJSON.dependencies["@mlc-ai/web-llm"]).toBe("0.2.82");
    expect(packageJSON.scripts["build:webllm"]).toContain("webllm-bundle.js");
    expect(packageJSON.devDependencies.esbuild).toBeTruthy();
  });

  it("loads the runtime only from the Kairos origin", () => {
    expect(loader).toContain('import * as webllm from "../vendor/webllm-bundle.js"');
    expect(loader).not.toContain("cdn.jsdelivr.net");
    expect(loader).not.toContain("esm.run");
    expect(index).toContain("kairos-local-inference-same-origin.js");
    expect(index).not.toContain("kairos-local-inference.js?v=");
  });

  it("builds and verifies the runtime before production deployment", () => {
    expect(workflow).toContain("npm run build:webllm");
    expect(workflow).toContain("vendor/webllm-bundle.js");
    expect(workflow).toContain("grep -q 'CreateMLCEngine'");
  });
});
