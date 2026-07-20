import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type KnowledgeLibraryContract = {
  contract_id: string;
  version: string;
  status: string;
  canonical_route: string;
  canonical_url: string;
  identity_contract: {
    canonical_asset_key: string;
    customer_ownership_key: string;
    rules: string[];
  };
  shopify_metadata: {
    namespace: string;
    definition_manifest: string;
    required_for_public_catalog: string[];
    required_for_subscription_selection: string[];
    allowed_values: Record<string, string[]>;
  };
  mode_contract: {
    public_catalog: {
      access: string;
      authoritative_filter: string[];
      subscription_indicator_rule: string;
    };
    subscription_selection: {
      access: string;
      authoritative_filter: string[];
      customer_actions: string[];
      client_rule: string;
    };
    my_library: {
      access: string;
      authoritative_sources: string[];
      retention_rule: string;
    };
  };
  eligibility_reason_codes: string[];
  ownership_contract: {
    grant_sources: string[];
    grant_statuses: string[];
    owned_definition: string;
    selection_rule: string;
  };
  entitlement_window_contract: {
    window_types: string[];
    statuses: string[];
    unit_accounting: {
      remaining_units_formula: string;
      overdraft_allowed: boolean;
      default_asset_subscription_value: number;
    };
    first_package: {
      post_purchase_action: string;
      total_units: number;
      target_asset_count: number;
      checkout_selection_allowed: boolean;
    };
    scheduled_package_review: {
      proposed_assets_per_package: number;
      review_window_hours: {
        minimum: number;
        maximum: number;
      };
    };
  };
  selection_item_contract: {
    required_response_fields: string[];
    eligibility_states: string[];
    ownership_states: string[];
    selection_states: string[];
  };
  storefront_integration: {
    liquid_data_snippet: string;
    membership_badge_snippet: string;
    card_integration_assembly: string;
    security_rules: string[];
  };
  asset_registry: {
    path: string;
    seed_asset: string;
  };
  integration_sequence: {
    previous_component: string;
    current_component: string;
    next_component: string;
  };
};

type MetafieldDefinition = {
  name: string;
  key: string;
  type: string;
  required_for: string[];
  allowed_values?: string[];
  minimum?: number;
  default?: boolean | number;
  unique_in_registry?: boolean;
  preferred_dimensions_px?: [number, number];
};

type MetafieldManifest = {
  manifest_id: string;
  version: string;
  status: string;
  owner_type: string;
  namespace: string;
  definitions: MetafieldDefinition[];
  provisioning_rules: string[];
};

type DigitalAssetRegistry = {
  registry_id: string;
  version: string;
  status: string;
  identity_key: string;
  records: Array<{
    asset_id: string;
    title: string;
    shopify_handle: string;
    canonical_path: string;
    product_type: string;
    asset_status: string;
    subscription_eligible: boolean;
    subscription_value: number;
    customer_destination: string;
    media: {
      portrait_cover: { verified: boolean };
      square_thumbnail: { verified: boolean };
    };
    delivery_package: {
      reference: string | null;
      status: string;
    };
    catalog_release: {
      public_catalog: boolean;
      subscription_selection: boolean;
      blocked_reason_codes: string[];
    };
  }>;
};

type ProductContract = {
  contract_id: string;
  status: string;
  title: string;
  handle: string;
  canonical_path: string;
  product_type: string;
  canonical_asset_id: string;
  metafields: Record<string, unknown>;
  subscription_catalog: {
    requested_eligibility: boolean;
    subscription_value: number;
    current_release_status: string;
    blocked_reason_codes: string[];
  };
  source_boundary: {
    source_html_present_in_repository: boolean;
    rule: string;
  };
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8")) as T;

const contract = readJson<KnowledgeLibraryContract>(
  "registry/knowledge-library/mmg-knowledge-library-contract-v1.json",
);
const manifest = readJson<MetafieldManifest>(
  "shopify/metafields/mmg-knowledge-library-product-metafields.json",
);
const registry = readJson<DigitalAssetRegistry>(
  "registry/knowledge-library/digital-asset-registry-v1.json",
);
const productContract = readJson<ProductContract>(
  "shopify/products/ai-image-mastery/product-contract.json",
);

const dataSnippet = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/snippets/mmg-knowledge-library-product-data.liquid",
  ),
  "utf8",
);
const badgeSnippet = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/snippets/mmg-subscription-eligibility-badge.liquid",
  ),
  "utf8",
);
const cardIntegration = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/knowledge-library/mmg-knowledge-library-card-integration.liquid",
  ),
  "utf8",
);
const metadataStyles = readFileSync(
  resolve(
    repositoryRoot,
    "shopify/assets/mmg-knowledge-library-metadata.css",
  ),
  "utf8",
);

