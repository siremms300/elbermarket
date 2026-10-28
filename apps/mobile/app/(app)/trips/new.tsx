import { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  AlertCircle,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Pressable } from "@/components/Pressable";
import { FadeIn } from "@/components/FadeIn";
import { StepIndicator } from "@/components/StepIndicator";
import { FormSection } from "@/components/FormSection";
import { ChipSelector } from "@/components/ChipSelector";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { LocationButton } from "@/components/LocationButton";
import { DatePicker } from "@/components/DatePicker";
import { Container } from "@/components/Container";
import { HttpError, api } from "@/lib/api/client";
import { colors, spacing, radii, elevation } from "@elbermarket/design-tokens";

type Step = 1 | 2 | 3 | 4;

interface FormData {
  cargoDescription: string;
  cargoWeight: string;
  cargoValue: string;
  externalReference: string;
  pickupAddress: string;
  pickupLat: string;
  pickupLon: string;
  destinationAddress: string;
  destinationLat: string;
  destinationLon: string;
  pickupDate: Date | null;
  pickupStartTime: string;
  pickupEndTime: string;
  vehicleType: string;
  minCapacity: string;
}

const INITIAL_FORM: FormData = {
  cargoDescription: "",
  cargoWeight: "",
  cargoValue: "",
  externalReference: "",
  pickupAddress: "",
  pickupLat: "",
  pickupLon: "",
  destinationAddress: "",
  destinationLat: "",
  destinationLon: "",
  pickupDate: null,
  pickupStartTime: "08:00",
  pickupEndTime: "16:00",
  vehicleType: "truck",
  minCapacity: "",
};

const VEHICLE_OPTIONS = [
  { value: "truck", label: "Truck" },
  { value: "van", label: "Van" },
  { value: "pickup", label: "Pickup" },
  { value: "trailer", label: "Trailer" },
  { value: "tanker", label: "Tanker" },
  { value: "refrigerated", label: "Refrigerated" },
  { value: "other", label: "Other" },
];

