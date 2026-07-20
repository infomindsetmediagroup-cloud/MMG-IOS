import {
  calculateRemainingUnits,
  evaluatePublicCatalogEligibility,
  evaluateSubscriptionSelectionEligibility,
  type MMGEligibilityDecision,
  type MMGEligibilityReasonCode,
  type MMGEntitlementWindowStatus,
  type MMGKnowledgeAssetCandidate,
  type MMGSubscriptionSelectionContext,
} from "./eligibility.js";

export type MMGPickerMode = "first_package" | "scheduled_package_review";

export type MMGPickerStatus =
  | "ready"
  | "selection_complete"
  | "confirmed"
  | "blocked";

export type MMGPickerSelectionState =
  | "available"
  | "selected"
  | "reserved"
  | "confirmed"
  | "unavailable";

export type MMGPickerCommandAction = "select" | "remove" | "confirm";

export type MMGPickerCommandErrorCode =
  | "INVALID_COMMAND"
  | "WINDOW_VERSION_CONFLICT"
  | "WINDOW_NOT_OPEN"
  | "ASSET_NOT_FOUND"
  | "ASSET_NOT_SELECTABLE"
  | "ASSET_ALREADY_SELECTED"
  | "ASSET_NOT_SELECTED"
  | "SELECTION_LOCKED"
  | "INSUFFICIENT_REMAINING_UNITS"
  | "PACKAGE_INCOMPLETE";

export interface MMGPickerAsset extends MMGKnowledgeAssetCandidate {
  shopifyProductId: string;
  handle: string;
  title: string;
  url: string;
  topic: string;
  experienceLevel: string;
  format: string;
  series: string | null;
  seriesOrder: number | null;
  portraitCoverUrl: string;
  squareThumbnailUrl: string;
  summary: string | null;
}

export interface MMGPickerSelection {
  assetId: string;
  units: number;
  state: Exclude<MMGPickerSelectionState, "available" | "unavailable">;
  selectedAt: string;
}

export interface MMGPickerWindow {
  id: string;
  type: MMGPickerMode;
  status: MMGEntitlementWindowStatus;
  totalUnits: number;
  targetAssetCount: number;
  version: number;
  opensAt: string | null;
  closesAt: string | null;
}

export interface MMGPickerState {
  customerAuthenticated: boolean;
  subscriptionActive: boolean;
  window: MMGPickerWindow;
  assets: MMGPickerAsset[];
  ownedAssetIds: string[];
  selections: MMGPickerSelection[];
  processedRequestIds: string[];
  confirmedAt: string | null;
}

export interface MMGPickerCommand {
  action: MMGPickerCommandAction;
  requestId: string;
  expectedWindowVersion: number;
  assetId?: string;
  occurredAt: string;
}

export interface MMGPickerItemView {
  assetId: string;
  shopifyProductId: string;
  handle: string;
  title: string;
  url: string;
  topic: string;
  experienceLevel: string;
  format: string;
  series: string | null;
  seriesOrder: number | null;
  portraitCoverUrl: string;
  squareThumbnailUrl: string;
  summary: string | null;
  subscriptionValue: number;
  eligibilityState: MMGEligibilityDecision["state"];
  eligibilityReasonCodes: MMGEligibilityReasonCode[];
  selectionState: MMGPickerSelectionState;
  canSelect: boolean;
  canRemove: boolean;
}

export interface MMGPickerSnapshot {
  schemaVersion: "1.0.0";
  serverDecisionRequired: true;
  status: MMGPickerStatus;
  customerAuthenticated: boolean;
  subscriptionActive: boolean;
  window: {
    id: string;
    type: MMGPickerMode;
    status: MMGEntitlementWindowStatus;
    totalUnits: number;
    selectedUnits: number;
    reservedUnits: number;
    remainingUnits: number;
    targetAssetCount: number;
    selectedAssetCount: number;
    version: number;
    opensAt: string | null;
    closesAt: string | null;
  };
  items: MMGPickerItemView[];
  selectedAssetIds: string[];
  excluded: {
    ownedCount: number;
    nonCatalogCount: number;
    incompleteMetadataCount: number;
  };
  canConfirm: boolean;
  confirmedAt: string | null;
}

export interface MMGPickerCommandResult {
  state: MMGPickerState;
  snapshot: MMGPickerSnapshot;
  action: MMGPickerCommandAction;
  changed: boolean;
  idempotentReplay: boolean;
}

export class MMGPickerCommandError extends Error {
  readonly code: MMGPickerCommandErrorCode;
  readonly status: number;
  readonly snapshot: MMGPickerSnapshot;