describe("MMG Knowledge Library eligibility contract", () => {
  it("is the approved staged authority for the canonical live route", () => {
    expect(contract.contract_id).toBe("mmg-knowledge-library-contract-v1");
    expect(contract.version).toBe("1.0.0");
    expect(contract.status).toBe("approved_for_staging");
    expect(contract.canonical_route).toBe("/pages/knowledge-library");
    expect(contract.canonical_url).toBe(
      "https://themindsetmediagroup.com/pages/knowledge-library",
    );
  });

  it("uses one stable asset identity across ownership and selection", () => {
    expect(contract.identity_contract.canonical_asset_key).toBe("mmg.asset_id");
    expect(contract.identity_contract.customer_ownership_key).toBe(
      "customer_id + asset_id",
    );
    expect(contract.identity_contract.rules.join(" ")).toContain(
      "asset_id remains stable",
    );
  });

  it("defines the exact three Knowledge Library modes", () => {
    expect(Object.keys(contract.mode_contract)).toEqual([
      "public_catalog",
      "subscription_selection",
      "my_library",
    ]);
    expect(contract.mode_contract.public_catalog.access).toBe("public");
    expect(contract.mode_contract.subscription_selection.access).toContain(
      "authenticated customer",
    );
    expect(contract.mode_contract.my_library.access).toBe(
      "authenticated customer",
    );
  });

  it("requires complete digital-download metadata before subscription selection", () => {
    expect(contract.shopify_metadata.namespace).toBe("mmg");
    expect(contract.shopify_metadata.definition_manifest).toBe(
      "shopify/metafields/mmg-knowledge-library-product-metafields.json",
    );

    const required = contract.shopify_metadata.required_for_subscription_selection;
    expect(required).toEqual(
      expect.arrayContaining([
        "product_type",
        "subscription_eligible",
        "asset_status",
        "asset_id",
        "topic",
        "experience_level",
        "format",
        "square_thumbnail",
        "portrait_cover",
        "subscription_value",
        "delivery_package",
        "customer_destination",
      ]),
    );

    const filter = contract.mode_contract.subscription_selection.authoritative_filter.join(
      " ",
    );
    expect(filter).toContain("digital_download");
    expect(filter).toContain("subscription_eligible");
    expect(filter).toContain("square_thumbnail");
    expect(filter).toContain("delivery_package");
    expect(filter).toContain("does not already own");
    expect(filter).toContain("entitlement window is open");
    expect(filter).toContain("remaining unreserved units");
  });

  it("locks server-side authority for customer-specific decisions", () => {
    expect(contract.mode_contract.subscription_selection.client_rule).toContain(
      "Kairos must revalidate",
    );
    expect(contract.storefront_integration.security_rules).toEqual(
      expect.arrayContaining([
        "Do not serialize customer ownership grants into public page source.",
        "Do not serialize subscription contract identifiers into public page source.",
        "Do not accept a browser-calculated remaining-unit total as authoritative.",
        "Do not grant an asset from Liquid or storefront JavaScript.",
      ]),
    );
  });

  it("excludes owned assets and deduplicates My Library by asset ID", () => {
    expect(contract.ownership_contract.grant_sources).toEqual([
      "one_time_purchase",
      "subscription_delivery",
      "bonus",
      "administrative",
    ]);
    expect(contract.ownership_contract.grant_statuses).toEqual([
      "pending",
      "active",
      "revoked",
    ]);
    expect(contract.ownership_contract.owned_definition).toContain(
      "active grant",
    );
    expect(contract.ownership_contract.selection_rule).toContain(
      "never offered",
    );
    expect(contract.eligibility_reason_codes).toContain("ALREADY_OWNED");
  });

  it("locks first-package and scheduled-review entitlement behavior", () => {
    const windows = contract.entitlement_window_contract;
    expect(windows.window_types).toEqual(
      expect.arrayContaining(["first_package", "scheduled_package_review"]),
    );
    expect(windows.unit_accounting.remaining_units_formula).toBe(
      "total_units - selected_units - reserved_units",
    );
    expect(windows.unit_accounting.overdraft_allowed).toBe(false);
    expect(windows.unit_accounting.default_asset_subscription_value).toBe(1);
    expect(windows.first_package).toEqual({
      post_purchase_action: "Choose Your First Two Titles",
      total_units: 2,
      target_asset_count: 2,
      selection_owner: "customer",
      checkout_selection_allowed: false,
    });
    expect(windows.scheduled_package_review.proposed_assets_per_package).toBe(2);
    expect(windows.scheduled_package_review.review_window_hours).toEqual({
      minimum: 24,
      maximum: 48,
    });
  });

  it("defines the future picker response and state contract", () => {
    expect(contract.selection_item_contract.required_response_fields).toEqual(
      expect.arrayContaining([
        "asset_id",
        "shopify_product_id",
        "handle",
        "title",
        "subscription_value",
        "eligibility_state",
        "eligibility_reason_codes",
        "ownership_state",
        "selection_state",
      ]),
    );
    expect(contract.selection_item_contract.eligibility_states).toEqual([
      "eligible",
      "ineligible",
      "blocked",
    ]);
    expect(contract.selection_item_contract.ownership_states).toContain("owned");
    expect(contract.selection_item_contract.selection_states).toContain(
      "confirmed",
    );
  });
});

