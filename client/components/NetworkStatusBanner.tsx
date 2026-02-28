import React from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedText } from "@/components/ThemedText";
import { Colors, Spacing } from "@/constants/theme";

interface NetworkStatusBannerProps {
  isOffline: boolean;
  isBackendDisconnected?: boolean;
}

export function NetworkStatusBanner({ isOffline, isBackendDisconnected = false }: NetworkStatusBannerProps) {
  if (!isOffline && !isBackendDisconnected) return null;

  const message = isOffline
    ? "You are offline. Changes may not sync until connection returns."
    : "Backend not connected";

  return (
    <View style={styles.container}>
      <Feather name={isOffline ? "wifi-off" : "alert-triangle"} size={14} color="#FFF" />
      <ThemedText type="caption" style={styles.text}>
        {message}
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
