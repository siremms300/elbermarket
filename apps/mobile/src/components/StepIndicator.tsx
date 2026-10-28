import { View, StyleSheet } from "react-native";
import { colors, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  label?: string;
}

export function StepIndicator({ currentStep, totalSteps, label }: StepIndicatorProps) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="overline" color={colors.text.tertiary}>
          Step {currentStep} of {totalSteps}
        </Text>
        {label && (
          <Text variant="label" color={colors.text.secondary}>
            {label}
          </Text>
        )}
      </View>
      <View style={styles.barTrack}>
        {Array.from({ length: totalSteps }).map((_, i) => {
          const isComplete = i < currentStep;
          return (
            <View
              key={i}
              style={[
                styles.barSegment,
                {
                  backgroundColor: isComplete
                    ? colors.brand.primary
                    : colors.border.subtle,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing[6] },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[2],
  },
  barTrack: { flexDirection: "row", gap: spacing[1] },
  barSegment: { flex: 1, height: 4, borderRadius: 2 },
});