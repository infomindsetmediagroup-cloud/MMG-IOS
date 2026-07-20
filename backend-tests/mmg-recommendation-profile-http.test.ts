import { describe, expect, it, vi } from "vitest";
import { handleMMGLearningProfileRequest } from "../server/knowledge-library/recommendation-profile-http.js";
import type { MMGLearningProfileHttpDependencies } from "../server/knowledge-library/recommendation-profile-http.js";

const savedProfile = {
  customerId: "customer-1",
  roleCode: "creator",
  primaryGoal: "publish_book",
  secondaryGoals: ["grow_audience"],
  experienceLevel: "beginner" as const,
  primaryTopics: ["publishing"],
  secondaryTopics: ["ai_image_generation"],
  preferredFormats: ["guide"],
  excludedTopics: [],
  profileVersion: "1.0.0",
  status: "active" as const,
};

const dependencies = (): MMGLearningProfileHttpDependencies => ({
  repository: {
    load: vi.fn().mockResolvedValue(savedProfile),
    save: vi.fn().mockResolvedValue(savedProfile),
  },
  authenticate: vi.fn().mockResolvedValue({
    customerId: "customer-1",
    sessionId: "session-12345678",
  }),
  validateSameOrigin: vi.fn().mockReturnValue(true),
  validateCsrf: vi.fn().mockResolvedValue(true),
  now: () => new Date("2026-07-20T22:00:00.000Z"),
});

const request = (method: string, body?: Record<string, unknown>): Request =>
  new Request("https://themindsetmediagroup.com/api/customer-portal/learning-profile", {
    method,
    headers: body
      ? {
          "Content-Type": "application/json",
          "X-MMG-CSRF-Token": "csrf-token-12345678",
        }
      : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

const validPayload = {
  roleCode: "Creator",
  primaryGoal: "Publish Book",
  secondaryGoals: ["Grow Audience"],
  experienceLevel: "beginner",
  primaryTopics: ["Publishing"],
  secondaryTopics: ["AI Image Generation"],
  preferredFormats: ["Guide"],
  excludedTopics: [],
  onboardingVersion: "1.0.0",
};

describe("MMG learning profile HTTP", () => {
  it("loads the authenticated profile privately", async () => {
    const response = await handleMMGLearningProfileRequest(
      request("GET"),
      dependencies(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, private");
    const body = await response.json();
    expect(body.profile.customerId).toBe("customer-1");
  });

  it("requires authentication", async () => {
    const deps = dependencies();
    deps.authenticate = vi.fn().mockResolvedValue(null);
    const response = await handleMMGLearningProfileRequest(
      request("GET"),
      deps,
    );
    expect(response.status).toBe(401);
  });

  it("requires same-origin and CSRF validation for updates", async () => {
    const originDeps = dependencies();
    originDeps.validateSameOrigin = vi.fn().mockReturnValue(false);
    expect(
      (await handleMMGLearningProfileRequest(request("PUT", validPayload), originDeps)).status,
    ).toBe(403);

    const csrfDeps = dependencies();
    csrfDeps.validateCsrf = vi.fn().mockResolvedValue(false);
    expect(
      (await handleMMGLearningProfileRequest(request("PUT", validPayload), csrfDeps)).status,
    ).toBe(403);
  });

  it("normalizes and persists approved onboarding codes", async () => {
    const deps = dependencies();
    const response = await handleMMGLearningProfileRequest(
      request("PUT", validPayload),
      deps,
    );
    expect(response.status).toBe(200);
    expect(deps.repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          roleCode: "creator",
          primaryGoal: "publish_book",
          primaryTopics: ["publishing"],
          secondaryTopics: ["ai_image_generation"],
        }),
      }),
    );
  });

  it("rejects invalid experience values and unsupported methods", async () => {
    const invalid = await handleMMGLearningProfileRequest(
      request("PUT", { ...validPayload, experienceLevel: "expert" }),
      dependencies(),
    );
    expect(invalid.status).toBe(400);

    const method = await handleMMGLearningProfileRequest(
      request("POST"),
      dependencies(),
    );
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET, PUT");
  });
});