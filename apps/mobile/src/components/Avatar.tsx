import { View, StyleSheet, Image } from "react-native";
import { colors, radii } from "@elbermarket/design-tokens";
import { Text } from "./Text";

// Avatar for users. Shows initials in a brand-tinted circle, or an image
// if provided.

export interface AvatarProps {
  name?: string;
  imageUrl?: string;
  size?: "sm" | "md" | "lg";
}

export function Avatar({ name, imageUrl, size = "md" }: AvatarProps) {
  const dims = { sm: 32, md: 44, lg: 64 } as const;
  const dim = dims[size];
  const fontSize = { sm: 12, md: 16, lg: 22 }[size];

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.base, { width: dim, height: dim, borderRadius: dim / 2 }]}
      />
    );
  }

  const initials = (name || "")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <View
      style={[
        styles.base,
        styles.fallback,
        { width: dim, height: dim, borderRadius: dim / 2 },
      ]}
    >
      <Text
        color={colors.brand.primary}
        style={{ fontSize, fontWeight: "700" }}
      >
        {initials || "?"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
  fallback: {
    backgroundColor: colors.brand.primaryMuted,
    alignItems: "center",
    justifyContent: "center",
  },
});