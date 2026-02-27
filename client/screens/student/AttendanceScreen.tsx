import React, { useState, useEffect, useRef, useMemo } from "react";
import { StyleSheet, View, ScrollView, Pressable, Alert, Platform, Modal, ActivityIndicator, Dimensions, Image, RefreshControl } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";

import { HOSTEL_LOCATIONS, HostelBoundary } from "@/constants/hostels";
import { LoadingOverlay } from "@/components/LoadingOverlay";

const { width } = Dimensions.get('window');

interface Attendance {
  _id: string;
  userId: string;
  hostel: string;
  markedAt: string;
  date: string;
  isPresent: boolean;
}

interface LeaveRequest {
  _id: string;
  status: 'pending' | 'approved' | 'rejected';
  fromDate: string;
  toDate: string;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

// Point-in-polygon algorithm (ray casting)
// Treats latitude as Y-axis (north-south) and longitude as X-axis (east-west)
function isPointInPolygon(
  lat: number,
  lon: number,
  polygon: Array<{ latitude: number; longitude: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].longitude; // X-axis = longitude (east-west)
    const yi = polygon[i].latitude;  // Y-axis = latitude (north-south)
    const xj = polygon[j].longitude;
    const yj = polygon[j].latitude;

    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const getCurrentSession = () => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 100 + minutes;

  // Morning: 07:00 to 12:30
  if (currentTime >= 700 && currentTime < 1230) return 'morning';
  // Afternoon: 12:30 to 18:00 (6:00 PM)
  if (currentTime >= 1230 && currentTime <= 1800) return 'afternoon';

  return null;
};

export default function AttendanceScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const { theme } = useTheme();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [locationPermission, requestLocationPermission] = Location.useForegroundPermissions();

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [locationStatus, setLocationStatus] = useState<{ valid: boolean; message: string; distance?: number } | null>(null);
  const [selectedHostel, setSelectedHostel] = useState<string>("");
  const [showHostelPicker, setShowHostelPicker] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const hostelCloseButtonRef = useRef<View>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const hostelOptions = Object.keys(HOSTEL_LOCATIONS);