describe("MMG Knowledge Library Shopify metafields", () => {
  it("defines every canonical product metafield with one namespace", () => {
    expect(manifest.manifest_id).toBe(
      "mmg-knowledge-library-product-metafields",
    );
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.status).toBe("approved_for_staging");
    expect(manifest.owner_type).toBe("PRODUCT");
    expect(manifest.namespace).toBe("mmg");

    const keys = manifest.definitions.map((definition) => definition.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "product_type",
        "subscription_eligible",
        "asset_status",
        "asset_id",
        "topic",
        "experience_level",
        "format",
        "series",
        "series_order",
        "related_assets",
        "square_thumbnail",
        "portrait_cover",
        "subscription_value",
        "delivery_package",
        "customer_destination",
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses safe types and validations for identity, media, and unit fields", () => {
    const byKey = new Map(
      manifest.definitions.map((definition) => [definition.key, definition]),
    );

    expect(byKey.get("asset_id")?.type).toBe("single_line_text_field");
    expect(byKey.get("asset_id")?.unique_in_registry).toBe(true);
    expect(byKey.get("subscription_eligible")?.type).toBe("boolean");
    expect(byKey.get("subscription_eligible")?.default).toBe(false);
    expect(byKey.get("subscription_value")?.type).toBe("number_integer");
    expect(byKey.get("subscription_value")?.minimum).toBe(1);
    expect(byKey.get("portrait_cover")?.type).toBe("file_reference");
    expect(byKey.get("portrait_cover")?.preferred_dimensions_px).toEqual([
      2048,
      3072,
    ]);
    expect(byKey.get("square_thumbnail")?.preferred_dimensions_px).toEqual([
      2048,
      2048,
    ]);
  });

  it("prevents service and subscription products from entering selection", () => {
    expect(manifest.provisioning_rules.join(" ")).toContain(
      "Do not set subscription_eligible true for services or the subscription product",
    );
    expect(
      manifest.definitions.find((definition) => definition.key === "product_type")
        ?.allowed_values,
    ).toEqual(["digital_download", "service", "subscription"]);
  });
});

