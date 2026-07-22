const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
};

export const SHOPIFY_DOCTRINE_VERSION = "2026-07-22.1";

export const SHOPIFY_DOCTRINE = freeze({
  version: SHOPIFY_DOCTRINE_VERSION,
  runtime: {
    provider: "cloudflare",
    vercelAllowed: false,
    openAiRequired: false,
    deterministicExecution: true,
  },
  authority: {
    default: "deny",
    arbitraryGraphqlAllowed: false,
    storeWideAuthorityFromTaskIntent: false,
    crossResourceSideEffectsAllowed: false,
    wildcardTargetsAllowed: false,
    exactWorkflowRequired: true,
    exactOperationRequired: true,
    exactTargetRequired: true,
    exactFieldScopeRequired: true,
  },
  lifecycle: [
    "load_doctrine",
    "resolve_workflow",
    "create_scope_manifest",
    "authenticate_caller",
    "authorize_exact_operation",
    "verify_shopify_installation_and_scopes",
    "read_target_before_write",
    "validate_operation_contract",
    "require_explicit_approval_for_write",
    "execute_once_with_idempotency",
    "read_target_after_write",
    "compare_expected_change",
    "write_audit_receipt",
  ],
  shopify: {
    api: "GraphQL Admin API",
    authentication: {
      serverSideOnly: true,
      leastPrivilege: true,
      accessTokensMayReachBrowser: false,
      acceptedCredentialModes: ["admin_access_token", "client_credentials"],
    },
    discoveryAndValidation: {
      schemaDiscoveryBeforeNewOperation: true,
      shopifyDocumentationBeforeNewOperation: true,
      graphqlValidationBeforeRegistration: true,
      registeredOperationsOnly: true,
    },
    reads: {
      allowedWithoutMutationApproval: true,
      stillRequireWorkflowScope: true,
      paginationRequiredForConnections: true,
    },
    writes: {
      globallyDisabledByDefault: true,
      environmentGate: "KAIROS_SHOPIFY_WRITES_ENABLED",
      explicitApprovalRequired: true,
      readBeforeWriteRequired: true,
      readbackRequired: true,
      idempotencyRequired: true,
      userErrorsAreFailures: true,
      partialSuccessAllowed: false,
    },
    themes: {
      mainThemeWritesAllowed: false,
      themePublishingAllowed: false,
      themeDeletionAllowed: false,
      unpublishedThemeFilesOnly: true,
      exactFilePathsRequired: true,
    },
  },
  operationScopeFirewall: {
    rule: "An active task grants authority only for its exact operation manifest.",
    manuscriptWorkflowsMayUseShopify: false,
    unrelatedWebsiteChanges: "deny",
    examples: {
      manuscript: {
        allowed: ["artifact.manuscript.write"],
        denied: [
          "shopify.menu.update",
          "shopify.page.update",
          "shopify.product.update",
          "shopify.theme.unpublishedFiles.upsert",
        ],
      },
    },
  },
  permanentlyUnregisteredOperations: [
    "shopify.theme.publish",
    "shopify.theme.delete",
    "shopify.order.cancel",
    "shopify.order.refund",
    "shopify.giftCard.write",
    "shopify.staff.write",
    "shopify.arbitraryGraphql.execute",
  ],
});
