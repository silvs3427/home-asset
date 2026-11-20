import { randomUUID } from "node:crypto";
import { getDb } from "../db/client.js";
import { assertPropertyOwnedByUser, getAssetForProperty } from "./assets.js";
import { notifyRecallAlert } from "./notifications.js";
import {
  matchAssetToRecalls,
  type RecallCatalogEntry,
} from "./recalls/catalog.js";
import { loadRecallCatalog, type RecallSourceMode } from "./recalls/source.js";
import type {
  AssetRecallAlertRecord,
  AssetRecallAlertStatus,
  PublicAssetRecallAlert,
  RecallNoticeRecord,
} from "./types.js";

type NoticeRow = {
  id: string;
  external_id: string;
  source: string;
  title: string;
  summary: string;
  hazard: string | null;
  manufacturer: string;
  model: string;
  serial_pattern: string | null;
  product_type: string | null;
  recall_date: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
};

type AlertRow = {
  id: string;
  property_id: string;
  asset_id: string;
  recall_notice_id: string;
  status: string;
  matched_on: string;
  notified_at: string | null;
  acknowledged_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  asset_name?: string | null;
  notice_title?: string | null;
  notice_summary?: string | null;
  notice_hazard?: string | null;
  notice_manufacturer?: string | null;
  notice_model?: string | null;
  notice_recall_date?: string | null;
  notice_source_url?: string | null;
  notice_source?: string | null;
  notice_external_id?: string | null;
};

