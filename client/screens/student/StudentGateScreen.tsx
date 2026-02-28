import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Alert,
  FlatList,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  UIManager,
  View,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
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
import { useTheme } from "@/hooks/useTheme";

type SegmentKey = "apply" | "myPasses" | "showQr";
type GateCategory = "HOME" | "PERSONAL" | "MEDICAL" | "ACADEMIC" | "OTHER";

type GatePass = {
  gatePassId: string;
  destination: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "LATE" | "COMPLETED";
  expectedReturnTime: string;
  exitMarkedAt?: string;
  enteredCampusAt?: string;
  enteredHostelAt?: string;
};

const SEGMENTS: Array<{ key: SegmentKey; label: string }> = [
  { key: "apply", label: "Apply" },
  { key: "myPasses", label: "My Passes" },
  { key: "showQr", label: "QR & Download" },
];

const CATEGORIES: GateCategory[] = ["HOME", "PERSONAL", "MEDICAL", "ACADEMIC", "OTHER"];

function getStatusTone(status: GatePass["status"]) {
  if (status === "PENDING") return { bg: Colors.status.warning, fg: "#FFFFFF", label: "PENDING" };
  if (status === "APPROVED") return { bg: Colors.status.info, fg: "#FFFFFF", label: "APPROVED" };
  if (status === "LATE") return { bg: Colors.status.error, fg: "#FFFFFF", label: "LATE" };
  if (status === "COMPLETED") return { bg: Colors.status.success, fg: "#FFFFFF", label: "COMPLETED" };
  return { bg: Colors.light.backgroundTertiary, fg: Colors.light.textSecondary, label: "REJECTED" };
}

function getTimelineCompletion(pass: GatePass) {
  return {
    applied: true,
    approved: pass.status !== "PENDING" && pass.status !== "REJECTED",
    exit: Boolean(pass.exitMarkedAt),
    campus: Boolean(pass.enteredCampusAt),
    hostel: Boolean(pass.enteredHostelAt) || pass.status === "COMPLETED",
  };
}

