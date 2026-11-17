import { listAssetsForProperty } from "./assets.js";
import { listDocumentsForProperty } from "./documents.js";
import { getPropertyForUser } from "./properties.js";
import {
  formatPropertyAddress,
  toPublicAsset,
  toPublicDocument,
  toPublicProperty,
} from "./types.js";

/**
 * Easy full export / home packet (D17 hybrid longevity).
 * Returns metadata for the owned home — documents include ids for authenticated download.
 * No silent sharing: only the owner can build this packet.
 */
export function buildHomePacket(propertyId: string, ownerUserId: string) {
  const property = getPropertyForUser(propertyId, ownerUserId);
  if (!property) throw new Error("PROPERTY_NOT_FOUND");

  const assets = listAssetsForProperty(propertyId, ownerUserId).map(toPublicAsset);
  const documents = listDocumentsForProperty(propertyId, ownerUserId).map(
    toPublicDocument,
  );

  return {
    exportedAt: new Date().toISOString(),
    format: "homeasset.home_packet.v1",
    privacy: {
      ledgerOwner: "homeowner",
      silentSharing: false,
      note: "This packet is for your records. Nothing was shared with anyone else.",
    },
    property: {
      ...toPublicProperty(property),
      formattedAddress: formatPropertyAddress(property),
    },
    assets,
    documents,
    documentDownloadHint:
      "Download each file with GET /properties/:propertyId/documents/:id/content while signed in.",
  };
}
