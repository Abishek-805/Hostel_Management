import { StyleSheet, ViewStyle, TextStyle } from "react-native";
import { BorderRadius, Shadows, Spacing, Typography } from "@/constants/theme";

export const DesignSystem = {
  spacing: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: BorderRadius.xs,
    md: BorderRadius.sm,
    lg: BorderRadius.md,
    xl: BorderRadius.lg,
    pill: BorderRadius.full,
  },
  shadows: {
    card: Shadows.card,
    elevated: Shadows.md,
    modal: Shadows.modal,
    fab: Shadows.fab,
  },
  icon: {
    xs: 14,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 28,
  },
  button: {
    height: Spacing.buttonHeight,
    minTouch: 44,
  },
  layout: {
    screenPaddingHorizontal: Spacing.lg,
    screenPaddingTop: Spacing.lg,
    sectionGap: Spacing.xl,
    cardGap: Spacing.md,
  },
  typography: {
    h1: Typography.h1,
    h2: Typography.h2,
    body: Typography.body,
    caption: Typography.caption,
  } as {
    h1: TextStyle;
    h2: TextStyle;
    body: TextStyle;
    caption: TextStyle;
  },
};

export const DSStyles = StyleSheet.create({
  screenContainer: {
    paddingHorizontal: DesignSystem.layout.screenPaddingHorizontal,
    paddingTop: DesignSystem.layout.screenPaddingTop,
  } as ViewStyle,
  card: {
    borderRadius: DesignSystem.radius.lg,
    ...DesignSystem.shadows.card,
  } as ViewStyle,
  sectionTitle: {
    marginBottom: DesignSystem.spacing.md,
  } as ViewStyle,
});
