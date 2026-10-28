import { ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import { colors, spacing } from "@elbermarket/design-tokens";
import { Text } from "./Text";

interface FormSectionProps {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <View style={styles.container}>
      {title && (
        <Text variant="h3" style={{ marginBottom: spacing[1] }}>
          {title}
        </Text>
      )}
      {description && (
        <Text
          variant="bodySmall"
          color={colors.text.secondary}
          style={{ marginBottom: spacing[4] }}
        >
          {description}
        </Text>
      )}
      <View style={{ marginTop: title && !description ? spacing[4] : 0 }}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing[6] },
});