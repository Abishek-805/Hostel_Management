import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing } from "@/constants/theme";

interface NetworkStatusBannerProps {
  isOffline: boolean;
}

export function NetworkStatusBanner({ isOffline }: NetworkStatusBannerProps) {
  if (!isOffline) return null;

  return (
    <View style={styles.container}>
      <Feather name="wifi-off" size={14} color="#FFF" />
      <ThemedText type="caption" style={styles.text}>
        You are offline. Changes may not sync until connection returns.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: Colors.status.error,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  text: {
    color: "#FFF",
    fontWeight: "700",
  },
});
