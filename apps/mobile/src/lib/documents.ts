import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import {
  resolveDocumentDownloadUrl,
  type DocumentType,
  type PublicDocument,
} from "./api";

export type PickedUpload = {
  uri: string;
  name: string;
  mimeType: string;
  suggestedType: DocumentType;
};

/**
 * Camera path for phone-first capture (warranties, receipts, install photos).
 */
export async function pickFromCamera(): Promise<PickedUpload | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Camera permission is needed to attach a photo.");
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    suggestedType: "photo",
  };
}

/** Photo library pick — still phone-friendly for existing camera-roll paperwork. */
export async function pickFromLibrary(): Promise<PickedUpload | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is needed to attach a photo.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.85,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? "image/jpeg",
    suggestedType: "photo",
  };
}

/** PDFs / other files (manuals, receipts) from the device. */
export async function pickDocumentFile(): Promise<PickedUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/pdf", "image/*", "text/*", "application/*"],
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mime = asset.mimeType ?? "application/octet-stream";
  const suggestedType: DocumentType = mime.startsWith("image/")
    ? "photo"
    : "manual";

  return {
    uri: asset.uri,
    name: asset.name || `document-${Date.now()}`,
    mimeType: mime,
    suggestedType,
  };
}

/** PDF-only pick for Ask HomeAsset invoice / paperwork intake. */
export async function pickPdfFile(): Promise<PickedUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/pdf"],
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || `invoice-${Date.now()}.pdf`,
    mimeType: asset.mimeType ?? "application/pdf",
    suggestedType: "receipt",
  };
}

/**
 * Voice note / audio attach (Talk path without a new native mic module).
 * Homeowner can record in Voice Memos / Files, then attach here — JS-only.
 */
export async function pickAudioFile(): Promise<PickedUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["audio/*"],
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || `voice-${Date.now()}.m4a`,
    mimeType: asset.mimeType ?? "audio/mpeg",
    suggestedType: "other",
  };
}

/** Download with auth (or signed Supabase URL), then open the share sheet. */
export async function downloadAndShareDocument(
  accessToken: string,
  propertyId: string,
  doc: PublicDocument,
): Promise<void> {
  const destination = new File(Paths.cache, doc.originalFilename);
  const resolved = await resolveDocumentDownloadUrl(
    accessToken,
    propertyId,
    doc.id,
  );
  await File.downloadFileAsync(resolved.url, destination, {
    headers: resolved.authHeader
      ? { authorization: resolved.authHeader }
      : undefined,
    idempotent: true,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(destination.uri, {
    mimeType: doc.mimeType,
    dialogTitle: doc.title,
  });
}
