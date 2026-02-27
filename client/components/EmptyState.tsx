import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
}

export function EmptyState({ title, subtitle, icon = "inbox" }: EmptyStateProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}> 
      <Feather name={icon} size={28} color={theme.textSecondary} />
      <ThemedText type="body" style={styles.title}>{title}</ThemedText>
      {subtitle ? <ThemedText type="caption" secondary style={styles.subtitle}>{subtitle}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    gap: Spacing.sm,
  },
  title: {
    textAlign: "center",
    fontWeight: "600",
  },
  subtitle: {
    textAlign: "center",
    opacity: 0.8,
  },
});
