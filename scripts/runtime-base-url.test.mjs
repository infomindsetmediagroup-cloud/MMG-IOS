import { describe, expect, it } from "vitest";
import { parseRuntimeBaseURL } from "./runtime-base-url.mjs";

const runtimeURL = "https://mmg-ios.vercel.app";

describe("parseRuntimeBaseURL", () => {
  it("accepts a standard runtime origin", () => {
    expect(parseRuntimeBaseURL(runtimeURL)).toBe(runtimeURL);
  });

  it("removes a trailing slash", () => {
    expect(parseRuntimeBaseURL(`${runtimeURL}/`)).toBe(runtimeURL);
  });

  it("extracts the destination from a Markdown link", () => {
    expect(parseRuntimeBaseURL(`[Kairos](${runtimeURL})`)).toBe(runtimeURL);
  });

  it("removes an injected bracketed-link suffix", () => {
    expect(parseRuntimeBaseURL(`${runtimeURL}](${runtimeURL})`)).toBe(runtimeURL);
  });

  it("rejects paths so the health route is appended safely", () => {
    expect(() => parseRuntimeBaseURL(`${runtimeURL}/api/kairos`)).toThrow(/without a path/);
  });
});
