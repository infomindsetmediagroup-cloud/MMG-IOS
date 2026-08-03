import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const controllerPath = new URL("../web/kairos-dashboard/scripts/manuscript-auto-pipeline.js", import.meta.url);
const guardPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-guard.js", import.meta.url);
const postIntakeGuardPath = new URL("../web/kairos-dashboard/scripts/manuscript-post-intake-guard.js", import.meta.url);
const directOpenPath = new URL("../web/kairos-dashboard/scripts/manuscript-direct-open-controller.js", import.meta.url);
const continuationPath = new URL("../web/kairos-dashboard/scripts/manuscript-continuation-controller.js", import.meta.url);
const studioPath = new URL("../web/kairos-dashboard/scripts/manuscript-studio.js", import.meta.url);
const studioStylePath = new URL("../web/kairos-dashboard/styles/manuscript-studio.css", import.meta.url);
const orchestratorPath = new URL("../web/kairos-dashboard/scripts/manuscript-pipeline-orchestrator.js", import.meta.url);
const workspacePath = new URL("../web/kairos-dashboard/scripts/production-workspace-controller.js", import.meta.url);
const bootstrapPath = new URL("../web/kairos-dashboard/scripts/manuscript-production-flow-bootstrap.js", import.meta.url);
const loaderPath = new URL("../web/kairos-dashboard/scripts/legacy-runtime-loader.js", import.meta.url);
const indexPath = new URL("../web/kairos-dashboard/index.html", import.meta.url);
const manuscriptPagePath = new URL("../web/kairos-dashboard/manuscript.html", import.meta.url);
const editorialPath = new URL("../web/kairos-dashboard/scripts/manuscript-editorial-workbench.js", import.meta.url);
const autoPipelineBackendPath = new URL("../cloudflare/mmg-ios/src/kairos-manuscript-auto-pipeline-v1.js", import.meta.url);

test("the actual manuscript controller uses only the local WebGPU production route", async () => {
  const source = await readFile(controllerPath, "utf8");

  assert.doesNotMatch(source, /generation-job/);
  assert.doesNotMatch(source, /Start Production Job/);
  assert.doesNotMatch(source, /you may close Safari|continues in the backend|phone-independent/i);
  assert.match(source, /KairosLocalInference/);
  assert.match(source, /data-start-local-production/);
  assert.match(source, /ready-for-manufacturing/);
  assert.match(source, /\/editorial/);
  assert.match(source, /\/setup/);
  assert.match(source, /\/auto-pipeline/);
  assert.match(source, /executionMode:\s*"browser-webgpu"/);
  assert.match(source, /Keep Safari open and in the foreground/);
  assert.match(source, /Do not close Safari during this step/);
});

