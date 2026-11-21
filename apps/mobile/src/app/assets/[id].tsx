import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  acknowledgeRecallAlert,
  categoryLabel,
  completeReminder,
  deleteAsset,
  deleteDocument,
  dismissRecallAlert,
  documentSourceLabel,
  documentTypeLabel,
  getAsset,
  listDocuments,
  listRecallAlerts,
  listReminders,
  manualsSuggestPath,
  normalizeLabelValue,
  recallAlertStatusLabel,
  recurrenceLabel,
  runPropertyRecallCheck,
  updateAsset,
  uploadDocument,
  type AssetCategory,
  type DocumentType,
  type PublicAsset,
  type PublicAssetRecallAlert,
  type PublicDocument,
  type PublicReminder,
} from "@/lib/api";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import { OpenLabelField } from "@/components/OpenLabelField";
import {
  downloadAndShareDocument,
  pickDocumentFile,
  pickFromCamera,
  pickFromLibrary,
  type PickedUpload,
} from "@/lib/documents";

/**
 * Asset detail + edit + documents for the current home.
 * Loads only via owned propertyId — API enforces the boundary.
 */
export default function AssetDetailScreen() {
  const router = useRouter();
  const { id, edit: editParam } = useLocalSearchParams<{
    id: string;
    edit?: string;
  }>();
  const { user, accessToken, activeProperty } = useAuth();
  const [asset, setAsset] = useState<PublicAsset | null>(null);
  const [documents, setDocuments] = useState<PublicDocument[]>([]);
  const [reminders, setReminders] = useState<PublicReminder[]>([]);
  const [recallAlerts, setRecallAlerts] = useState<PublicAssetRecallAlert[]>(
    [],
  );
  const [editing, setEditing] = useState(editParam === "1");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [installDate, setInstallDate] = useState("");
  const [installerVendor, setInstallerVendor] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [warrantyEndDate, setWarrantyEndDate] = useState("");
  const [warrantyTerm, setWarrantyTerm] = useState("");

  const [pending, setPending] = useState<PickedUpload | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docType, setDocType] = useState<DocumentType>("");
  const [docDate, setDocDate] = useState("");

  const fillForm = useCallback((next: PublicAsset) => {
    setAsset(next);
    setName(next.name);
    setCategory(next.category);
    setManufacturer(next.manufacturer ?? "");
    setModel(next.model ?? "");
    setSerial(next.serial ?? "");
    setPurchaseDate(next.purchaseDate ?? "");
    setInstallDate(next.installDate ?? "");
    setInstallerVendor(next.installerVendor ?? "");
    setLocation(next.location ?? "");
    setNotes(next.notes ?? "");
    setWarrantyEndDate(next.warrantyEndDate ?? "");
    setWarrantyTerm(next.warrantyTerm ?? "");
  }, []);

  const loadDocuments = useCallback(async () => {
    if (!accessToken || !activeProperty || !id) return;
    const res = await listDocuments(accessToken, activeProperty.id, {
      assetId: id,
    });
    setDocuments(res.documents);
  }, [accessToken, activeProperty, id]);

  const loadReminders = useCallback(async () => {
    if (!accessToken || !activeProperty || !id) return;
    const res = await listReminders(accessToken, activeProperty.id, {
      assetId: id,
    });
    setReminders(res.reminders);
  }, [accessToken, activeProperty, id]);

  const loadRecalls = useCallback(async () => {
    if (!accessToken || !activeProperty || !id) return;
    const res = await listRecallAlerts(accessToken, activeProperty.id, {
      assetId: id,
      status: "all",
    });
    setRecallAlerts(res.alerts);
  }, [accessToken, activeProperty, id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!accessToken || !activeProperty || !id) {
        setLoading(false);
        return;
      }
      setError(null);
      setLoading(true);
      try {
        const res = await getAsset(accessToken, activeProperty.id, id);
        if (!cancelled) {
          fillForm(res.asset);
          await Promise.all([
            loadDocuments(),
            loadReminders(),
            loadRecalls(),
          ]);
          // Quiet match when manufacturer+model exist so cloud preview demos
          // show alerts without remembering Check (still homeowner-opened).
          if (
            res.asset.manufacturer?.trim() &&
            res.asset.model?.trim()
          ) {
            try {
              await runPropertyRecallCheck(accessToken, activeProperty.id);
              if (!cancelled) await loadRecalls();
            } catch {
              // Listing already loaded; Check button remains for retry.
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load asset.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeProperty,
    id,
    fillForm,
    loadDocuments,
    loadReminders,
    loadRecalls,
  ]);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }
  if (!activeProperty || !accessToken) {
    return <Redirect href="/home" />;
  }

  async function onSave() {
    if (!accessToken || !activeProperty || !id) return;
    if (!normalizeLabelValue(category)) {
      setError("Add a category (your own words).");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await updateAsset(accessToken, activeProperty.id, id, {
        name: name.trim(),
        category: normalizeLabelValue(category),
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial: serial.trim() || null,
        purchaseDate: purchaseDate.trim() || null,
        installDate: installDate.trim() || null,
        installerVendor: installerVendor.trim() || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        warrantyEndDate: warrantyEndDate.trim() || null,
        warrantyTerm: warrantyTerm.trim() || null,
      });
      fillForm(res.asset);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update asset.");
    } finally {
      setBusy(false);
    }
  }

  function onDelete() {
    Alert.alert(
      "Remove asset?",
      "This removes it, its documents, and its reminders from this home's ledger.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (!accessToken || !activeProperty || !id) return;
              setBusy(true);
              setError(null);
              try {
                await deleteAsset(accessToken, activeProperty.id, id);
                router.replace("/assets");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Could not remove asset.",
                );
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }

  async function beginPick(
    picker: () => Promise<PickedUpload | null>,
  ): Promise<void> {
    setError(null);
    try {
      const picked = await picker();
      if (!picked) return;
      setPending(picked);
      setDocTitle(picked.name.replace(/\.[^.]+$/, "") || asset?.name || "Document");
      setDocType(picked.suggestedType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open picker.");
    }
  }

  async function onUploadDoc(): Promise<void> {
    if (!accessToken || !activeProperty || !id || !pending) return;
    setBusy(true);
    setError(null);
    try {
      const typed = normalizeLabelValue(docType);
      if (!typed) {
        setError("Add a document type (your own words).");
        setBusy(false);
        return;
      }
      await uploadDocument(accessToken, activeProperty.id, {
        uri: pending.uri,
        name: pending.name,
        mimeType: pending.mimeType,
        title: docTitle.trim() || pending.name,
        docType: typed,
        documentDate: docDate.trim() || null,
        assetId: id,
      });
      setPending(null);
      setDocTitle("");
      setDocDate("");
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload.");
    } finally {
      setBusy(false);
    }
  }

  async function onShareDoc(doc: PublicDocument): Promise<void> {
    if (!accessToken || !activeProperty) return;
    setBusy(true);
    setError(null);
    try {
      await downloadAndShareDocument(accessToken, activeProperty.id, doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open document.");
    } finally {
      setBusy(false);
    }
  }

  function onDeleteDoc(doc: PublicDocument): void {
    Alert.alert("Remove document?", "Deletes this file from the asset.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (!accessToken || !activeProperty) return;
            setBusy(true);
            try {
              await deleteDocument(accessToken, activeProperty.id, doc.id);
              await loadDocuments();
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Could not remove document.",
              );
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="Asset"
        right={
          <Pressable
            accessibilityRole="button"
            disabled={busy || loading || !asset}
            onPress={() => {
              if (editing) {
                void onSave();
              } else {
                setEditing(true);
              }
            }}
            style={styles.headerAction}
          >
            <Text style={styles.headerActionLabel}>
              {editing ? (busy ? "Saving…" : "Save") : "Edit"}
            </Text>
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} style={styles.loader} />
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && asset && !editing ? (
          <>
            <Text style={styles.eyebrow}>{activeProperty.name}</Text>
            <Text style={styles.title}>{asset.name}</Text>
            <Text style={styles.copy}>{categoryLabel(asset.category)}</Text>

            <View style={styles.facts}>
              <Fact label="Manufacturer" value={asset.manufacturer} />
              <Fact label="Model" value={asset.model} />
              <Fact label="Serial" value={asset.serial} />
              <Fact label="Purchase date" value={asset.purchaseDate} />
              <Fact label="Install date" value={asset.installDate} />
              <Fact label="Warranty ends" value={asset.warrantyEndDate} />
              <Fact label="Warranty term" value={asset.warrantyTerm} />
              <Fact label="Installer / vendor" value={asset.installerVendor} />
              <Fact label="Location" value={asset.location} />
              <Fact label="Notes" value={asset.notes} />
              <Fact
                label="Source"
                value={
                  asset.provenance === "contractor"
                    ? "Contractor submission"
                    : "Added by you"
                }
              />
            </View>
          </>
        ) : null}

        {!loading && asset && editing ? (
          <>
            <Field label="Name" value={name} onChangeText={setName} />
            {accessToken && activeProperty ? (
              <OpenLabelField
                accessToken={accessToken}
                propertyId={activeProperty.id}
                kind="asset_category"
                label="Category"
                value={category}
                onChange={setCategory}
                placeholder="e.g. Furnace, Roof, Kids gear"
              />
            ) : null}
            <Field
              label="Manufacturer"
              value={manufacturer}
              onChangeText={setManufacturer}
            />
            <Field label="Model" value={model} onChangeText={setModel} />
            <Field
              label="Serial"
              value={serial}
              onChangeText={setSerial}
              autoCapitalize="characters"
            />
            <Field
              label="Purchase date (YYYY-MM-DD)"
              value={purchaseDate}
              onChangeText={setPurchaseDate}
              autoCapitalize="none"
            />
            <Field
              label="Install date (YYYY-MM-DD)"
              value={installDate}
              onChangeText={setInstallDate}
              autoCapitalize="none"
            />
            <Field
              label="Warranty end date (YYYY-MM-DD)"
              value={warrantyEndDate}
              onChangeText={setWarrantyEndDate}
              autoCapitalize="none"
            />
            <Field
              label="Warranty term"
              value={warrantyTerm}
              onChangeText={setWarrantyTerm}
              placeholder="e.g. 10 years, lifetime"
            />
            <Field
              label="Installer / vendor"
              value={installerVendor}
              onChangeText={setInstallerVendor}
            />
            <Field
              label="Location"
              value={location}
              onChangeText={setLocation}
            />
            <Field
              label="Notes"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </>
        ) : null}

        {!loading && asset ? (
          <>
            <Text style={styles.sectionHeading}>Documents</Text>
            <Text style={styles.sectionCopy}>
              Manuals, receipts, warranties, and photos for this asset.
            </Text>

            {manualsSuggestPath({
              assetId: asset.id,
              manufacturer: editing ? manufacturer : asset.manufacturer,
              model: editing ? model : asset.model,
            }) ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const path = manualsSuggestPath({
                    assetId: asset.id,
                    manufacturer: editing ? manufacturer : asset.manufacturer,
                    model: editing ? model : asset.model,
                  });
                  if (path) router.push(path);
                }}
                style={({ pressed }) => [
                  styles.findManualsBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryLabel}>Find manuals</Text>
              </Pressable>
            ) : null}

            <View style={styles.docActions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void beginPick(pickFromCamera);
                }}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryLabel}>Take photo</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void beginPick(pickFromLibrary);
                }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryLabel}>Photo library</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void beginPick(pickDocumentFile);
                }}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryLabel}>Choose file</Text>
              </Pressable>
            </View>

            {pending ? (
              <View style={styles.uploadBox}>
                <Text style={styles.factLabel}>Ready to save</Text>
                <Text style={styles.pendingName}>{pending.name}</Text>
                <Field label="Title" value={docTitle} onChangeText={setDocTitle} />
                {accessToken && activeProperty ? (
                  <OpenLabelField
                    accessToken={accessToken}
                    propertyId={activeProperty.id}
                    kind="document_type"
                    label="Type"
                    value={docType}
                    onChange={setDocType}
                    placeholder="e.g. Photo, Manual, Invoice"
                  />
                ) : null}
                <Field
                  label="Document date (YYYY-MM-DD)"
                  value={docDate}
                  onChangeText={setDocDate}
                  autoCapitalize="none"
                />
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    void onUploadDoc();
                  }}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.onBrand} />
                  ) : (
                    <Text style={styles.primaryLabel}>Save document</Text>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setPending(null)}
                  style={styles.cancelBtn}
                >
                  <Text style={styles.cancelLabel}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}

            {documents.length === 0 && !pending ? (
              <Text style={styles.emptyDocs}>No documents on this asset yet.</Text>
            ) : null}

            <View style={styles.docList}>
              {documents.map((doc) => (
                <View key={doc.id} style={styles.docRow}>
                  <View style={styles.docRowText}>
                    <Text style={styles.docName}>{doc.title}</Text>
                    <Text style={styles.docMeta}>
                      {documentTypeLabel(doc.docType)} ·{" "}
                      {documentSourceLabel(doc.source)}
                      {doc.documentDate ? ` · ${doc.documentDate}` : ""}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => {
                      void onShareDoc(doc);
                    }}
                  >
                    <Text style={styles.docAction}>View</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => onDeleteDoc(doc)}
                  >
                    <Text style={styles.docDanger}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>

          </>
        ) : null}

        {!loading && asset && !editing ? (
          <>
            <Text style={styles.sectionHeading}>Safety recalls</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void (async () => {
                  if (!accessToken || !activeProperty) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await runPropertyRecallCheck(
                      accessToken,
                      activeProperty.id,
                    );
                    await loadRecalls();
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not check recalls.",
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Check recalls for this home</Text>
            </Pressable>
            {recallAlerts.length === 0 ? (
              <Text style={styles.emptyDocs}>
                No recall matches yet. Add manufacturer and model (e.g. Generac /
                GP6500), then check — or save and reopen this asset.
              </Text>
            ) : (
              <View style={styles.docList}>
                {recallAlerts.map((alert) => (
                  <View key={alert.id} style={styles.docRow}>
                    <View style={styles.docRowText}>
                      <Text style={styles.docName}>{alert.recall.title}</Text>
                      <Text style={styles.docMeta}>
                        {recallAlertStatusLabel(alert.status)}
                        {alert.recall.hazard ? ` · ${alert.recall.hazard}` : ""}
                        {alert.recall.recallDate
                          ? ` · ${alert.recall.recallDate}`
                          : ""}
                      </Text>
                      <Text style={styles.docMeta}>{alert.recall.summary}</Text>
                    </View>
                    {alert.status === "open" ? (
                      <View style={styles.recallActions}>
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() => {
                            void (async () => {
                              if (!accessToken || !activeProperty) return;
                              setBusy(true);
                              setError(null);
                              try {
                                await acknowledgeRecallAlert(
                                  accessToken,
                                  activeProperty.id,
                                  alert.id,
                                );
                                await loadRecalls();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not acknowledge.",
                                );
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          <Text style={styles.docAction}>Ack</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() => {
                            void (async () => {
                              if (!accessToken || !activeProperty) return;
                              setBusy(true);
                              setError(null);
                              try {
                                await dismissRecallAlert(
                                  accessToken,
                                  activeProperty.id,
                                  alert.id,
                                );
                                await loadRecalls();
                              } catch (err) {
                                setError(
                                  err instanceof Error
                                    ? err.message
                                    : "Could not dismiss.",
                                );
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        >
                          <Text style={styles.docAction}>Dismiss</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.sectionHeading}>Reminders</Text>
            <Text style={styles.sectionCopy}>
              One-time or repeating maintenance for this asset. Mark done when
              finished; recurring tasks roll to the next due date.
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/reminders/new",
                  params: { assetId: id },
                })
              }
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Add reminder</Text>
            </Pressable>
            {reminders.length === 0 ? (
              <Text style={styles.emptyDocs}>No upcoming reminders.</Text>
            ) : (
              <View style={styles.docList}>
                {reminders.map((reminder) => (
                  <View key={reminder.id} style={styles.docRow}>
                    <View style={styles.docRowText}>
                      <Text style={styles.docName}>{reminder.title}</Text>
                      <Text style={styles.docMeta}>
                        Due {reminder.dueDate} ·{" "}
                        {recurrenceLabel(reminder.recurrence)}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => {
                        void (async () => {
                          if (!accessToken || !activeProperty) return;
                          setBusy(true);
                          setError(null);
                          try {
                            await completeReminder(
                              accessToken,
                              activeProperty.id,
                              reminder.id,
                            );
                            await loadReminders();
                          } catch (err) {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Could not mark done.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      <Text style={styles.docAction}>Done</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onDelete}
              style={styles.dangerBtn}
            >
              <Text style={styles.dangerLabel}>Remove asset</Text>
            </Pressable>
          </>
        ) : null}

        {!loading && asset && editing ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (asset) fillForm(asset);
                setEditing(false);
                setError(null);
              }}
              style={styles.cancelBtn}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact(props: { label: string; value: string | null }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{props.label}</Text>
      <Text style={styles.factValue}>{props.value?.trim() || "—"}</Text>
    </View>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMultiline]}
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor="#8A9BB0"
        autoCapitalize={props.autoCapitalize}
        multiline={props.multiline}
        textAlignVertical={props.multiline ? "top" : "center"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: {
    paddingVertical: 8,
    minWidth: 56,
  },
  backLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.brand,
  },
  headerAction: {
    paddingVertical: 8,
    minWidth: 56,
    alignItems: "flex-end",
  },
  headerActionLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  loader: {
    marginTop: 40,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  copy: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: colors.copy,
  },
  facts: {
    marginTop: 24,
    gap: 14,
  },
  fact: {
    gap: 2,
  },
  factLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  factValue: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  sectionHeading: {
    marginTop: 32,
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  sectionCopy: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: colors.copy,
  },
  findManualsBtn: {
    marginTop: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  docActions: {
    marginTop: 12,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: colors.onBrand,
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.6,
  },
  uploadBox: {
    marginTop: 16,
  },
  pendingName: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 14,
    color: colors.copy,
  },
  emptyDocs: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted,
  },
  docList: {
    marginTop: 16,
    gap: 10,
  },
  docRow: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  docRowText: {
    flex: 1,
    gap: 2,
  },
  docName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.ink,
  },
  docMeta: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  docAction: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  recallActions: {
    gap: 10,
    alignItems: "flex-end",
  },
  docDanger: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.danger,
  },
  footnote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  dangerBtn: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerLabel: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    marginTop: 8,
    marginBottom: 8,
    color: colors.danger,
    fontSize: 14,
  },
  field: {
    marginTop: 10,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  inputMultiline: {
    minHeight: 96,
    paddingTop: 12,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandMuted,
  },
  chipLabelSelected: {
    color: colors.onBrand,
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 10,
  },
  cancelLabel: {
    color: colors.brandMuted,
    fontSize: 14,
    fontWeight: "600",
  },
});
