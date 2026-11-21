import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
  DOCUMENT_TYPES,
  deleteDocument,
  documentSourceLabel,
  documentTypeLabel,
  exportHomePacket,
  listDocuments,
  uploadDocument,
  type DocumentType,
  type PublicDocument,
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
 * Home-level documents (not tied to one asset) + easy home packet export.
 * Camera-first attach path for phone capture.
 */
export default function PropertyDocumentsScreen() {
  const router = useRouter();
  const { user, accessToken, activeProperty } = useAuth();
  const [documents, setDocuments] = useState<PublicDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PickedUpload | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocumentType>("photo");
  const [documentDate, setDocumentDate] = useState("");
  const [exportSummary, setExportSummary] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken || !activeProperty) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await listDocuments(accessToken, activeProperty.id, {
        propertyOnly: true,
      });
      setDocuments(res.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load documents.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, activeProperty]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!user) {
    return <Redirect href="/sign-in" />;
  }
  if (!activeProperty || !accessToken) {
    return <Redirect href="/home" />;
  }

  async function beginPick(
    picker: () => Promise<PickedUpload | null>,
  ): Promise<void> {
    setError(null);
    try {
      const picked = await picker();
      if (!picked) return;
      setPending(picked);
      setTitle(picked.name.replace(/\.[^.]+$/, "") || "Home document");
      setDocType(picked.suggestedType);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open picker.");
    }
  }

  async function onUpload(): Promise<void> {
    if (!accessToken || !activeProperty || !pending) return;
    setBusy(true);
    setError(null);
    try {
      await uploadDocument(accessToken, activeProperty.id, {
        uri: pending.uri,
        name: pending.name,
        mimeType: pending.mimeType,
        title: title.trim() || pending.name,
        docType,
        documentDate: documentDate.trim() || null,
        assetId: null,
      });
      setPending(null);
      setTitle("");
      setDocumentDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload.");
    } finally {
      setBusy(false);
    }
  }

  async function onShare(doc: PublicDocument): Promise<void> {
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

  function onDelete(doc: PublicDocument): void {
    Alert.alert("Remove document?", "This deletes the file from this home only.", [
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
              await load();
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

  async function onExport(): Promise<void> {
    if (!accessToken || !activeProperty) return;
    setBusy(true);
    setError(null);
    setExportSummary(null);
    try {
      const res = await exportHomePacket(accessToken, activeProperty.id);
      setExportSummary(
        `Packet ready: ${res.packet.assets.length} assets, ${res.packet.documents.length} documents. Nothing was shared — this is your private export.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not export.");
    } finally {
      setBusy(false);
    }
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
        <Text style={styles.brand}>Documents</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>{activeProperty.name}</Text>
        <Text style={styles.title}>Documents</Text>

        <View style={styles.actions}>
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
            <Text style={styles.sectionLabel}>Ready to save</Text>
            <Text style={styles.pendingName}>{pending.name}</Text>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholderTextColor="#8A9BB0"
            />
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
            <Text style={styles.label}>Document date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={documentDate}
              onChangeText={setDocumentDate}
              autoCapitalize="none"
              placeholder="optional"
              placeholderTextColor="#8A9BB0"
            />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                void onUpload();
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && styles.pressed,
                busy && styles.disabled,
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryLabel}>Save to this home</Text>
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

        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            void onExport();
          }}
          style={({ pressed }) => [
            styles.exportBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.exportLabel}>Export home packet</Text>
        </Pressable>
        {exportSummary ? (
          <Text style={styles.exportNote}>{exportSummary}</Text>
        ) : null}

        {loading ? (
          <ActivityIndicator style={styles.loader} color="#002D72" />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {!loading && documents.length === 0 ? (
          <Text style={styles.empty}>
            No home-level documents yet. Take a photo or attach a file.
          </Text>
        ) : null}

        <View style={styles.list}>
          {documents.map((doc) => (
            <View key={doc.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{doc.title}</Text>
                <Text style={styles.rowMeta}>
                  {documentTypeLabel(doc.docType)} ·{" "}
                  {documentSourceLabel(doc.source)}
                  {doc.documentDate ? ` · ${doc.documentDate}` : ""}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => {
                  void onShare(doc);
                }}
              >
                <Text style={styles.rowAction}>View</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onDelete(doc)}
              >
                <Text style={styles.rowDanger}>Remove</Text>
              </Pressable>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F2F5FA",
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
  backSpacer: {
    minWidth: 56,
  },
  backLabel: {
    color: "#1E4D96",
    fontSize: 14,
    fontWeight: "600",
  },
  brand: {
    fontSize: 18,
    fontWeight: "700",
    color: "#002D72",
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#5C6E84",
  },
  title: {
    marginTop: 8,
    fontSize: 28,
    fontWeight: "700",
    color: "#0B1B33",
    letterSpacing: -0.4,
  },
  copy: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: "#3D4F66",
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: "#002D72",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryBtn: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FF5910",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: "#FF5910",
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
    marginTop: 20,
    gap: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#5C6E84",
  },
  pendingName: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 14,
    color: "#3D4F66",
  },
  label: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: "600",
    color: "#002D72",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#C5D0DE",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0B1B33",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#C5D0DE",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: "#002D72",
    backgroundColor: "#002D72",
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E4D96",
  },
  chipLabelSelected: {
    color: "#FFFFFF",
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  cancelLabel: {
    color: "#1E4D96",
    fontSize: 14,
    fontWeight: "600",
  },
  exportBtn: {
    marginTop: 24,
    paddingVertical: 12,
  },
  exportLabel: {
    color: "#1E4D96",
    fontSize: 14,
    fontWeight: "600",
  },
  exportNote: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#3D4F66",
  },
  loader: {
    marginTop: 28,
  },
  error: {
    marginTop: 16,
    color: "#B42318",
    fontSize: 14,
  },
  empty: {
    marginTop: 24,
    fontSize: 15,
    lineHeight: 22,
    color: "#5C6E84",
  },
  list: {
    marginTop: 20,
    gap: 10,
  },
  row: {
    borderWidth: 1,
    borderColor: "#C5D0DE",
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0B1B33",
  },
  rowMeta: {
    fontSize: 13,
    lineHeight: 18,
    color: "#5C6E84",
  },
  rowAction: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E4D96",
  },
  rowDanger: {
    fontSize: 13,
    fontWeight: "600",
    color: "#B42318",
  },
  footnote: {
    marginTop: 28,
    fontSize: 13,
    lineHeight: 18,
    color: "#5C6E84",
  },
});
