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
  /** Present when picked for Ask HomeAsset vision / OCR. */
  base64?: string | null;
};

export type PickForAiOptions = {
  /** Include base64 for multimodal asset intake (compressed). */
  forAi?: boolean;
};

/** Soft cap so edge JSON stays under typical body limits (~2.5MB binary). */
const AI_MEDIA_BASE64_MAX_CHARS = 3_200_000;

/**
 * Camera path for phone-first capture (warranties, receipts, install photos).
 */
export async function pickFromCamera(
  options: PickForAiOptions = {},
): Promise<PickedUpload | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Camera permission is needed to attach a photo.");
  }

  const forAi = Boolean(options.forAi);
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    quality: forAi ? 0.65 : 0.85,
    exif: false,
    base64: forAi,
  });
  if (result.canceled || !result.assets[0]) return null;

  return finalizeAiPhotoPick(result.assets[0], forAi);
}

/** Photo library pick — still phone-friendly for existing camera-roll paperwork. */
export async function pickFromLibrary(
  options: PickForAiOptions = {},
): Promise<PickedUpload | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is needed to attach a photo.");
  }

  const forAi = Boolean(options.forAi);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: forAi ? 0.65 : 0.85,
    exif: false,
    base64: forAi,
  });
  if (result.canceled || !result.assets[0]) return null;

  return finalizeAiPhotoPick(result.assets[0], forAi);
}

function finalizeAiPhotoPick(
  asset: ImagePicker.ImagePickerAsset,
  forAi: boolean,
): PickedUpload {
  // ImagePicker base64 is JPEG when requested.
  const mimeType = forAi ? "image/jpeg" : (asset.mimeType ?? "image/jpeg");
  const base64 = forAi ? asset.base64 ?? null : null;
  if (forAi && base64 && base64.length > AI_MEDIA_BASE64_MAX_CHARS) {
    throw new Error(
      "That photo is too large to read right now. Try a closer crop of the label, or take the photo again.",
    );
  }
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType,
    suggestedType: "Photo",
    base64,
  };
}

/** PDFs / other files (manuals, receipts) from the device. */
export async function pickDocumentFile(
  options: PickForAiOptions = {},
): Promise<PickedUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/pdf", "image/*", "text/*", "application/*"],
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mime = asset.mimeType ?? "application/octet-stream";
  const suggestedType: DocumentType = mime.startsWith("image/")
    ? "Photo"
    : "Manual";

  let base64: string | null = null;
  if (options.forAi) {
    base64 = await readUriAsBase64(asset.uri);
    assertAiMediaSize(base64, "file");
  }

  return {
    uri: asset.uri,
    name: asset.name || `document-${Date.now()}`,
    mimeType: mime,
    suggestedType,
    base64,
  };
}

/** PDF-only pick for Ask HomeAsset invoice / paperwork intake. */
export async function pickPdfFile(
  options: PickForAiOptions = {},
): Promise<PickedUpload | null> {
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    multiple: false,
    type: ["application/pdf"],
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  let base64: string | null = null;
  if (options.forAi) {
    base64 = await readUriAsBase64(asset.uri);
    assertAiMediaSize(base64, "PDF");
  }

  return {
    uri: asset.uri,
    name: asset.name || `invoice-${Date.now()}.pdf`,
    mimeType: asset.mimeType ?? "application/pdf",
    suggestedType: "Receipt",
    base64,
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
    suggestedType: "Other",
  };
}

/** Read a local file URI as base64 (PDF / fallback when picker base64 is missing). */
export async function readUriAsBase64(uri: string): Promise<string> {
  const file = new File(uri);
  if (!file.exists) {
    throw new Error("Could not read that file on this phone.");
  }
  return file.base64();
}

function assertAiMediaSize(base64: string, kind: string): void {
  if (base64.length > AI_MEDIA_BASE64_MAX_CHARS) {
    throw new Error(
      kind === "PDF"
        ? "That file is too large to read right now. Try a shorter PDF or a clearer photo of the label page."
        : "That file is too large to read right now. Try a closer crop of the label, or a smaller attachment.",
    );
  }
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
