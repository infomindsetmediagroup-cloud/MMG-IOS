import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyWebsiteRetoolCandidate,
  collectVerifiedThemeSchemes,
} from "../src/kairos-website-retool-exception-planner-v1.js";

const headerSetting = (key, valueType = "string") => ({
  key,
  valueType,
  path: ["sections", "header", "settings", key],
});

test("header logo layout settings are never classified as removable logo assets", () => {
  for (const key of ["logo_position", "mobile_logo_position", "logo_width", "header_logo_width", "brand_image_width"]) {
    assert.equal(
      classifyWebsiteRetoolCandidate("sections/header-group.json", headerSetting(key)),
      null,
      `${key} must remain untouched`,
    );
  }
});

test("only an active exact logo asset key is proposed and it always requires executive review", () => {
  const active = classifyWebsiteRetoolCandidate("config/settings_data.json", {
    key: "logo",
    valueType: "string",
    path: ["current", "logo"],
  });
  assert.equal(active?.authorizedChange, "clear verified theme logo asset assignment");
  assert.equal(active?.proposedValue, "");
  assert.ok(active?.confidence < 0.95);
  assert.match(active?.rationale || "", /rendered preview/i);

  const preset = classifyWebsiteRetoolCandidate("config/settings_data.json", {
    key: "logo",
    valueType: "string",
    path: ["presets", "Rise", "logo"],
  });
  assert.equal(preset, null, "inactive presets must never be mutated");
});

test("verified native visibility controls remain classifiable on their owning groups", () => {
  const logoVisibility = classifyWebsiteRetoolCandidate("sections/header-group.json", headerSetting("show_logo", "boolean"));
  assert.equal(logoVisibility?.proposedValue, false);
  assert.ok(logoVisibility?.confidence >= 0.95);

  const paymentVisibility = classifyWebsiteRetoolCandidate("sections/footer-group.json", {
    key: "payment_enable",
    valueType: "boolean",
    path: ["sections", "footer", "settings", "payment_enable"],
  });
  assert.equal(paymentVisibility?.proposedValue, false);
  assert.ok(paymentVisibility?.confidence >= 0.95);
});

test("only active verified theme schemes become selectable color values", () => {
  const report = {
    settings: {
      candidateSettings: [
        { path: ["current", "color_schemes", "scheme-3", "settings", "background"], valuePreview: "#242833" },
        { path: ["current", "color_schemes", "scheme-4", "settings", "background"], valuePreview: "#1CCBF5" },
        { path: ["presets", "Rise", "color_schemes", "scheme-4", "settings", "background"], valuePreview: "#121212" },
      ],
    },
  };
  assert.deepEqual(collectVerifiedThemeSchemes(report), [
    { value: "scheme-3", background: "#242833", source: "config/settings_data.json/current/color_schemes" },
    { value: "scheme-4", background: "#1ccbf5", source: "config/settings_data.json/current/color_schemes" },
  ]);

  const candidate = classifyWebsiteRetoolCandidate("sections/header-group.json", headerSetting("color_scheme"));
  assert.equal(candidate?.proposedValue, null);
  assert.equal(candidate?.requiresVerifiedThemeScheme, true);
  assert.match(candidate?.rationale || "", /will not infer/i);
});
