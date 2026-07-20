import "./delivery-window-service.js";

declare module "./delivery-window-service.js" {
  interface MMGDeliveryWindowCandidate {
    secondaryTopics?: string[];
    roleTags?: string[];
    goalTags?: string[];
    prerequisiteAssetIds?: string[];
    complementaryAssetIds?: string[];
    diversityGroup?: string | null;
    recommendationPriority?: number;
    estimatedMinutes?: number | null;
  }
}

export {};