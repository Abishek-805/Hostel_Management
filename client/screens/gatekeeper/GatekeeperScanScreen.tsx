import React, { useCallback, useState } from "react";
import { Alert, LayoutAnimation, ScrollView, StyleSheet, TextInput, UIManager, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { gateApiRequest } from "@/lib/gate-api";
import { BorderRadius, Colors, Shadows, Spacing } from "@/constants/theme";

type ScanResponse = {
  gatePass?: {
    reason?: string;
    expectedReturnTime?: string;
  };
};

async function submitScan(endpoint: string, payload: { token: string; latitude?: number; longitude?: number }) {
  const response = await gateApiRequest("POST", endpoint, payload);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Scan failed");
  }
  return data as ScanResponse;
}

export default function GatekeeperScanScreen() {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const [token, setToken] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [scanMode, setScanMode] = useState<"campus" | "hostel">("campus");
  const [lastScanState, setLastScanState] = useState<"IDLE" | "SUCCESS" | "ERROR">("IDLE");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const runScan = useCallback(async (mode: "campus" | "hostel") => {
    if (!token.trim()) {
      Alert.alert("Validation", "Token is required");
      return;
    }

    setLoading(true);
    try {
      const payload: { token: string; latitude?: number; longitude?: number } = {
        token: token.trim(),
      };
      if (latitude.trim()) payload.latitude = Number(latitude.trim());
      if (longitude.trim()) payload.longitude = Number(longitude.trim());

      const endpoint = mode === "campus" ? "/gate/scan/campus-entry" : "/gate/scan/hostel-entry";
      const result = await submitScan(endpoint, payload);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setScanResult(result);
      setToken("");
      setLastScanState("SUCCESS");
      setErrorMessage(null);
      Alert.alert("Success", mode === "campus" ? "Campus entry confirmed" : "Hostel entry confirmed");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setLastScanState("ERROR");
      setErrorMessage(message);
      setScanResult(null);
      Alert.alert("Scan Failed", message);
    } finally {
      setLoading(false);
    }
  }, [latitude, longitude, token]);

  const handleConfirmScan = useCallback(() => {
    void runScan(scanMode);
  }, [runScan, scanMode]);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="h2" style={styles.screenTitle}>Gate Verification Console</ThemedText>

        <View style={styles.toggleWrap}>
          <PressableMode mode="campus" activeMode={scanMode} onPress={() => setScanMode("campus")} />
          <PressableMode mode="hostel" activeMode={scanMode} onPress={() => setScanMode("hostel")} />
        </View>

        <View style={styles.tokenArea}>
          <ThemedText type="body" style={styles.label}>Paste Signed QR Token</ThemedText>
          <ThemedText type="caption" secondary>
            Paste the signed token copied from the student QR, then verify by selected mode.
          </ThemedText>
          <TextInput
            style={styles.scanInput}
            placeholder="Signed token"
            value={token}
            onChangeText={setToken}
            multiline
          />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Latitude (required for hostel)"
          value={latitude}
          onChangeText={setLatitude}
        />
        <TextInput
          style={styles.input}
          placeholder="Longitude (required for hostel)"
          value={longitude}
          onChangeText={setLongitude}
        />

        <View style={styles.actions}>
          <Button onPress={handleConfirmScan} loading={loading} fullWidth accessibilityRole="button">
            Verify {scanMode === "campus" ? "Campus" : "Hostel"} Entry
          </Button>
        </View>

        {lastScanState === "SUCCESS" ? (
          <View style={styles.successPanel} accessible accessibilityLabel="Verification successful">
            <View style={styles.panelHeader}>
              <Feather name="check-circle" size={20} color={Colors.status.success} />
              <ThemedText type="body" style={styles.successTitle}>✔ Verified</ThemedText>
            </View>
            <ThemedText type="caption">Student: Token owner verified</ThemedText>
            <ThemedText type="caption">Pass reason: {scanResult?.gatePass?.reason || "-"}</ThemedText>
            <ThemedText type="caption">
              Return time: {scanResult?.gatePass?.expectedReturnTime ? new Date(scanResult.gatePass.expectedReturnTime).toLocaleString() : "-"}
            </ThemedText>
          </View>
        ) : null}

        {lastScanState === "ERROR" ? (
          <View style={styles.errorPanel} accessible accessibilityLabel="Verification failed">
            <View style={styles.panelHeader}>
              <Feather name="x-circle" size={20} color={Colors.status.error} />
              <ThemedText type="body" style={styles.errorTitle}>✖ Invalid / Expired / Wrong Stage</ThemedText>
            </View>
            <ThemedText type="caption">{errorMessage || "Scan could not be verified."}</ThemedText>
          </View>
        ) : null}
      </ScrollView>

      <LoadingOverlay visible={loading} message="Verifying scan..." icon="shield" />
    </ThemedView>
  );
}

function PressableMode({
  mode,
  activeMode,
  onPress,
}: {
  mode: "campus" | "hostel";
  activeMode: "campus" | "hostel";
  onPress: () => void;
}) {
  const active = mode === activeMode;
  return (
    <View style={styles.modeCell}>
      <Button
        onPress={onPress}
        variant={active ? "primary" : "outline"}
        fullWidth
        style={styles.modeButton}
        accessibilityRole="button"
        accessibilityLabel={`Set ${mode} mode`}
      >
        {mode === "campus" ? "Campus" : "Hostel"}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  content: {
    gap: Spacing.sm,
    flexGrow: 1,
  },
  screenTitle: {
    fontWeight: "700",
  },
  toggleWrap: {
    flexDirection: "row",
    gap: Spacing.sm,
    backgroundColor: Colors.light.backgroundSecondary,
    borderRadius: BorderRadius.full,
    padding: Spacing.xs,
  },
  modeCell: {
    flex: 1,
  },
  modeButton: {
    borderRadius: BorderRadius.full,
    minHeight: Spacing.buttonHeight,
  },
  tokenArea: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    backgroundColor: Colors.light.backgroundSecondary,
    gap: Spacing.xs,
  },
  label: {
    fontWeight: "600",
  },
  scanInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.sm,
    padding: 12,
    minHeight: 160,
    backgroundColor: Colors.light.backgroundRoot,
    textAlignVertical: "top",
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.sm,
    padding: 12,
    minHeight: Spacing.buttonHeight,
    backgroundColor: Colors.light.backgroundRoot,
  },
  actions: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  successPanel: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.status.success,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  errorPanel: {
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    backgroundColor: Colors.light.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.status.error,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  successTitle: {
    color: Colors.status.success,
    fontWeight: "700",
  },
  errorTitle: {
    color: Colors.status.error,
    fontWeight: "700",
  },
});
