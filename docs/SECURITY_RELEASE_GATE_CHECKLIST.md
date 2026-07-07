# Kairos / MMG Security Release Gate Checklist

**Status:** Required production gate  
**Applies to:** Website, iOS app, backend, APIs, repositories, dashboards, customer systems

---

## 1. Release Gate Rule

No production release should ship without passing the applicable security gate or receiving explicit owner risk acceptance.

Security is not optional. It is a P1 constitutional requirement.

---

## 2. Pre-Release Checklist

### Secrets and Credentials

- [ ] No secrets committed to source control.
- [ ] No `.env` files committed.
- [ ] GitHub Actions secrets referenced through `${{ secrets.* }}` only.
- [ ] `KAIROS` secret is referenced only as `${{ secrets.KAIROS }}` where required.
- [ ] No workflow prints, echoes, stores, or retrieves raw secret values.
- [ ] Any suspected exposed credential has been rotated.

### Repository Controls

- [ ] Main or production branch is protected where practical.
- [ ] Force pushes are blocked on production branches where practical.
- [ ] Dependency scanning is enabled or scheduled.
- [ ] Secret scanning is enabled where available.
- [ ] Pull request or review workflow is used for high-risk changes.
- [ ] Documentation updates use `[skip ci]` where appropriate to conserve Actions minutes.

### Dependency Security

- [ ] No known critical dependency vulnerabilities remain unresolved.
- [ ] High severity vulnerabilities are reviewed and either fixed or risk-accepted.
- [ ] Lockfiles are present where the package ecosystem uses them.
- [ ] New dependencies are justified.
- [ ] Abandoned or untrusted packages are avoided.

### Authentication and Authorization

- [ ] Protected routes require authentication.
- [ ] Admin routes require admin authorization.
- [ ] Customer routes enforce customer-specific access.
- [ ] Founder/private intelligence is not exposed publicly or to customers.
- [ ] Authorization is enforced server-side where applicable.

### Customer Data Protection

- [ ] Customer records are separated by customer/account identity.
- [ ] Private customer files are not publicly exposed.
- [ ] Customer-specific recommendations do not leak to other customers.
- [ ] Logs do not expose sensitive customer information.

### Website and API Security

- [ ] HTTPS/TLS enforced.
- [ ] Security headers reviewed.
- [ ] Input validation applied at trust boundaries.
- [ ] Output encoding applied where needed.
- [ ] API routes validate payloads.
- [ ] High-cost or sensitive endpoints are rate-limited.
- [ ] Error responses do not reveal sensitive internals.

### CI/CD Security

- [ ] Workflow permissions are least-privilege.
- [ ] Deployment workflows are gated where practical.
- [ ] Manual deployment trigger is preferred for production.
- [ ] Build minutes are preserved during active development.
- [ ] Workflows do not run unnecessarily for documentation-only changes.

### Logging, Monitoring, and Recovery

- [ ] Security-relevant admin actions are logged where supported.
- [ ] Suspicious auth or API activity can be investigated.
- [ ] Backups or recovery path exist for critical data.
- [ ] Rollback path exists for production changes.

---

## 3. Severity Gate

### Critical

Critical security issues block release unless explicitly risk-accepted by the owner.

Examples:

- Exposed production credential
- Unauthenticated admin access
- Customer data exposure
- Remote code execution
- Active compromise

### High

High issues should be fixed before release or formally risk-accepted.

Examples:

- Missing server-side authorization
- Known high-impact dependency vulnerability
- Insecure file exposure
- Missing authentication on protected APIs

### Medium and Low

Medium and low issues may be queued in the security backlog if they do not create immediate unacceptable risk.

---

## 4. Release Approval Record

For each production release, record:

- Date
- Release branch or commit
- Affected systems
- Security checks completed
- Known risks
- Owner approval or risk acceptance
- Rollback plan

---

## 5. Current Priority

This checklist should be integrated into the Quality & Release Center and Security Operations workflow as Kairos development continues.
