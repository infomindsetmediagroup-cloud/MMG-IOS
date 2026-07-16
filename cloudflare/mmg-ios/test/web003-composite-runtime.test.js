import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCompositePlan,
  mergeCompositeExecution,
} from "../src/kairos-web003-composite-runtime-v1.js";

test("WEB-003 plan binds canonical and native-theme source hashes", () => {
  const canonical = {
    planID: "plan-1",
    actionID: "action-1",
    build: "canonical",
    summary: "Canonical plan",
    plan: {
      targetTheme: { gid: "gid://shopify/OnlineStoreTheme/2", role: "UNPUBLISHED" },
      changes: [{ filename: "templates/index.json", purpose: "Install canonical homepage" }],
      sourceHashes: { "templates/index.json": "home-before" },
      canonicalPackage: { files: [{ filename: "templates/index.json" }] },
    },
    evidence: {},
  };
  const native = {
    build: "native-plan",
    highConfidence: [],
    executiveReview: [{
      filename: "sections/header-group.json",
      sourceSha256: "header-before",
      path: ["sections", "header", "settings", "color_scheme"],
      key: "color_scheme",
      authorizedChange: "select a verified active theme color scheme",
      confidence: 0.72,
      requiresExecutiveApproval: true,
    }],
    verifiedThemeSchemes: [{ value: "scheme-3", background: "#242833" }],
  };

  const result = buildCompositePlan(canonical, native);
  assert.equal(result.requestType, "full-retool");
  assert.equal(result.plan.sourceHashes["templates/index.json"], "home-before");
  assert.equal(result.plan.sourceHashes["sections/header-group.json"], "header-before");
  assert.equal(result.plan.websiteRetoolExceptions, native);
  assert.equal(result.plan.compositePackage.explicitNativeThemeDecisionRequired, true);
});

test("WEB-003 execution emits one release and rollback boundary", () => {
  const canonical = {
    actionID: "execution-1",
    execution: {
      targetTheme: { gid: "gid://shopify/OnlineStoreTheme/2", role: "UNPUBLISHED" },
      publishedTheme: { gid: "gid://shopify/OnlineStoreTheme/1", role: "MAIN" },
      filesWritten: [{ filename: "templates/index.json", beforeSha256: "home-before", afterSha256: "home-after" }],
    },
    verification: [{ filename: "templates/index.json", matched: true }],
    evidence: {},
    rollback: {
      targetThemeID: "gid://shopify/OnlineStoreTheme/2",
      currentHashes: { "templates/index.json": "home-after" },
      files: [{ filename: "templates/index.json", content: "{}" }],
    },
  };
  const native = {
    build: "native-execution",
    execution: {
      filesWritten: [{ filename: "sections/header-group.json", beforeSha256: "header-before", afterSha256: "header-after", verified: true }],
    },
    receipts: [{ key: "color_scheme" }],
    safeguards: { stagingOnly: true },
    rollback: {
      targetThemeID: "gid://shopify/OnlineStoreTheme/2",
      currentHashes: { "sections/header-group.json": "header-after" },
      files: [{ filename: "sections/header-group.json", content: "{}" }],
    },
  };

  const result = mergeCompositeExecution(canonical, native, "approved-selection");
  assert.deepEqual(result.execution.packageBoundary, [
    "templates/index.json",
    "sections/header-group.json",
  ]);
  assert.equal(result.execution.nativeThemeChangesApplied, 1);
  assert.equal(result.rollback.packageType, "web-003-composite");
  assert.equal(result.rollback.files.length, 2);
  assert.equal(result.rollback.currentHashes["sections/header-group.json"], "header-after");
});