test("the controller observer cannot recursively schedule renders for its own section", async () => {
  const source = await readFile(controllerPath, "utf8");

  assert.doesNotMatch(source, /new MutationObserver\(scheduleEnhance\)/);
  assert.match(source, /hasSetup && !hasPipeline/);
  assert.match(source, /setTimeout\(\(\) =>/);
});

test("the governed loader uses the post-intake stability lineage and installs the guard first", async () => {
  const source = await readFile(loaderPath, "utf8");
  const activeScripts = source.match(/const SCRIPT_FILES = \[([\s\S]*?)\];/)?.[1] || "";

  assert.match(source, /const ASSET_RELEASE = "five-center-dashboard-post-intake-stability-20260731-1"/);
  assert.doesNotMatch(source, /const ASSET_RELEASE = "five-center-dashboard-direct-studio-chunks-20260730-4"/);
  assert.match(source, /script\.src = `\.\/scripts\/\$\{filename\}\?v=\$\{ASSET_RELEASE\}`/);
  assert.match(activeScripts, /"manuscript-post-intake-guard\.js"/);
  assert.match(activeScripts, /"manuscript-studio\.js"/);
  assert.match(activeScripts, /"manuscript-auto-pipeline\.js"/);
  assert.ok(
    activeScripts.indexOf('"manuscript-post-intake-guard.js"') <
      activeScripts.indexOf('"manuscript-studio.js"'),
    "The post-intake guard must load before Manuscript Studio.",
  );
});

test("the route firewall rewrites any retained legacy button before document handlers run", async () => {
  const source = await readFile(guardPath, "utf8");

  assert.doesNotMatch(source, /generation-job/);
  assert.match(source, /window\.addEventListener\("click"/);
  assert.match(source, /data-start-production/);
  assert.match(source, /data-start-local-production/);
  assert.match(source, /stopImmediatePropagation/);
  assert.match(source, /KairosLocalInference/);
  assert.match(source, /auto-pipeline\/run/);
});

test("the post-intake guard preserves the successful overlay and suppresses duplicate Studio modules", async () => {
  const source = await readFile(postIntakeGuardPath, "utf8");

  assert.match(source, /kairos-manuscript-post-intake-guard-20260731-1/);
  assert.match(source, /duplicate Manuscript Studio module blocked/);
  assert.match(source, /success-overlay-stabilized/);
  assert.match(source, /success-overlay-restored/);
  assert.match(source, /intentionalRemovalUntil/);
  assert.match(source, /kairos:production:workspace-visibility/);
  assert.match(source, /KairosManuscriptPostIntakeGuard/);
});

test("the direct route independently loads Studio and owns visible recovery", async () => {
  const source = await readFile(directOpenPath, "utf8");

  assert.match(source, /kairos-manuscript-direct-open-20260801-2-standalone/);
  assert.match(source, /routeTarget === "manuscript"/);
  assert.match(source, /ensureStyle\("manuscript-studio\.css"\)/);
  assert.match(source, /ensureModule\("manuscript-post-intake-guard\.js"\)/);
  assert.match(source, /ensureModule\("manuscript-studio\.js"\)/);
  assert.match(source, /data-kairos-command-script/);
  assert.match(source, /data-kairos-command-style/);
  assert.match(source, /\.manuscript-launch/);
  assert.match(source, /#manuscript-studio-overlay/);
  assert.match(source, /Manuscript Studio did not open/);
  assert.match(source, /data-kairos-manuscript-retry/);
  assert.match(source, /data-kairos-command-return/);
  assert.match(source, /kairos-manuscript-direct-open-shell/);
  assert.match(source, /overlay-watchdog/);
  assert.match(source, /KairosManuscriptDirectOpen/);
});

test("the iPhone intake receipt automatically exposes Project Setup without a hidden handoff", async () => {
  const [continuation, studio, styles, manuscriptPage] = await Promise.all([
    readFile(continuationPath, "utf8"),
    readFile(studioPath, "utf8"),
    readFile(studioStylePath, "utf8"),
    readFile(manuscriptPagePath, "utf8"),
  ]);

  assert.match(continuation, /kairos-manuscript-continuation-20260802-3-auto-setup/);
  assert.match(continuation, /scheduleAutomaticContinuation/);
  assert.match(continuation, /automaticContinuations/);
  assert.match(continuation, /continueToSetup\(button\)/);
  assert.match(continuation, /behavior:\s*"auto"/);
  assert.match(studio, /data-kairos-intake-receipt/);
  assert.match(studio, /manuscript-intake-actions/);
  assert.match(studio, />Continue to Project Setup</);
  assert.match(studio, /document\.documentElement\.classList\.toggle\("manuscript-studio-open"/);
  assert.match(styles, /\.manuscript-intake-actions\s*\{[\s\S]*position:\s*sticky/);
  assert.match(styles, /backdrop-filter:\s*none/);
  assert.match(styles, /box-sizing:\s*border-box/);
  assert.match(styles, /height:\s*100dvh/);
  assert.match(styles, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(manuscriptPage, /mmg-manuscript-mobile-flow-release/);
  assert.match(manuscriptPage, /manuscript-deliverable-review-20260803-1/);
});

test("the authoritative orchestrator owns setup persistence and deterministic manufacturing", async () => {
  const source = await readFile(orchestratorPath, "utf8");

  assert.match(source, /kairos-manuscript-pipeline-orchestrator-20260803-1-deliverable-review/);
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /X-Kairos-Idempotency-Key/);
  assert.match(source, /auto-pipeline\/run/);
  assert.match(source, /Manufacture Delivery Package/);
  assert.match(source, /Preview Package/);
  assert.match(source, /Approve &amp; Finalize Deliverable Package/);
  assert.match(source, /Preview Shopify Product/);
  assert.match(source, /Publish Product Live/);
  assert.doesNotMatch(source, /\/setup\/cover/);
  assert.doesNotMatch(source, /api\.openai\.com/);
});

test("the manuscript URL is isolated from the advanced command shell", async () => {
  const [index, manuscriptPage] = await Promise.all([
    readFile(indexPath, "utf8"),
    readFile(manuscriptPagePath, "utf8"),
  ]);

  assert.match(index, /current\.searchParams\.get\("open"\) !== "manuscript"/);
  assert.match(index, /new URL\("\.\/manuscript", current\)/);
  assert.match(index, /target\.searchParams\.delete\("mode"\)/);
  assert.match(index, /location\.replace\(target\.href\)/);
  assert.match(index, /mmg-dedicated-manuscript-route/);

  assert.match(manuscriptPage, /kairos-dedicated-manuscript-route-20260803-1-deliverable-review/);
  assert.match(manuscriptPage, /kairos-manuscript-pipeline-orchestrator-20260803-1-deliverable-review/);
  assert.match(manuscriptPage, /data-kairos-dedicated-manuscript="true"/);
  assert.match(manuscriptPage, /safari-manuscript-intake-compat\.js/);
  assert.match(manuscriptPage, /manuscript-direct-open-controller\.js/);
  assert.match(manuscriptPage, /manuscript-pipeline-orchestrator\.js/);
  assert.match(manuscriptPage, /kairos-manuscript-route-boot/);
  assert.doesNotMatch(manuscriptPage, /legacy-runtime-loader\.js/);
  assert.doesNotMatch(manuscriptPage, /manuscript-production-flow-bootstrap\.js/);
  assert.doesNotMatch(manuscriptPage, /data-kairos-persistent-return/);
});

test("customer review exposes the exact deliverable contract and an executable production action", async () => {
  const [editorial, backend] = await Promise.all([
    readFile(editorialPath, "utf8"),
    readFile(autoPipelineBackendPath, "utf8"),
  ]);

  for (const filename of [
    "customer-spec-sheet.pdf",
    "kdp-interior-6x9.pdf",
    "digital-asset-edition-v2.pdf",
    "cover-portrait-2048x3072.png",
    "cover-thumbnail-2048x2048.png",
    "README.txt",
  ]) {
    assert.match(editorial, new RegExp(filename.replaceAll(".", "\\.")));
  }
  assert.match(editorial, /complete-production-package\.zip/);
  assert.match(editorial, /Approve Review & Produce Deliverable Asset/);
  assert.match(editorial, /data-customer-review-manuscript readonly/);
  assert.match(editorial, /setup\/cover/);
  assert.match(editorial, /orchestrator\.manufacture\(\)/);

  assert.match(backend, /resolveApprovedEditorialInput/);
  assert.match(backend, /ready-for-manufacturing/);
  assert.match(backend, /approvedEditorialVersionId/);
  assert.match(backend, /approvedEditorialChecksum/);
  assert.match(backend, /KAIROS_MANUSCRIPT_SOURCES/);
  assert.doesNotMatch(
    backend.match(/async function runPipeline[\s\S]*?async function prepareShopifyDraft/)?.[0] || "",
    /\/source\/text/,
  );
});

test("the production workspace does not convert arbitrary DOM mutations into durable state changes", async () => {
  const source = await readFile(workspacePath, "utf8");
  const intakeBranch = source.match(/async function captureProductionResponse[\s\S]*?async function upsertWorkspaceRecord/)?.[0] || "";
  const observerBlock = source.match(/const observer = new MutationObserver[\s\S]*?observer\.observe/)?.[0] || "";

  assert.match(source, /kairos-production-workspace-20260731-4-post-intake/);
  assert.doesNotMatch(intakeBranch, /url\.includes\("\/api\/manuscript\/intake\/advance"\)/);
  assert.match(source, /Manuscript Studio exclusively owns the intake-to-registry transition/);
  assert.match(observerBlock, /dispatchWorkspaceVisibility/);
  assert.doesNotMatch(observerBlock, /kairos:production:state-changed/);
  assert.match(source, /kairos:production:workspace-visibility/);
});

test("the dashboard installs bounded state transport, direct-open recovery, and one guarded controller owner", async () => {
  const [bootstrap, index, loader] = await Promise.all([
    readFile(bootstrapPath, "utf8"),
    readFile(indexPath, "utf8"),
    readFile(loaderPath, "utf8"),
  ]);

  assert.match(bootstrap, /kairos-state-fetch-install\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /manuscript-direct-open-controller\.js\?v=\$\{RELEASE\}/);
  assert.ok(
    bootstrap.indexOf("manuscript-direct-open-controller.js") <
      bootstrap.indexOf("legacy-runtime-loader.js"),
    "Direct-open recovery must install before the command runtime.",
  );
  assert.match(bootstrap, /legacy-runtime-loader\.js\?v=\$\{COMMAND_RUNTIME_RELEASE\}/);
  assert.match(bootstrap, /KairosLegacyRuntime\.load/);
  assert.doesNotMatch(bootstrap, /import\(`\.\/manuscript-auto-pipeline\.js/);
  assert.match(bootstrap, /manuscript-production-flow-guard\.js\?v=\$\{RELEASE\}/);
  assert.match(bootstrap, /five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(bootstrap, /manuscript-post-intake-stability-20260731-1/);
  assert.match(bootstrap, /BOOT_TIMEOUT_MS = 20_000/);
  assert.match(bootstrap, /renderBootstrapFailure/);
  assert.match(bootstrap, /directOpenController:/);
  assert.match(bootstrap, /singleControllerOwner:\s*"legacy-runtime-loader"/);
  assert.match(loader, /"manuscript-auto-pipeline\.js"/);
  assert.match(loader, /"manuscript-post-intake-guard\.js"/);
  assert.match(index, /manuscript-production-flow-bootstrap\.js\?v=manuscript-post-intake-stability-20260731-1/);
  assert.match(index, /legacy-runtime-loader\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-auto-pipeline\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-post-intake-guard\.js\?v=five-center-dashboard-post-intake-stability-20260731-1/);
  assert.match(index, /manuscript-direct-open-controller\.js\?v=kairos-dedicated-manuscript-route-20260801-2/);
  assert.match(index, /mmg-production-controller-target/);
  assert.match(index, /mmg-post-intake-guard-target/);
  assert.match(index, /mmg-direct-open-target/);
  assert.match(index, /mmg-visible-first-paint/);
  assert.match(index, /<h1>Opening Kairos<\/h1>/);
  const moduleTags = [...index.matchAll(/<script type="module"([^>]*)>/g)].map((match) => match[1]);
  assert.equal(moduleTags.length, 3);
  assert.match(moduleTags[0], /src="\.\/scripts\/safari-manuscript-intake-compat\.js/);
  assert.match(moduleTags[1], /data-kairos-command-script="command-hub\.js command-center-layout\.js"/);
  assert.match(moduleTags[2], /src="\.\/scripts\/manuscript-production-flow-bootstrap\.js/);
  assert.ok(index.indexOf('import("./scripts/command-hub.js') < index.indexOf('import("./scripts/command-center-layout.js'));
});
