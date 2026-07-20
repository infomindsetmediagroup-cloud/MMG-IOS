import { createHash } from "node:crypto";
import {
  buildMMGThankYouFirstTitleHandoff,
  findMMGSubscriptionLine,
  type MMGThankYouHandoffLinks,
  type MMGThankYouHandoffSnapshot,
} from "./thank-you-first-title-handoff.js";
import type {
  MMGThankYouHandoffRepository,
  MMGThankYouOrderGateway,
} from "./thank-you-handoff-repository.js";

export interface MMGThankYouExtensionPrincipal {
  shopDomain: string;
  customerId: string | null;
  tokenId: string;
}

export interface MMGThankYouHandoffRequest {
  orderId: string;
  checkoutToken: string;
}

export type MMGThankYouHandoffServiceResponse =
  | {
      status: 200;
      body: {
        ok: true;
        handoff: MMGThankYouHandoffSnapshot;
      };
    }
  | {
      status: 400 | 404 | 409;
      body: {
        ok: false;
        error: {
          code:
            | "INVALID_HANDOFF_REQUEST"
            | "ORDER_NOT_FOUND"
            | "ORDER_CONTEXT_MISMATCH";
          message: string;
          retryable: boolean;
        };
      };
    };

export interface MMGThankYouHandoffServiceDependencies {
  repository: MMGThankYouHandoffRepository;
  orderGateway: MMGThankYouOrderGateway;
  canonicalProductId: string | null;
  canonicalProductHandle: string;
  links: MMGThankYouHandoffLinks;
  now(): Date;
}

const hashCheckoutToken = (checkoutToken: string): string =>
  createHash("sha256").update(checkoutToken, "utf8").digest("hex");

const validIdentifier = (value: string, maximum = 256): boolean => {
  const length = value.trim().length;
  return length >= 8 && length <= maximum;
};

export const resolveMMGThankYouFirstTitleHandoff = async (
  principal: MMGThankYouExtensionPrincipal,
  request: MMGThankYouHandoffRequest,
  dependencies: MMGThankYouHandoffServiceDependencies,
): Promise<MMGThankYouHandoffServiceResponse> => {
  if (!validIdentifier(request.orderId) || !validIdentifier(request.checkoutToken, 512)) {
    return {
      status: 400,
      body: {
        ok: false,
        error: {
          code: "INVALID_HANDOFF_REQUEST",
          message: "The order handoff request is incomplete.",
          retryable: false,
        },
      },
    };
  }

  const order = await dependencies.orderGateway.loadVerifiedOrder({
    shopDomain: principal.shopDomain,
    orderId: request.orderId,
    checkoutToken: request.checkoutToken,
  });

  if (!order) {
    return {
      status: 404,
      body: {
        ok: false,
        error: {
          code: "ORDER_NOT_FOUND",
          message: "The completed order could not be verified yet.",
          retryable: true,
        },
      },
    };
  }

  if (
    order.shopDomain !== principal.shopDomain ||
    order.orderId !== request.orderId ||
    order.checkoutToken !== request.checkoutToken
  ) {
    return {
      status: 409,
      body: {
        ok: false,
        error: {
          code: "ORDER_CONTEXT_MISMATCH",
          message: "The order does not match the authenticated checkout context.",
          retryable: false,
        },
      },
    };
  }

  const subscriptionLine = findMMGSubscriptionLine(
    order,
    dependencies.canonicalProductId,
    dependencies.canonicalProductHandle,
  );

  if (!subscriptionLine) {
    return {
      status: 200,
      body: {
        ok: true,
        handoff: buildMMGThankYouFirstTitleHandoff({
          order,
          entitlement: null,
          links: dependencies.links,
          canonicalProductId: dependencies.canonicalProductId,
          canonicalProductHandle: dependencies.canonicalProductHandle,
        }),
      },
    };
  }

  if (
    principal.customerId &&
    order.customerId &&
    principal.customerId !== order.customerId
  ) {
    return {
      status: 409,
      body: {
        ok: false,
        error: {
          code: "ORDER_CONTEXT_MISMATCH",
          message: "The signed-in customer does not match the completed order.",
          retryable: false,
        },
      },
    };
  }

  await dependencies.repository.recordVerifiedSubscriptionOrder({
    shopDomain: order.shopDomain,
    orderId: order.orderId,
    checkoutTokenHash: hashCheckoutToken(order.checkoutToken),
    customerId: order.customerId,
    planCode: subscriptionLine.planCode,
    verifiedAt: dependencies.now(),
  });

  const entitlement = order.customerId
    ? await dependencies.repository.loadEntitlementForOrder({
        shopDomain: order.shopDomain,
        orderId: order.orderId,
        customerId: order.customerId,
      })
    : null;

  return {
    status: 200,
    body: {
      ok: true,
      handoff: buildMMGThankYouFirstTitleHandoff({
        order,
        entitlement,
        links: dependencies.links,
        canonicalProductId: dependencies.canonicalProductId,
        canonicalProductHandle: dependencies.canonicalProductHandle,
      }),
    },
  };
};