  // Manage focus when modal opens/closes to prevent aria-hidden warnings
  useEffect(() => {
    if (showHostelPicker) {
      // Save currently focused element
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        previousFocusRef.current = document.activeElement as HTMLElement;
      }
      // Move focus into the modal
      setTimeout(() => {
        if (hostelCloseButtonRef.current && Platform.OS === 'web') {
          (hostelCloseButtonRef.current as any)?.focus?.();
        }
      }, 100);
    } else {
      // Restore focus when modal closes
      if (Platform.OS === 'web' && previousFocusRef.current) {
        setTimeout(() => {
          previousFocusRef.current?.focus();
        }, 100);
      }
    }
  }, [showHostelPicker]);

  const { data: todayAttendanceData, isLoading, refetch: refetchTodayAttendance } = useQuery({
    queryKey: ["attendance/check", user?.id || (user as any)?._id, new Date().toISOString().split('T')[0]],
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const todayAttendance = todayAttendanceData as any;

  const { data: stats, refetch: refetchAttendanceStats } = useQuery({
    queryKey: ["attendance/stats", user?.id || (user as any)?._id],
    enabled: !!user,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  // Fetch attendance for the month
  const { data: monthAttendance, refetch: refetchMonthAttendance } = useQuery<Attendance[]>({
    queryKey: ["attendances", "user", user?.id],
    enabled: !!user?.id,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { data: leaves, refetch: refetchLeaves } = useQuery<LeaveRequest[]>({
    queryKey: ["leave-requests", "user", user?.id],
    enabled: !!user?.id,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const { data: hostelSettings, refetch: refetchHostelSettings } = useQuery({
    queryKey: ['hostel-settings', user?.hostelBlock],
    queryFn: getQueryFn({ on401: 'returnNull' }),
    enabled: !!user?.hostelBlock,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const [refreshing, setRefreshing] = useState(false);

  const refetchAttendanceData = React.useCallback(async () => {
    await Promise.all([
      refetchTodayAttendance(),
      refetchAttendanceStats(),
      refetchMonthAttendance(),
      refetchLeaves(),
      refetchHostelSettings(),
    ]);
  }, [refetchTodayAttendance, refetchAttendanceStats, refetchMonthAttendance, refetchLeaves, refetchHostelSettings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchAttendanceData();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      refetchAttendanceData();
    }, [refetchAttendanceData])
  );

  const calculatedStats = useMemo(() => {
    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const attendanceMap: Record<number, { morning?: boolean, afternoon?: boolean }> = {};
    if (monthAttendance) {
      (monthAttendance as any[]).forEach((record: any) => {
        const date = new Date(record.date);
        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
          const day = date.getDate();
          if (!attendanceMap[day]) attendanceMap[day] = {};
          if (record.session === 'morning') attendanceMap[day].morning = record.isPresent;
          if (record.session === 'afternoon') attendanceMap[day].afternoon = record.isPresent;
        }
      });
    }

    const leaveMap: Record<number, boolean> = {};
    if (leaves) {
      (leaves as any[]).forEach((leave: any) => {
        if (leave.status === 'approved') {
          const from = new Date(leave.fromDate);
          const to = new Date(leave.toDate);
          for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
              leaveMap[d.getDate()] = true;
            }
          }
        }
      });
    }

    const leaveWindowDays: Record<number, boolean> = {};
    const hSettings = hostelSettings as any;
    if (hSettings?.leaveWindowLabel && hSettings?.leaveWindowFrom && hSettings?.leaveWindowTo) {
      const from = new Date(hSettings.leaveWindowFrom);
      const to = new Date(hSettings.leaveWindowTo);
      const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          leaveWindowDays[d.getDate()] = true;
        }
      }
    }

    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let holidayCount = 0;
    const statusMap: Record<number, string> = {};

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateOfSelectedDay = new Date(currentYear, currentMonth, day);
      const record = attendanceMap[day];

      const isPersonalLeave = leaveMap[day];
      const isHostelHoliday = leaveWindowDays[day];

      if (dateOfSelectedDay <= todayMidnight) {
        const morningPresent = record?.morning;
        const afternoonPresent = record?.afternoon;
        const isHoliday = false; // Removed automatic weekend holiday logic

        // Morning Session
        if (morningPresent) {
          presentCount++;
        } else if (isPersonalLeave) {
          leaveCount++;
        } else if (isHostelHoliday || isHoliday) {
          holidayCount++;
        } else if (dateOfSelectedDay < todayMidnight || (dateOfSelectedDay.getTime() === todayMidnight.getTime() && new Date().getHours() >= 9)) {
          absentCount++;
        }

        // Afternoon Session
        if (afternoonPresent) {
          presentCount++;
        } else if (isPersonalLeave) {
          leaveCount++;
        } else if (isHostelHoliday || isHoliday) {
          holidayCount++;
        } else if (dateOfSelectedDay < todayMidnight || (dateOfSelectedDay.getTime() === todayMidnight.getTime() && new Date().getHours() >= 22)) {
          absentCount++;
        }

        // Calendar Status mapping
        if (morningPresent && afternoonPresent) {
          statusMap[day] = 'present';
        } else if (morningPresent || afternoonPresent) {
          statusMap[day] = 'partially-present';
        } else if (isPersonalLeave) {
          statusMap[day] = 'leave';
        } else if (isHostelHoliday || isHoliday) {
          statusMap[day] = 'holiday';
        } else if (dateOfSelectedDay < todayMidnight) {
          statusMap[day] = 'absent';
        }
      }
    }

    const attendanceTotal = presentCount + absentCount;
    const percentage = attendanceTotal > 0 ? Math.round((presentCount / attendanceTotal) * 100) : 0;

    return {
      statusMap,
      present: presentCount,
      absent: absentCount,
      leave: leaveCount,
      holiday: holidayCount,
      percentage,
      activeLeaveSession: (hSettings?.leaveWindowLabel && hSettings?.leaveWindowTo && new Date(hSettings.leaveWindowTo).setHours(23, 59, 59, 999) >= Date.now()) ? hSettings.leaveWindowLabel : null,
      isCurrentlyInLeaveWindow: leaveWindowDays[today.getDate()] || false
    };
  }, [monthAttendance, leaves, hostelSettings]);

  // Simple helper to get days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const renderCalendar = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const { statusMap } = calculatedStats;

    return (
      <View style={[styles.calendarCard, { backgroundColor: theme.backgroundSecondary }]}>
        <View style={styles.calendarHeader}>
          <View>
            <ThemedText type="h3">{today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</ThemedText>
            <ThemedText type="caption" secondary>Monthly Performance</ThemedText>
          </View>
          <View style={styles.statsBadgeSmall}>
            <ThemedText style={styles.percentageText}>{calculatedStats.percentage}%</ThemedText>
          </View>
        </View>

        <View style={styles.calendarGrid}>
          <View style={styles.weekHeader}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <ThemedText key={`weekday-${i}`} style={styles.weekDayText}>{d}</ThemedText>
            ))}
          </View>
          <View style={styles.daysGrid}>
            {days.map((day, index) => {
              const isToday = day === today.getDate();
              const status = day ? statusMap[day] : null;

              return (
                <View key={index} style={styles.dayCell}>
                  {day && (
                    <View style={[
                      styles.dayCircle,
                      isToday && { borderColor: Colors.primary.main, borderWidth: 1.5 },
                      status === 'present' && { backgroundColor: Colors.status.success },
                      status === 'partially-present' && { backgroundColor: Colors.primary.main + '90' },
                      status === 'absent' && { backgroundColor: Colors.status.error + '90' },
                      status === 'leave' && { backgroundColor: Colors.status.warning },
                      status === 'holiday' && { backgroundColor: Colors.secondary.main + 'c0' },
                    ]}>
                      <ThemedText style={[
                        styles.dayText,
                        (status) && { color: '#FFFFFF', fontWeight: 'bold' }
                      ]}>
                        {day}
                      </ThemedText>
                      {isToday && !status && <View style={[styles.todayIndicator, { backgroundColor: Colors.primary.main }]} />}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.calendarLegend}>
          <LegendItem color={Colors.status.success} label="Present" />
          <LegendItem color={Colors.primary.main + '90'} label="Partial" />
          <LegendItem color={Colors.status.error + '90'} label="Absent" />
          <LegendItem color={Colors.status.warning} label="Leave" />
          <LegendItem color={Colors.secondary.main + 'c0'} label="Holiday" />
        </View>
      </View>
    );
  };

  const LegendItem = ({ color, label }: { color: string, label: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <ThemedText type="caption" style={{ fontSize: 9 }} secondary>{label}</ThemedText>
    </View>
  );

  const markAttendanceMutation = useMutation({
    mutationFn: async (data: { photo: string; location: Location.LocationObject }) => {
      const userId = user?.id || (user as any)?._id;
      if (!userId) throw new Error("User ID not found");

      // Update status to show verifying
      setProcessingStatus("🔐 Verifying face match...");
      console.log("🔍 Starting face verification...");

      try {
        const res = await apiRequest("POST", "/api/attendance", {
          userId: userId,
          date: new Date().toISOString(),
          isPresent: true,
          photoUrl: data.photo,
          latitude: data.location.coords.latitude.toString(),
          longitude: data.location.coords.longitude.toString(),
          selectedHostel: selectedHostel, // Pass the selected hostel for validation
        });

        const result = await res.json();
        console.log("Server response:", result);

        if (!res.ok) {
          throw new Error(result.error || "Failed to mark attendance");
        }

        setProcessingStatus("✅ Attendance verified!");
        return result;
      } catch (error: any) {
        // Handle timeout errors from face verification
        if (error.message && error.message.includes('timeout')) {
          throw new Error('Face verification took too long. Please try again in good lighting and ensure your face is clearly visible.');
        }
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("✅ Attendance marked successfully:", data);
      queryClient.invalidateQueries({ queryKey: ["attendance/check"] });
      queryClient.invalidateQueries({ queryKey: ["attendances", "user"] });
      queryClient.invalidateQueries({ queryKey: ["attendance/stats"] });
      setErrorMessage(null);

      // Successfully updated, can clear processing state
      setProcessingStatus("");
      setIsProcessing(false);
      Alert.alert("Success", "Attendance marked successfully! ✅");
    },
    onError: (error: Error) => {
      console.error("❌ Attendance error:", error);
      setErrorMessage(error.message);
      setProcessingStatus("");
      setIsProcessing(false);

      // Show notification if already marked or other bad request
      Alert.alert("Attendance Info", error.message);
    },
    onSettled: () => {
      // Don't reset here - let success/error handlers manage state
    }
  });

  const deleteAttendanceMutation = useMutation({
    mutationFn: async () => {
      const userId = user?.id || (user as any)?._id;
      const dateStr = new Date().toISOString().split('T')[0];
      const res = await apiRequest("DELETE", `/api/attendance/user/${userId}/date/${dateStr}`);
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: (data) => {
      // Check if anything was actually deleted
      if (data.deletedCount === 0) {
        console.log("Delete failed debug:", data.debug);
        Alert.alert(
          "Delete Failed",
          `Could not find attendance record for this date.\n\nServer Debug Info:\nTarget Date: ${data.debug?.dateParam}\nServer Query Start: ${data.debug?.serverQueryStart}\nFound in range: ${data.debug?.foundRecordsInRange?.length || 0}`
        );
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["attendance/check"] });
      queryClient.invalidateQueries({ queryKey: ["attendance/stats"] });
      queryClient.invalidateQueries({ queryKey: ["attendances", "user"] }); // Refresh calendar
      Alert.alert("Deleted", "Attendance reset for today.");
    },
    onError: (error: Error) => {
      console.error("Delete attendance error:", error);
      Alert.alert("Error", `Failed to delete attendance: ${error.message}`);
    }
  });

  useEffect(() => {
    let isActive = true;

    (async () => {
      if (!selectedHostel) {
        console.log("📍 No hostel selected yet, skipping location check.");
        setLocationStatus({ valid: false, message: "Please select a hostel" });
        return;
      }

      console.log(`📍 selectedHostel changed to: "${selectedHostel}", triggering check...`);
      const status = await checkLocation();
      if (isActive && status) {
        setLocationStatus(status);
      }
    })();

    return () => { isActive = false; };
  }, [selectedHostel]);

  // Track if we've initialized the hostel from user profile
  const hasInitializedHostel = useRef(false);

  useEffect(() => {
    if (user?.hostelBlock && !hasInitializedHostel.current) {
      const normalizedBlock = user.hostelBlock.trim().replace(/\s+/g, ' ');
      console.log(`📍 Initializing hostel from profile: "${user.hostelBlock}" -> "${normalizedBlock}"`);
      if (HOSTEL_LOCATIONS[normalizedBlock]) {
        setSelectedHostel(normalizedBlock);
        hasInitializedHostel.current = true;
      } else {
        console.warn(`⚠️ Hostel block "${normalizedBlock}" from profile not found in configuration!`);
      }
    }
  }, [user?.hostelBlock]);

  const checkLocation = async () => {
    try {
      if (!selectedHostel || !HOSTEL_LOCATIONS[selectedHostel]) {
        console.warn(`⚠️ checkLocation failed: selectedHostel("${selectedHostel}") is invalid.`);
        return { valid: false, message: "Please select a hostel" };
      }

      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const permissionResponse = await requestLocationPermission();
        status = permissionResponse.status;
      }

      if (status !== 'granted') {
        return { valid: false, message: "Location permission denied" };
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const hostelBoundary = HOSTEL_LOCATIONS[selectedHostel];
      let isInside = false;
      let currentDistance: number | undefined;

      if (hostelBoundary.radius && hostelBoundary.center) {
        currentDistance = getDistance(
          location.coords.latitude,
          location.coords.longitude,
          hostelBoundary.center.latitude,
          hostelBoundary.center.longitude
        );
        isInside = currentDistance <= hostelBoundary.radius;
      } else {
        isInside = isPointInPolygon(
          location.coords.latitude,
          location.coords.longitude,
          hostelBoundary.points
        );
      }

      // Debug: Log actual coordinates
      console.log(`📍 GPS: ${location.coords.latitude}, ${location.coords.longitude} | Hostel: ${selectedHostel} | Inside: ${isInside}`);
      if (currentDistance !== undefined) {
        console.log(`   Distance: ${currentDistance.toFixed(2)}m (Max: ${hostelBoundary.radius || 'N/A'}m)`);
      }

      if (isInside) {
        return {
          valid: true,
          message: currentDistance !== undefined
            ? `Verified (${currentDistance.toFixed(0)}m from center)`
            : "You are within hostel premises",
          distance: currentDistance
        };
      } else {
        const distanceInfo = currentDistance !== undefined
          ? ` (${currentDistance.toFixed(0)}m away)`
          : "";
        return {
          valid: false,
          message: `Outside boundary${distanceInfo}. GPS: ${location.coords.latitude.toFixed(5)}, ${location.coords.longitude.toFixed(5)}`,
          distance: currentDistance
        };
      }
    } catch (error) {
      console.log("Location Error:", error);
      return { valid: false, message: "Could not fetch location. Ensure GPS is on." };
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current) {
      Alert.alert("Error", "Camera not available");
      return;
    }
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      setProcessingStatus("📸 Capturing photo...");
      console.log("📸 Capturing attendance photo...");
      const captureStart = Date.now();

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });

      if (!photo?.base64) {
        throw new Error("Failed to capture photo");
      }

      const captureTime = Date.now() - captureStart;
      console.log(`✓ Photo captured in ${captureTime}ms (${(photo.base64.length / 1024).toFixed(1)}KB)`);
      setProcessingStatus("🔍 Verifying face...");

      let location;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch (locationError) {
        console.log("Location fetch failed:", locationError);
        // For web or if location fails, use dummy location
        location = {
          coords: { latitude: "web", longitude: "web" },
          timestamp: Date.now(),
        } as any;
      }

      console.log("🔄 Sending to server for face verification...");
      setProcessingStatus("⏳ Uploading & verifying...");

      // Exit camera mode immediately after capture
      setIsCameraOpen(false);
      setIsCameraReady(false);

      markAttendanceMutation.mutate({
        photo: photo.base64.startsWith('data:image') ? photo.base64 : `data:image/jpeg;base64,${photo.base64}`,
        location,
      });
    } catch (error: any) {
      console.error("❌ Capture error:", error);
      setProcessingStatus("");
      setIsProcessing(false);
      Alert.alert("Error", `Failed to capture photo: ${error.message}`);
    }
  };

  if (isCameraOpen) {
    if (!permission?.granted) {
      return (
        <ThemedView style={styles.container}>
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
            <ThemedText style={{ textAlign: "center", marginBottom: 20 }}>
              We need your permission to access the camera
            </ThemedText>
            <Button onPress={requestPermission}>Grant Permission</Button>
          </View>
        </ThemedView>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="front"
          onCameraReady={() => setIsCameraReady(true)}
        />
        <View style={[StyleSheet.absoluteFill, styles.cameraOverlay]}>
          <View style={styles.cameraHeader}>
            <Pressable
              onPress={() => {
                setIsCameraOpen(false);
                setIsCameraReady(false);
                setProcessingStatus("");
                setErrorMessage(null);
              }}
              disabled={isProcessing}
              style={styles.closeButton}
            >
              <Feather name="x" size={28} color="#FFFFFF" />
            </Pressable>
            <View style={styles.headerTitleContainer}>
              <ThemedText style={styles.headerTitleText}>Face Verification</ThemedText>
            </View>
          </View>

          <View style={styles.scannerContainer}>
            <View style={styles.scannerFrame}>
              <View style={[styles.scannerCorner, styles.topLeft]} />
              <View style={[styles.scannerCorner, styles.topRight]} />
              <View style={[styles.scannerCorner, styles.bottomLeft]} />
              <View style={[styles.scannerCorner, styles.bottomRight]} />
              {isProcessing && <View style={styles.scanLine} />}
            </View>
          </View>

          <View style={styles.cameraBottomContainer}>
            <View style={styles.locationDetailPanel}>
              <View style={styles.locationStatusBadge}>
                <View style={[styles.statusDot, { backgroundColor: locationStatus?.valid ? '#4ADE80' : '#F87171' }]} />
                <ThemedText style={styles.locationBadgeText}>
                  {locationStatus?.valid ? "Within Range" : "Out of Range"}
                </ThemedText>
              </View>

              <ThemedText style={styles.hostelNameText}>{selectedHostel || user?.hostelBlock}</ThemedText>

              <View style={styles.distanceBadge}>
                <Feather name="navigation" size={12} color="rgba(255,255,255,0.7)" />
                <ThemedText style={styles.distanceText}>
                  {locationStatus?.distance ? `${locationStatus.distance.toFixed(1)}m from center` : "Calculating..."}
                </ThemedText>
              </View>
            </View>

            <View style={styles.captureButtonWrapper}>
              <Pressable
                onPress={handleCapture}
                disabled={isProcessing || !locationStatus?.valid}
                style={({ pressed }) => [
                  styles.captureButton,
                  (isProcessing || !locationStatus?.valid) && { opacity: 0.5 },
                  pressed && { scale: 0.95 }
                ]}
              >
                <View style={styles.captureButtonCircle}>
                  {isProcessing ? (
                    <ActivityIndicator color={Colors.primary.main} />
                  ) : (
                    <View style={styles.captureButtonInnerCircle} />
                  )}
                </View>
              </Pressable>
              <ThemedText style={styles.captureHintText}>
                {processingStatus || (isProcessing ? "Processing..." : "Tap to Verify")}
              </ThemedText>
            </View>

            {errorMessage && (
              <View style={styles.cameraErrorToast}>
                <Feather name="alert-triangle" size={16} color="#FFFFFF" />
                <ThemedText style={styles.cameraErrorText}>{errorMessage}</ThemedText>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  }


  const handleDelete = () => {
    Alert.alert("Confirm Reset", "Are you sure you want to delete today's attendance? This is for testing purposes.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteAttendanceMutation.mutate() }
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />}
      >
        {!!calculatedStats.activeLeaveSession && (
          <View style={[styles.leaveBanner, { backgroundColor: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
            <View style={[styles.leaveBannerIcon, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
              <Feather name="check-circle" size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="bodySmall" style={{ fontWeight: '700', color: '#10B981' }}>
                Active Holiday: {calculatedStats.activeLeaveSession}
              </ThemedText>
              <ThemedText type="caption" secondary style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                The hostel has declared a holiday period. Your attendance will be marked as 'Holiday' automatically for this session.
              </ThemedText>
            </View>
          </View>
        )}

        <View style={styles.sectionTitle}>
          <ThemedText type="h2">Today's Attendance</ThemedText>
        </View>

        <View style={[styles.statusCard, { backgroundColor: theme.backgroundDefault, padding: 16 }]}>
          <View style={styles.sessionRow}>
            {/* Morning Session Box */}
            <View style={[styles.sessionItem, { backgroundColor: theme.backgroundSecondary }]}>
              <View style={[styles.sessionIcon, {
                backgroundColor: todayAttendance?.morningMarked ? Colors.status.success + '20' :
                  (new Date().getHours() > 11 || (new Date().getHours() === 11 && new Date().getMinutes() >= 30) ? Colors.status.error + '20' : Colors.status.warning + '20'),
                overflow: 'hidden'
              }]}>
                {todayAttendance?.morning?.photoUrl ? (
                  <Image source={{ uri: todayAttendance.morning.photoUrl }} style={StyleSheet.absoluteFill} />
                ) : (
                  <Feather
                    name={todayAttendance?.morningMarked ? "check" : (new Date().getHours() > 11 || (new Date().getHours() === 11 && new Date().getMinutes() >= 30) ? "x" : "clock")}
                    size={24}
                    color={todayAttendance?.morningMarked ? Colors.status.success :
                      (new Date().getHours() > 11 || (new Date().getHours() === 11 && new Date().getMinutes() >= 30) ? Colors.status.error : Colors.status.warning)}
                  />
                )}
                {/* Small indicator overlay */}
                <View style={[styles.statusIndicatorOverlay, {
                  backgroundColor: todayAttendance?.morningMarked ? Colors.status.success :
                    (new Date().getHours() > 11 || (new Date().getHours() === 11 && new Date().getMinutes() >= 30) ? Colors.status.error : Colors.status.warning)
                }]}>
                  <Feather
                    name={todayAttendance?.morningMarked ? "check" : (new Date().getHours() > 11 || (new Date().getHours() === 11 && new Date().getMinutes() >= 30) ? "x" : "clock")}
                    size={10}
                    color="#FFF"
                  />
                </View>
              </View>
              <ThemedText style={styles.sessionLabel}>Morning</ThemedText>
              <ThemedText style={[styles.sessionStatus, {
                color: todayAttendance?.morningMarked ? Colors.status.success :
                  (new Date().getHours() > 12 || (new Date().getHours() === 12 && new Date().getMinutes() >= 30) ? Colors.status.error : theme.textSecondary)
              }]}>
                {todayAttendance?.morningMarked ? "Present" : (new Date().getHours() > 12 || (new Date().getHours() === 12 && new Date().getMinutes() >= 30) ? "Absent" : "07:00-12:30")}
              </ThemedText>
            </View>

            {/* Afternoon Session Box */}
            <View style={[styles.sessionItem, { backgroundColor: theme.backgroundSecondary }]}>
              <View style={[styles.sessionIcon, {
                backgroundColor: todayAttendance?.afternoonMarked ? Colors.status.success + '20' :
                  (new Date().getHours() > 16 || (new Date().getHours() === 16 && new Date().getMinutes() >= 30) ? Colors.status.error + '20' : Colors.status.warning + '20'),
                overflow: 'hidden'
              }]}>
                {todayAttendance?.afternoon?.photoUrl ? (
                  <Image source={{ uri: todayAttendance.afternoon.photoUrl }} style={StyleSheet.absoluteFill} />
                ) : (
                  <Feather
                    name={todayAttendance?.afternoonMarked ? "check" : (new Date().getHours() > 16 || (new Date().getHours() === 16 && new Date().getMinutes() >= 30) ? "x" : "clock")}
                    size={24}
                    color={todayAttendance?.afternoonMarked ? Colors.status.success :
                      (new Date().getHours() > 16 || (new Date().getHours() === 16 && new Date().getMinutes() >= 30) ? Colors.status.error : Colors.status.warning)}
                  />
                )}
                {/* Small indicator overlay */}
                <View style={[styles.statusIndicatorOverlay, {
                  backgroundColor: todayAttendance?.afternoonMarked ? Colors.status.success :
                    (new Date().getHours() > 16 || (new Date().getHours() === 16 && new Date().getMinutes() >= 30) ? Colors.status.error : Colors.status.warning)
                }]}>
                  <Feather
                    name={todayAttendance?.afternoonMarked ? "check" : (new Date().getHours() > 16 || (new Date().getHours() === 16 && new Date().getMinutes() >= 30) ? "x" : "clock")}
                    size={10}
                    color="#FFF"
                  />
                </View>
              </View>
              <ThemedText style={styles.sessionLabel}>Afternoon</ThemedText>
              <ThemedText style={[styles.sessionStatus, {
                color: todayAttendance?.afternoonMarked ? Colors.status.success :
                  (new Date().getHours() > 18 ? Colors.status.error : theme.textSecondary)
              }]}>
                {todayAttendance?.afternoonMarked ? "Present" : (new Date().getHours() > 18 ? "Absent" : "12:30-18:00")}
              </ThemedText>
            </View>
          </View>

          {/* Location & Action Section */}
          <View style={{ marginTop: 16 }}>
            <Pressable
              style={[styles.hostelSelector, { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)' }]}
              onPress={() => setShowHostelPicker(true)}
            >
              <View style={styles.hostelSelectorContent}>
                <View style={styles.hostelIconWrapper}>
                  <Feather name="map-pin" size={16} color={Colors.primary.main} />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="caption" secondary style={{ fontSize: 9, textTransform: 'uppercase' }}>Current Hostel</ThemedText>
                  <ThemedText type="body" style={{ fontWeight: '700', fontSize: 14 }}>{selectedHostel || "Select Hostel"}</ThemedText>
                </View>
                <Feather name="chevron-down" size={18} color={theme.textSecondary} />
              </View>
            </Pressable>

            <View style={[styles.locationStatusBadge, {
              backgroundColor: locationStatus?.valid ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              borderColor: locationStatus?.valid ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              marginTop: 12
            }]}>
              <Feather
                name={locationStatus?.valid ? "check-circle" : "alert-circle"}
                size={14}
                color={locationStatus?.valid ? Colors.status.success : Colors.status.error}
              />
              <ThemedText style={{
                color: locationStatus?.valid ? Colors.status.success : Colors.status.error,
                fontSize: 12,
                fontWeight: '600'
              }}>
                {locationStatus?.message || "Validating location..."}
              </ThemedText>
            </View>

            {getCurrentSession() && !((getCurrentSession() === 'morning' && todayAttendance?.morningMarked) ||
              (getCurrentSession() === 'afternoon' && todayAttendance?.afternoonMarked)) ? (
              <Button
                onPress={() => {
                  setIsCameraOpen(true);
                  setIsCameraReady(false);
                  setErrorMessage(null);
                  setProcessingStatus("");
                }}
                disabled={!locationStatus?.valid && Platform.OS !== 'web'}
                style={{ marginTop: 16, height: 50, borderRadius: BorderRadius.sm }}
              >
                Mark {getCurrentSession() === 'morning' ? 'Morning' : 'Afternoon'} Attendance
              </Button>
            ) : (
              <View style={{ marginTop: 16, alignItems: 'center' }}>
                {(todayAttendance?.morningMarked || todayAttendance?.afternoonMarked) ? (
                  <View style={{ width: '100%', gap: 12 }}>
                    <View style={[styles.closedAlert, { backgroundColor: Colors.status.success + '10', borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.status.success + '30' }]}>
                      <Feather name="check-circle" size={18} color={Colors.status.success} />
                      <ThemedText style={{ color: Colors.status.success, fontWeight: '700' }}>
                        {getCurrentSession() ? "Session Already Marked" : "All Sessions Complete"}
                      </ThemedText>
                    </View>

                    {/* Test Mode Delete Button */}
                    <Button
                      variant="outline"
                      onPress={handleDelete}
                      loading={deleteAttendanceMutation.isPending}
                      style={{ borderColor: Colors.status.error + '40' }}
                      textStyle={{ color: Colors.status.error, fontSize: 13 }}
                    >
                      Reset Attendance (Test Mode)
                    </Button>
                  </View>
                ) : !getCurrentSession() ? (
                  <View style={[styles.closedAlert, { backgroundColor: Colors.status.warning + '15' }]}>
                    <Feather name="clock" size={18} color={Colors.status.warning} />
                    <ThemedText style={{ color: Colors.status.warning, fontWeight: '600' }}>Attendance Window Closed</ThemedText>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>


        <View style={styles.sectionTitle}>
          <ThemedText type="h2">Monthly Statistics</ThemedText>
        </View>

        <View style={[styles.statsCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.monthSelector}>
            <Feather name="chevron-left" size={24} color={theme.text} />
            <ThemedText style={styles.monthText}>December 2025</ThemedText>
            <Feather name="chevron-right" size={24} color={theme.text} />
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <ThemedText type="h3" style={{ color: Colors.status.success }}>
                {calculatedStats.present}
              </ThemedText>
              <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>Present</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText type="h3" style={{ color: Colors.status.error }}>
                {calculatedStats.absent}
              </ThemedText>
              <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>Absent</ThemedText>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <ThemedText type="h3" style={{ color: Colors.status.warning }}>
                {calculatedStats.leave}
              </ThemedText>
              <ThemedText style={{ color: theme.textSecondary, fontSize: 12 }}>Leave</ThemedText>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <ThemedText style={{ fontSize: 12, fontWeight: '600' }}>Attendance</ThemedText>
              <ThemedText style={{ fontSize: 12, fontWeight: '700' }}>
                {calculatedStats.percentage}%
              </ThemedText>
            </View>
            <View style={[styles.progressBar, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${calculatedStats.percentage}%`,
                    backgroundColor: calculatedStats.percentage >= 75 ? Colors.status.success : Colors.status.error
                  }
                ]}
              />
            </View>
            <ThemedText style={[styles.progressLabel, { color: theme.textSecondary, fontSize: 11, marginTop: 8 }]}>
              Minimum 75% required
            </ThemedText>
          </View>
        </View>

        <View style={styles.sectionTitle}>
          <ThemedText type="h3">Calendar View</ThemedText>
        </View>
        <View style={[styles.calendarCard, { backgroundColor: theme.backgroundDefault }]}>
          {renderCalendar()}
        </View>

      </ScrollView>

      <Modal
        visible={showHostelPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHostelPicker(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Select Hostel</ThemedText>
              <Pressable 
                ref={hostelCloseButtonRef}
                onPress={() => setShowHostelPicker(false)}
                accessibilityRole="button"
                accessibilityLabel="Close hostel picker"
              >
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.hostelList}>
              {hostelOptions.map((hostel) => (
                <Pressable
                  key={hostel}
                  style={[
                    styles.hostelOption,
                    {
                      backgroundColor: selectedHostel === hostel ? Colors.primary.light + "20" : theme.backgroundDefault,
                      borderColor: selectedHostel === hostel ? Colors.primary.main : theme.border
                    }
                  ]}
                  onPress={() => {
                    setSelectedHostel(hostel);
                    setShowHostelPicker(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{
                      color: selectedHostel === hostel ? Colors.primary.main : theme.text
                    }}>
                      {hostel}
                    </ThemedText>
                  </View>
                  {selectedHostel === hostel && (
                    <Feather name="check" size={20} color={Colors.primary.main} />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <LoadingOverlay visible={isProcessing} message={processingStatus || "Verifying attendance..."} icon="check-circle" />
    </ThemedView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  leaveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
    borderWidth: 1,
    gap: Spacing.md,
    ...Shadows.card
  },
  leaveBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xxl,
    backgroundColor: 'rgba(27, 37, 75, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    ...Shadows.card,
  },
  statusHeader: {
    marginBottom: Spacing.xl,
  },
  notMarkedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF'
  },
  inlineError: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  timeDisplay: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.sm,
  },
  webNote: {
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    marginBottom: Spacing.lg,
  },
  statsCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(27, 37, 75, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    ...Shadows.card,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  monthText: {
    fontWeight: "600",
    fontSize: 16,
  },
  statsGrid: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xxl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: Spacing.xl,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  progressContainer: {
    marginTop: Spacing.sm,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
  progressLabel: {
    textAlign: "center",
  },
  calendarCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(27, 37, 75, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    ...Shadows.card,
    marginBottom: Spacing.xl,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  statsBadgeSmall: {
    backgroundColor: Colors.primary.main + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  percentageText: {
    color: Colors.primary.main,
    fontWeight: '800',
    fontSize: 14,
  },
  calendarGrid: {
    gap: Spacing.sm,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing.md,
  },
  weekDayText: {
    width: 32,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 12,
    fontWeight: '700',
  },
  todayIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  calendarLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "space-between",
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 40 : 20,
    zIndex: 10,
  },
  closeButton: {
    padding: Spacing.md,
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  headerTitleText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  scannerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerFrame: {
    width: width * 0.7,
    height: width * 0.7,
    position: 'relative',
  },
  scannerCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#FFFFFF',
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.primary.main,
    opacity: 0.5,
  },
  cameraBottomContainer: {
    padding: Spacing.xl,
    gap: Spacing.xl,
  },
  locationDetailPanel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    gap: 4,
  },
  locationStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  locationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  hostelNameText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  captureButtonWrapper: {
    alignItems: 'center',
    gap: 8,
  },
  captureButton: {
    padding: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 50,
  },
  captureButtonCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: Colors.primary.main,
  },
  captureHintText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  cameraErrorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
  },
  cameraErrorText: {
    color: '#FFFFFF',
    fontSize: 13,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  hostelList: {
    padding: Spacing.lg,
  },
  hostelOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
  },
  sessionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  sessionItem: {
    flex: 1,
    padding: 16,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    gap: 8,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  sessionStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusIndicatorOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#121212',
  },
  hostelSelector: {
    padding: 16,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  hostelSelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hostelIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: BorderRadius.md,
    width: '100%',
  },
});

