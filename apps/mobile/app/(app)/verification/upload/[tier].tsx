import { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  CheckCircle2,
  Upload,
  RefreshCw,
  AlertCircle,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Header } from "@/components/Header";
import { Text } from "@/components/Text";
import { Pressable } from "@/components/Pressable";
import { Button } from "@/components/Button";
import { FadeIn } from "@/components/FadeIn";
import { Container } from "@/components/Container";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/context";
import {
  uploadDocument,
  ClockSkewError,
  UploadFailedError,
} from "@/lib/verification/upload";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";
import {
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_HINTS,
  type DocumentType,
  type TierInfo,
} from "@/lib/api/verification-types";

type TierKey = "basic" | "business" | "fleet_owner";

interface DocumentUploadState {
  type: DocumentType;
  documentId: string | null;
  localUri: string | null;
  uploading: boolean;
  error: string | null;
}

export default function UploadDocumentsScreen() {
  const router = useRouter();
  const { getActiveOrganisation } = useAuth();
  const activeOrg = getActiveOrganisation();
  const { tier } = useLocalSearchParams<{ tier: TierKey }>();

  const [tierInfo, setTierInfo] = useState<TierInfo | null>(null);
  const [documents, setDocuments] = useState<DocumentUploadState[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load tier requirements and initialize document state
  useEffect(() => {
    async function load() {
      try {
        const response = await api.listVerificationTiers();
        const info = response.tiers.find((t) => t.key === tier);
        if (info) {
          setTierInfo(info);
          setDocuments(
            info.requires.map((type) => ({
              type,
              documentId: null,
              localUri: null,
              uploading: false,
              error: null,
            })),
          );
        }
      } catch (err) {
        Alert.alert("Error", "Unable to load verification requirements.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tier]);

  // Pick an image from camera or gallery
  const pickImage = useCallback(
    async (docType: DocumentType, source: "camera" | "gallery") => {
      // Request permission
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Camera access is required to take photos.");
          return;
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission needed", "Photo library access is required to pick images.");
          return;
        }
      }

      // Launch picker
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: false,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: false,
            });

      if (result.canceled || result.assets.length === 0) return;

      const asset = result.assets[0];
      await uploadPickedImage(docType, asset);
    },
    [activeOrg],
  );

  const uploadPickedImage = useCallback(
    async (docType: DocumentType, asset: ImagePicker.ImagePickerAsset) => {
      if (!activeOrg) return;

      // Update state to uploading
      setDocuments((docs) =>
        docs.map((d) =>
          d.type === docType
            ? { ...d, uploading: true, error: null, localUri: asset.uri }
            : d,
        ),
      );

      try {
        const result = await uploadDocument({
          orgId: activeOrg.id,
          documentType: docType,
          fileUri: asset.uri,
          mimeType: asset.mimeType ?? "image/jpeg",
          fileName: asset.fileName ?? `${docType}.jpg`,
          fileSize: asset.fileSize ?? 0,
        });

        setDocuments((docs) =>
          docs.map((d) =>
            d.type === docType
              ? { ...d, uploading: false, documentId: result.documentId, error: null }
              : d,
          ),
        );
      } catch (err) {
        let message = "Upload failed. Please try again.";
        if (err instanceof ClockSkewError) {
          message = err.message;
        } else if (err instanceof UploadFailedError) {
          message = err.message;
        }
        setDocuments((docs) =>
          docs.map((d) =>
            d.type === docType
              ? { ...d, uploading: false, error: message }
              : d,
          ),
        );
      }
    },
    [activeOrg],
  );

  const showPicker = useCallback(
    (docType: DocumentType) => {
      Alert.alert(
        "Upload document",
        "Choose a source",
        [
          { text: "Camera", onPress: () => pickImage(docType, "camera") },
          { text: "Photo library", onPress: () => pickImage(docType, "gallery") },
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true },
      );
    },
    [pickImage],
  );

  const allUploaded = documents.every((d) => d.documentId !== null);

  const handleSubmit = useCallback(async () => {
    if (!activeOrg || !tier || !allUploaded) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const documentIds = documents
        .map((d) => d.documentId)
        .filter((id): id is string => id !== null);

      await api.submitVerification(activeOrg.id, {
        requested_tier: tier,
        document_ids: documentIds,
      });

      // Navigate to status screen
      router.replace("/(app)/verification/status");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Submission failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [activeOrg, tier, allUploaded, documents, router]);

  if (loading || !tierInfo) {
    return (
      <Screen>
        <Header title="Upload documents" showBack />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }

  const uploadedCount = documents.filter((d) => d.documentId !== null).length;
  const totalCount = documents.length;

  return (
    <Screen padded={false}>
      <Container>
        <Header title="Upload documents" showBack />
        <ScrollView contentContainerStyle={styles.content}>
          <FadeIn>
            <Text variant="h2">{tierInfo.label} verification</Text>
            <Text
              variant="body"
              color={colors.text.secondary}
              style={{ marginTop: spacing[2] }}
            >
              Upload {totalCount} {totalCount === 1 ? "document" : "documents"} to verify your business.
            </Text>

            {/* Progress */}
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(uploadedCount / totalCount) * 100}%` },
                ]}
              />
            </View>
            <Text
              variant="caption"
              color={colors.text.tertiary}
              style={{ marginTop: spacing[2] }}
            >
              {uploadedCount} of {totalCount} uploaded
            </Text>
          </FadeIn>

          {/* Document cards */}
          <View style={{ marginTop: spacing[6] }}>
            {documents.map((doc, idx) => (
              <FadeIn key={doc.type} delay={80 + idx * 60}>
                <DocumentCard
                  document={doc}
                  onPick={() => showPicker(doc.type)}
                />
              </FadeIn>
            ))}
          </View>

          {submitError && (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color={colors.status.danger.fg} strokeWidth={2} />
              <Text
                variant="bodySmall"
                color={colors.status.danger.fg}
                style={{ marginLeft: spacing[2], flex: 1 }}
              >
                {submitError}
              </Text>
            </View>
          )}

          <View style={styles.footer}>
            <Button
              label={
                submitting
                  ? "Submitting…"
                  : allUploaded
                  ? "Submit for review"
                  : `Upload remaining ${totalCount - uploadedCount}`
              }
              onPress={handleSubmit}
              loading={submitting}
              disabled={!allUploaded || submitting}
              size="lg"
            />
          </View>
        </ScrollView>
      </Container>
    </Screen>
  );
}

function DocumentCard({
  document,
  onPick,
}: {
  document: DocumentUploadState;
  onPick: () => void;
}) {
  const isUploaded = document.documentId !== null;
  const hasError = document.error !== null;

  return (
    <View style={[styles.card, isUploaded && styles.cardUploaded]}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyMedium">{DOCUMENT_TYPE_LABELS[document.type]}</Text>
          {DOCUMENT_TYPE_HINTS[document.type] && (
            <Text
              variant="caption"
              color={colors.text.tertiary}
              style={{ marginTop: 2 }}
            >
              {DOCUMENT_TYPE_HINTS[document.type]}
            </Text>
          )}
        </View>
        {isUploaded && (
          <CheckCircle2 size={22} color={colors.status.success.fg} strokeWidth={2.5} />
        )}
      </View>

      {/* Preview or upload button */}
      {document.localUri ? (
        <Image source={{ uri: document.localUri }} style={styles.preview} />
      ) : null}

      {document.uploading ? (
        <View style={styles.uploadingRow}>
          <ActivityIndicator size="small" color={colors.brand.primary} />
          <Text
            variant="caption"
            color={colors.text.secondary}
            style={{ marginLeft: spacing[2] }}
          >
            Uploading…
          </Text>
        </View>
      ) : (
        <Pressable onPress={onPick} style={styles.uploadButton}>
          {isUploaded ? (
            <>
              <RefreshCw size={16} color={colors.text.secondary} strokeWidth={2} />
              <Text
                variant="label"
                color={colors.text.secondary}
                style={{ marginLeft: spacing[2] }}
              >
                Replace document
              </Text>
            </>
          ) : (
            <>
              <Camera size={16} color={colors.brand.primary} strokeWidth={2} />
              <Text
                variant="label"
                color={colors.brand.primary}
                style={{ marginLeft: spacing[2], fontWeight: "600" }}
              >
                Add document
              </Text>
            </>
          )}
        </Pressable>
      )}

      {hasError && (
        <Text
          variant="caption"
          color={colors.status.danger.fg}
          style={{ marginTop: spacing[2] }}
        >
          {document.error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing[5],
    paddingBottom: spacing[10],
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.surface.sunken,
    borderRadius: 3,
    marginTop: spacing[5],
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.brand.primary,
  },
  card: {
    padding: spacing[4],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: spacing[3],
  },
  cardUploaded: {
    borderColor: colors.status.success.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: radii.md,
    marginTop: spacing[3],
    resizeMode: "cover",
  },
  uploadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[3],
  },
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    marginTop: spacing[3],
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginTop: spacing[4],
  },
  footer: {
    marginTop: spacing[6],
  },
});