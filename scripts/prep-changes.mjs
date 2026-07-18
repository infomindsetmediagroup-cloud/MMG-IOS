#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function run(command, args = [], { capture = false } = {}) {
  console.log(`Executing: ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
}

function capture(command, args = []) {
  return run(command, args, { capture: true }).trim();
}

function sanitizeBranchName(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");

  if (!normalized || normalized.includes("..") || normalized.includes("@{") || normalized.endsWith(".lock")) {
    throw new Error(`Unsafe or empty branch name: ${value}`);
  }

  return normalized;
}

function resolveSafePath(repositoryRoot, relativePath) {
  if (typeof relativePath !== "string" || !relativePath.trim()) {
    throw new Error("Every change requires a non-empty relative path.");
  }

  const normalized = relativePath.replaceAll("\\", "/");
  if (path.isAbsolute(normalized)) {
    throw new Error(`Absolute paths are not allowed: ${relativePath}`);
  }

  const fullPath = path.resolve(repositoryRoot, normalized);
  const relativeToRoot = path.relative(repositoryRoot, fullPath);
  if (!relativeToRoot || relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Path escapes or targets the repository root: ${relativePath}`);
  }

  return fullPath;
}

function loadRequest(filePath) {
  const absolute = path.resolve(filePath);
  const payload = JSON.parse(fs.readFileSync(absolute, "utf8"));

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Change request must be a JSON object.");
  }

  if (!payload.changes || typeof payload.changes !== "object" || Array.isArray(payload.changes) || Object.keys(payload.changes).length === 0) {
    throw new Error("Change request must contain a non-empty changes object.");
  }

  for (const [fileName, content] of Object.entries(payload.changes)) {
    if (typeof content !== "string") {
      throw new Error(`Content for ${fileName} must be a string.`);
    }
  }

  return payload;
}

function assertCleanWorkingTree() {
  if (capture("git", ["status", "--porcelain"])) {
    throw new Error("Working tree is not clean. Commit or stash local changes first.");
  }
}

function assertTool(command) {
  try {
    capture(command, ["--version"]);
  } catch {
    throw new Error(`${command} is required and must be authenticated before this script runs.`);
  }
}

function main() {
  const requestPath = process.argv[2];
  if (!requestPath) {
    throw new Error("Usage: node scripts/prep-changes.mjs <change-request.json>");
  }

  const request = loadRequest(requestPath);
  const repositoryRoot = capture("git", ["rev-parse", "--show-toplevel"]);
  process.chdir(repositoryRoot);

  assertCleanWorkingTree();
  assertTool("gh");

  const baseBranch = String(request.baseBranch || "main");
  const branchName = sanitizeBranchName(request.branchName || `feature/kairos-update-${Date.now()}`);
  const title = String(request.title || `Kairos update: ${branchName}`);
  const body = String(request.body || "Automated repository update prepared by Kairos. Production deployment occurs only after validation and merge into main.");

  run("git", ["fetch", "origin", baseBranch]);
  run("git", ["checkout", baseBranch]);
  run("git", ["reset", "--hard", `origin/${baseBranch}`]);

  if (capture("git", ["branch", "--list", branchName])) {
    throw new Error(`Local branch already exists: ${branchName}`);
  }

  run("git", ["checkout", "-b", branchName]);

  for (const [relativePath, content] of Object.entries(request.changes)) {
    const fullPath = resolveSafePath(repositoryRoot, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf8");
    console.log(`Updated: ${relativePath}`);
  }

  if (!capture("git", ["status", "--porcelain"])) {
    throw new Error("No repository changes were produced.");
  }

  run("git", ["add", "--all"]);
  run("git", ["commit", "-m", `chore: Kairos automated update ${new Date().toISOString()}`]);
  run("git", ["push", "--set-upstream", "origin", branchName]);
  run("gh", ["pr", "create", "--base", baseBranch, "--head", branchName, "--title", title, "--body", body]);

  console.log(`Pull request created from ${branchName} into ${baseBranch}.`);
}

try {
  main();
} catch (error) {
  console.error("Preparation failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