export default function StudentGateScreen() {
  const { theme } = useTheme();

  if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  const [activeSegment, setActiveSegment] = useState<SegmentKey>("apply");
  const [passes, setPasses] = useState<GatePass[]>([]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [category, setCategory] = useState<GateCategory>("OTHER");
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [expectedReturnTime, setExpectedReturnTime] = useState<Date>(new Date(Date.now() + 2 * 60 * 60 * 1000));
  const [emergencyContact, setEmergencyContact] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const [selectedPassId, setSelectedPassId] = useState("");
  const [stage, setStage] = useState<"CAMPUS_ENTRY" | "HOSTEL_ENTRY">("CAMPUS_ENTRY");
  const [token, setToken] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

  const categoryModalRef = useRef<View>(null);
  const dateModalRef = useRef<View>(null);
  const qrPulse = useRef(new Animated.Value(0)).current;

  useModalFocus(categoryModalRef, showCategoryModal);
  useModalFocus(dateModalRef, showDatePicker && Platform.OS !== "web");

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(qrPulse, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(qrPulse, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [qrPulse]);

  useEffect(() => {
    if (!tokenExpiresAt || !token) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const remaining = Math.max(0, Math.floor((new Date(tokenExpiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        setToken("");
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [token, tokenExpiresAt]);

  const approvedPasses = useMemo(() => passes.filter((pass) => pass.status === "APPROVED" || pass.status === "LATE"), [passes]);
  const activePass = useMemo(
    () => passes.find((item) => item.gatePassId === selectedPassId) || approvedPasses[0] || passes[0] || null,
    [approvedPasses, passes, selectedPassId]
  );

  const loadPasses = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await gateApiRequest("GET", "/gate/passes/my");
      const data = await response.json();
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setPasses(data.passes || []);
      setLocked(Boolean(data.gateState?.attendanceLocked));

      if (!selectedPassId && data.passes?.length) {
        const firstApproved = (data.passes as GatePass[]).find((item) => item.status === "APPROVED" || item.status === "LATE");
        if (firstApproved) {
          setSelectedPassId(firstApproved.gatePassId);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load gate data";
      setLoadError(message);
      Alert.alert("Gate", message);
    } finally {
      setLoading(false);
    }
  }, [selectedPassId]);

  useFocusEffect(
    useCallback(() => {
      void loadPasses();
    }, [loadPasses])
  );

  const submitGatePass = async () => {
    if (!reason.trim()) {
      Alert.alert("Validation", "Reason is required.");
      return;
    }
    if (!destination.trim()) {
      Alert.alert("Validation", "Destination is required.");
      return;
    }
    if (category === "HOME" && !emergencyContact.trim()) {
      Alert.alert("Validation", "Emergency contact is required for HOME category.");
      return;
    }

    setLoading(true);
    try {
      const response = await gateApiRequest("POST", "/gate/passes", {
        category,
        reason: reason.trim(),
        destination: destination.trim(),
        expectedReturnTime: expectedReturnTime.toISOString(),
        emergencyContact: emergencyContact.trim() || undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit gate pass");
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      Alert.alert("Success", "Gate pass submitted successfully.");
      setReason("");
      setDestination("");
      setEmergencyContact("");
      setCategory("OTHER");
      void loadPasses();
      setActiveSegment("myPasses");
    } catch (error) {
      Alert.alert("Gate", error instanceof Error ? error.message : "Failed to submit gate pass");
    } finally {
      setLoading(false);
    }
  };

  const refreshQrToken = async () => {
    if (!selectedPassId) {
      Alert.alert("Validation", "Select an approved pass to generate QR.");
      return;
    }

    setLoading(true);
    try {
      const response = await gateApiRequest("GET", `/gate/passes/${selectedPassId}/qr-token?stage=${stage}`);
      const data = await response.json();
      setToken(data.token || "");
      setTokenExpiresAt(data.expiresAt || null);
      if (data.expiresAt) {
        const seconds = Math.max(0, Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000));
        AccessibilityInfo.announceForAccessibility(`QR token refreshed. ${seconds} seconds remaining.`);
      }
    } catch (error) {
      setToken("");
      setTokenExpiresAt(null);
      Alert.alert("Gate", error instanceof Error ? error.message : "Failed to generate token");
    } finally {
      setLoading(false);
    }
  };

  const downloadGatePassPdf = async () => {
    if (!selectedPassId) {
      Alert.alert("Validation", "Select an approved pass before downloading PDF.");
      return;
    }

    setLoading(true);
    try {
      const response = await gateApiRequest("GET", `/gate/passes/${selectedPassId}/pdf?stage=${stage}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "PDF download failed");
      }

      if (Platform.OS === "web") {
        const blob = await response.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = `${selectedPassId}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(objectUrl);
      }

      Alert.alert("PDF Ready", "Gate pass PDF generated successfully.");
    } catch (error) {
      Alert.alert("Gate", error instanceof Error ? error.message : "Failed to download PDF");
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setExpectedReturnTime(selectedDate);
      if (Platform.OS !== "web") {
        setShowDatePicker(false);
      }
    }
  };

  const hasActiveModal = showCategoryModal || (showDatePicker && Platform.OS !== "web");
  const qrStageTitle = stage === "CAMPUS_ENTRY" ? "Campus Entry QR" : "Hostel Entry QR";
  const handleSegmentChange = (segment: SegmentKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveSegment(segment);
  };
  const qrBorderColor = qrPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.primary.light, Colors.primary.main],
  });

  return (
    <ThemedView
      style={styles.container}
      importantForAccessibility={hasActiveModal ? "no-hide-descendants" : "auto"}
    >
      <ThemedText type="h2" style={styles.screenTitle}>Gate</ThemedText>

      <View style={[styles.segmentContainer, { borderBottomColor: theme.border }]}> 
        {SEGMENTS.map((segment) => (
          <Pressable
            key={segment.key}
            style={styles.segmentButton}
            onPress={() => handleSegmentChange(segment.key)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${segment.label} segment`}
            hitSlop={8}
          >
            <ThemedText
              type="bodySmall"
              style={[
                styles.segmentLabel,
                { color: activeSegment === segment.key ? Colors.primary.main : theme.textSecondary },
                activeSegment === segment.key ? styles.segmentTextActive : undefined,
              ]}
            >
              {segment.label}
            </ThemedText>
            {activeSegment === segment.key ? <View style={styles.segmentUnderline} /> : null}
          </Pressable>
        ))}
      </View>

      {locked ? (
        <View style={styles.lockBanner}>
          <ThemedText type="bodySmall">Attendance is locked until admin unlocks your gate state.</ThemedText>
        </View>
      ) : null}

      {activeSegment === "apply" ? (
        <ScrollView contentContainerStyle={styles.sectionWrap} keyboardShouldPersistTaps="handled">
          <Pressable
            style={styles.input}
            onPress={() => setShowCategoryModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Choose gate pass category"
            hitSlop={8}
          >
            <ThemedText type="bodySmall">Category: {category}</ThemedText>
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder="Reason"
            value={reason}
            onChangeText={setReason}
          />
          <TextInput
            style={styles.input}
            placeholder="Destination"
            value={destination}
            onChangeText={setDestination}
          />

          <Pressable
            style={styles.input}
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Select expected return time"
            hitSlop={8}
          >
            <ThemedText type="bodySmall">
              Return time: {expectedReturnTime.toLocaleString()}
            </ThemedText>
          </Pressable>

          {Platform.OS === "web" && showDatePicker ? (
            <View style={styles.webDateWrap}>
              <ThemedText type="caption" style={styles.dateLabel}>Pick return date & time</ThemedText>
              <DateTimePicker
                value={expectedReturnTime}
                mode="datetime"
                display="inline"
                minimumDate={new Date()}
                onChange={handleDateChange}
              />
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Emergency contact (required for HOME)"
            value={emergencyContact}
            onChangeText={setEmergencyContact}
          />

          <Button onPress={submitGatePass} loading={loading} fullWidth>
            Submit Gate Pass
          </Button>
        </ScrollView>
      ) : null}

      {activeSegment === "myPasses" ? (
        <View style={styles.sectionWrap}>
          <Button onPress={loadPasses} loading={loading} variant="outline">
            Refresh
          </Button>
          {loadError ? <ErrorState title="Could not load passes" message={loadError} onRetry={() => void loadPasses()} /> : null}
          <FlatList
            data={passes}
            keyExtractor={(item) => item.gatePassId}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.card, activePass?.gatePassId === item.gatePassId && styles.activeCard]}
                onPress={() => setSelectedPassId(item.gatePassId)}
              >
                <View style={styles.cardHeader}>
                  <ThemedText type="body" style={styles.cardTitle}>{item.destination}</ThemedText>
                  <View
                    style={[styles.statusChip, { backgroundColor: getStatusTone(item.status).bg }]}
                    accessible
                    accessibilityLabel={`Pass status ${getStatusTone(item.status).label}`}
                  >
                    <ThemedText type="caption" style={[styles.statusChipLabel, { color: getStatusTone(item.status).fg }]}>
                      {getStatusTone(item.status).label}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText type="caption">↩ {new Date(item.expectedReturnTime).toLocaleString()}</ThemedText>
                {(item.status === "APPROVED" || item.status === "LATE" || item.status === "COMPLETED") ? (
                  <View style={styles.timelineWrap}>
                    {[
                      { key: "applied", label: "Applied" },
                      { key: "approved", label: "Approved" },
                      { key: "exit", label: "Exit" },
                      { key: "campus", label: "Campus" },
                      { key: "hostel", label: "Hostel" },
                    ].map((step, index, arr) => {
                      const completion = getTimelineCompletion(item);
                      const done = completion[step.key as keyof typeof completion];
                      return (
                        <View key={`${item.gatePassId}-${step.key}`} style={styles.timelineStep}>
                          <View
                            style={[
                              styles.timelineDot,
                              {
                                borderColor: done ? Colors.primary.main : theme.border,
                                backgroundColor: done ? Colors.primary.main : "transparent",
                              },
                            ]}
                          />
                          {index < arr.length - 1 ? (
                            <View style={[styles.timelineLine, { backgroundColor: done ? Colors.primary.main : theme.border }]} />
                          ) : null}
                          <ThemedText type="caption" style={styles.timelineLabel}>{step.label}</ThemedText>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {(item.status === "APPROVED" || item.status === "LATE") ? (
                  <Button
                    onPress={() => {
                      setSelectedPassId(item.gatePassId);
                      setActiveSegment("showQr");
                    }}
                    variant="outline"
                  >
                    Show QR
                  </Button>
                ) : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <EmptyState
                title="No Passes Yet"
                subtitle="Your submitted gate passes will appear here." 
                icon="file-text"
              />
            }
          />

          {activePass ? (
            <View style={styles.focusCard}>
              <ThemedText type="caption">Active pass</ThemedText>
              <ThemedText type="body">{activePass.reason}</ThemedText>
              <ThemedText type="caption">ID: {activePass.gatePassId}</ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}

      {activeSegment === "showQr" ? (
        <View style={styles.sectionWrap}>
          <ThemedText type="bodySmall" style={styles.sectionHeading}>Select an approved pass</ThemedText>
          <FlatList
            horizontal
            data={approvedPasses}
            keyExtractor={(item) => item.gatePassId}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.passChip, selectedPassId === item.gatePassId && styles.passChipActive]}
                onPress={() => setSelectedPassId(item.gatePassId)}
              >
                <ThemedText type="caption">#{item.gatePassId.slice(0, 8)}</ThemedText>
              </Pressable>
            )}
            ListEmptyComponent={
              <EmptyState
                title="No Active Passes"
                subtitle="You don’t have any approved gate passes yet."
                icon="shield"
              />
            }
          />

          <View style={styles.stageRow}>
            <Button
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setStage("CAMPUS_ENTRY");
              }}
              variant={stage === "CAMPUS_ENTRY" ? "primary" : "outline"}
            >
              Campus Entry
            </Button>
            <Button
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setStage("HOSTEL_ENTRY");
              }}
              variant={stage === "HOSTEL_ENTRY" ? "primary" : "outline"}
            >
              Hostel Entry
            </Button>
          </View>

          <Button onPress={refreshQrToken} loading={loading} fullWidth>
            Generate QR
          </Button>

          {token ? (
            <View style={styles.qrWrap}>
              <ThemedText type="h3">{qrStageTitle}</ThemedText>
              <ThemedText
                type="caption"
                style={[
                  styles.countdownText,
                  remainingSeconds < 10 ? { color: Colors.status.error } : undefined,
                ]}
                accessible
                accessibilityLabel={`QR expires in ${remainingSeconds} seconds`}
              >
                Expires in {remainingSeconds}s{remainingSeconds < 10 ? " • Refresh now" : ""}
              </ThemedText>

              <Animated.View style={[styles.qrBorder, { borderColor: qrBorderColor }]}> 
                <Image
                  source={{ uri: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(token)}` }}
                  style={styles.qrImage}
                />
              </Animated.View>

              <ThemedText type="caption" style={styles.qrSafetyText}>
                Do not share this QR. It expires automatically.
              </ThemedText>

              <Button onPress={refreshQrToken} variant="outline" fullWidth accessibilityLabel="Refresh QR token">
                ↻ Refresh QR Token
              </Button>

              <Button
                onPress={downloadGatePassPdf}
                loading={loading}
                variant="outline"
                fullWidth
                style={styles.pdfButton}
                accessibilityLabel="Download gate pass PDF"
              >
                ⬇ Download Gate Pass PDF
              </Button>
            </View>
          ) : (
            <EmptyState title="QR Not Generated" subtitle="Generate a QR token to verify at the gate." icon="smartphone" />
          )}
        </View>
      ) : null}

      <Modal
        visible={showCategoryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCategoryModal(false)}
        accessibilityViewIsModal
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryModal(false)}>
          <View ref={categoryModalRef} style={styles.modalCard}>
            <ThemedText type="h3">Select Category</ThemedText>
            {CATEGORIES.map((item) => (
              <Pressable
                key={item}
                style={styles.modalItem}
                onPress={() => {
                  setCategory(item);
                  setShowCategoryModal(false);
                }}
              >
                <ThemedText type="body">{item}</ThemedText>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showDatePicker && Platform.OS !== "web"}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
        accessibilityViewIsModal
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowDatePicker(false)}>
          <View ref={dateModalRef} style={styles.modalCard}>
            <ThemedText type="h3">Pick Return Time</ThemedText>
            <DateTimePicker
              value={expectedReturnTime}
              mode="datetime"
              display="spinner"
              minimumDate={new Date()}
              onChange={handleDateChange}
            />
            <Button onPress={() => setShowDatePicker(false)} variant="outline" fullWidth>
              Close
            </Button>
          </View>
        </Pressable>
      </Modal>

      <LoadingOverlay visible={loading && activeSegment !== "apply"} message="Syncing gate data..." icon="clock" />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  segmentContainer: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    minHeight: Spacing.buttonHeight,
    justifyContent: "center",
    position: "relative",
  },
  segmentLabel: {
    fontWeight: "500",
  },
  segmentTextActive: {
    fontWeight: "700",
  },
  segmentUnderline: {
    position: "absolute",
    bottom: 0,
    height: 3,
    width: "62%",
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary.main,
  },
  screenTitle: {
    fontWeight: "700",
  },
  sectionHeading: {
    fontWeight: "600",
  },
  sectionWrap: {
    gap: Spacing.sm,
    flexGrow: 1,
  },
  webDateWrap: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: BorderRadius.sm,
    backgroundColor: "#FFFFFF",
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  dateLabel: {
    opacity: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.light.backgroundRoot,
    minHeight: Spacing.buttonHeight,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  lockBanner: {
    borderWidth: 1,
    borderColor: "#F59E0B",
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    backgroundColor: "#FEF3C7",
  },
  card: {
    borderWidth: 0,
    borderRadius: BorderRadius.sm,
    padding: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.light.backgroundRoot,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  activeCard: {
    borderColor: Colors.primary.main,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  cardTitle: {
    flex: 1,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 24,
  },
  statusChipLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  timelineWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    paddingTop: Spacing.sm,
  },
  timelineStep: {
    flex: 1,
    alignItems: "center",
    minHeight: 48,
    position: "relative",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
  },
  timelineLine: {
    position: "absolute",
    top: 5,
    right: -18,
    width: 36,
    height: 2,
  },
  timelineLabel: {
    marginTop: Spacing.xs,
    fontSize: 10,
  },
  focusCard: {
    borderWidth: 0,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    gap: Spacing.xs,
    backgroundColor: Colors.light.backgroundSecondary,
    ...Shadows.sm,
  },
  passChip: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: BorderRadius.full,
    minHeight: Spacing.buttonHeight,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginRight: Spacing.sm,
    backgroundColor: Colors.light.backgroundRoot,
  },
  passChipActive: {
    borderColor: Colors.primary.main,
    backgroundColor: Colors.light.backgroundSecondary,
  },
  stageRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    justifyContent: "space-between",
  },
  qrWrap: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
  },
  countdownText: {
    fontWeight: "600",
  },
  qrBorder: {
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    ...Shadows.sm,
  },
  qrImage: {
    width: Platform.OS === "web" ? 220 : 260,
    height: Platform.OS === "web" ? 220 : 260,
  },
  qrSafetyText: {
    textAlign: "center",
    opacity: 0.85,
  },
  pdfButton: {
    minHeight: Spacing.buttonHeight,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: Spacing.lg,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  modalItem: {
    paddingVertical: 10,
  },
});
