import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type Route = {
  id: string;
  title: string;
  resource_type: string;
  path: string;
  url: string;
  status: string;
  access: string;
  role?: string;
};

type SiteRegistry = {
  registry_id: string;
  version: string;
  status: string;
  canonical_domain: string;
  governance: {
    preserve_https_non_www: boolean;
    handle_changes_require_redirects: boolean;
    portal_boundaries_must_be_preserved: boolean;
  };
  routes: Route[];
  superseded_route_assumptions: Array<{
    old_path: string;
    canonical_path: string;
  }>;
};

const currentFile = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(currentFile), "..");
const registryPath = resolve(
  repositoryRoot,
  "registry/site-pages/site-url-registry-current.json",
);
const registry = JSON.parse(
  readFileSync(registryPath, "utf8"),
) as SiteRegistry;

const requiredPaths = [
  "/",
  "/products/ai-image-mastery",
  "/products/professional-cover-design-service",
  "/pages/contact",
  "/pages/data-sharing-opt-out",
  "/pages/free-creator-toolkit",
  "/pages/capcut-templates",
  "/pages/mmg-creator-merch",
  "/pages/tiktok-secret-sauce",
  "/pages/publishing-services",
  "/pages/customer-portal",
  "/pages/admin-portal",
  "/pages/customer-service",
  "/pages/about",
  "/pages/our-standards",
  "/pages/publishing-philosophy",
  "/pages/knowledge-library",
  "/pages/founder",
  "/pages/mmg-promise",
  "/pages/project-guide",
  "/collections/frontpage",
];

describe("MMG live site URL registry", () => {
  it("is the approved canonical route authority", () => {
    expect(registry.registry_id).toBe("mmg-live-site-url-registry");
    expect(registry.version).toBe("1.0.0");
    expect(registry.status).toBe("approved");
    expect(registry.canonical_domain).toBe(
      "https://themindsetmediagroup.com",
    );
    expect(registry.governance.preserve_https_non_www).toBe(true);
    expect(registry.governance.handle_changes_require_redirects).toBe(true);
    expect(registry.governance.portal_boundaries_must_be_preserved).toBe(true);
  });

  it("contains every approved active route exactly once", () => {
    expect(registry.routes).toHaveLength(requiredPaths.length);
    expect(registry.routes.map((route) => route.path).sort()).toEqual(
      [...requiredPaths].sort(),
    );
    expect(new Set(registry.routes.map((route) => route.path)).size).toBe(
      registry.routes.length,
    );
    expect(new Set(registry.routes.map((route) => route.url)).size).toBe(
      registry.routes.length,
    );
  });

  it("constructs every URL from the canonical domain and registered path", () => {
    for (const route of registry.routes) {
      const expectedUrl =
        route.path === "/"
          ? `${registry.canonical_domain}/`
          : `${registry.canonical_domain}${route.path}`;

      expect(route.url).toBe(expectedUrl);
      expect(route.status).toBe("active");
    }
  });

  it("preserves restricted and authenticated portal boundaries", () => {
    const adminPortal = registry.routes.find(
      (route) => route.path === "/pages/admin-portal",
    );
    const customerPortal = registry.routes.find(
      (route) => route.path === "/pages/customer-portal",
    );

    expect(adminPortal?.access).toBe("restricted_administrative");
    expect(customerPortal?.access).toBe(
      "customer_facing_authenticated_workflows",
    );
  });

  it("locks the corrected canonical handles", () => {
    expect(registry.superseded_route_assumptions).toEqual(
      expect.arrayContaining([
        {
          old_path: "/pages/about-mindset-media-group",
          canonical_path: "/pages/about",
        },
        {
          old_path: "/pages/the-mmg-promise",
          canonical_path: "/pages/mmg-promise",
        },
        {
          old_path: "/collections/all",
          canonical_path: "/collections/frontpage",
        },
      ]),
    );
  });
});
