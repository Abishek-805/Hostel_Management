import React, { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useAuth } from "@/contexts/AuthContext";
import { BorderRadius, Colors, Shadows, Spacing } from "@/constants/theme";

export default function GatekeeperProfileScreen() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
    } catch (error) {
      Alert.alert("Logout Failed", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="h2" style={styles.screenTitle}>Gatekeeper Profile</ThemedText>

      <View style={styles.card}>
        <View style={styles.row}>
          <Feather name="user" size={18} color={Colors.primary.main} />
          <ThemedText type="body">{user?.name || "-"}</ThemedText>
        </View>
        <View style={styles.metaRow}>
          <ThemedText type="caption" secondary>Role</ThemedText>
          <ThemedText type="caption">{user?.role || "-"}</ThemedText>
        </View>
        <View style={styles.metaRow}>
          <ThemedText type="caption" secondary>ID</ThemedText>
          <ThemedText type="caption">{user?.registerId || "-"}</ThemedText>
        </View>
        <View style={styles.metaRow}>
          <ThemedText type="caption" secondary>Gate Number</ThemedText>
          <ThemedText type="caption">{user?.gateNumber || "-"}</ThemedText>
        </View>
      </View>

      <Button
        onPress={handleLogout}
        fullWidth
        variant="outline"
        style={{ borderColor: Colors.status.error }}
        textStyle={{ color: Colors.status.error }}
        accessibilityRole="button"
        accessibilityLabel="Logout"
      >
        Logout
      </Button>

      <LoadingOverlay visible={loggingOut} message="Logging out..." icon="log-out" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  screenTitle: {
    fontWeight: "700",
  },
  card: {
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.light.backgroundRoot,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
});
