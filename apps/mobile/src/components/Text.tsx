import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { useFonts } from "expo-font";
import {
  colors,
  textVariants,
  type TextVariant,
} from "@elbermarket/design-tokens";

// Font family names as registered in _layout.tsx via useFonts.
const weightToFamily: Record<string, string> = {
  "400": "InterRegular",
  "500": "InterMedium",
  "600": "InterSemiBold",
  "700": "InterBold",
};

// System font fallbacks per weight. Used when fonts aren't loaded yet so
// Text components can render safely before the font loading completes.
const weightToFallback: Record<string, string | undefined> = {
  "400": undefined, // system default
  "500": undefined,
  "600": undefined,
  "700": undefined,
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
}

export function Text({
  variant = "body",
  color = colors.text.primary,
  style,
  children,
  ...rest
}: TextProps) {
  // Check if fonts are loaded via the same useFonts hook. This is cheap
  // (it just reads a global context) and lets us fall back gracefully
  // if some component renders before _layout.tsx finished loading fonts.
  const [fontsLoaded] = useFonts({});
  const v = textVariants[variant];
  const family = fontsLoaded ? weightToFamily[v.fontWeight] : undefined;

  return (
    <RNText
      style={[
        {
          // If fonts aren't loaded yet, leave fontFamily unset so RN uses
          // the system default. Once loaded, use the correct Inter family.
          ...(family ? { fontFamily: family } : {}),
          // fontWeight is only applied when using system font fallback —
          // custom fonts express weight through the family name itself.
          ...(!family && v.fontWeight
            ? { fontWeight: v.fontWeight as any }
            : {}),
          fontSize: v.fontSize,
          lineHeight: v.lineHeight,
          letterSpacing: v.letterSpacing,
          color,
        },
        "textTransform" in v ? { textTransform: v.textTransform } : null,
        "fontVariant" in v ? { fontVariant: [...v.fontVariant] } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}






















































































// import { Text as RNText, TextProps as RNTextProps } from "react-native";
// import {
//   colors,
//   textVariants,
//   type TextVariant,
// } from "@elbermarket/design-tokens";

// // React Native does not support fontWeight on custom fonts. Each weight is
// // a separate registered family name. This map translates our abstract
// // fontWeight token ("400", "500", "600", "700") to the actual loaded family.
// const weightToFamily: Record<string, string> = {
//   "400": "InterRegular",
//   "500": "InterMedium",
//   "600": "InterSemiBold",
//   "700": "InterBold",
// };

// export interface TextProps extends RNTextProps {
//   variant?: TextVariant;
//   color?: string;
// }

// export function Text({
//   variant = "body",
//   color = colors.text.primary,
//   style,
//   children,
//   ...rest
// }: TextProps) {
//   const v = textVariants[variant];
//   const family = weightToFamily[v.fontWeight] ?? "InterRegular";

//   return (
//     <RNText
//       style={[
//         {
//           fontFamily: family,
//           fontSize: v.fontSize,
//           lineHeight: v.lineHeight,
//           letterSpacing: v.letterSpacing,
//           color,
//         },
//         "textTransform" in v ? { textTransform: v.textTransform } : null,
//         "fontVariant" in v ? { fontVariant: [...v.fontVariant] } : null,
//         style,
//       ]}
//       {...rest}
//     >
//       {children}
//     </RNText>
//   );
// }