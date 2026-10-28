import { View, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import { Text } from "./Text";
import { Pressable } from "./Pressable";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface ChipSelectorProps<T extends string> {
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

export function ChipSelector<T extends string>({
  options,
  value,
  onChange,
}: ChipSelectorProps<T>) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, isActive && styles.chipActive]}
          >
            {option.icon && <View style={styles.iconWrap}>{option.icon}</View>}
            <Text
              variant="label"
              color={isActive ? colors.text.inverse : colors.text.primary}
              style={{ fontWeight: isActive ? "600" : "500" }}
            >
              {option.label}
            </Text>
            {isActive && (
              <View style={styles.checkWrap}>
                <Check size={14} color={colors.text.inverse} strokeWidth={3} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radii.md,
    backgroundColor: colors.surface.raised,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
  },
  chipActive: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  iconWrap: { marginRight: spacing[2] },
  checkWrap: { marginLeft: spacing[2] },
});