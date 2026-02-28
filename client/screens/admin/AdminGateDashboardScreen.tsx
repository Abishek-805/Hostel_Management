import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, FlatList, LayoutAnimation, Modal, Pressable, StyleSheet, TextInput, UIManager, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useModalFocus } from "@/hooks/useModalFocus";
import { BorderRadius, Colors, Shadows, Spacing } from "@/constants/theme";
import { gateApiRequest } from "@/lib/gate-api";

type SegmentKey = "pending" | "late" | "logs";

type PendingPass = {
  gatePassId: string;
  reason: string;
  destination: string;
  expectedReturnTime: string;
  status: string;
  userId: {
    _id: string;
    name: string;
    registerId: string;
    hostelBlock?: string;
    roomNumber?: string;
  };
};

type LatePass = {
  gatePassId: string;
  status: string;
  reason?: string;
  expectedReturnTime?: string;
  userId: {
    _id: string;
    name: string;
    registerId: string;
    hostelBlock?: string;
    roomNumber?: string;
  };
};

type GateLog = {
  _id: string;
  type: string;
  gatePassId: string;
  timestamp: string;
  userId?: {
    name?: string;
    registerId?: string;
  };
};

const SEGMENTS: Array<{ key: SegmentKey; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "late", label: "Late" },
  { key: "logs", label: "Logs" },
];

const LOG_FILTERS = ["ALL", "EXIT", "CAMPUS_ENTRY", "HOSTEL_ENTRY", "SYSTEM_ACTION"] as const;
type LogFilter = (typeof LOG_FILTERS)[number];

function getStatusChip(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "PENDING") return { bg: Colors.status.warning, fg: "#FFFFFF", text: "PENDING" };
  if (normalized === "APPROVED") return { bg: Colors.status.info, fg: "#FFFFFF", text: "APPROVED" };
  if (normalized === "LATE") return { bg: Colors.status.error, fg: "#FFFFFF", text: "LATE" };
  if (normalized === "COMPLETED") return { bg: Colors.status.success, fg: "#FFFFFF", text: "COMPLETED" };
  if (normalized === "REJECTED") return { bg: Colors.light.backgroundTertiary, fg: Colors.light.textSecondary, text: "REJECTED" };
  return { bg: Colors.light.backgroundSecondary, fg: Colors.light.textSecondary, text: normalized };
}