  constructor(
    code: MMGPickerCommandErrorCode,
    message: string,
    status: number,
    snapshot: MMGPickerSnapshot,
  ) {
    super(message);
    this.name = "MMGPickerCommandError";
    this.code = code;
    this.status = status;
    this.snapshot = snapshot;
  }
}

const MAX_PROCESSED_REQUEST_IDS = 100;

const normalizeAssetId = (value: string | undefined): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const selectionUnits = (
  selections: readonly MMGPickerSelection[],
  states: readonly MMGPickerSelection["state"][],
): number =>
  selections
    .filter((selection) => states.includes(selection.state))
    .reduce((sum, selection) => sum + Math.max(0, Math.trunc(selection.units)), 0);

const selectionContext = (state: MMGPickerState): MMGSubscriptionSelectionContext => {
  const selectedUnits = selectionUnits(state.selections, ["selected", "confirmed"]);
  const reservedUnits = selectionUnits(state.selections, ["reserved"]);

  return {
    authenticated: state.customerAuthenticated,
    subscriptionActive: state.subscriptionActive,
    windowStatus: state.window.status,
    totalUnits: state.window.totalUnits,
    selectedUnits,
    reservedUnits,
    ownedAssetIds: new Set(state.ownedAssetIds),
    selectedAssetIds: new Set(state.selections.map((selection) => selection.assetId)),
  };
};

const selectionContextWithoutCurrent = (
  state: MMGPickerState,
  current: MMGPickerSelection,
): MMGSubscriptionSelectionContext => {
  const context = selectionContext(state);
  const currentUnits = Math.max(0, Math.trunc(current.units));

  return {
    ...context,
    selectedUnits:
      current.state === "selected" || current.state === "confirmed"
        ? Math.max(0, context.selectedUnits - currentUnits)
        : context.selectedUnits,
    reservedUnits:
      current.state === "reserved"
        ? Math.max(0, context.reservedUnits - currentUnits)
        : context.reservedUnits,
    selectedAssetIds: new Set(
      [...context.selectedAssetIds].filter(
        (assetId) => assetId !== current.assetId,
      ),
    ),
  };
};

const isMetadataIncomplete = (
  reasons: readonly MMGEligibilityReasonCode[],
): boolean =>
  reasons.some((reason) =>
    [
      "MISSING_ASSET_ID",
      "MISSING_PORTRAIT_COVER",
      "MISSING_SQUARE_THUMBNAIL",
      "INVALID_SUBSCRIPTION_VALUE",
      "MISSING_DELIVERY_PACKAGE",
    ].includes(reason),
  );

const sortItems = (items: MMGPickerItemView[]): MMGPickerItemView[] =>
  [...items].sort((left, right) => {
    const leftSelected = ["selected", "reserved", "confirmed"].includes(
      left.selectionState,
    );
    const rightSelected = ["selected", "reserved", "confirmed"].includes(
      right.selectionState,
    );

    if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;

    if (left.series && right.series && left.series === right.series) {
      const leftOrder = left.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right.seriesOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }

    return left.title.localeCompare(right.title);
  });

