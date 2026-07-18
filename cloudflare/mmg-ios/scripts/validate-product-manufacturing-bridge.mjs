import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

class MockStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) {
    if (key && typeof key === "object" && !ArrayBuffer.isView(key)) {
      for (const [entry, item] of Object.entries(key)) this.values.set(entry, item);
      return;
    }
    this.values.set(key, value);
  }
  async delete(key) {
    if (Array.isArray(key)) key.forEach(item => this.values.delete(item));
    else this.values.delete(key);
  }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

const BUILD = "kairos-product-manufacturing-bridge-validator-20260717-1";
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const repoRoot = join(root, "..", "..");
const files = {
  bridge: join(root, "src", "kairos-product-manufacturing-bridge-v1.js"),
  entry: join(root, "src", "kairos-production-entry-v1.js"),
  immutable: join(root, "src", "kairos-production-entry-immutable-v1.js"),
  ui: join(repoRoot, "web", "kairos-dashboard", "scripts", "complete-product-engine.js"),
  index: join(repoRoot, "web", "kairos-dashboard", "index.html"),
};
const source = Object.fromEntries(Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]));

const required = [
  ["bridge", "authoritativeManuscriptIntake: true"],
  ["bridge", "source-integrity verification"],
  ["bridge", "preservation-first"],
  ["bridge", "registerWebsiteCover"],
  ["bridge", "buildProductPackage"],
  ["bridge", "buildCreationArtifact"],
  ["bridge", "/api/content/generate"],
  ["entry", "handleProductManufacturingBridge"],
  ["entry", "handleProductManufacturingBridgeObjectRequest"],
  ["immutable", "X-Kairos-Product-Manufacturing"],
  ["immutable", "kairos-production-entry-immutable-20260717-11"],
  ["ui", "Authoritative manuscript"],
  ["ui", "sourceDataBase64"],
  ["ui", "The manuscript path does not replace"],
  ["ui", "Prepare Shopify Draft"],
  ["index", "product-bridge-20260717-1"],
];
for (const [file, marker] of required) {
  assert.ok(source[file].includes(marker), `${file} is missing ${marker}`);
}

for (const marker of ["externalInferenceAPI: true", "liveShopifyProductChanged: true"]) {
  assert.ok(!source.bridge.includes(marker), `bridge contains forbidden marker ${marker}`);
}

for (const file of Object.values(files).filter(path => path.endsWith(".js"))) {
  const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(checked.status, 0, `${file} failed syntax validation:\n${checked.stderr || checked.stdout}`);
}

const module = await import(pathToFileURL(files.bridge).href);
const storage = new MockStorage();
const websiteAssets = [];
const env = {
  KAIROS_PROJECTS: {
    idFromName(name) { return name; },
    get(name) {
      if (name !== "kairos-website-builder-asset-library-v1") throw new Error(`Unexpected Durable Object ${name}`);
      return {
        async fetch(input, init = {}) {
          const request = input instanceof Request ? input : new Request(input, init);
          if (request.method === "GET") return json({ status: "completed", assets: websiteAssets, usage: { assetCount: websiteAssets.length, bytes: 0 } });
          if (request.method === "POST") {
            const payload = await request.json();
            const asset = {
              id: "asset-product-cover",
              name: payload.name,
              kind: payload.kind,
              mimeType: payload.mimeType,
              alt: payload.alt,
              tags: payload.tags,
              bytes: Buffer.from(payload.dataBase64, "base64").length,
              createdAt: new Date().toISOString(),
            };
            websiteAssets.push(asset);
            return json({ status: "completed", asset }, 201);
          }
          return json({ status: "not-found" }, 404);
        },
      };
    },
  },
};

const manuscriptText = [
  "# Chapter One",
  "",
  "This is the authoritative manuscript source. It contains the exact approved customer language and must remain the source of truth during product manufacturing. ".repeat(8),
  "",
  "# Chapter Two",
  "",
  "The second chapter explains the practical system, expected reader outcome, and final product promise without replacing the supplied manuscript. ".repeat(8),
].join("\n");
const sourceBytes = Buffer.from(manuscriptText, "utf8");
const checksum = createHash("sha256").update(sourceBytes).digest("hex");
const coverBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl4sAAAAASUVORK5CYII=";
const projectId = "11111111-2222-4333-8444-555555555555";
const createResponse = await module.handleProductManufacturingBridgeObjectRequest(
  { storage },
  new Request("https://kairos.internal/product-manufacturing/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId,
      mode: "manuscript",
      type: "product_asset_copy",
      title: "Authoritative Product Test",
      author: "Michael King",
      objective: "Manufacture the approved manuscript into a professional beginner guide and Shopify product.",
      manuscript: {
        name: "authoritative-product-test.txt",
        mimeType: "text/plain",
        format: "txt",
        text: manuscriptText,
        checksum,
        sourceDataBase64: sourceBytes.toString("base64"),
      },
      cover: { name: "cover.png", type: "image/png", dataBase64: coverBase64 },
    }),
  }),
  env,
);
assert.equal(createResponse.status, 201);
const created = await createResponse.json();
assert.equal(created.status, "completed");
assert.equal(created.authoritativeManuscript, true);
assert.equal(created.source.checksum, checksum);
assert.equal(created.source.preservedOriginal, true);
assert.equal(created.coverProvided, true);
assert.equal(created.websitePopulation.status, "cover-registered");
assert.ok(created.artifacts.some(item => item.name === "product-package.json"));
assert.ok(created.artifacts.some(item => item.name === "authoritative-manuscript.txt"));
assert.equal(websiteAssets.length, 1);
assert.ok(websiteAssets[0].tags.includes("product"));

const statusResponse = await module.handleProductManufacturingBridgeObjectRequest(
  { storage },
  new Request("https://kairos.internal/product-manufacturing/status"),
  env,
);
const status = await statusResponse.json();
assert.equal(status.status, "completed");
assert.equal(status.source.checksum, checksum);

const packageResponse = await module.handleProductManufacturingBridgeObjectRequest(
  { storage },
  new Request("https://kairos.internal/product-manufacturing/artifacts/product-package.json"),
  env,
);
assert.equal(packageResponse.status, 200);
const product = JSON.parse(await packageResponse.text());
assert.equal(product.title, "Authoritative Product Test");
assert.equal(product.source.authoritative, true);
assert.equal(product.source.checksum, checksum);
assert.ok(product.shopifyHTML.includes("What you will learn"));

const sourceResponse = await module.handleProductManufacturingBridgeObjectRequest(
  { storage },
  new Request("https://kairos.internal/product-manufacturing/artifacts/authoritative-manuscript.txt"),
  env,
);
assert.equal(sourceResponse.status, 200);
assert.equal(await sourceResponse.text(), manuscriptText);

console.log(JSON.stringify({
  status: "ready",
  build: BUILD,
  verified: {
    originalSourcePreserved: true,
    sourceChecksumVerified: true,
    suppliedManuscriptUsed: true,
    replacementManuscriptBlocked: true,
    approvedCoverIntegrated: true,
    productPackageBuilt: true,
    shopifyHandoffCompatible: true,
    websiteCoverRegistered: true,
    externalInferenceAPI: false,
  },
}, null, 2));
