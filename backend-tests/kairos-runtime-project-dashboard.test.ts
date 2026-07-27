import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const index = readFileSync("web/kairos-dashboard/index.html", "utf8");
const script = readFileSync("web/kairos-dashboard/scripts/runtime-project-operations.js", "utf8");
const style = readFileSync("web/kairos-dashboard/styles/runtime-project-operations.css", "utf8");

describe("Kairos runtime project dashboard", () => {
  it("registers runtime assets in the command hub", () => {
    expect(index).toContain("runtime-project-operations.css");
    expect(index).toContain("runtime-project-operations.js");
  });

  it("surfaces live project state, progress, approvals, queue, QA, packaging, and delivery", () => {
    expect(script).toContain("Publishing project operations");
    expect(script).toContain("Awaiting approval");
    expect(script).toContain("Queue approved work");
    expect(script).toContain("Record QA pass");
    expect(script).toContain("Record package");
    expect(script).toContain("Record delivery");
    expect(script).toContain("role=\"progressbar\"");
  });

  it("uses authenticated runtime actions without deployment or commerce controls", () => {
    expect(script).toContain("/projects/${encodeURIComponent(id)}/analyze");
    expect(script).toContain("/projects/${encodeURIComponent(id)}/queue");
    expect(script).toContain("/projects/${encodeURIComponent(id)}/start");
    expect(script).toContain("/projects/${encodeURIComponent(id)}/events");
    expect(script).not.toContain("Deploy");
    expect(script).not.toContain("Publish product");
    expect(script).not.toContain("Rollback");
  });

  it("is responsive and reduced-motion safe", () => {
    expect(style).toContain("@media(max-width:620px)");
    expect(style).toContain("prefers-reduced-motion");
  });
});