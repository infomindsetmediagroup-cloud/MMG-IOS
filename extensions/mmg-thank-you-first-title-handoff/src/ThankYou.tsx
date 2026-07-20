import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

type HandoffState =
  | "not_applicable"
  | "sign_in_required"
  | "activation_pending"
  | "ready"
  | "selection_in_progress"
  | "recovery_required"
  | "completed";

type Handoff = {
  schemaVersion: "1.0.0";
  state: HandoffState;
  applicable: boolean;
  heading: string;
  message: string;
  action: { label: string; href: string } | null;
  secondaryAction: { label: string; href: string } | null;
  membership: { planCode: string; planName: string } | null;
  package: {
    status: string;
    selectedAssetCount: number;
    targetAssetCount: number;
    closesAt: string | null;
  } | null;
};

type ViewState =
  | { kind: "loading" }
  | { kind: "hidden" }
  | { kind: "ready"; handoff: Handoff }
  | { kind: "error"; message: string };

const DEFAULT_PORTAL_URL = "https://themindsetmediagroup.com/pages/customer-portal";
const DEFAULT_LIBRARY_URL =
  "https://themindsetmediagroup.com/pages/knowledge-library?mode=subscription-selection&handoff=first-package";

const setting = (key: string): string => {
  const value = (shopify.settings.value as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" ? value.trim() : "";
};

const hasSubscriptionMarker = (): boolean => {
  const lines = shopify.lines.value as Array<Record<string, unknown>>;

  return lines.some((line) => {
    const attributes = Array.isArray(line.attributes)
      ? (line.attributes as Array<Record<string, unknown>>)
      : [];
    const hasPlanCode = attributes.some(
      (attribute) =>
        attribute.key === "_mmg_subscription_plan_code" &&
        ["monthly", "biweekly", "weekly"].includes(String(attribute.value ?? "")),
    );
    const sellingPlanAllocation = line.sellingPlanAllocation ?? line.selling_plan_allocation;
    return hasPlanCode && Boolean(sellingPlanAllocation);
  });
};

const toneFor = (state: HandoffState): "info" | "success" | "warning" | "critical" => {
  if (state === "completed") return "success";
  if (state === "recovery_required") return "critical";
  if (state === "sign_in_required" || state === "activation_pending") return "warning";
  return "info";
};

const formatDeadline = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

export default function extension() {
  render(<Extension />, document.body);
}

function Extension() {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const orderId = shopify.orderConfirmation.value?.id;
  const checkoutToken = shopify.checkoutToken.value;
  const endpoint = setting("handoff_api_url");
  const portalUrl = setting("customer_portal_url") || DEFAULT_PORTAL_URL;
  const libraryUrl = setting("knowledge_library_url") || DEFAULT_LIBRARY_URL;
  const localMarker = useMemo(() => hasSubscriptionMarker(), []);

  const load = useCallback(async () => {
    if (!orderId || !checkoutToken) {
      setView(
        localMarker
          ? {
              kind: "error",
              message:
                "Your membership is confirmed. Open the Customer Portal to continue when Shopify finishes preparing the order.",
            }
          : { kind: "hidden" },
      );
      return;
    }

    if (!endpoint) {
      setView(
        localMarker
          ? {
              kind: "ready",
              handoff: {
                schemaVersion: "1.0.0",
                state: "activation_pending",
                applicable: true,
                heading: "Your membership is confirmed",
                message:
                  "Open the Customer Portal to continue into your first two-title package.",
                action: { label: "Open Customer Portal", href: portalUrl },
                secondaryAction: { label: "Browse the Knowledge Library", href: libraryUrl },
                membership: null,
                package: null,
              },
            }
          : { kind: "hidden" },
      );
      return;
    }

    setView({ kind: "loading" });

    try {
      const sessionToken = await shopify.sessionToken.get();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ orderId, checkoutToken }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; handoff: Handoff }
        | { ok: false; error?: { message?: string; retryable?: boolean } }
        | null;

      if (!response.ok || !payload?.ok) {
        const message =
          payload && !payload.ok && payload.error?.message
            ? payload.error.message
            : "The membership handoff is still being prepared.";
        setView({ kind: "error", message });
        return;
      }

      if (!payload.handoff.applicable || payload.handoff.state === "not_applicable") {
        setView({ kind: "hidden" });
        return;
      }

      setView({ kind: "ready", handoff: payload.handoff });
    } catch {
      setView({
        kind: "error",
        message:
          "The secure first-title handoff could not load. Your order is complete; open the Customer Portal to continue.",
      });
    }
  }, [checkoutToken, endpoint, libraryUrl, localMarker, orderId, portalUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  if (view.kind === "hidden") return null;

  if (view.kind === "loading") {
    return (
      <s-section heading="Preparing your MMG membership">
        <s-stack gap="base">
          <s-spinner accessibilityLabel="Loading membership handoff" />
          <s-text>Kairos is checking whether this order opened a first-title package.</s-text>
        </s-stack>
      </s-section>
    );
  }

  if (view.kind === "error") {
    return (
      <s-section heading="Continue in your Customer Portal">
        <s-stack gap="base">
          <s-banner tone="warning" heading="Your checkout is complete">
            {view.message}
          </s-banner>
          <s-stack direction="inline" gap="base">
            <s-button variant="primary" href={portalUrl}>
              Open Customer Portal
            </s-button>
            <s-button variant="secondary" onClick={() => void load()}>
              Check again
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    );
  }

  const { handoff } = view;
  const deadline = formatDeadline(handoff.package?.closesAt ?? null);

  return (
    <s-section heading={handoff.heading}>
      <s-stack gap="base">
        <s-banner tone={toneFor(handoff.state)}>
          {handoff.message}
        </s-banner>

        {handoff.membership ? (
          <s-text>
            Plan: <s-text type="strong">{handoff.membership.planName}</s-text>
          </s-text>
        ) : null}

        {handoff.package ? (
          <s-stack gap="small-200">
            <s-text>
              Package progress: {handoff.package.selectedAssetCount} of{" "}
              {handoff.package.targetAssetCount} titles
            </s-text>
            {deadline ? <s-text>Selection window closes {deadline}.</s-text> : null}
          </s-stack>
        ) : null}

        <s-stack direction="inline" gap="base">
          {handoff.action ? (
            <s-button variant="primary" href={handoff.action.href}>
              {handoff.action.label}
            </s-button>
          ) : null}
          {handoff.secondaryAction ? (
            <s-button variant="secondary" href={handoff.secondaryAction.href}>
              {handoff.secondaryAction.label}
            </s-button>
          ) : null}
        </s-stack>
      </s-stack>
    </s-section>
  );
}
