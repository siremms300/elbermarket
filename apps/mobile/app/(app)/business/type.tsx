import { useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { api } from "@/lib/api/client";
import { colors, spacing, radii } from "@elbermarket/design-tokens";
import type { OrganisationType } from "@/lib/api/types";

interface TypeOption {
  value: OrganisationType;
  label: string;
  description: string;
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    value: "farmer",
    label: "Farmer",
    description: "I produce and sell agricultural commodities.",
  },
  {
    value: "trader",
    label: "Trader",
    description: "I buy and sell commodities across markets.",
  },
  {
    value: "buyer",
    label: "Buyer",
    description: "I source commodities for my business or institution.",
  },
  {
    value: "fleet_owner",
    label: "Fleet Owner",
    description: "I own vehicles for transport and logistics.",
  },
  {
    value: "warehouse",
    label: "Warehouse",
    description: "I store, handle and manage stock for others.",
  },
  {
    value: "inspector",
    label: "Inspector",
    description: "I assess commodity quality and verify batches.",
  },
];

export default function BusinessTypeScreen() {
  const router = useRouter();
  const [availableTypes, setAvailableTypes] = useState<OrganisationType[]>([]);

  useEffect(() => {
    api
      .listOrganisationTypes()
      .then((r) => setAvailableTypes(r.types))
      .catch(() => {
        setAvailableTypes(TYPE_OPTIONS.map((t) => t.value));
      });
  }, []);

  function handleSelect(type: OrganisationType) {
    router.push({
      pathname: "/(app)/business/profile",
      params: { type },
    });
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h1" color={colors.text.primary}>
          What kind of{"\n"}business are you?
        </Text>
        <Text
          variant="body"
          color={colors.text.secondary}
          style={{ marginTop: spacing[2], marginBottom: spacing[8] }}
        >
          Choose the role that best describes your business. You can create
          more organisations later.
        </Text>

        <View style={styles.list}>
          {TYPE_OPTIONS.map((option) => {
            const isAvailable =
              availableTypes.length === 0 ||
              availableTypes.includes(option.value);
            return (
              <Pressable
                key={option.value}
                onPress={() => isAvailable && handleSelect(option.value)}
                disabled={!isAvailable}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.cardPressed,
                  !isAvailable && styles.cardDisabled,
                ]}
              >
                <Text variant="h3" color={colors.text.primary}>
                  {option.label}
                </Text>
                <Text
                  variant="bodySmall"
                  color={colors.text.secondary}
                  style={{ marginTop: spacing[1] }}
                >
                  {option.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing[6],
    paddingBottom: spacing[12],
  },
  list: {
    gap: spacing[3],
  },
  card: {
    padding: spacing[5],
    backgroundColor: colors.surface.raised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  cardPressed: {
    backgroundColor: colors.surface.sunken,
  },
  cardDisabled: {
    opacity: 0.5,
  },
});