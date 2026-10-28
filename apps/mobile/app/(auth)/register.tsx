import { useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { HttpError, api } from "../../src/lib/api/client";
import { colors, spacing, radii } from "@elbermarket/design-tokens";

// Registration screen.
//
// Collects: full name, phone, email. Phone and email are both required
// because the account is anchored to both — but for now, OTP delivery
// goes to email only. SMS delivery is built into the backend but not
// exposed until Termii's sender ID is verified.
//
// When SMS becomes available: add a channel picker here and pass its
// value into api.register({channel}).

type Channel = "sms" | "email";

// The active channel. Forced to "email" until SMS is verified. When
// flipping back, convert this to a useState channel picker.
const ACTIVE_CHANNEL: Channel = "email";

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setError(null);
    setLoading(true);

    try {
      await api.register({
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim(),
        email: email.trim(),
        channel: ACTIVE_CHANNEL,
      });

      // Navigate to /verify with the email as the target.
      router.push({
        pathname: "/verify",
        params: {
          target: email.trim(),
          channel: ACTIVE_CHANNEL,
          purpose: "register",
        },
      });
    } catch (err) {
      if (err instanceof HttpError) {
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    fullName.trim().length >= 2 &&
    phoneNumber.trim().length >= 10 &&
    email.trim().length >= 5 &&
    !loading;

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text variant="h1" color={colors.text.primary}>
            Create your{"\n"}account
          </Text>
          <Text
            variant="body"
            color={colors.text.secondary}
            style={{ marginTop: spacing[2] }}
          >
            A verified business account, in under a minute.
          </Text>

          <View style={styles.form}>
            <Field label="Full name">
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="e.g. Adaeze Okafor"
                placeholderTextColor={colors.text.tertiary}
                autoCapitalize="words"
                autoCorrect={false}
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Field label="Phone number">
              <TextInput
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="+234 801 234 5678"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="phone-pad"
                autoComplete="tel"
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Field label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                style={styles.input}
                editable={!loading}
              />
            </Field>

            <Text
              variant="caption"
              color={colors.text.tertiary}
              style={styles.hint}
            >
              We'll email you a 6-digit verification code.
            </Text>

            {error && (
              <View style={styles.errorBox}>
                <Text variant="bodySmall" color={colors.status.danger.fg}>
                  {error}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.footer}>
            <Button
              label="Send code"
              onPress={handleContinue}
              variant="primary"
              size="lg"
              loading={loading}
              disabled={!canSubmit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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

const styles = StyleSheet.create({
  content: {
    padding: spacing[6],
    paddingBottom: spacing[12],
  },
  form: {
    marginTop: spacing[8],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.surface.raised,
  },
  hint: {
    marginTop: spacing[2],
  },
  errorBox: {
    padding: spacing[3],
    backgroundColor: colors.status.danger.bg,
    borderRadius: radii.md,
    marginTop: spacing[2],
  },
  footer: {
    marginTop: spacing[6],
  },
});




















// import { useState } from "react";
// import {
//   View,
//   StyleSheet,
//   TextInput,
//   Pressable,
//   ScrollView,
//   KeyboardAvoidingView,
//   Platform,
// } from "react-native";
// import { useRouter } from "expo-router";
// import { Screen } from "../src/components/Screen";
// import { Text } from "../src/components/Text";
// import { Button } from "../src/components/Button";
// import { HttpError, api } from "../src/lib/api/client";
// import { colors, spacing, radii } from "@elbermarket/design-tokens";

// // Registration screen.
// //
// // Collects: full name, phone, email (required — used for OTP as an
// // alternative channel), and preferred OTP channel.
// //
// // On success, navigates to /verify with the target and channel as params.

// type Channel = "sms" | "email";

// export default function RegisterScreen() {
//   const router = useRouter();
//   const [fullName, setFullName] = useState("");
//   const [phoneNumber, setPhoneNumber] = useState("");
//   const [email, setEmail] = useState("");
//   // const [channel, setChannel] = useState<Channel>("email");
//   const CHANNEL: Channel = "email";
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);

//   async function handleContinue() {
//     setError(null);
//     setLoading(true);

//     try {
//       const result = await api.register({
//         full_name: fullName.trim(),
//         phone_number: phoneNumber.trim(),
//         email: email.trim(),
//         channel,
//       });

//       // Navigate to /verify with the target and channel.
//       router.push({
//         pathname: "/verify",
//         params: {
//           target: channel === "email" ? email.trim() : phoneNumber.trim(),
//           channel,
//           purpose: "register",
//         },
//       });
//     } catch (err) {
//       if (err instanceof HttpError) {
//         setError(err.message);
//       } else {
//         setError("Something went wrong. Please try again.");
//       }
//     } finally {
//       setLoading(false);
//     }
//   }

//   const canSubmit =
//     fullName.trim().length >= 2 &&
//     phoneNumber.trim().length >= 10 &&
//     email.trim().length >= 5 &&
//     !loading;

//   return (
//     <Screen padded={false}>
//       <KeyboardAvoidingView
//         style={{ flex: 1 }}
//         behavior={Platform.OS === "ios" ? "padding" : undefined}
//       >
//         <ScrollView
//           contentContainerStyle={styles.content}
//           keyboardShouldPersistTaps="handled"
//         >
//           <Text variant="h1" color={colors.text.primary}>
//             Create your{"\n"}account
//           </Text>
//           <Text
//             variant="body"
//             color={colors.text.secondary}
//             style={{ marginTop: spacing[2] }}
//           >
//             A verified business account, in under a minute.
//           </Text>

//           <View style={styles.form}>
//             <Field label="Full name">
//               <TextInput
//                 value={fullName}
//                 onChangeText={setFullName}
//                 placeholder="e.g. Adaeze Okafor"
//                 placeholderTextColor={colors.text.tertiary}
//                 autoCapitalize="words"
//                 autoCorrect={false}
//                 style={styles.input}
//                 editable={!loading}
//               />
//             </Field>

//             <Field label="Phone number">
//               <TextInput
//                 value={phoneNumber}
//                 onChangeText={setPhoneNumber}
//                 placeholder="+234 801 234 5678"
//                 placeholderTextColor={colors.text.tertiary}
//                 keyboardType="phone-pad"
//                 autoComplete="tel"
//                 style={styles.input}
//                 editable={!loading}
//               />
//             </Field>

//             <Field label="Email">
//               <TextInput
//                 value={email}
//                 onChangeText={setEmail}
//                 placeholder="you@example.com"
//                 placeholderTextColor={colors.text.tertiary}
//                 keyboardType="email-address"
//                 autoCapitalize="none"
//                 autoCorrect={false}
//                 autoComplete="email"
//                 style={styles.input}
//                 editable={!loading}
//               />
//             </Field>

//             {/* <Field label="How should we send your code?">
//               <View style={styles.channelRow}>
//                 <ChannelOption
//                   label="Email"
//                   selected={channel === "email"}
//                   onPress={() => setChannel("email")}
//                   disabled={loading}
//                 />
//                 <ChannelOption
//                   label="SMS"
//                   selected={channel === "sms"}
//                   onPress={() => setChannel("sms")}
//                   disabled={loading}
//                 />
//               </View>
//             </Field> */}

//             {error && (
//               <View style={styles.errorBox}>
//                 <Text variant="bodySmall" color={colors.status.danger.fg}>
//                   {error}
//                 </Text>
//               </View>
//             )}
//           </View>

//           <View style={styles.footer}>
//             <Button
//               label="Send code"
//               onPress={handleContinue}
//               variant="primary"
//               size="lg"
//               loading={loading}
//               disabled={!canSubmit}
//             />
//           </View>
//         </ScrollView>
//       </KeyboardAvoidingView>
//     </Screen>
//   );
// }

// function Field({ label, children }: { label: string; children: React.ReactNode }) {
//   return (
//     <View style={{ marginBottom: spacing[4] }}>
//       <Text
//         variant="label"
//         color={colors.text.secondary}
//         style={{ marginBottom: spacing[2] }}
//       >
//         {label}
//       </Text>
//       {children}
//     </View>
//   );
// }

// function ChannelOption({
//   label,
//   selected,
//   onPress,
//   disabled,
// }: {
//   label: string;
//   selected: boolean;
//   onPress: () => void;
//   disabled: boolean;
// }) {
//   return (
//     <Pressable
//       onPress={onPress}
//       disabled={disabled}
//       style={[
//         styles.channelButton,
//         selected && styles.channelButtonSelected,
//       ]}
//     >
//       <Text
//         variant="label"
//         color={selected ? colors.text.inverse : colors.text.primary}
//       >
//         {label}
//       </Text>
//     </Pressable>
//   );
// }

// const styles = StyleSheet.create({
//   content: {
//     padding: spacing[6],
//     paddingBottom: spacing[12],
//   },
//   form: {
//     marginTop: spacing[8],
//   },
//   input: {
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     borderRadius: radii.md,
//     paddingHorizontal: spacing[4],
//     paddingVertical: spacing[3],
//     fontSize: 16,
//     color: colors.text.primary,
//     backgroundColor: colors.surface.raised,
//   },
//   channelRow: {
//     flexDirection: "row",
//     gap: spacing[2],
//   },
//   channelButton: {
//     flex: 1,
//     paddingVertical: spacing[3],
//     borderRadius: radii.md,
//     borderWidth: 1,
//     borderColor: colors.border.subtle,
//     alignItems: "center",
//     backgroundColor: colors.surface.raised,
//   },
//   channelButtonSelected: {
//     backgroundColor: colors.brand.primary,
//     borderColor: colors.brand.primary,
//   },
//   errorBox: {
//     padding: spacing[3],
//     backgroundColor: colors.status.danger.bg,
//     borderRadius: radii.md,
//     marginTop: spacing[2],
//   },
//   footer: {
//     marginTop: spacing[6],
//   },
// });