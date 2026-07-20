import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const verifyShopifyWebhookHmac = (input: {
  rawBody: string;
  providedHmac: string;
  clientSecret: string;
}): boolean => {
  const provided = input.providedHmac.trim();
  const secret = input.clientSecret.trim();
  if (!provided || !secret) return false;

  let providedBytes: Buffer;
  try {
    providedBytes = Buffer.from(provided, "base64");
  } catch {
    return false;
  }
  const expectedBytes = createHmac("sha256", secret)
    .update(input.rawBody, "utf8")
    .digest();

  return (
    providedBytes.length === expectedBytes.length &&
    timingSafeEqual(providedBytes, expectedBytes)
  );
};