describe("MMG digital asset registry", () => {
  it("uses unique immutable asset IDs", () => {
    expect(registry.registry_id).toBe("mmg-digital-asset-registry-v1");
    expect(registry.identity_key).toBe("asset_id");
    const ids = registry.records.map((record) => record.asset_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("registers AI Image Mastery as the first canonical digital asset", () => {
    const asset = registry.records.find(
      (record) => record.asset_id === "mmg-dd-ai-image-mastery-001",
    );
    expect(asset).toBeDefined();
    expect(asset?.title).toBe("AI Image Mastery™");
    expect(asset?.shopify_handle).toBe("ai-image-mastery");
    expect(asset?.canonical_path).toBe("/products/ai-image-mastery");
    expect(asset?.product_type).toBe("digital_download");
    expect(asset?.asset_status).toBe("active");
    expect(asset?.subscription_eligible).toBe(true);
    expect(asset?.subscription_value).toBe(1);
    expect(asset?.customer_destination).toBe("my_library");
  });

  it("keeps the seed product public but blocks subscriber selection until delivery readiness", () => {
    const asset = registry.records[0];
    expect(asset.catalog_release.public_catalog).toBe(true);
    expect(asset.catalog_release.subscription_selection).toBe(false);
    expect(asset.media.square_thumbnail.verified).toBe(false);
    expect(asset.delivery_package.reference).toBeNull();
    expect(asset.catalog_release.blocked_reason_codes).toEqual(
      expect.arrayContaining([
        "MISSING_SQUARE_THUMBNAIL",
        "MISSING_DELIVERY_PACKAGE",
      ]),
    );
  });
});

describe("AI Image Mastery product metadata contract", () => {
  it("maps the live product to the canonical asset registry", () => {
    expect(productContract.contract_id).toBe(
      "mmg-product-ai-image-mastery-v1",
    );
    expect(productContract.title).toBe("AI Image Mastery™");
    expect(productContract.handle).toBe("ai-image-mastery");
    expect(productContract.canonical_path).toBe(
      "/products/ai-image-mastery",
    );
    expect(productContract.product_type).toBe("digital_download");
    expect(productContract.canonical_asset_id).toBe(
      "mmg-dd-ai-image-mastery-001",
    );
    expect(productContract.metafields["mmg.asset_id"]).toBe(
      productContract.canonical_asset_id,
    );
  });

  it("does not claim subscriber release before provisioning is complete", () => {
    expect(productContract.subscription_catalog.requested_eligibility).toBe(true);
    expect(productContract.subscription_catalog.subscription_value).toBe(1);
    expect(productContract.subscription_catalog.current_release_status).toBe(
      "blocked_pending_provisioning",
    );
    expect(productContract.subscription_catalog.blocked_reason_codes).toEqual(
      expect.arrayContaining([
        "MISSING_SQUARE_THUMBNAIL",
        "MISSING_DELIVERY_PACKAGE",
      ]),
    );
  });

  it("preserves the live source boundary", () => {
    expect(productContract.source_boundary.source_html_present_in_repository).toBe(
      false,
    );
    expect(productContract.source_boundary.rule).toContain(
      "Do not infer or overwrite",
    );
  });
});

describe("MMG Knowledge Library Liquid metadata integration", () => {
  it("reads the canonical product metafields and emits public JSON", () => {
    for (const key of [
      "product_type",
      "subscription_eligible",
      "asset_status",
      "asset_id",
      "topic",
      "experience_level",
      "format",
      "series",
      "series_order",
      "related_assets",
      "square_thumbnail",
      "portrait_cover",
      "subscription_value",
      "delivery_package",
      "customer_destination",
    ]) {
      expect(dataSnippet).toContain(`metafields.mmg.${key}`);
    }

    expect(dataSnippet).toContain('type="application/json"');
    expect(dataSnippet).toContain("data-mmg-library-asset");
    expect(dataSnippet).toContain('"serverDecisionRequired": true');
    expect(dataSnippet).toContain('"publicCatalogHint"');
    expect(dataSnippet).toContain('"subscriptionSelectionHint"');
  });

  it("does not serialize private customer or subscription state", () => {
    expect(dataSnippet).not.toContain("customer.orders");
    expect(dataSnippet).not.toContain("subscription_contract");
    expect(dataSnippet).not.toContain("remaining_units");
    expect(dataSnippet).not.toContain("delivery_download_url");
    expect(dataSnippet).not.toContain("/cart/add.js");
  });

  it("shows the membership badge only after the full metadata predicate", () => {
    expect(badgeSnippet).toContain("mmg_show_subscription_badge = false");
    expect(badgeSnippet).toContain("mmg_badge_product_type == 'digital_download'");
    expect(badgeSnippet).toContain("mmg_badge_subscription_eligible");
    expect(badgeSnippet).toContain("mmg_badge_asset_status == 'active'");
    expect(badgeSnippet).toContain("mmg_badge_subscription_value >= 1");
    expect(badgeSnippet).toContain("mmg_badge_delivery_package != blank");
    expect(badgeSnippet).toContain("mmg_badge_portrait != blank");
    expect(badgeSnippet).toContain("mmg_badge_square != blank");
    expect(badgeSnippet).toContain("Included with Membership");
  });

  it("connects the prepared card assembly to both snippets", () => {
    expect(cardIntegration).toContain(
      "render 'mmg-subscription-eligibility-badge'",
    );
    expect(cardIntegration).toContain(
      "render 'mmg-knowledge-library-product-data'",
    );
  });

  it("is scoped and responsive without page-breakout behavior", () => {
    expect(metadataStyles).toContain(".mmg-subscription-eligibility-badge");
    expect(metadataStyles).toContain("max-width: 100%");
    expect(metadataStyles).toContain("text-wrap: balance");
    expect(metadataStyles).toContain("@media (prefers-reduced-motion: reduce)");

    for (const source of [dataSnippet, badgeSnippet, metadataStyles]) {
      expect(source).not.toContain("100vw");
      expect(source).not.toContain("#MainContent");
      expect(source).not.toContain("document.body.style");
    }
  });
});

describe("MMG Knowledge Library build sequence", () => {
  it("follows the cart controller and hands off to the picker", () => {
    expect(contract.integration_sequence.previous_component).toBe(
      "MMG Cart Subscription Controller",
    );
    expect(contract.integration_sequence.current_component).toBe(
      "MMG Knowledge Library eligibility metadata and selection-mode contract",
    );
    expect(contract.integration_sequence.next_component).toBe(
      "MMG Knowledge Library Picker",
    );
    expect(contract.asset_registry.path).toBe(
      "registry/knowledge-library/digital-asset-registry-v1.json",
    );
    expect(contract.asset_registry.seed_asset).toBe(
      "mmg-dd-ai-image-mastery-001",
    );
  });
});