export default function NewTripScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ reference: string; id: string } | null>(null);

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const scrollTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const validateStep1 = (): string | null => {
    if (form.cargoDescription.trim().length < 3) {
      return "Describe the cargo in at least 3 characters.";
    }
    const weight = parseFloat(form.cargoWeight);
    if (isNaN(weight) || weight <= 0) {
      return "Weight must be a positive number.";
    }
    const value = parseFloat(form.cargoValue);
    if (isNaN(value) || value <= 0) {
      return "Declared value must be a positive number.";
    }
    return null;
  };

  const validateStep2 = (): string | null => {
    if (form.pickupAddress.trim().length < 5) {
      return "Enter a pickup address.";
    }
    const pLat = parseFloat(form.pickupLat);
    const pLon = parseFloat(form.pickupLon);
    if (isNaN(pLat) || pLat < -90 || pLat > 90) {
      return "Pickup latitude must be between -90 and 90.";
    }
    if (isNaN(pLon) || pLon < -180 || pLon > 180) {
      return "Pickup longitude must be between -180 and 180.";
    }
    if (form.destinationAddress.trim().length < 5) {
      return "Enter a destination address.";
    }
    // Destination coordinates are optional. If both are provided, validate.
    // If only one is provided, reject — must be both or neither.
    const hasDestLat = form.destinationLat.trim() !== "";
    const hasDestLon = form.destinationLon.trim() !== "";
    if (hasDestLat !== hasDestLon) {
      return "Provide both destination coordinates, or leave both blank.";
    }
    if (hasDestLat && hasDestLon) {
      const dLat = parseFloat(form.destinationLat);
      const dLon = parseFloat(form.destinationLon);
      if (isNaN(dLat) || dLat < -90 || dLat > 90) {
        return "Destination latitude must be between -90 and 90.";
      }
      if (isNaN(dLon) || dLon < -180 || dLon > 180) {
        return "Destination longitude must be between -180 and 180.";
      }
    }
    return null;
  };

  const validateStep3 = (): string | null => {
    if (!form.pickupDate) {
      return "Please select a pickup date.";
    }
    const date = new Date(form.pickupDate);
    date.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      return "Pickup date must be in the future.";
    }
    if (!/^\d{2}:\d{2}$/.test(form.pickupStartTime)) {
      return "Start time must be HH:MM.";
    }
    if (!/^\d{2}:\d{2}$/.test(form.pickupEndTime)) {
      return "End time must be HH:MM.";
    }
    if (form.pickupStartTime >= form.pickupEndTime) {
      return "End time must be after start time.";
    }
    return null;
  };

  const nextStep = () => {
    let validation: string | null = null;
    if (step === 1) validation = validateStep1();
    else if (step === 2) validation = validateStep2();
    else if (step === 3) validation = validateStep3();

    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
    scrollTop();
  };

  const prevStep = () => {
    setError(null);
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
    scrollTop();
  };

  const submit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (!form.pickupDate) {
        throw new Error("Pickup date is required.");
      }

      const dateStr = form.pickupDate.toISOString().split("T")[0];
      const pickupDateTime = new Date(`${dateStr}T${form.pickupStartTime}:00Z`);
      const endDateTime = new Date(`${dateStr}T${form.pickupEndTime}:00Z`);

      // Destination coordinates are optional
      const destLat =
        form.destinationLat.trim() !== "" ? parseFloat(form.destinationLat) : undefined;
      const destLon =
        form.destinationLon.trim() !== "" ? parseFloat(form.destinationLon) : undefined;

      const result = await api.createTransportRequest({
        cargo_description: form.cargoDescription.trim(),
        cargo_declared_value: parseFloat(form.cargoValue),
        cargo_weight_kg: parseFloat(form.cargoWeight),
        pickup_address: form.pickupAddress.trim(),
        pickup_latitude: parseFloat(form.pickupLat),
        pickup_longitude: parseFloat(form.pickupLon),
        destination_address: form.destinationAddress.trim(),
        destination_latitude: destLat,
        destination_longitude: destLon,
        pickup_window_start: pickupDateTime.toISOString(),
        pickup_window_end: endDateTime.toISOString(),
        required_vehicle_type: form.vehicleType,
        required_min_capacity_kg: form.minCapacity
          ? parseFloat(form.minCapacity)
          : undefined,
        currency: "NGN",
        external_reference: form.externalReference.trim() || undefined,
      });

      setSuccess({
        reference: result.transport_request.reference,
        id: result.transport_request.id,
      });

      setTimeout(() => {
        router.replace(`/(app)/trips/${result.transport_request.id}`);
      }, 2500);
    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Success state ─────────────────────────────────────────────────
  if (success) {
    return (
      <Screen>
        <Container>
          <View style={styles.successContainer}>
            <SuccessAnimation />
            <Text variant="h1" style={{ marginTop: spacing[8], textAlign: "center" }}>
              Trip created
            </Text>
            <Text
              variant="body"
              color={colors.text.secondary}
              style={{ marginTop: spacing[2], textAlign: "center" }}
            >
              Your transport request is now awaiting assignment.
            </Text>
            <View style={styles.referenceCard}>
              <Text variant="overline" color={colors.text.tertiary}>
                Reference
              </Text>
              <Text
                variant="numericDisplay"
                color={colors.brand.primary}
                style={{ marginTop: spacing[2] }}
              >
                {success.reference}
              </Text>
            </View>
            <Text
              variant="caption"
              color={colors.text.tertiary}
              style={{ marginTop: spacing[6], textAlign: "center" }}
            >
              Taking you to the trip detail…
            </Text>
          </View>
        </Container>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <Container>
        <View style={styles.header}>
          <Pressable
            onPress={step === 1 ? () => router.back() : prevStep}
            style={styles.headerBack}
          >
            <ChevronLeft size={24} color={colors.text.primary} strokeWidth={2} />
          </Pressable>
          <Text variant="label" color={colors.text.secondary} style={{ marginLeft: spacing[2] }}>
            New trip
          </Text>
          <View style={{ flex: 1 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <StepIndicator
              currentStep={step === 4 ? 3 : step}
              totalSteps={3}
              label={
                step === 1 ? "Cargo" : step === 2 ? "Route" : step === 3 ? "When & How" : "Review"
              }
            />

            {error && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color={colors.status.danger.fg} strokeWidth={2} />
                <Text
                  variant="bodySmall"
                  color={colors.status.danger.fg}
                  style={{ marginLeft: spacing[2], flex: 1 }}
                >
                  {error}
                </Text>
              </View>
            )}

            {/* Step 1: Cargo */}
            {step === 1 && (
              <FadeIn>
                <FormSection
                  title="What are you moving?"
                  description="Tell us about the cargo — accurate details help get the right vehicle."
                >
                  <Field label="Cargo description">
                    <TextInput
                      value={form.cargoDescription}
                      onChangeText={(v) => update("cargoDescription", v)}
                      placeholder="e.g. Grade A maize in 50kg bags"
                      placeholderTextColor={colors.text.tertiary}
                      style={styles.input}
                    />
                  </Field>

                  <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: spacing[2] }}>
                      <Field label="Weight (kg)">
                        <TextInput
                          value={form.cargoWeight}
                          onChangeText={(v) => update("cargoWeight", v)}
                          placeholder="5000"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="numeric"
                          style={styles.input}
                        />
                      </Field>
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing[2] }}>
                      <Field label="Value (NGN)">
                        <TextInput
                          value={form.cargoValue}
                          onChangeText={(v) => update("cargoValue", v)}
                          placeholder="500000"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="numeric"
                          style={styles.input}
                        />
                      </Field>
                    </View>
                  </View>

                  <Field label="Your reference (optional)">
                    <TextInput
                      value={form.externalReference}
                      onChangeText={(v) => update("externalReference", v)}
                      placeholder="e.g. PO-2026-1042"
                      placeholderTextColor={colors.text.tertiary}
                      style={styles.input}
                    />
                  </Field>
                </FormSection>
              </FadeIn>
            )}

            {/* Step 2: Route */}
            {step === 2 && (
              <FadeIn>
                <FormSection
                  title="Where's it going?"
                  description="Tap the GPS button to auto-fill coordinates and address from your current location."
                >
                  <Field label="Pickup address">
                    <TextInput
                      value={form.pickupAddress}
                      onChangeText={(v) => update("pickupAddress", v)}
                      placeholder="e.g. Kaduna Central Market"
                      placeholderTextColor={colors.text.tertiary}
                      style={styles.input}
                    />
                  </Field>
                  <LocationButton
                    label="Use my location for pickup"
                    onCapture={(loc) => {
                      update("pickupLat", loc.latitude.toFixed(7));
                      update("pickupLon", loc.longitude.toFixed(7));
                      if (loc.address) update("pickupAddress", loc.address);
                    }}
                  />

                  <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: spacing[2] }}>
                      <Field label="Latitude">
                        <TextInput
                          value={form.pickupLat}
                          onChangeText={(v) => update("pickupLat", v)}
                          placeholder="10.5264"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="numeric"
                          style={styles.input}
                        />
                      </Field>
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing[2] }}>
                      <Field label="Longitude">
                        <TextInput
                          value={form.pickupLon}
                          onChangeText={(v) => update("pickupLon", v)}
                          placeholder="7.4388"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="numeric"
                          style={styles.input}
                        />
                      </Field>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <Field label="Destination address">
                    <TextInput
                      value={form.destinationAddress}
                      onChangeText={(v) => update("destinationAddress", v)}
                      placeholder="e.g. Mile 12 Market, Lagos"
                      placeholderTextColor={colors.text.tertiary}
                      style={styles.input}
                    />
                  </Field>
                  <LocationButton
                    label="Use my location for destination"
                    onCapture={(loc) => {
                      update("destinationLat", loc.latitude.toFixed(7));
                      update("destinationLon", loc.longitude.toFixed(7));
                      if (loc.address) update("destinationAddress", loc.address);
                    }}
                  />

                  <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: spacing[2] }}>
                      <Field label="Latitude (optional)">
                        <TextInput
                          value={form.destinationLat}
                          onChangeText={(v) => update("destinationLat", v)}
                          placeholder="6.5244"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="numeric"
                          style={styles.input}
                        />
                      </Field>
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing[2] }}>
                      <Field label="Longitude (optional)">
                        <TextInput
                          value={form.destinationLon}
                          onChangeText={(v) => update("destinationLon", v)}
                          placeholder="3.3792"
                          placeholderTextColor={colors.text.tertiary}
                          keyboardType="numeric"
                          style={styles.input}
                        />
                      </Field>
                    </View>
                  </View>

                  <View style={styles.hintBox}>
                    <Text variant="caption" color={colors.text.secondary}>
                      Distance is calculated from coordinates. If you don't know
                      the destination coordinates, leave them blank — you can
                      provide them once the receiver confirms.
                    </Text>
                  </View>
                </FormSection>
              </FadeIn>
            )}

            {/* Step 3: When & How */}
            {step === 3 && (
              <FadeIn>
                <FormSection
                  title="When and how?"
                  description="Choose your pickup window and vehicle requirements."
                >
                  <DatePicker
                    label="Pickup date"
                    value={form.pickupDate}
                    onChange={(date) => update("pickupDate", date)}
                    minimumDate={new Date()}
                  />

                  <View style={styles.row}>
                    <View style={{ flex: 1, marginRight: spacing[2] }}>
                      <Field label="Start time (HH:MM)">
                        <TextInput
                          value={form.pickupStartTime}
                          onChangeText={(v) => update("pickupStartTime", v)}
                          placeholder="08:00"
                          placeholderTextColor={colors.text.tertiary}
                          style={styles.input}
                        />
                      </Field>
                    </View>
                    <View style={{ flex: 1, marginLeft: spacing[2] }}>
                      <Field label="End time (HH:MM)">
                        <TextInput
                          value={form.pickupEndTime}
                          onChangeText={(v) => update("pickupEndTime", v)}
                          placeholder="16:00"
                          placeholderTextColor={colors.text.tertiary}
                          style={styles.input}
                        />
                      </Field>
                    </View>
                  </View>

                  <Field label="Vehicle type">
                    <ChipSelector
                      options={VEHICLE_OPTIONS}
                      value={form.vehicleType}
                      onChange={(v) => update("vehicleType", v)}
                    />
                  </Field>

                  <Field label="Minimum capacity (kg, optional)">
                    <TextInput
                      value={form.minCapacity}
                      onChangeText={(v) => update("minCapacity", v)}
                      placeholder="e.g. 5000"
                      placeholderTextColor={colors.text.tertiary}
                      keyboardType="numeric"
                      style={styles.input}
                    />
                  </Field>
                </FormSection>
              </FadeIn>
            )}

            {/* Step 4: Review */}
            {step === 4 && (
              <FadeIn>
                <FormSection title="Review your trip">
                  <ReviewRow label="Cargo" value={form.cargoDescription} />
                  <ReviewRow
                    label="Weight"
                    value={`${parseFloat(form.cargoWeight).toLocaleString()} kg`}
                  />
                  <ReviewRow
                    label="Declared value"
                    value={`NGN ${parseFloat(form.cargoValue).toLocaleString()}`}
                  />
                  {form.externalReference && (
                    <ReviewRow label="Your reference" value={form.externalReference} />
                  )}

                  <View style={styles.divider} />

                  <ReviewRow label="Pickup" value={form.pickupAddress} />
                  <ReviewRow label="Destination" value={form.destinationAddress} />

                  <View style={styles.divider} />

                  <ReviewRow
                    label="Pickup date"
                    value={
                      form.pickupDate
                        ? `${form.pickupDate.toLocaleDateString()} · ${form.pickupStartTime}–${form.pickupEndTime}`
                        : "—"
                    }
                  />
                  <ReviewRow
                    label="Vehicle"
                    value={
                      VEHICLE_OPTIONS.find((v) => v.value === form.vehicleType)?.label ??
                      form.vehicleType
                    }
                  />
                  {form.minCapacity && (
                    <ReviewRow
                      label="Min. capacity"
                      value={`${parseFloat(form.minCapacity).toLocaleString()} kg`}
                    />
                  )}
                </FormSection>

                <View style={styles.infoBox}>
                  <Text variant="caption" color={colors.text.secondary}>
                    Cargo insurance is automatically attached. The premium is
                    computed from the declared value and distance, and shown on
                    the trip detail after creation.
                  </Text>
                </View>
              </FadeIn>
            )}

            <View style={styles.navRow}>
              {step === 4 ? (
                <Button
                  label="Create trip"
                  onPress={submit}
                  loading={loading}
                  disabled={loading}
                  size="lg"
                />
              ) : (
                <Button
                  label={step === 3 ? "Review" : "Continue"}
                  onPress={nextStep}
                  size="lg"
                  icon={
                    step === 3 ? (
                      <Check size={18} color={colors.text.inverse} strokeWidth={2.5} />
                    ) : (
                      <ChevronRight size={18} color={colors.text.inverse} strokeWidth={2.5} />
                    )
                  }
                />
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Container>
    </Screen>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing[4] }}>
      <Text
        variant="label"
        color={colors.text.secondary}
        style={{ marginBottom: spacing[2] }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text variant="bodySmall" color={colors.text.tertiary}>
        {label}
      </Text>
      <Text
        variant="bodySmall"
        color={colors.text.primary}
        style={{ flex: 1, textAlign: "right", marginLeft: spacing[3], fontWeight: "500" }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBack: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  scrollContent: {
    padding: spacing[5],
    paddingBottom: spacing[8],
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.surface.raised,
  },
  row: { flexDirection: "row" },
  divider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginVertical: spacing[4],
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginBottom: spacing[4],
  },
  infoBox: {
    padding: spacing[4],
    backgroundColor: colors.brand.primaryMuted,
    borderRadius: radii.md,
    marginBottom: spacing[4],
  },
  hintBox: {
    padding: spacing[3],
    backgroundColor: colors.surface.sunken,
    borderRadius: radii.md,
    marginTop: spacing[2],
  },
  navRow: { marginTop: spacing[4] },
  reviewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing[2],
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6],
  },
  referenceCard: {
    marginTop: spacing[6],
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[6],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    ...elevation.subtle,
  },
});