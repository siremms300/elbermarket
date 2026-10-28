import { useRef } from "react";
import {
  Animated,
  Pressable as RNPressable,
  PressableProps as RNPressableProps,
  PressableStateCallbackType,
  StyleProp,
  ViewStyle,
  Easing,
} from "react-native";

interface PressableProps extends Omit<RNPressableProps, "style" | "children"> {
  children:
    | React.ReactNode
    | ((state: PressableStateCallbackType) => React.ReactNode);
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
}

export function Pressable({
  children,
  onPressIn,
  onPressOut,
  style,
  scaleTo = 0.97,
  ...rest
}: PressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <RNPressable
      onPressIn={(e) => {
        Animated.timing(scale, {
          toValue: scaleTo,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        Animated.timing(scale, {
          toValue: 1,
          duration: 150,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
        onPressOut?.(e);
      }}
      {...rest}
    >
      {(state) => (
        <Animated.View style={[style, { transform: [{ scale }] }]}>
          {typeof children === "function" ? children(state) : children}
        </Animated.View>
      )}
    </RNPressable>
  );
}














































// import { useRef } from "react";
// import {
//   Animated,
//   Pressable as RNPressable,
//   PressableProps as RNPressableProps,
//   PressableStateCallbackType,
//   ViewStyle,
//   Easing,
// } from "react-native";

// import type { StyleProp, ViewStyle } from "react-native";
// // Pressable — press feedback done right.
// //
// // Every interactive surface should feel like a physical object. When you
// // press, it scales to 0.97. When you release, it springs back. This is
// // what makes the interface feel "alive" — every tap has a physical
// // response.
// //
// // Wraps RN's Pressable so the onPress API stays identical, but adds the
// // scale animation. The `children` prop supports the same callback form
// // as RN's Pressable: (state) => ReactNode, where state.pressed tells you
// // the current state.

// // interface PressableProps extends Omit<RNPressableProps, "style" | "children"> {
// //   children:
// //     | React.ReactNode
// //     | ((state: PressableStateCallbackType) => React.ReactNode);
// //   style?: ViewStyle | ViewStyle[];
// //   scaleTo?: number;
// // }





// interface PressableProps extends Omit<RNPressableProps, "style" | "children"> {
//   children:
//     | React.ReactNode
//     | ((state: PressableStateCallbackType) => React.ReactNode);
//   style?: StyleProp<ViewStyle>;
//   scaleTo?: number;
// }




// export function Pressable({
//   children,
//   onPressIn,
//   onPressOut,
//   style,
//   scaleTo = 0.97,
//   ...rest
// }: PressableProps) {
//   const scale = useRef(new Animated.Value(1)).current;

//   return (
//     <RNPressable
//       onPressIn={(e) => {
//         Animated.timing(scale, {
//           toValue: scaleTo,
//           duration: 100,
//           easing: Easing.out(Easing.cubic),
//           useNativeDriver: true,
//         }).start();
//         onPressIn?.(e);
//       }}
//       onPressOut={(e) => {
//         Animated.timing(scale, {
//           toValue: 1,
//           duration: 150,
//           easing: Easing.out(Easing.cubic),
//           useNativeDriver: true,
//         }).start();
//         onPressOut?.(e);
//       }}
//       {...rest}
//     >
//       {(state) => (
//         <Animated.View
//           style={[
//             style,
//             { transform: [{ scale }] },
//           ]}
//         >
//           {typeof children === "function" ? children(state) : children}
//         </Animated.View>
//       )}
//     </RNPressable>
//   );
// }