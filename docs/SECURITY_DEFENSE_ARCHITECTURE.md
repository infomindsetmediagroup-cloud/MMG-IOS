# Kairos / MMG Security & Defense Architecture

**Status:** P1 constitutional subsystem  
**Scope:** Website, iOS app, backend, APIs, repositories, deployments, customer data, operational tooling  
**Doctrine:** Defense in depth, redundant controls, mandatory release gate

---

## 1. Constitutional Amendment

Security is a Priority 1 foundational subsystem across the entire Kairos/MMG ecosystem.

The Kairos/MMG iOS constitution was temporarily unfrozen for this amendment and immediately refrozen after incorporation.

This standard applies to:

- Website
- Native iOS application
- Customer dashboard
- Admin dashboard
- Backend services
- APIs
- Authentication
- File storage
- Customer data
- Repository
- CI/CD
- Operational tooling
- Future autonomous services

---

## 2. Core Security Doctrine

Kairos uses a defense-in-depth model. No critical system should depend on a single safeguard.

Every critical function should be protected by overlapping controls across:

- Prevention
- Detection
- Response
- Recovery
- Auditability

Failure of one control must not expose the platform.

---

## 3. Threat Model

Kairos must be engineered to reduce risk from:

- Unauthorized access
- Credential theft
- Phishing
- Malware
- Trojan horses
- Supply-chain compromise
- Cross-site scripting (XSS)
- SQL/NoSQL injection
- Cross-site request forgery (CSRF)
- Remote code execution
- Session hijacking
- Brute-force attacks
- API abuse
- Data exfiltration
- Repository secret exposure
- Compromised deployment workflows
- Misconfigured storage
- Privilege escalation

---

## 4. Website Security Requirements

### 4.1 Transport Security

- Enforce HTTPS/TLS everywhere.
- Redirect HTTP to HTTPS.
- Use HSTS where supported.
- Avoid mixed content.

### 4.2 Authentication

- Use secure authentication flows.
- Require strong password and credential standards where passwords exist.
- Support multi-factor authentication for admin users where possible.
- Harden login, reset, and recovery flows.

### 4.3 Authorization

- Use role-based access control (RBAC).
- Enforce least-privilege access.
- Separate public, customer, admin, and founder scopes.
- Never expose customer-specific records to other customers.

### 4.4 Session Security

- Secure session cookies.
- Use `HttpOnly`, `Secure`, and appropriate `SameSite` settings where applicable.
- Rotate or expire sessions appropriately.
- Protect against session fixation and hijacking.

### 4.5 Input and Output Safety

- Validate input at trust boundaries.
- Sanitize unsafe content.
- Encode output to reduce XSS risk.
- Use parameterized queries or safe ORM patterns for database access.
- Reject unexpected file types and malformed payloads.

### 4.6 Security Headers

Implement applicable headers:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `X-Frame-Options` or CSP frame protections
- `Referrer-Policy`
- `Permissions-Policy`

### 4.7 Rate Limiting and Abuse Controls

- Apply rate limits to auth, API, forms, and high-cost endpoints.
- Add bot protection where appropriate.
- Monitor abnormal traffic and request bursts.

### 4.8 Web Application Firewall

- Use WAF support where available.
- Filter common exploit patterns.
- Keep rules updated.
- Log blocked events for review.

---

## 5. API Security Requirements

- Authenticate protected APIs.
- Authorize every request server-side.
- Avoid trusting client state.
- Validate request schemas.
- Limit payload sizes.
- Apply rate limiting.
- Log security-relevant actions.
- Avoid returning sensitive implementation details in errors.
- Version APIs where needed.

---

## 6. Data and Storage Security

- Keep private customer assets private.
- Avoid public exposure of restricted files.
- Use scoped access for file delivery.
- Encrypt sensitive data where appropriate.
- Maintain backups.
- Test restore procedures.
- Separate customer records logically and enforce access boundaries.

---

## 7. Repository Security Requirements

### 7.1 Branch Protection

Main and production branches should be protected.

Recommended controls:

- No direct force-pushes
- No accidental deletion
- Required review before production merges when appropriate
- Required status checks for production releases
- Restricted deploy permissions

### 7.2 Secret Scanning

- Enable secret scanning where available.
- Never commit credentials, API keys, tokens, private keys, or `.env` files.
- Use repository secrets or environment secrets.
- Rotate exposed credentials immediately.

### 7.3 Dependency Security

- Monitor package vulnerabilities.
- Use dependency scanning.
- Keep lockfiles committed where applicable.
- Avoid abandoned packages when possible.
- Review transitive dependency risk.

### 7.4 Static Security Analysis

- Add SAST tooling where practical.
- Treat high severity findings as release blockers.
- Track medium/low findings in the security backlog.

### 7.5 Least-Privilege Access

- Repository access should follow least privilege.
- Admin access should be limited.
- Automation tokens should have only required scopes.

---

## 8. CI/CD Security Requirements

- Use `${{ secrets.KAIROS }}` as the canonical elevated repository secret when required.
- Do not print secrets.
- Do not echo tokens.
- Do not retrieve raw token values.
- Validate secret presence without exposing values.
- Minimize permissions in workflow files.
- Prefer read-only permissions unless write access is required.
- Use manual deploy gates where practical.
- Avoid unnecessary GitHub Actions minute consumption during active development.

Example safe validation pattern:

```yaml
- name: Validate Kairos secret presence
  run: |
    if [ -z "${KAIROS_TOKEN_PRESENT}" ]; then
      echo "KAIROS secret is not available."
      exit 1
    fi
  env:
    KAIROS_TOKEN_PRESENT: ${{ secrets.KAIROS }}
```

Do not print the value.

---

## 9. Security Operations Capability

Kairos must include a permanent Security Operations capability responsible for:

- Continuous security health monitoring
- Website security audits
- Repository security oversight
- Dependency and vulnerability management
- Incident detection
- Audit log review
- Security reporting
- Production security approval
- Security backlog management
- Release gate enforcement

---

## 10. Release Security Gate

Security is mandatory before production release.

A production release should not proceed until security checks are satisfied or explicitly risk-accepted by the owner.

Minimum gate:

- No known exposed secrets
- No critical dependency vulnerabilities
- Authentication and authorization reviewed for affected areas
- Customer data boundaries validated
- Admin routes protected
- Security headers reviewed for web surfaces
- Sensitive environment variables stored securely
- Rollback or recovery path available
- Relevant logs available for investigation

---

## 11. Incident Response Baseline

If a security incident is suspected:

1. Contain the affected system.
2. Preserve logs and evidence.
3. Rotate potentially exposed credentials.
4. Review repository and deployment history.
5. Patch the root cause.
6. Verify no ongoing compromise.
7. Document the incident and prevention steps.
8. Add follow-up items to the security backlog.

---

## 12. Security Backlog Categories

Security tasks should be classified by severity:

- Critical
- High
- Medium
- Low

And discipline:

- Application security
- Repository security
- CI/CD security
- Infrastructure security
- Data security
- Authentication and authorization
- Monitoring and logging
- Incident response
- Compliance readiness

---

## 13. Current Implementation Priority

Immediate implementation priority:

1. Establish repository security documentation.
2. Add security policy.
3. Add dependency scanning configuration where supported.
4. Add security backlog checklist.
5. Review current app structure for authentication, data storage, and secrets.
6. Add security gates to release workflow without wasting Actions minutes.

---

## 14. Governing Rule

Security must be integrated into every future Kairos/MMG feature, workflow, and release. It is not an afterthought, plugin, or optional enhancement.
