import { describe, expect, it } from "vitest";
import {
  createMMGDeliveryWindowSchedule,
  decideMMGDeliveryWindowAction,
  validateMMGDeliveryWindowTransition,
  type MMGDeliveryWindowRuntimeState,
} from "../server/knowledge-library/delivery-windows.js";

const runtimeWindow = (
  overrides: Partial<MMGDeliveryWindowRuntimeState> = {},
): MMGDeliveryWindowRuntimeState => ({
  id: "window-1",
  customerId: "customer-1",
  cycleId: "cycle-1",
  packageSequence: 1,
  type: "scheduled_package_review",
  status: "scheduled",
  totalUnits: 2,
  targetAssetCount: 2,
  selectedUnits: 0,
  selectedAssetCount: 0,
  version: 1,
  opensAt: "2026-07-01T00:00:00.000Z",
  closesAt: "2026-07-03T00:00:00.000Z",
  fallbackPolicy: "auto_confirm_current_selection",
  deliveryDispatchId: null,
  ...overrides,
});

describe("MMG delivery-window scheduling", () => {
  it("creates one monthly package with two assets", () => {
    const schedule = createMMGDeliveryWindowSchedule({
      cycleId: "cycle-monthly",
      planCode: "monthly",
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      initialSubscriptionCycle: true,
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({
      packageSequence: 1,
      type: "first_package",
      totalUnits: 2,
      targetAssetCount: 2,
      opensAt: "2026-07-01T00:00:00.000Z",
      closesAt: "2026-07-03T00:00:00.000Z",
      fallbackPolicy: "manual_recovery",
    });
  });

  it("creates bi-weekly packages at day zero and day fourteen", () => {
    const schedule = createMMGDeliveryWindowSchedule({
      cycleId: "cycle-biweekly",
      planCode: "biweekly",
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      initialSubscriptionCycle: false,
    });

    expect(schedule.map((window) => window.opensAt)).toEqual([
      "2026-07-01T00:00:00.000Z",
      "2026-07-15T00:00:00.000Z",
    ]);
    expect(schedule.every((window) => window.type === "scheduled_package_review")).toBe(
      true,
    );
  });

  it("creates exactly four weekly packages even in a five-week month", () => {
    const schedule = createMMGDeliveryWindowSchedule({
      cycleId: "cycle-weekly",
      planCode: "weekly",
      periodStart: "2026-07-01T00:00:00.000Z",
      periodEnd: "2026-08-01T00:00:00.000Z",
      initialSubscriptionCycle: false,
    });

    expect(schedule).toHaveLength(4);
    expect(schedule.map((window) => window.opensAt)).toEqual([
      "2026-07-01T00:00:00.000Z",
      "2026-07-08T00:00:00.000Z",
      "2026-07-15T00:00:00.000Z",
      "2026-07-22T00:00:00.000Z",
    ]);
    expect(
      schedule.reduce((sum, window) => sum + window.totalUnits, 0),
    ).toBe(8);
  });

  it("accepts review windows only from twenty-four through forty-eight hours", () => {
    expect(() =>
      createMMGDeliveryWindowSchedule({
        cycleId: "cycle",
        planCode: "monthly",
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-08-01T00:00:00.000Z",
        initialSubscriptionCycle: false,
        reviewWindowHours: 23,
      }),
    ).toThrow("MMG_DELIVERY_WINDOW_REVIEW_HOURS_OUT_OF_RANGE");

    expect(() =>
      createMMGDeliveryWindowSchedule({
        cycleId: "cycle",
        planCode: "monthly",
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-08-01T00:00:00.000Z",
        initialSubscriptionCycle: false,
        reviewWindowHours: 49,
      }),
    ).toThrow("MMG_DELIVERY_WINDOW_REVIEW_HOURS_OUT_OF_RANGE");
  });
});

describe("MMG delivery-window lifecycle decisions", () => {
  const afterOpen = new Date("2026-07-01T00:01:00.000Z");
  const afterClose = new Date("2026-07-03T00:01:00.000Z");

  it("opens first packages without curation", () => {
    expect(
      decideMMGDeliveryWindowAction(
        runtimeWindow({ type: "first_package" }),
        afterOpen,
      ),
    ).toEqual({ type: "open_first_package" });
  });

  it("curates future packages when their schedule is due", () => {
    expect(decideMMGDeliveryWindowAction(runtimeWindow(), afterOpen)).toEqual({
      type: "curate_and_open",
    });
  });

  it("never auto-confirms an expired first package", () => {
    expect(
      decideMMGDeliveryWindowAction(
        runtimeWindow({
          type: "first_package",
          status: "open",
          selectedUnits: 2,
          selectedAssetCount: 2,
          fallbackPolicy: "manual_recovery",
        }),
        afterClose,
      ),
    ).toEqual({
      type: "move_to_recovery",
      reason: "FIRST_PACKAGE_CUSTOMER_SELECTION_EXPIRED",
    });
  });

  it("auto-confirms a complete curated package at expiry", () => {
    expect(
      decideMMGDeliveryWindowAction(
        runtimeWindow({
          status: "open",
          selectedUnits: 2,
          selectedAssetCount: 2,
        }),
        afterClose,
      ),
    ).toEqual({ type: "auto_confirm" });
  });

  it("moves incomplete curated packages to recovery", () => {
    expect(
      decideMMGDeliveryWindowAction(
        runtimeWindow({
          status: "open",
          selectedUnits: 1,
          selectedAssetCount: 1,
        }),
        afterClose,
      ),
    ).toEqual({
      type: "move_to_recovery",
      reason: "SCHEDULED_PACKAGE_INCOMPLETE_AT_EXPIRY",
    });
  });

  it("queues a confirmed package only once", () => {
    expect(
      decideMMGDeliveryWindowAction(
        runtimeWindow({ status: "confirmed" }),
        afterClose,
      ),
    ).toEqual({ type: "queue_delivery" });

    expect(
      decideMMGDeliveryWindowAction(
        runtimeWindow({
          status: "confirmed",
          deliveryDispatchId: "dispatch-1",
        }),
        afterClose,
      ),
    ).toEqual({ type: "none" });
  });

  it("enforces the canonical transition graph", () => {
    expect(() => validateMMGDeliveryWindowTransition("scheduled", "open")).not.toThrow();
    expect(() =>
      validateMMGDeliveryWindowTransition("open", "confirmed"),
    ).not.toThrow();
    expect(() =>
      validateMMGDeliveryWindowTransition("confirmed", "delivery_ready"),
    ).not.toThrow();
    expect(() =>
      validateMMGDeliveryWindowTransition("delivery_ready", "delivered"),
    ).not.toThrow();
    expect(() =>
      validateMMGDeliveryWindowTransition("scheduled", "delivered"),
    ).toThrow("MMG_DELIVERY_WINDOW_TRANSITION_INVALID");
  });
});
