import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Please try again.",
  onRetry,
}: ErrorStateProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundSecondary }]}> 
      <Feather name="alert-circle" size={28} color={Colors.status.error} />
      <ThemedText type="body" style={styles.title}>{title}</ThemedText>
      <ThemedText type="caption" secondary style={styles.message}>{message}</ThemedText>
      {onRetry ? (
        <Button onPress={onRetry} fullWidth>
          Retry
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  title: {
    textAlign: "center",
    fontWeight: "700",
  },
  message: {
    textAlign: "center",
    marginBottom: Spacing.md,
  },
});
