import { useState } from "react";
import {
  View,
  TextInput,
  TextInputProps,
  StyleSheet,
  Pressable,
} from "react-native";
import { colors, spacing, radii, fontFamilies } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// Text input with label, focus state, error state, helper text,
// optional icon prefix/suffix, and multi-line support.
//
// Every input has: label above, optional helper below, optional error
// below (replaces helper). Focused state shows brand-green border.
// Error state shows danger border and error text.

export interface InputProps extends TextInputProps {
  label?: string;
  helper?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  multiline?: boolean;
  minHeight?: number;
}

export function Input({
  label,
  helper,
  error,
  prefix,
  suffix,
  multiline = false,
  minHeight,
  onFocus,
  onBlur,
  style,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

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

      <View
        style={[
          styles.inputWrap,
          multiline && { minHeight: minHeight ?? 100, alignItems: "flex-start" },
          focused && styles.inputWrapFocused,
          hasError && styles.inputWrapError,
        ]}
      >
        {prefix && <View style={styles.prefix}>{prefix}</View>}
        <TextInput
          {...rest}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            multiline && { textAlignVertical: "top", paddingTop: spacing[3] },
            style,
          ]}
          placeholderTextColor={colors.text.tertiary}
        />
        {suffix && <View style={styles.suffix}>{suffix}</View>}
      </View>

      {(helper || error) && (
        <Text
          variant="caption"
          color={hasError ? colors.status.danger.fg : colors.text.tertiary}
          style={{ marginTop: spacing[2] }}
        >
          {error ?? helper}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing[4],
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface.raised,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing[4],
  },
  inputWrapFocused: {
    borderColor: colors.brand.primary,
  },
  inputWrapError: {
    borderColor: colors.status.danger.fg,
  },
  input: {
    flex: 1,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
    color: colors.text.primary,
    paddingVertical: spacing[3],
  },
  prefix: {
    marginRight: spacing[2],
  },
  suffix: {
    marginLeft: spacing[2],
  },
});