export default function AdminGateDashboardScreen() {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const [activeSegment, setActiveSegment] = useState<SegmentKey>("pending");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pendingPasses, setPendingPasses] = useState<PendingPass[]>([]);
  const [latePasses, setLatePasses] = useState<LatePass[]>([]);
  const [outsideCount, setOutsideCount] = useState(0);
  const [logs, setLogs] = useState<GateLog[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [overrideId, setOverrideId] = useState("");
  const [logFilter, setLogFilter] = useState<LogFilter>("ALL");
  const [showLogFilterModal, setShowLogFilterModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const confirmModalRef = useRef<View>(null);
  const logFilterModalRef = useRef<View>(null);
  useModalFocus(confirmModalRef, Boolean(confirmDialog));
  useModalFocus(logFilterModalRef, showLogFilterModal);

  const loadGateData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [pendingResponse, lateResponse, logsResponse, outsideResponse] = await Promise.all([
        gateApiRequest("GET", "/gate/passes/pending"),
        gateApiRequest("GET", "/gate/late"),
        gateApiRequest("GET", "/gate/logs?limit=200"),
        gateApiRequest("GET", "/gate/outside"),
      ]);

      const pendingData = await pendingResponse.json();
      const lateData = await lateResponse.json();
      const logsData = await logsResponse.json();
      const outsideData = await outsideResponse.json();

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPendingPasses(pendingData.passes || []);
      setLatePasses(lateData.passes || []);
      setLogs(logsData.logs || []);
      setOutsideCount((outsideData.students || []).length);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load gate dashboard";
      setErrorMessage(message);
      Alert.alert("Gate", message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadGateData();
    }, [loadGateData])
  );

  const approve = async (gatePassId: string) => {
    try {
      await gateApiRequest("POST", `/gate/passes/${gatePassId}/approve`, {});
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      void loadGateData();
    } catch (error) {
      Alert.alert("Gate", error instanceof Error ? error.message : "Approval failed");
    }
  };

  const reject = async (gatePassId: string) => {
    try {
      const rejectionReason = reasons[gatePassId] || "Rejected by admin";
      await gateApiRequest("POST", `/gate/passes/${gatePassId}/reject`, { rejectionReason });
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      void loadGateData();
    } catch (error) {
      Alert.alert("Gate", error instanceof Error ? error.message : "Rejection failed");
    }
  };

  const unlock = async (userId: string) => {
    try {
      await gateApiRequest("POST", `/gate/unlock/${userId}`, {});
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Alert.alert("Success", "Attendance unlocked");
      void loadGateData();
    } catch (error) {
      Alert.alert("Gate", error instanceof Error ? error.message : "Unlock failed");
    }
  };

  const overrideEntry = async () => {
    if (!overrideId.trim()) {
      Alert.alert("Validation", "Gate pass ID is required");
      return;
    }

    try {
      await gateApiRequest("POST", `/gate/passes/${overrideId.trim()}/override-hostel-entry`, {});
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Alert.alert("Success", "Manual hostel entry completed");
      setOverrideId("");
      void loadGateData();
    } catch (error) {
      Alert.alert("Gate", error instanceof Error ? error.message : "Override failed");
    }
  };

  const askConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmDialog({ title, message, onConfirm });
  };

  const pendingKeyExtractor = useCallback((item: PendingPass) => item.gatePassId, []);
  const lateKeyExtractor = useCallback((item: LatePass) => item.gatePassId, []);
  const logsKeyExtractor = useCallback((item: GateLog) => item._id, []);
  const filteredLogs = useMemo(
    () => (logFilter === "ALL" ? logs : logs.filter((entry) => entry.type === logFilter)),
    [logFilter, logs]
  );

  const renderPendingItem = useCallback(
    ({ item }: { item: PendingPass }) => {
      const chip = getStatusChip(item.status || "PENDING");
      return (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <ThemedText type="body" style={styles.cardTitle}>{item.userId?.name}</ThemedText>
            <View style={[styles.statusChip, { backgroundColor: chip.bg }]} accessible accessibilityLabel={`Pass status ${chip.text}`}>
              <ThemedText type="caption" style={[styles.badgeText, { color: chip.fg }]}>{chip.text}</ThemedText>
            </View>
          </View>

          <View style={styles.metaRow}>
            <ThemedText type="caption" secondary>Room / Block</ThemedText>
            <ThemedText type="caption">{item.userId?.roomNumber || "-"} / {item.userId?.hostelBlock || "-"}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText type="caption" secondary>Reason</ThemedText>
            <ThemedText type="caption">{item.reason}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText type="caption" secondary>Expected Return</ThemedText>
            <ThemedText type="caption">{new Date(item.expectedReturnTime).toLocaleString()}</ThemedText>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Rejection reason"
            value={reasons[item.gatePassId] || ""}
            onChangeText={(text) => setReasons((prev) => ({ ...prev, [item.gatePassId]: text }))}
          />

          <Button
            onPress={() => askConfirm("Approve Gate Pass", "Approve this gate pass request?", () => void approve(item.gatePassId))}
            fullWidth
          >
            Approve
          </Button>
          <Button
            onPress={() => askConfirm("Reject Gate Pass", "Reject this gate pass request?", () => void reject(item.gatePassId))}
            variant="outline"
            textStyle={{ color: Colors.status.error }}
            style={{ borderColor: Colors.status.error }}
            fullWidth
          >
            Reject
          </Button>
        </View>
      );
    },
    [approve, askConfirm, reasons, reject]
  );

  const renderLateItem = useCallback(
    ({ item }: { item: LatePass }) => {
      const chip = getStatusChip(item.status);
      return (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <ThemedText type="body" style={styles.cardTitle}>{item.userId?.name}</ThemedText>
            <View style={[styles.statusChip, { backgroundColor: chip.bg }]} accessible accessibilityLabel={`Pass status ${chip.text}`}>
              <ThemedText type="caption" style={[styles.badgeText, { color: chip.fg }]}>{chip.text}</ThemedText>
            </View>
          </View>

          <View style={styles.metaRow}>
            <ThemedText type="caption" secondary>Room / Block</ThemedText>
            <ThemedText type="caption">{item.userId?.roomNumber || "-"} / {item.userId?.hostelBlock || "-"}</ThemedText>
          </View>
          {item.reason ? (
            <View style={styles.metaRow}>
              <ThemedText type="caption" secondary>Reason</ThemedText>
              <ThemedText type="caption">{item.reason}</ThemedText>
            </View>
          ) : null}
          {item.expectedReturnTime ? (
            <View style={styles.metaRow}>
              <ThemedText type="caption" secondary>Expected Return</ThemedText>
              <ThemedText type="caption">{new Date(item.expectedReturnTime).toLocaleString()}</ThemedText>
            </View>
          ) : null}

          <Button
            onPress={() => askConfirm("Unlock Attendance", "Unlock attendance for this student?", () => void unlock(item.userId._id))}
            fullWidth
          >
            Unlock Attendance
          </Button>
        </View>
      );
    },
    [askConfirm]
  );

  const renderLogItem = useCallback(
    ({ item }: { item: GateLog }) => {
      const chip = getStatusChip(item.type);
      return (
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <ThemedText type="body">{item.type}</ThemedText>
            <View style={[styles.statusChip, { backgroundColor: chip.bg }]}> 
              <ThemedText type="caption" style={[styles.badgeText, { color: chip.fg }]}>{chip.text}</ThemedText>
            </View>
          </View>
          <ThemedText type="caption">Pass: {item.gatePassId}</ThemedText>
          <ThemedText type="caption">{item.userId?.name || "N/A"} ({item.userId?.registerId || "-"})</ThemedText>
          <ThemedText type="caption">{new Date(item.timestamp).toLocaleString()}</ThemedText>
        </View>
      );
    },
    []
  );

  return (
    <ThemedView
      style={styles.container}
      importantForAccessibility={confirmDialog ? "no-hide-descendants" : "auto"}
    >
      <ThemedText type="h2" style={styles.screenTitle}>Gate Dashboard</ThemedText>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: Colors.light.backgroundSecondary }]}> 
          <Feather name="clock" size={18} color={Colors.status.warning} />
          <ThemedText type="h3">{pendingPasses.length}</ThemedText>
          <ThemedText type="caption">Pending</ThemedText>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.light.backgroundSecondary }]}> 
          <Feather name="log-out" size={18} color={Colors.status.info} />
          <ThemedText type="h3">{outsideCount}</ThemedText>
          <ThemedText type="caption">Outside</ThemedText>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.light.backgroundSecondary }]}> 
          <Feather name="alert-circle" size={18} color={Colors.status.error} />
          <ThemedText type="h3">{latePasses.length}</ThemedText>
          <ThemedText type="caption">Late</ThemedText>
        </View>
      </View>

      <View style={styles.segmentContainer}>
        {SEGMENTS.map((segment) => (
          <Pressable
            key={segment.key}
            style={[styles.segmentButton, activeSegment === segment.key && styles.segmentButtonActive]}
            onPress={() => setActiveSegment(segment.key)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${segment.label} segment`}
          >
            <ThemedText type="bodySmall" style={activeSegment === segment.key ? styles.segmentTextActive : undefined}>
              {segment.label}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <Button onPress={loadGateData} loading={loading} variant="outline">
        Refresh
      </Button>

      {errorMessage ? <ErrorState title="Could not load dashboard" message={errorMessage} onRetry={() => void loadGateData()} /> : null}

      {activeSegment === "pending" ? (
        <FlatList
          data={pendingPasses}
          keyExtractor={pendingKeyExtractor}
          renderItem={renderPendingItem}
          ListEmptyComponent={<EmptyState title="No Pending Requests" subtitle="New gate pass requests will appear here." icon="clipboard" />}
        />
      ) : null}

      {activeSegment === "late" ? (
        <FlatList
          data={latePasses}
          keyExtractor={lateKeyExtractor}
          renderItem={renderLateItem}
          ListEmptyComponent={<EmptyState title="No Late Students" subtitle="No students are currently marked late." icon="check-circle" />}
        />
      ) : null}

      {activeSegment === "logs" ? (
        <View style={styles.logsWrap}>
          <Pressable style={styles.dropdown} onPress={() => setShowLogFilterModal(true)} accessibilityRole="button">
            <ThemedText type="bodySmall">Log Filter: {logFilter}</ThemedText>
            <Feather name="chevron-down" size={16} color={Colors.light.textSecondary} />
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder="Gate pass ID for manual override"
            value={overrideId}
            onChangeText={setOverrideId}
          />
          <Button
            onPress={() => askConfirm("Override Hostel Entry", "Proceed with manual hostel entry override?", () => void overrideEntry())}
            fullWidth
          >
            Override Entry
          </Button>

          <FlatList
            data={filteredLogs}
            keyExtractor={logsKeyExtractor}
            renderItem={renderLogItem}
            ListEmptyComponent={<EmptyState title="No Logs Found" subtitle="Try changing the log filter." icon="list" />}
          />
        </View>
      ) : null}

      <Modal
        visible={Boolean(confirmDialog)}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDialog(null)}
        accessibilityViewIsModal
      >
        <Pressable style={styles.modalOverlay} onPress={() => setConfirmDialog(null)}>
          <View ref={confirmModalRef} style={styles.modalCard}>
            <ThemedText type="h3">{confirmDialog?.title}</ThemedText>
            <ThemedText type="bodySmall">{confirmDialog?.message}</ThemedText>
            <View style={styles.modalActions}>
              <Button onPress={() => setConfirmDialog(null)} variant="outline" fullWidth>
                Cancel
              </Button>
              <Button
                onPress={() => {
                  const pendingConfirm = confirmDialog;
                  setConfirmDialog(null);
                  pendingConfirm?.onConfirm();
                }}
                fullWidth
              >
                Confirm
              </Button>
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showLogFilterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogFilterModal(false)}
        accessibilityViewIsModal
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLogFilterModal(false)}>
          <View ref={logFilterModalRef} style={styles.modalCard}>
            <ThemedText type="h3">Select Log Filter</ThemedText>
            {LOG_FILTERS.map((item) => (
              <Pressable
                key={item}
                style={styles.modalOption}
                onPress={() => {
                  setLogFilter(item);
                  setShowLogFilterModal(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Set log filter ${item}`}
              >
                <ThemedText type="body">{item}</ThemedText>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <LoadingOverlay visible={loading} message="Loading dashboard..." icon="activity" />
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
  summaryRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  segmentContainer: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  segmentButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    minHeight: Spacing.buttonHeight,
    justifyContent: "center",
    backgroundColor: Colors.light.backgroundRoot,
  },
  segmentButtonActive: {
    borderColor: Colors.primary.main,
    backgroundColor: Colors.primary.main,
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  card: {
    borderWidth: 0,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.light.backgroundRoot,
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  statusChip: {
    minHeight: 24,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.sm,
    minHeight: Spacing.buttonHeight,
    paddingHorizontal: 10,
    backgroundColor: Colors.light.backgroundRoot,
  },
  dropdown: {
    minHeight: Spacing.buttonHeight,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.light.backgroundRoot,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logsWrap: {
    gap: Spacing.sm,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.light.backgroundRoot,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalOption: {
    minHeight: Spacing.buttonHeight,
    justifyContent: "center",
  },
  modalActions: {
    gap: Spacing.sm,
  },
});
