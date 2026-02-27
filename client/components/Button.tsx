import React, { ReactNode } from "react";
import { StyleSheet, Pressable, ViewStyle, StyleProp, ActivityIndicator, GestureResponderEvent, Insets, Platform } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  WithSpringConfig,
} from "react-native-reanimated";

import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Spacing, Colors } from "@/constants/theme";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";

interface ButtonProps {
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<any>; // Added textStyle prop
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button";
  hitSlop?: Insets;
}

const springConfig: WithSpringConfig = {
  damping: 20,
  mass: 0.3,
  stiffness: 150,
  overshootClamping: true,
  energyThreshold: 0.001,
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  onPress,
  children,
  style,
  textStyle,
  disabled = false,
  loading = false,
  variant = "primary",
  fullWidth = false,
  accessibilityLabel,
  accessibilityRole = "button",
  hitSlop,
}: ButtonProps) {
  const { theme, isDark } = useTheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(0.97, springConfig);
    }
  };

  const handlePressOut = () => {
    if (!disabled && !loading) {
      scale.value = withSpring(1, springConfig);
    }
  };

  const getButtonStyle = () => {
    switch (variant) {
      case "primary":
        return {
          backgroundColor: Colors.primary.main,
          borderWidth: 0,
        };
      case "secondary":
        return {
          backgroundColor: Colors.secondary.main,
          borderWidth: 0,
        };
      case "outline":
        return {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: theme.border,
        };
      case "ghost":
        return {
          backgroundColor: "transparent",
          borderWidth: 0,
        };
      default:
        return {
          backgroundColor: Colors.primary.main,
          borderWidth: 0,
        };
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case "primary":
      case "secondary":
        return "#FFFFFF";
      case "outline":
      case "ghost":
        return theme.text;
      default:
        return "#FFFFFF";
    }
  };

  return (
    <AnimatedPressable
      onPress={disabled || loading ? undefined : onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop ?? { top: 8, bottom: 8, left: 8, right: 8 }}
      android_ripple={Platform.OS === "android" ? { color: "rgba(255,255,255,0.16)", borderless: false } : undefined}
      style={[
        styles.button,
        getButtonStyle(),
        {
          opacity: disabled ? 0.5 : 1,
          width: fullWidth ? "100%" : undefined,
        },
        style,
        animatedStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} size="small" />
      ) : (
        <ThemedText
          type="body"
          style={[styles.buttonText, { color: getTextColor() }, textStyle]}
        >
          {children}
        </ThemedText>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: Spacing.buttonHeight,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontWeight: "600",
  },
});
