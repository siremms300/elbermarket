import { useState } from "react";
import { View, StyleSheet, Platform, Pressable as RNPressable } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// DatePicker — a button that opens a native date picker.
//
// On Android: shows the native calendar dialog.
// On iOS: shows the native wheel selector.
//
// Used for pickup date and similar date-only inputs.

interface DatePickerProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  label?: string;
}

export function DatePicker({ value, onChange, minimumDate, label }: DatePickerProps) {
  const [showPicker, setShowPicker] = useState(false);

  const displayValue = value
    ? value.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Select date";

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    // On Android, always close the picker after interaction (whether
    // cancelled or selected). On iOS, keep it open until user taps outside.
    if (Platform.OS === "android") {
      setShowPicker(false);
    }
    if (event.type === "set" && selectedDate) {
      onChange(selectedDate);
    }
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text
          variant="label"
          color={colors.text.secondary}
          style={{ marginBottom: spacing[2] }}
        >
          {label}
        </Text>
      )}
      <RNPressable
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Calendar size={18} color={colors.text.tertiary} strokeWidth={2} />
        <Text
          variant="body"
          color={value ? colors.text.primary : colors.text.tertiary}
          style={{ marginLeft: spacing[2], flex: 1 }}
        >
          {displayValue}
        </Text>
      </RNPressable>

      {showPicker && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleChange}
          minimumDate={minimumDate ?? new Date()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing[4] },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
  },
  buttonPressed: {
    backgroundColor: colors.surface.sunken,
  },
});