export const buildPickerSnapshot = (state: MMGPickerState): MMGPickerSnapshot => {
  const context = selectionContext(state);
  const selectedUnits = context.selectedUnits;
  const reservedUnits = context.reservedUnits;
  const remainingUnits = calculateRemainingUnits(
    state.window.totalUnits,
    selectedUnits,
    reservedUnits,
  );
  const selectionByAssetId = new Map(
    state.selections.map((selection) => [selection.assetId, selection]),
  );
  const ownedAssetIds = new Set(state.ownedAssetIds);
  const items: MMGPickerItemView[] = [];
  let ownedCount = 0;
  let nonCatalogCount = 0;
  let incompleteMetadataCount = 0;
  let selectedItemsStillEligible = true;

  for (const asset of state.assets) {
    const assetId = normalizeAssetId(asset.assetId ?? undefined);
    if (!assetId) {
      nonCatalogCount += 1;
      continue;
    }

    const selection = selectionByAssetId.get(assetId);
    const publicDecision = evaluatePublicCatalogEligibility(asset);

    if (!publicDecision.eligible && !selection) {
      nonCatalogCount += 1;
      continue;
    }

    if (!selection && ownedAssetIds.has(assetId)) {
      ownedCount += 1;
      continue;
    }

    let decision: MMGEligibilityDecision;
    let selectionState: MMGPickerSelectionState = "available";
    let canSelect = false;
    let canRemove = false;

    if (selection) {
      decision = evaluateSubscriptionSelectionEligibility(
        asset,
        selectionContextWithoutCurrent(state, selection),
      );
      selectionState = selection.state;
      canRemove =
        state.window.status === "open" && selection.state === "selected";
      selectedItemsStillEligible &&= decision.eligible;

      if (isMetadataIncomplete(decision.reasonCodes)) {
        incompleteMetadataCount += 1;
      }
    } else {
      decision = evaluateSubscriptionSelectionEligibility(asset, context);
      selectionState = decision.eligible ? "available" : "unavailable";
      canSelect = decision.eligible;

      if (isMetadataIncomplete(decision.reasonCodes)) {
        incompleteMetadataCount += 1;
        continue;
      }

      if (
        decision.reasonCodes.includes("NOT_SUBSCRIPTION_ELIGIBLE") ||
        decision.reasonCodes.includes("NOT_DIGITAL_DOWNLOAD") ||
        decision.reasonCodes.includes("WRONG_CUSTOMER_DESTINATION") ||
        decision.reasonCodes.includes("ASSET_RETIRED")
      ) {
        continue;
      }
    }

    items.push({
      assetId,
      shopifyProductId: asset.shopifyProductId,
      handle: asset.handle,
      title: asset.title,
      url: asset.url,
      topic: asset.topic,
      experienceLevel: asset.experienceLevel,
      format: asset.format,
      series: asset.series,
      seriesOrder: asset.seriesOrder,
      portraitCoverUrl: asset.portraitCoverUrl,
      squareThumbnailUrl: asset.squareThumbnailUrl,
      summary: asset.summary,
      subscriptionValue: Math.max(1, Math.trunc(asset.subscriptionValue ?? 1)),
      eligibilityState: decision.state,
      eligibilityReasonCodes: decision.reasonCodes,
      selectionState,
      canSelect,
      canRemove,
    });
  }

  const selectedAssetIds = state.selections
    .filter((selection) =>
      ["selected", "reserved", "confirmed"].includes(selection.state),
    )
    .map((selection) => selection.assetId);
  const selectedAssetCount = selectedAssetIds.length;
  const canConfirm =
    state.window.status === "open" &&
    selectedItemsStillEligible &&
    selectedUnits + reservedUnits === state.window.totalUnits &&
    selectedAssetCount === state.window.targetAssetCount &&
    state.selections.every((selection) => selection.state === "selected");

  let status: MMGPickerStatus = "ready";
  if (state.window.status === "confirmed") {
    status = "confirmed";
  } else if (
    !state.customerAuthenticated ||
    !state.subscriptionActive ||
    state.window.status !== "open"
  ) {
    status = "blocked";
  } else if (canConfirm) {
    status = "selection_complete";
  }

  return {
    schemaVersion: "1.0.0",
    serverDecisionRequired: true,
    status,
    customerAuthenticated: state.customerAuthenticated,
    subscriptionActive: state.subscriptionActive,
    window: {
      id: state.window.id,
      type: state.window.type,
      status: state.window.status,
      totalUnits: state.window.totalUnits,
      selectedUnits,
      reservedUnits,
      remainingUnits,
      targetAssetCount: state.window.targetAssetCount,
      selectedAssetCount,
      version: state.window.version,
      opensAt: state.window.opensAt,
      closesAt: state.window.closesAt,
    },
    items: sortItems(items),
    selectedAssetIds,
    excluded: {
      ownedCount,
      nonCatalogCount,
      incompleteMetadataCount,
    },
    canConfirm,
    confirmedAt: state.confirmedAt,
  };
};

const withProcessedRequest = (
  state: MMGPickerState,
  requestId: string,
): MMGPickerState => ({
  ...state,
  processedRequestIds: [
    ...state.processedRequestIds.filter((id) => id !== requestId),
    requestId,
  ].slice(-MAX_PROCESSED_REQUEST_IDS),
});

const assertOpenAndCurrent = (
  state: MMGPickerState,
  command: MMGPickerCommand,
): void => {
  const snapshot = buildPickerSnapshot(state);

  if (!command.requestId.trim() || !Number.isInteger(command.expectedWindowVersion)) {
    throw new MMGPickerCommandError(
      "INVALID_COMMAND",
      "The picker command is incomplete.",
      400,
      snapshot,
    );
  }

  if (command.expectedWindowVersion !== state.window.version) {
    throw new MMGPickerCommandError(
      "WINDOW_VERSION_CONFLICT",
      "The selection window changed. Refresh the picker before continuing.",
      409,
      snapshot,
    );
  }

  if (state.window.status !== "open") {
    throw new MMGPickerCommandError(
      "WINDOW_NOT_OPEN",
      "The current selection window is not open.",
      409,
      snapshot,
    );
  }
};

