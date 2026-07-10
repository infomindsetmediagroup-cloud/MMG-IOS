# MMG / Kairos Execution Standard

**Status:** Canonical operating standard  
**Effective date:** 2026-07-10  
**Applies to:** ChatGPT, coding agents, maintainers, departments, repositories, deployments, and operational workflows

## 1. Purpose

This standard converts the MMG/Kairos Constitution into repeatable execution behavior. It governs how work is interpreted, planned, implemented, validated, documented, committed, reviewed, deployed, and preserved.

## 2. Execution-mode default

The project is in Execution Mode.

When the executive owner says `continue`, `proceed`, `implement`, `update`, or otherwise directs forward motion, the default behavior is to advance the current approved work from the existing baseline.

Do not restart architecture, repeat already-settled questions, or produce extended conceptual narration in place of implementation.

Implementation updates should report:

- current baseline,
- work completed,
- evidence,
- material risks,
- real blockers,
- and the next executable step.

## 3. ChatGPT operating role

ChatGPT is the executive technical command interface and institutional continuity layer.

ChatGPT must:

- preserve approved MMG/Kairos doctrine,
- translate executive intent into specific work orders,
- inspect the repository before recommending structural change,
- challenge weak assumptions and identify material tradeoffs,
- distinguish verified repository state from proposed work,
- use connected tools when repository or operational evidence is required,
- avoid claiming work is complete without evidence,
- protect the frozen Constitution and checkpoint baselines,
- and continue from established decisions rather than redesigning by default.

ChatGPT must not function as the production AI runtime. Production intelligence must run through secured server-side Kairos APIs.

## 4. Coding-agent operating role

The coding agent is the implementation engine.

A coding work order should include:

- objective,
- repository and branch,
- current baseline,
- constitutional references,
- files or modules in scope,
- acceptance criteria,
- security requirements,
- tests and validation,
- migration or rollback requirements,
- prohibited changes,
- commit strategy,
- and completion evidence.

The agent must inspect before editing, preserve unrelated work, implement the smallest coherent vertical slice, run relevant tests, and report exact files and results.

## 5. Repository workflow

Canonical source of truth: GitHub.

Required flow:

1. Establish the exact baseline.
2. Create or use a purpose-specific branch.
3. Inspect relevant implementation and documentation.
4. Make cohesive changes.
5. Run local or controlled validation.
6. Commit intentionally.
7. Push with `[skip ci]` during active development when safe and appropriate.
8. Open or update a draft pull request.
9. Run expensive CI/deployment validation deliberately, not on every minor edit.
10. Merge only after the checkpoint gate is satisfied.
11. Create a frozen-baseline record when the checkpoint is certified.

`main` must remain deployable and recoverable.

## 6. Work prioritization

Prioritize work in this order unless the executive owner explicitly overrides it:

1. Security and data protection
2. Runtime correctness and recoverability
3. Identity, authorization, tenant isolation, and auditability
4. Platform services and reusable contracts
5. End-to-end reference-domain workflows
6. Customer-facing experience
7. Optimization and cosmetic refinement

Prefer vertical slices that produce working, testable capability over broad scaffolding that cannot execute.

## 7. Architectural acceptance criteria

Every significant change must answer:

- Which objective does this advance?
- Which constitutional doctrine governs it?
- Which service or domain owns it?
- Does it create a second source of truth?
- Does dependency direction remain valid?
- Should it be local, shared, or canonical?
- What events, audit records, and permissions apply?
- What fails if the change is unavailable?
- How is it tested and rolled back?
- What knowledge or reusable asset remains afterward?

## 8. Canonical request lifecycle

Every Kairos runtime request should progressively support:

1. authenticated session,
2. user and tenant context,
3. role and permission evaluation,
4. objective interpretation,
5. context assembly,
6. planning,
7. department/capability routing,
8. governed execution,
9. result verification,
10. audit persistence,
11. durable object updates,
12. response and recommended next action.

## 9. Session and identity standard

The temporary browser gateway-token model is an internal bootstrap boundary only.

The target model is:

`Browser → authenticated MMG session → user/tenant/role context → Kairos runtime → governed services`

Requirements:

- Secure, HttpOnly cookies
- explicit expiration
- revocation behavior
- tenant and role claims
- constant-time secret comparison
- signing-key rotation strategy
- no provider or gateway credentials in client bundles
- audit linkage between session, request, execution, and outcome

## 10. Checkpoint standard

Every checkpoint must include:

- objective,
- certified capability,
- implementation summary,
- tests and validation evidence,
- security boundary,
- known limitations,
- rollback/recovery path,
- deployment status,
- next checkpoint entry criteria,
- and frozen-baseline record.

A checkpoint is not frozen merely because code was merged.

## 11. Documentation standard

Documentation must be layered:

- Constitution — enduring governing doctrine
- Reference architecture — stable structural model
- Master blueprint — current system and roadmap
- Service/domain contracts — technical ownership and behavior
- ADRs — significant decisions and rationale
- Checkpoint records — certified implementation state
- Runbooks — operational execution and recovery

Do not create multiple documents that claim to be the same canonical authority.

## 12. Evidence standard

Acceptable evidence includes:

- repository commit SHA,
- pull request,
- exact changed files,
- test output,
- build output,
- deployment record,
- production health response,
- audit identifier,
- screenshot or recorded behavior where appropriate.

Plans, intentions, and generated text are not completion evidence.

## 13. Progress communication

Progress updates should be concise and operational.

Report partial findings early when material. Avoid repetitive commentary, speculative status, or low-level narration of every tool call.

Use precise language:

- `implemented` only when code or documentation is written,
- `validated` only when checks were run,
- `deployed` only when deployment evidence exists,
- `frozen` only when the checkpoint record and approval gate exist.

## 14. Production safety

Never:

- expose secrets,
- bypass authorization for convenience,
- merge unvalidated security-boundary changes,
- claim external execution without evidence,
- destroy production data without explicit approval and recovery planning,
- silently modify unrelated work,
- or trade recoverability for cosmetic speed.

## 15. Continuous institutional improvement

Every completed work unit should leave at least one durable improvement:

- production capability,
- reusable service,
- clearer contract,
- test,
- runbook,
- decision record,
- simplified implementation,
- preserved knowledge,
- or improved customer outcome.

The engineering north star is to increase organizational capability while reducing unnecessary complexity.