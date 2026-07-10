import { describe, expect, it } from "vitest";
import {
  KairosHttpError,
  authorizeRequest,
  buildOpenAIRequestBody,
  extractResponseText,
  parseRuntimeRequest,
  requireRuntimeEnvironment,
} from "../api/kairos-core.js";

describe("Kairos backend core", () => {
  it("requires all runtime secrets and model configuration", () => {
    expect(() => requireRuntimeEnvironment({})).toThrow(KairosHttpError);
    expect(requireRuntimeEnvironment({
      OPENAI_API_KEY: "provider-key",
      OPENAI_MODEL: "configured-model",
      KAIROS_RUNTIME_TOKEN: "gateway-token",
    })).toEqual({
      OPENAI_API_KEY: "provider-key",
      OPENAI_MODEL: "configured-model",
      KAIROS_RUNTIME_TOKEN: "gateway-token",
    });
  });

  it("requires an exact bearer token", () => {
    expect(() => authorizeRequest(undefined, "gateway-token")).toThrow(KairosHttpError);
    expect(() => authorizeRequest("Bearer wrong", "gateway-token")).toThrow(KairosHttpError);
    expect(() => authorizeRequest("Bearer gateway-token", "gateway-token")).not.toThrow();
  });

  it("normalizes and validates the iOS runtime request", () => {
    expect(parseRuntimeRequest({
      objective: "  Build the next slice  ",
      department: "engineering",
      routingConfidence: 0.92,
      executionPlan: ["Define contract", "Validate"],
      governanceNote: "Keep credentials server-side.",
    })).toEqual({
      objective: "Build the next slice",
      department: "engineering",
      routingConfidence: 0.92,
      executionPlan: ["Define contract", "Validate"],
      governanceNote: "Keep credentials server-side.",
    });
  });

  it("rejects empty or invalid request values", () => {
    expect(() => parseRuntimeRequest({ objective: "", department: "engineering" })).toThrow(KairosHttpError);
    expect(() => parseRuntimeRequest({ objective: "Build", department: "engineering", routingConfidence: 2 })).toThrow(KairosHttpError);
  });

  it("builds an OpenAI Responses API request without provider secrets", () => {
    const body = buildOpenAIRequestBody({
      objective: "Build the next slice",
      department: "engineering",
      routingConfidence: 0.9,
      executionPlan: ["Implement", "Validate"],
      governanceNote: "Do not claim unverified completion.",
    }, "configured-model");

    expect(body.model).toBe("configured-model");
    expect(body.input).toContain("Build the next slice");
    expect(JSON.stringify(body)).not.toContain("provider-key");
  });

  it("extracts text from both convenience and output content forms", () => {
    expect(extractResponseText({ output_text: "Direct response" })).toBe("Direct response");
    expect(extractResponseText({
      output: [{ content: [{ type: "output_text", text: "Structured response" }] }],
    })).toBe("Structured response");
  });
});
