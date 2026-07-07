# Security Policy

## Supported Project

This repository supports development of the Kairos / MMG iOS and web operating platform.

Security is a Priority 1 constitutional subsystem for the project.

## Security Standard

Kairos / MMG follows a defense-in-depth model with redundant controls across:

- Application security
- Website security
- API security
- Customer data isolation
- Authentication and authorization
- Repository security
- CI/CD security
- Secret management
- Monitoring and audit logging
- Backup and recovery

## Reporting Security Issues

Do not disclose security vulnerabilities publicly in issues, discussions, comments, commits, or pull requests.

Report suspected security issues privately to the repository owner or authorized MMG/Kairos maintainer.

Include:

- A clear summary of the issue
- Affected component or file path if known
- Steps to reproduce if safe to share
- Potential impact
- Suggested mitigation if available

## Secret Handling

Never commit:

- API keys
- Access tokens
- Passwords
- Private keys
- `.env` files
- Production credentials
- Customer data exports

The canonical elevated GitHub Actions secret name for this project is:

```text
KAIROS
```

Workflow files must reference it only through GitHub secret syntax, such as:

```yaml
${{ secrets.KAIROS }}
```

The raw value must never be printed, retrieved, echoed, stored, or exposed.

## Production Security Gate

Before production release, affected areas should pass the applicable security checks:

- No exposed credentials
- No known critical vulnerabilities
- Protected admin routes
- Valid authentication and authorization boundaries
- Customer data separation verified
- Secure environment variable handling
- Dependency review completed
- Rollback or recovery path available
- Relevant audit logs available

## Security Documentation

The canonical architecture is documented in:

- `docs/SECURITY_DEFENSE_ARCHITECTURE.md`
- `docs/KAIROS_MMG_MASTER_BLUEPRINT.md`

## Incident Response

If compromise is suspected:

1. Contain affected systems.
2. Preserve logs and evidence.
3. Rotate potentially exposed credentials.
4. Review deployment and repository history.
5. Patch the root cause.
6. Verify no ongoing compromise.
7. Document remediation and add follow-up backlog items.
