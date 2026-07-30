import assert from "node:assert/strict";
import test from "node:test";

import { handleProductionRegistry } from "../src/kairos-production-registry-v1.js";

const PROJECT_ID = "manuscript-source-forwarding-12345678";
const PUBLIC_PATH = `/api/production-registry/manuscripts/${PROJECT_ID}/source`;
const INTERNAL_PATH = `/registry/manuscripts/${PROJECT_ID}/source`;

test("multipart manuscript source uploads are buffered before Durable Object forwarding", async () => {
  let forwardedRequest = null;

  const env = {
    KAIROS_PROJECTS: {
      idFromName(name) {
        assert.equal(name, "mmg-production-project-registry");
        return "registry-object-id";
      },
      get(id) {
        assert.equal(id, "registry-object-id");
        return {
          async fetch(request) {
            forwardedRequest = request;
            assert.equal(new URL(request.url).pathname, INTERNAL_PATH);
            assert.equal(request.method, "POST");
            assert.match(request.headers.get("content-type") || "", /^multipart\/form-data; boundary=/i);
            assert.equal(
              request.headers.get("x-kairos-registry-forwarding"),
              "kairos-production-registry-20260730-3-source-buffering",
            );

            const form = await request.formData();
            const file = form.get("file");
            assert.ok(file instanceof File);
            assert.equal(file.name, "AI-Video-Prompt-Mastery.docx");
            assert.equal(await file.text(), "PK\u0003\u0004docx-test");
            assert.equal(form.get("extractedText"), "AI Video Prompt Mastery manuscript text retained locally.");
            assert.equal(form.get("format"), "docx");

            return new Response(JSON.stringify({ status: "stored-and-verified" }), {
              status: 201,
              headers: { "Content-Type": "application/json" },
            });
          },
        };
      },
    },
  };

  const form = new FormData();
  form.append(
    "file",
    new File(["PK\u0003\u0004docx-test"], "AI-Video-Prompt-Mastery.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  form.append("extractedText", "AI Video Prompt Mastery manuscript text retained locally.");
  form.append("title", "AI Video Prompt Mastery");
  form.append("format", "docx");
  form.append("checksum", "source-forwarding-checksum");

  const response = await handleProductionRegistry(new Request(`https://kairos.test${PUBLIC_PATH}`, {
    method: "POST",
    body: form,
  }), env);

  assert.ok(forwardedRequest);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { status: "stored-and-verified" });
});

test("read-only source requests remain streaming-safe and are not marked as buffered mutations", async () => {
  const env = {
    KAIROS_PROJECTS: {
      idFromName() { return "registry-object-id"; },
      get() {
        return {
          async fetch(request) {
            assert.equal(new URL(request.url).pathname, INTERNAL_PATH);
            assert.equal(request.method, "GET");
            assert.equal(request.headers.get("x-kairos-registry-forwarding"), null);
            return new Response(JSON.stringify({ status: "not-found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          },
        };
      },
    },
  };

  const response = await handleProductionRegistry(new Request(`https://kairos.test${PUBLIC_PATH}`), env);
  assert.equal(response.status, 404);
});