const findAsset = (state: MMGPickerState, assetId: string): MMGPickerAsset => {
  const asset = state.assets.find((candidate) => candidate.assetId === assetId);
  if (!asset) {
    throw new MMGPickerCommandError(
      "ASSET_NOT_FOUND",
      "The selected title is not available in this catalog.",
      404,
      buildPickerSnapshot(state),
    );
  }
  return asset;
};

const selectAsset = (
  state: MMGPickerState,
  command: MMGPickerCommand,
): MMGPickerState => {
  const assetId = normalizeAssetId(command.assetId);
  if (!assetId) {
    throw new MMGPickerCommandError(
      "INVALID_COMMAND",
      "An asset ID is required to select a title.",
      400,
      buildPickerSnapshot(state),
    );
  }

  if (state.selections.some((selection) => selection.assetId === assetId)) {
    throw new MMGPickerCommandError(
      "ASSET_ALREADY_SELECTED",
      "This title is already selected.",
      409,
      buildPickerSnapshot(state),
    );
  }

  const asset = findAsset(state, assetId);
  const decision = evaluateSubscriptionSelectionEligibility(
    asset,
    selectionContext(state),
  );

  if (!decision.eligible) {
    const code = decision.reasonCodes.includes("INSUFFICIENT_REMAINING_UNITS")
      ? "INSUFFICIENT_REMAINING_UNITS"
      : "ASSET_NOT_SELECTABLE";
    throw new MMGPickerCommandError(
      code,
      "This title cannot be selected for the current package.",
      409,
      buildPickerSnapshot(state),
    );
  }

  const units = Math.max(1, Math.trunc(asset.subscriptionValue ?? 1));
  return {
    ...state,
    window: { ...state.window, version: state.window.version + 1 },
    selections: [
      ...state.selections,
      {
        assetId,
        units,
        state: "selected",
        selectedAt: command.occurredAt,
      },
    ],
  };
};

const removeAsset = (
  state: MMGPickerState,
  command: MMGPickerCommand,
): MMGPickerState => {
  const assetId = normalizeAssetId(command.assetId);
  if (!assetId) {
    throw new MMGPickerCommandError(
      "INVALID_COMMAND",
      "An asset ID is required to remove a title.",
      400,
      buildPickerSnapshot(state),
    );
  }

  const selection = state.selections.find((item) => item.assetId === assetId);
  if (!selection) {
    throw new MMGPickerCommandError(
      "ASSET_NOT_SELECTED",
      "This title is not currently selected.",
      409,
      buildPickerSnapshot(state),
    );
  }

  if (selection.state !== "selected") {
    throw new MMGPickerCommandError(
      "SELECTION_LOCKED",
      "This selection is already reserved or confirmed and cannot be removed.",
      409,
      buildPickerSnapshot(state),
    );
  }

  return {
    ...state,
    window: { ...state.window, version: state.window.version + 1 },
    selections: state.selections.filter((item) => item.assetId !== assetId),
  };
};

const confirmPackage = (
  state: MMGPickerState,
  command: MMGPickerCommand,
): MMGPickerState => {
  const snapshot = buildPickerSnapshot(state);
  if (!snapshot.canConfirm) {
    throw new MMGPickerCommandError(
      "PACKAGE_INCOMPLETE",
      `Choose exactly ${state.window.targetAssetCount} titles using all ${state.window.totalUnits} available units before confirming.`,
      409,
      snapshot,
    );
  }

  return {
    ...state,
    window: {
      ...state.window,
      status: "confirmed",
      version: state.window.version + 1,
    },
    selections: state.selections.map((selection) => ({
      ...selection,
      state: "confirmed",
    })),
    confirmedAt: command.occurredAt,
  };
};

export const applyPickerCommand = (
  state: MMGPickerState,
  command: MMGPickerCommand,
): MMGPickerCommandResult => {
  if (state.processedRequestIds.includes(command.requestId)) {
    return {
      state,
      snapshot: buildPickerSnapshot(state),
      action: command.action,
      changed: false,
      idempotentReplay: true,
    };
  }

  assertOpenAndCurrent(state, command);

  let nextState: MMGPickerState;
  switch (command.action) {
    case "select":
      nextState = selectAsset(state, command);
      break;
    case "remove":
      nextState = removeAsset(state, command);
      break;
    case "confirm":
      nextState = confirmPackage(state, command);
      break;
    default: {
      const exhaustive: never = command.action;
      throw new MMGPickerCommandError(
        "INVALID_COMMAND",
        `Unsupported picker action: ${String(exhaustive)}`,
        400,
        buildPickerSnapshot(state),
      );
    }
  }

  nextState = withProcessedRequest(nextState, command.requestId);

  return {
    state: nextState,
    snapshot: buildPickerSnapshot(nextState),
    action: command.action,
    changed: true,
    idempotentReplay: false,
  };
};
