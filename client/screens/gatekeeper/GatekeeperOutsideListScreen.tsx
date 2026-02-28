import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { gateApiRequest } from "@/lib/gate-api";
import { BorderRadius, Colors, Shadows, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

type OutsideStudent = {
  userId: {
    _id: string;
    name: string;
    registerId: string;
    hostelBlock: string;
    roomNumber?: string;
  };
  currentState: string;
  lastExitTime?: string;
  updatedAt: string;
};

type ApprovedPass = {
  expectedReturnTime?: string;
  userId?: {
    _id?: string;
  };
};

export default function GatekeeperOutsideListScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState<OutsideStudent[]>([]);
  const [approvedPasses, setApprovedPasses] = useState<ApprovedPass[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [outsideResponse, approvedResponse] = await Promise.all([
        gateApiRequest("GET", "/gate/outside"),
        gateApiRequest("GET", "/gate/passes/approved"),
      ]);

      const outsideData = await outsideResponse.json();
      const approvedData = await approvedResponse.json();

      if (!outsideResponse.ok) throw new Error(outsideData.error || "Failed to load");
      if (!approvedResponse.ok) throw new Error(approvedData.error || "Failed to load approved passes");

      setItems(outsideData.students || []);
      setApprovedPasses(approvedData.passes || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load";
      setErrorMessage(message);
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const expectedReturnLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const pass of approvedPasses) {
      const id = pass.userId?._id;
      if (id && pass.expectedReturnTime && !lookup.has(id)) {
        lookup.set(id, pass.expectedReturnTime);
      }
    }
    return lookup;
  }, [approvedPasses]);

  const outsideKeyExtractor = useCallback((item: OutsideStudent) => `outside-${item.userId?._id || item.updatedAt}`, []);

  const renderOutsideItem = useCallback(
    ({ item }: { item: OutsideStudent }) => {
      const expectedReturn = expectedReturnLookup.get(item.userId?._id) || "";
      const expectedDate = expectedReturn ? new Date(expectedReturn) : null;
      const isLate = expectedDate ? Date.now() > expectedDate.getTime() : false;
      const exitTime = item.lastExitTime ? new Date(item.lastExitTime).toLocaleString() : new Date(item.updatedAt).toLocaleString();

      return (
        <View style={styles.card}>
          <View style={styles.topRow}>
            <ThemedText type="body" style={styles.name}>{item.userId?.name}</ThemedText>
            {isLate ? <View style={styles.lateDot} accessibilityLabel="Late indicator" /> : null}
          </View>

          <View style={styles.metaRow}>
            <ThemedText type="caption" secondary>Gate Number</ThemedText>
            <ThemedText type="caption">{user?.gateNumber || "-"}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText type="caption" secondary>Exit Time</ThemedText>
            <ThemedText type="caption">{exitTime}</ThemedText>
          </View>
          <View style={styles.metaRow}>
            <ThemedText type="caption" secondary>Expected Return</ThemedText>
            <ThemedText type="caption">{expectedDate ? expectedDate.toLocaleString() : "-"}</ThemedText>
          </View>
        </View>
      );
    },
    [expectedReturnLookup, user?.gateNumber]
  );

  const emptyOutsideList = useMemo(
    () => <EmptyState title="No Students Outside" subtitle="All tracked students are currently inside campus/hostel." icon="check-circle" />,
    []
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="h2" style={styles.screenTitle}>Outside Students</ThemedText>
      <Button onPress={load} loading={loading} variant="outline" accessibilityRole="button">Refresh</Button>
      {errorMessage ? <ErrorState title="Could not load outside list" message={errorMessage} onRetry={() => void load()} /> : null}
      <FlatList
        data={items}
        keyExtractor={outsideKeyExtractor}
        renderItem={renderOutsideItem}
        ListEmptyComponent={emptyOutsideList}
      />
      <LoadingOverlay visible={loading} message="Loading outside list..." icon="map-pin" />
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
    borderWidth: 0,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.light.backgroundRoot,
    gap: Spacing.xs,
    ...Shadows.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontWeight: "600",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  lateDot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.status.error,
  },
});
