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
  ASSET_CATEGORIES,
  DOCUMENT_TYPES,
  categoryLabel,
  completeReminder,
  deleteAsset,
  deleteDocument,
  documentSourceLabel,
  documentTypeLabel,
  getAsset,
  listDocuments,
  listReminders,
  recurrenceLabel,
  updateAsset,
  uploadDocument,
  type AssetCategory,
  type DocumentType,
  type PublicAsset,
  type PublicDocument,
  type PublicReminder,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, accessToken, activeProperty } = useAuth();
  const [asset, setAsset] = useState<PublicAsset | null>(null);
  const [documents, setDocuments] = useState<PublicDocument[]>([]);
  const [reminders, setReminders] = useState<PublicReminder[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>("other");
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
  const [docType, setDocType] = useState<DocumentType>("photo");
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
          await Promise.all([loadDocuments(), loadReminders()]);
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
  }, [accessToken, activeProperty, id, fillForm, loadDocuments, loadReminders]);

  if (!user) {
    return <Redirect href="/sign-in" />;
  }
  if (!activeProperty || !accessToken) {
    return <Redirect href="/home" />;
  }

  async function onSave() {
    if (!accessToken || !activeProperty || !id) return;
    setError(null);
    setBusy(true);
    try {
      const res = await updateAsset(accessToken, activeProperty.id, id, {
        name: name.trim(),
        category,
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
      await uploadDocument(accessToken, activeProperty.id, {
        uri: pending.uri,
        name: pending.name,
        mimeType: pending.mimeType,
        title: docTitle.trim() || pending.name,
        docType,
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
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backLabel}>Back</Text>
        </Pressable>
        <Text style={styles.brand}>Asset</Text>
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
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <ActivityIndicator color="#1B3A2F" style={styles.loader} />
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

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                router.push({
                  pathname: "/ai/howto",
                  params: { assetId: id },
                })
              }
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryLabel}>Ask how-to (AI)</Text>
            </Pressable>

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

            <Text style={styles.sectionHeading}>Documents</Text>
            <Text style={styles.sectionCopy}>
              Manuals, receipts, warranties, and photos for this asset. Camera
              is the fastest path on your phone.
            </Text>

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
                <Text style={styles.label}>Type</Text>
                <View style={styles.chips}>
                  {DOCUMENT_TYPES.map((item) => {
                    const selected = item.value === docType;
                    return (
                      <Pressable
                        key={item.value}
                        accessibilityRole="button"
                        onPress={() => setDocType(item.value)}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text
                          style={[
                            styles.chipLabel,
                            selected && styles.chipLabelSelected,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
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
                    <ActivityIndicator color="#F3F6F4" />
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

            <Text style={styles.footnote}>
              Files stay on this home only. No silent sharing.
            </Text>

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
            <Text style={styles.copy}>
              Editing on {activeProperty.name}. Changes stay on this home only.
            </Text>
            <Field label="Name" value={name} onChangeText={setName} />
            <Text style={styles.label}>Category</Text>
            <View style={styles.chips}>
              {ASSET_CATEGORIES.map((item) => {
                const selected = item.value === category;
                return (
                  <Pressable
                    key={item.value}
                    accessibilityRole="button"
                    onPress={() => setCategory(item.value)}
                    style={[styles.chip, selected && styles.chipSelected]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        selected && styles.chipLabelSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
        placeholderTextColor="#7A8A82"
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
    backgroundColor: "#F3F6F4",
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
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B3A2F",
  },
  headerAction: {
    paddingVertical: 8,
    minWidth: 56,
    alignItems: "flex-end",
  },
  headerActionLabel: {
    color: "#2F5B4A",
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
    color: "#5A6E64",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: "#14241D",
    letterSpacing: -0.4,
  },
  copy: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: "#3D5349",
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
    color: "#5A6E64",
  },
  factValue: {
    fontSize: 16,
    lineHeight: 22,
    color: "#14241D",
  },
  sectionHeading: {
    marginTop: 32,
    fontSize: 20,
    fontWeight: "700",
    color: "#14241D",
  },
  sectionCopy: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: "#3D5349",
  },
  docActions: {
    marginTop: 16,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#F3F6F4",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#1B3A2F",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: "#1B3A2F",
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
    color: "#3D5349",
  },
  emptyDocs: {
    marginTop: 16,
    fontSize: 14,
    color: "#5A6E64",
  },
  docList: {
    marginTop: 16,
    gap: 10,
  },
  docRow: {
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
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
    color: "#14241D",
  },
  docMeta: {
    fontSize: 12,
    lineHeight: 17,
    color: "#5A6E64",
  },
  docAction: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2F5B4A",
  },
  docDanger: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8B2E2E",
  },
  footnote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 18,
    color: "#5A6E64",
  },
  dangerBtn: {
    marginTop: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  dangerLabel: {
    color: "#8B2E2E",
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    marginTop: 8,
    marginBottom: 8,
    color: "#8B2E2E",
    fontSize: 14,
  },
  field: {
    marginTop: 10,
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#1B3A2F",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#14241D",
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
    borderColor: "#C5D2CB",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: "#1B3A2F",
    backgroundColor: "#1B3A2F",
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2F5B4A",
  },
  chipLabelSelected: {
    color: "#F3F6F4",
  },
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 10,
  },
  cancelLabel: {
    color: "#2F5B4A",
    fontSize: 14,
    fontWeight: "600",
  },
});