function rowToNotice(row: NoticeRow): RecallNoticeRecord {
  return {
    id: row.id,
    externalId: row.external_id,
    source: row.source as RecallNoticeRecord["source"],
    title: row.title,
    summary: row.summary,
    hazard: row.hazard,
    manufacturer: row.manufacturer,
    model: row.model,
    serialPattern: row.serial_pattern,
    productType: row.product_type,
    recallDate: row.recall_date,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAlert(row: AlertRow): AssetRecallAlertRecord {
  return {
    id: row.id,
    propertyId: row.property_id,
    assetId: row.asset_id,
    recallNoticeId: row.recall_notice_id,
    status: row.status as AssetRecallAlertStatus,
    matchedOn: row.matched_on as AssetRecallAlertRecord["matchedOn"],
    notifiedAt: row.notified_at,
    acknowledgedAt: row.acknowledged_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicAssetRecallAlert(
  row: AlertRow,
): PublicAssetRecallAlert {
  const alert = rowToAlert(row);
  return {
    id: alert.id,
    propertyId: alert.propertyId,
    assetId: alert.assetId,
    assetName: row.asset_name ?? null,
    status: alert.status,
    matchedOn: alert.matchedOn,
    notifiedAt: alert.notifiedAt,
    acknowledgedAt: alert.acknowledgedAt,
    dismissedAt: alert.dismissedAt,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
    recall: {
      id: alert.recallNoticeId,
      externalId: row.notice_external_id ?? "",
      source: (row.notice_source ?? "cpsc_fixture") as RecallNoticeRecord["source"],
      title: row.notice_title ?? "Safety recall",
      summary: row.notice_summary ?? "",
      hazard: row.notice_hazard ?? null,
      manufacturer: row.notice_manufacturer ?? "",
      model: row.notice_model ?? "",
      recallDate: row.notice_recall_date ?? null,
      sourceUrl: row.notice_source_url ?? null,
    },
  };
}

const ALERT_SELECT = `SELECT a.id, a.property_id, a.asset_id, a.recall_notice_id,
       a.status, a.matched_on, a.notified_at, a.acknowledged_at, a.dismissed_at,
       a.created_at, a.updated_at,
       ast.name AS asset_name,
       n.title AS notice_title, n.summary AS notice_summary,
       n.hazard AS notice_hazard, n.manufacturer AS notice_manufacturer,
       n.model AS notice_model, n.recall_date AS notice_recall_date,
       n.source_url AS notice_source_url, n.source AS notice_source,
       n.external_id AS notice_external_id
FROM asset_recall_alerts a
INNER JOIN recall_notices n ON n.id = a.recall_notice_id
LEFT JOIN assets ast ON ast.id = a.asset_id`;

/**
 * Upsert catalog entries into recall_notices. Returns notice id by externalId.
 */
export function upsertRecallNotices(
  entries: RecallCatalogEntry[],
): Map<string, string> {
  const db = getDb();
  const now = new Date().toISOString();
  const byExternal = new Map<string, string>();

  const select = db.prepare(
    `SELECT id FROM recall_notices WHERE source = ? AND external_id = ?`,
  );
  const insert = db.prepare(
    `INSERT INTO recall_notices
      (id, external_id, source, title, summary, hazard, manufacturer, model,
       serial_pattern, product_type, recall_date, source_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = db.prepare(
    `UPDATE recall_notices
     SET title = ?, summary = ?, hazard = ?, manufacturer = ?, model = ?,
         serial_pattern = ?, product_type = ?, recall_date = ?, source_url = ?,
         updated_at = ?
     WHERE id = ?`,
  );

  for (const entry of entries) {
    const existing = select.get(entry.source, entry.externalId) as
      | { id: string }
      | undefined;
    if (existing) {
      update.run(
        entry.title,
        entry.summary,
        entry.hazard,
        entry.manufacturer,
        entry.model,
        entry.serialPattern,
        entry.productType,
        entry.recallDate,
        entry.sourceUrl,
        now,
        existing.id,
      );
      byExternal.set(entry.externalId, existing.id);
    } else {
      const id = randomUUID();
      insert.run(
        id,
        entry.externalId,
        entry.source,
        entry.title,
        entry.summary,
        entry.hazard,
        entry.manufacturer,
        entry.model,
        entry.serialPattern,
        entry.productType,
        entry.recallDate,
        entry.sourceUrl,
        now,
        now,
      );
      byExternal.set(entry.externalId, id);
    }
  }

  return byExternal;
}

export function listRecallAlertsForProperty(
  propertyId: string,
  ownerUserId: string,
  options?: { assetId?: string; status?: AssetRecallAlertStatus | "all" },
): PublicAssetRecallAlert[] {
  assertPropertyOwnedByUser(propertyId, ownerUserId);
  if (options?.assetId) {
    const asset = getAssetForProperty(
      options.assetId,
      propertyId,
      ownerUserId,
    );
    if (!asset) throw new Error("ASSET_NOT_FOUND");
  }

  const params: string[] = [propertyId];
  let filter = " WHERE a.property_id = ?";
  if (options?.assetId) {
    filter += " AND a.asset_id = ?";
    params.push(options.assetId);
  }
  if (options?.status && options.status !== "all") {
    filter += " AND a.status = ?";
    params.push(options.status);
  }

  const rows = getDb()
    .prepare(
      `${ALERT_SELECT}${filter}
       ORDER BY
         CASE a.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,
         a.created_at DESC`,
    )
    .all(...params) as AlertRow[];

  return rows.map(toPublicAssetRecallAlert);
}

export function getRecallAlertForProperty(
  propertyId: string,
  alertId: string,
  ownerUserId: string,
): PublicAssetRecallAlert {
  assertPropertyOwnedByUser(propertyId, ownerUserId);
  const row = getDb()
    .prepare(`${ALERT_SELECT} WHERE a.id = ? AND a.property_id = ?`)
    .get(alertId, propertyId) as AlertRow | undefined;
  if (!row) throw new Error("RECALL_ALERT_NOT_FOUND");
  return toPublicAssetRecallAlert(row);
}

function setAlertStatus(
  propertyId: string,
  alertId: string,
  ownerUserId: string,
  status: "acknowledged" | "dismissed",
): PublicAssetRecallAlert {
  assertPropertyOwnedByUser(propertyId, ownerUserId);
  const existing = getDb()
    .prepare(
      `SELECT id, status FROM asset_recall_alerts WHERE id = ? AND property_id = ?`,
    )
    .get(alertId, propertyId) as { id: string; status: string } | undefined;
  if (!existing) throw new Error("RECALL_ALERT_NOT_FOUND");

  const now = new Date().toISOString();
  if (status === "acknowledged") {
    getDb()
      .prepare(
        `UPDATE asset_recall_alerts
         SET status = 'acknowledged', acknowledged_at = COALESCE(acknowledged_at, ?),
             dismissed_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(now, now, alertId);
  } else {
    getDb()
      .prepare(
        `UPDATE asset_recall_alerts
         SET status = 'dismissed', dismissed_at = COALESCE(dismissed_at, ?),
             updated_at = ?
         WHERE id = ?`,
      )
      .run(now, now, alertId);
  }

  return getRecallAlertForProperty(propertyId, alertId, ownerUserId);
}

export function acknowledgeRecallAlert(
  propertyId: string,
  alertId: string,
  ownerUserId: string,
): PublicAssetRecallAlert {
  return setAlertStatus(propertyId, alertId, ownerUserId, "acknowledged");
}

export function dismissRecallAlert(
  propertyId: string,
  alertId: string,
  ownerUserId: string,
): PublicAssetRecallAlert {
  return setAlertStatus(propertyId, alertId, ownerUserId, "dismissed");
}

export type RecallMatchCheckResult = {
  mode: RecallSourceMode;
  sourceNote: string;
  catalogSize: number;
  assetsScanned: number;
  matchesFound: number;
  alertsCreated: number;
  alertsExisting: number;
  notificationsCreated: number;
};

type AssetOwnerRow = {
  asset_id: string;
  property_id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
  owner_user_id: string;
};

/**
 * Load public recall list → match assets → create alerts + notify homeowners.
 * Deduped per asset + recall notice. Respects recallsEnabled prefs via notify.
 */
export async function runRecallMatchCheck(options?: {
  userId?: string;
  propertyId?: string;
  forceMode?: RecallSourceMode;
}): Promise<RecallMatchCheckResult> {
  const loaded = await loadRecallCatalog({ forceMode: options?.forceMode });
  const noticeIds = upsertRecallNotices(loaded.entries);

  const result: RecallMatchCheckResult = {
    mode: loaded.mode,
    sourceNote: loaded.sourceNote,
    catalogSize: loaded.entries.length,
    assetsScanned: 0,
    matchesFound: 0,
    alertsCreated: 0,
    alertsExisting: 0,
    notificationsCreated: 0,
  };

  const params: string[] = [];
  let filter = " WHERE a.manufacturer IS NOT NULL AND a.model IS NOT NULL";
  if (options?.propertyId) {
    filter += " AND a.property_id = ?";
    params.push(options.propertyId);
  }
  if (options?.userId) {
    filter += " AND p.owner_user_id = ?";
    params.push(options.userId);
  }

  const assets = getDb()
    .prepare(
      `SELECT a.id AS asset_id, a.property_id, a.name, a.manufacturer, a.model,
              a.serial, p.owner_user_id
       FROM assets a
       INNER JOIN properties p ON p.id = a.property_id
       ${filter}`,
    )
    .all(...params) as AssetOwnerRow[];

  const findAlert = getDb().prepare(
    `SELECT id, notified_at FROM asset_recall_alerts
     WHERE asset_id = ? AND recall_notice_id = ?`,
  );
  const insertAlert = getDb().prepare(
    `INSERT INTO asset_recall_alerts
      (id, property_id, asset_id, recall_notice_id, status, matched_on,
       notified_at, acknowledged_at, dismissed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, NULL, NULL, ?, ?)`,
  );
  const markNotified = getDb().prepare(
    `UPDATE asset_recall_alerts SET notified_at = ?, updated_at = ? WHERE id = ?`,
  );

  for (const asset of assets) {
    result.assetsScanned += 1;
    const hits = matchAssetToRecalls(
      {
        manufacturer: asset.manufacturer,
        model: asset.model,
        serial: asset.serial,
      },
      loaded.entries,
    );
    result.matchesFound += hits.length;

    for (const hit of hits) {
      const noticeId = noticeIds.get(hit.entry.externalId);
      if (!noticeId) continue;

      const existing = findAlert.get(asset.asset_id, noticeId) as
        | { id: string; notified_at: string | null }
        | undefined;

      let alertId: string;
      if (existing) {
        result.alertsExisting += 1;
        alertId = existing.id;
      } else {
        alertId = randomUUID();
        const now = new Date().toISOString();
        insertAlert.run(
          alertId,
          asset.property_id,
          asset.asset_id,
          noticeId,
          hit.matchedOn,
          null,
          now,
          now,
        );
        result.alertsCreated += 1;
      }

      const alreadyNotified = Boolean(existing?.notified_at);
      if (!alreadyNotified) {
        const notified = await notifyRecallAlert({
          userId: asset.owner_user_id,
          propertyId: asset.property_id,
          assetId: asset.asset_id,
          recallId: alertId,
          title: `Safety recall: ${asset.name}`,
          body: `${hit.entry.title}. Open the asset to acknowledge or dismiss. Source: free public safety lists.`,
        });
        if (notified.created || notified.notification) {
          const now = new Date().toISOString();
          markNotified.run(now, now, alertId);
          if (notified.created) result.notificationsCreated += 1;
        }
      }
    }
  }

  return result;
}

/** Test helper — clear recall tables between suites when needed. */
export function __resetRecallsForTests(): void {
  const db = getDb();
  try {
    db.exec("DELETE FROM asset_recall_alerts");
    db.exec("DELETE FROM recall_notices");
  } catch {
    // tables may not exist yet in a mid-migrate edge case
  }
}
