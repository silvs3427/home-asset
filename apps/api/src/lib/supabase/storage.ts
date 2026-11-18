import { getSupabaseService, isSupabaseServiceConfigured, getSupabaseAnon } from "./client.js";

const BUCKET = "documents";

function storageClient() {
  return isSupabaseServiceConfigured() ? getSupabaseService() : getSupabaseAnon();
}

/** Upload document bytes to the private `documents` bucket. */
export async function uploadDocumentObject(
  storageKey: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const client = storageClient();
  const { error } = await client.storage.from(BUCKET).upload(storageKey, bytes, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`SUPABASE_STORAGE_UPLOAD:${error.message}`);
}

export async function downloadDocumentObject(
  storageKey: string,
): Promise<Buffer> {
  const client = storageClient();
  const { data, error } = await client.storage.from(BUCKET).download(storageKey);
  if (error || !data) {
    throw new Error(`SUPABASE_STORAGE_DOWNLOAD:${error?.message ?? "missing"}`);
  }
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

export async function removeDocumentObject(storageKey: string): Promise<void> {
  const client = storageClient();
  const { error } = await client.storage.from(BUCKET).remove([storageKey]);
  if (error) {
    // Best-effort — metadata row is source of truth for API deletes.
    console.warn("[supabase-storage] remove failed", error.message);
  }
}
