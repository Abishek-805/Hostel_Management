import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, Animated as RNAnimated, Platform } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, CommonActions } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Linking from 'expo-linking';
import Animated, { FadeInDown, FadeInRight, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, getQueryFn } from "@/lib/query-client";
import { Colors, Spacing, BorderRadius, Shadows } from "@/constants/theme";
import { HOSTEL_CODES } from "@/constants/hostels";
import { FloatingBackground } from "@/components/FloatingBackground";
import { BrandedLoadingOverlay } from "@/components/BrandedLoadingOverlay";

// Pulsing Icon Component
const PulsingIcon = ({ children, style }: { children: React.ReactNode, style: any }) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
};

// Blinking Dot Component
const BlinkingDot = ({
  color,
  duration = 1000,
  minOpacity = 0.3,
  maxOpacity = 1.0
}: {
  color: string,
  duration?: number,
  minOpacity?: number,
  maxOpacity?: number
}) => {
  const opacity = useRef(new RNAnimated.Value(minOpacity)).current;

  useEffect(() => {
    opacity.setValue(minOpacity);
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, { toValue: maxOpacity, duration: duration / 2, useNativeDriver: Platform.OS !== 'web' }),
        RNAnimated.timing(opacity, { toValue: minOpacity, duration: duration / 2, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [duration, minOpacity, maxOpacity]);

  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};

export default function AdminProfileScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user, logout, changePassword, updateUser } = useAuth();
  const navigation = useNavigation();

  // LIVE CLOCK & MESS STATUS LOGIC
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const getMealState = (type: "breakfast" | "lunch" | "dinner") => {
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let isActive = false;
    let label = "Closed";
    let config = { duration: 2000, minOpacity: 0.4, maxOpacity: 0.8 };

    if (type === "breakfast") {
      if (minutes >= 450 && minutes <= 520) { isActive = true; label = "Serving"; }
      else if (minutes >= 420 && minutes < 450) label = "Prep";
    } else if (type === "lunch") {
      if (minutes >= 735 && minutes <= 780) { isActive = true; label = "Serving"; }
      else if (minutes >= 700 && minutes < 735) label = "Prep";
    } else if (type === "dinner") {
      if (minutes >= 1170 && minutes <= 1230) { isActive = true; label = "Serving"; }
      else if (minutes >= 1140 && minutes < 1170) label = "Prep";
    }

    if (isActive) { config.duration = 400; config.minOpacity = 0.6; config.maxOpacity = 1.0; }
    return { ...config, label };
  };

  const breakfastState = getMealState("breakfast");
  const lunchState = getMealState("lunch");
  const dinnerState = getMealState("dinner");

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [skipCurrentPassword, setSkipCurrentPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showVerifyCodeModal, setShowVerifyCodeModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phone, setPhone] = useState(user?.phone || "");

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleCallStudent = (phoneNumber: string, studentName: string) => {
    console.log('Call button pressed for:', studentName, 'Phone:', phoneNumber);

    if (!phoneNumber) {
      if (Platform.OS === 'web') {
        window.alert(`${studentName} does not have a phone number on file.`);
      } else {
        Alert.alert('No Phone Number', `${studentName} does not have a phone number on file.`);
      }
      return;
    }

    // Handle web and mobile differently
    if (Platform.OS === 'web') {
      // For web, use browser's copy-to-clipboard and window.alert
      const msg = `${studentName}'s phone number: ${phoneNumber}\n\nCopy this number and call manually.`;
      window.alert(msg);
      // Also copy to clipboard for convenience
      if (navigator.clipboard) {
        navigator.clipboard.writeText(phoneNumber).then(() => {
          console.log('Phone number copied to clipboard');
        });
      }
    } else {
      // For mobile, use native Alert with Call option
      Alert.alert(
        `Contact ${studentName}`,
        `Phone: ${phoneNumber}\n\nClick "Call" to dial.`,
        [
          {
            text: 'Call',
            onPress: () => {
              Linking.openURL(`tel:${phoneNumber}`).catch((err) => {
                console.error('Call failed:', err);
                Alert.alert('Error', 'Unable to make phone call');
              });
            }
          },
          {
            text: 'Cancel',
            style: 'cancel'
          }
        ]
      );
    }
  };

  const handleChangePassword = async () => {
    setErrors({});
    const newErrors: Record<string, string> = {};

    // Get the correct hostel code from HOSTEL_CODES based on user's hostelBlock
    const correctHostelCode = HOSTEL_CODES[user?.hostelBlock || ""] || "";

    if (!currentPassword && !skipCurrentPassword) newErrors.currentPassword = "Current password is required";
    if (skipCurrentPassword && !verifyCode) newErrors.currentPassword = "Please enter your hostel code";
    if (skipCurrentPassword && verifyCode && verifyCode.trim() !== correctHostelCode.trim()) {
      newErrors.currentPassword = "Hostel code is incorrect";
    }
    if (!newPassword) newErrors.newPassword = "New password is required";
    if (!confirmPassword) newErrors.confirmPassword = "Confirm password is required";

    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }
    if (newPassword && newPassword.length < 6) {
      newErrors.newPassword = "Password must be at least 6 characters";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    // Send empty string if skipping current password with hostel code verification
    const result = await changePassword(skipCurrentPassword ? "" : currentPassword, newPassword);
    setIsLoading(false);

    if (result.success) {
      setShowPasswordModal(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setVerifyCode("");
      setSkipCurrentPassword(false);
      setErrors({});
      Alert.alert("Success", "Password changed successfully");
    } else {
      const errMsg = result.error || "Failed to change password";
      if (errMsg.toLowerCase().includes("current password")) {
        setErrors({ currentPassword: errMsg });
      } else {
        Alert.alert("Error", errMsg);
      }
    }
  };

  const handleUpdatePhone = async () => {
    if (!phone) {
      Alert.alert("Error", "Phone number is required");
      return;
    }
    setIsLoading(true);
    try {
      const response = await apiRequest("PUT", `/users/${user?.id}`, { phone });
      if (response.ok) {
        const updatedData = await response.json();
        // Update local context
        if (updateUser) await updateUser(updatedData);
        Alert.alert("Success", "Phone number updated successfully");
        setShowPhoneModal(false);
      } else {
        const errorData = await response.json();
        Alert.alert("Error", errorData.message || "Failed to update phone number");
      }
    } catch (error) {
      Alert.alert("Error", "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      // No need to manually reset navigation. 
      // RootStackNavigator will automatically redirect to Auth when user becomes null.
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const renderPasswordInput = (
    placeholder: string,
    value: string,
    onChangeText: (text: string) => void,
    field: string,
    showPass: boolean,
    toggleShowPass: () => void,
    error?: string
  ) => (
    <View>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.backgroundDefault,
            borderColor: error ? Colors.status.error : Colors.primary.main + '20',
            borderWidth: 1
          }
        ]}
      >
        <TextInput
          style={[styles.input, { color: theme.text, outlineStyle: 'none' } as any]}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            clearError(field);
          }}
          secureTextEntry={!showPass}
        />
        <Pressable onPress={toggleShowPass} style={{ padding: Spacing.sm }}>
          <Feather name={showPass ? "eye" : "eye-off"} size={20} color={theme.textSecondary} />
        </Pressable>
      </View>
      {error && (
        <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
          {error}
        </ThemedText>
      )}
    </View>
  );

  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['/stats/admin'],
    queryFn: getQueryFn({ on401: 'throw' }),
    enabled: user?.role === 'admin'
  });
  const statsData = stats as any || { studentCount: 0, pendingLeaveCount: 0, openComplaintCount: 0, absentCount: 0, absentStudents: [] };

  const handleHelpSupport = () => {
    setShowSupportModal(true);
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight, paddingBottom: tabBarHeight + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Section */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.headerContainer}>
          <View style={[styles.headerBanner, { backgroundColor: Colors.primary.main }]} />
          <View style={[styles.profileCard, { backgroundColor: theme.backgroundDefault }]}>
            <View style={[styles.avatarContainer, { borderColor: theme.backgroundRoot }]}>
              <PulsingIcon style={{}}>
                <View style={[styles.avatar, { backgroundColor: Colors.primary.light }]}>
                  <ThemedText type="h1" style={{ color: "#FFFFFF" }}>
                    {user?.name?.charAt(0).toUpperCase() || "A"}
                  </ThemedText>
                </View>
              </PulsingIcon>
              <View style={[styles.onlineBadge, { borderColor: theme.backgroundDefault }]} />
            </View>

            <ThemedText type="h2" style={styles.userName} numberOfLines={2}>
              {user?.name}
            </ThemedText>
            <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.md }} numberOfLines={1}>
              {user?.registerId} • Administrator
            </ThemedText>
          </View>
        </Animated.View>

        {/* MESS STATUS WIDGET */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={[styles.statusDashboard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md }}>
            <ThemedText type="h3">Mess Status</ThemedText>
            <ThemedText type="caption" secondary>{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</ThemedText>
          </View>
          <View style={styles.statusRow}>
            <View style={[styles.statusBox, { backgroundColor: Colors.status.success + '10', borderColor: Colors.status.success + '20' }]}>
              <View style={styles.statusHeader}>
                <BlinkingDot color={Colors.status.success} duration={breakfastState.duration} minOpacity={breakfastState.minOpacity} maxOpacity={breakfastState.maxOpacity} />
                <ThemedText type="caption" style={{ color: Colors.status.success, fontWeight: '700' }}>{breakfastState.label}</ThemedText>
              </View>
              <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Breakfast</ThemedText>
            </View>
            <View style={[styles.statusBox, { backgroundColor: Colors.status.warning + '10', borderColor: Colors.status.warning + '20' }]}>
              <View style={styles.statusHeader}>
                <BlinkingDot color={Colors.status.warning} duration={lunchState.duration} minOpacity={lunchState.minOpacity} maxOpacity={lunchState.maxOpacity} />
                <ThemedText type="caption" style={{ color: Colors.status.warning, fontWeight: '700' }}>{lunchState.label}</ThemedText>
              </View>
              <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Lunch</ThemedText>
            </View>
            <View style={[styles.statusBox, { backgroundColor: Colors.status.error + '10', borderColor: Colors.status.error + '20' }]}>
              <View style={styles.statusHeader}>
                <BlinkingDot color={Colors.status.error} duration={dinnerState.duration} minOpacity={dinnerState.minOpacity} maxOpacity={dinnerState.maxOpacity} />
                <ThemedText type="caption" style={{ color: Colors.status.error, fontWeight: '700' }}>{dinnerState.label}</ThemedText>
              </View>
              <ThemedText type="bodySmall" style={{ fontWeight: '600' }}>Dinner</ThemedText>
            </View>
          </View>
        </Animated.View>

        {/* Quick Stats Grid */}
        <Animated.View entering={FadeInRight.delay(300).springify()} style={styles.statsGrid}>
          {[
            { label: "Students", value: statsData.studentCount?.toString() || "0", icon: "users", color: Colors.primary.main },
            { label: "Leave Pending", value: statsData.pendingLeaveCount?.toString() || "0", icon: "clock", color: Colors.status.warning },
            { label: "Complaints", value: statsData.openComplaintCount?.toString() || "0", icon: "alert-circle", color: Colors.status.error },
          ].map((stat, i) => (
            <View key={i} style={[styles.statCard, { backgroundColor: theme.backgroundDefault, minHeight: 80 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, justifyContent: 'center' }}>
                <View style={[styles.statIcon, { backgroundColor: stat.color + "20" }]}>
                  <Feather name={stat.icon as any} size={18} color={stat.color} />
                </View>
                <ThemedText style={{ fontSize: 28, fontWeight: "700", color: theme.text }} numberOfLines={1}>{stat.value}</ThemedText>
              </View>
              <ThemedText type="caption" secondary numberOfLines={2} style={{ textAlign: 'center', marginTop: Spacing.xs }}>{stat.label}</ThemedText>
            </View>
          ))}
        </Animated.View>

        {/* Account Details Section */}
        <View style={styles.sectionHeader}>
          <ThemedText type="h3">Personal Information</ThemedText>
        </View>
        <Animated.View entering={FadeInDown.delay(400).springify()} style={[styles.detailsCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="mail" size={16} color={theme.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="bodySmall" secondary>Staff ID</ThemedText>
              <ThemedText type="body">{user?.registerId}</ThemedText>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="phone" size={16} color={theme.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="bodySmall" secondary>Phone</ThemedText>
              <ThemedText type="body">{user?.phone || "Not Set"}</ThemedText>
            </View>
            <Pressable
              style={[styles.editBadge, { backgroundColor: Colors.primary.main + '15' }]}
              onPress={() => {
                setPhone(user?.phone || "");
                setShowPhoneModal(true);
              }}
            >
              <Feather name="edit" size={16} color={Colors.primary.main} />
            </Pressable>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Feather name="map-pin" size={16} color={theme.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="bodySmall" secondary>Location</ThemedText>
              <ThemedText type="body">{user?.hostelBlock || "Not Assigned"}</ThemedText>
            </View>
          </View>
        </Animated.View>

        {/* Settings Section */}
        <View style={styles.sectionHeader}>
          <ThemedText type="h3">Settings & Preferences</ThemedText>
        </View>
        <Animated.View entering={FadeInDown.delay(500).springify()} style={styles.settingsSection}>
          <Pressable
            style={[styles.settingsItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => setShowPasswordModal(true)}
          >
            <View style={[styles.settingsIcon, { backgroundColor: Colors.primary.light + "20" }]}>
              <Feather name="lock" size={20} color={Colors.primary.main} />
            </View>
            <View style={styles.settingsContent}>
              <ThemedText type="body">Security</ThemedText>
              <ThemedText type="caption" secondary>Change password & 2FA</ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.settingsItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={() => setShowAbsentModal(true)}
          >
            <View style={[styles.settingsIcon, { backgroundColor: Colors.status.error + "20" }]}>
              <Feather name="user-x" size={20} color={Colors.status.error} />
            </View>
            <View style={styles.settingsContent}>
              <ThemedText type="body">Notifications</ThemedText>
              <ThemedText type="caption" secondary>Absent Students</ThemedText>
            </View>
            {statsData.absentCount > 0 && (
              <View style={[styles.badge, { backgroundColor: Colors.status.error }]}>
                <ThemedText style={{ color: "white", fontSize: 10, fontWeight: "bold" }}>{statsData.absentCount}</ThemedText>
              </View>
            )}
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.settingsItem, { backgroundColor: theme.backgroundDefault }]}
            onPress={handleHelpSupport}
          >
            <View style={[styles.settingsIcon, { backgroundColor: Colors.status.warning + "20" }]}>
              <Feather name="help-circle" size={20} color={Colors.status.warning} />
            </View>
            <View style={styles.settingsContent}>
              <ThemedText type="body">Help & Support</ThemedText>
              <ThemedText type="caption" secondary>Global Impact Team</ThemedText>
            </View>
            <Feather name="chevron-right" size={20} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            style={[styles.settingsItem, { backgroundColor: theme.backgroundDefault, marginTop: Spacing.sm }]}
            onPress={handleLogout}
          >
            <View style={[styles.settingsIcon, { backgroundColor: Colors.status.error + "10" }]}>
              <Feather name="log-out" size={20} color={Colors.status.error} />
            </View>
            <View style={styles.settingsContent}>
              <ThemedText type="body" style={{ color: Colors.status.error }}>Logout</ThemedText>
              <ThemedText type="caption" secondary>Sign out of your account</ThemedText>
            </View>
          </Pressable>
        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={showPasswordModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPasswordModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Change Password</ThemedText>
              <Pressable onPress={() => setShowPasswordModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalForm}>
              <View style={[styles.inputGroup, { marginBottom: Spacing.lg }]}>
                <ThemedText type="bodySmall" secondary style={styles.label}>Current Password</ThemedText>
                {!skipCurrentPassword ? (
                  renderPasswordInput(
                    "Enter current password",
                    currentPassword,
                    setCurrentPassword,
                    "currentPassword",
                    showCurrentPassword,
                    () => setShowCurrentPassword(!showCurrentPassword),
                    errors.currentPassword
                  )
                ) : (
                  <View style={[styles.inputContainer, { backgroundColor: theme.backgroundSecondary, justifyContent: 'center', borderColor: theme.border, borderWidth: 1 }]}>
                    <ThemedText type="body" style={{ color: theme.textSecondary, fontStyle: 'italic', paddingHorizontal: Spacing.lg }}>Verified with Hostel Code</ThemedText>
                  </View>
                )}
                <Pressable onPress={() => setSkipCurrentPassword(!skipCurrentPassword)} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
                  <ThemedText type="caption" style={{ color: Colors.primary.main, fontWeight: '600' }}>
                    {skipCurrentPassword ? "Use password instead" : "Verify with Hostel Code"}
                  </ThemedText>
                </Pressable>
              </View>

              {skipCurrentPassword && (
                <View style={[styles.inputGroup, { marginBottom: Spacing.lg, padding: Spacing.lg, backgroundColor: Colors.primary.main + '10', borderRadius: BorderRadius.md, borderColor: Colors.primary.main + '30', borderWidth: 1 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
                    <Feather name="key" size={20} color={Colors.primary.main} />
                    <ThemedText type="bodySmall" secondary style={[styles.label, { marginLeft: Spacing.md }]}>Verify with Hostel Code</ThemedText>
                  </View>
                  <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: errors.currentPassword ? Colors.status.error : Colors.primary.main + '20', borderWidth: 1, marginBottom: Spacing.md }]}>
                    <TextInput
                      style={[styles.input, { color: theme.text, outlineStyle: 'none' } as any]}
                      placeholder="Enter code"
                      placeholderTextColor={theme.textSecondary}
                      value={verifyCode}
                      onChangeText={setVerifyCode}
                    />
                  </View>
                  {errors.currentPassword && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md }}>
                      <Feather name="alert-circle" size={16} color={Colors.status.error} />
                      <ThemedText type="caption" style={{ color: Colors.status.error, marginLeft: Spacing.sm, fontWeight: '600' }}>
                        {errors.currentPassword}
                      </ThemedText>
                    </View>
                  )}
                  <Pressable onPress={() => setShowVerifyCodeModal(true)} style={{ alignSelf: 'flex-end' }}>
                    <ThemedText type="caption" style={{ color: Colors.primary.main, fontWeight: '600' }}>
                      Where to find it?
                    </ThemedText>
                  </Pressable>
                </View>
              )}

              <View style={styles.inputGroup}>
                <ThemedText type="bodySmall" secondary style={styles.label}>
                  New Password
                </ThemedText>
                {renderPasswordInput(
                  "Enter new password",
                  newPassword,
                  setNewPassword,
                  "newPassword",
                  showNewPassword,
                  () => setShowNewPassword(!showNewPassword),
                  errors.newPassword
                )}
              </View>
              <View style={styles.inputGroup}>
                <ThemedText type="bodySmall" secondary style={styles.label}>
                  Confirm Password
                </ThemedText>
                {renderPasswordInput(
                  "Confirm new password",
                  confirmPassword,
                  setConfirmPassword,
                  "confirmPassword",
                  showConfirmPassword,
                  () => setShowConfirmPassword(!showConfirmPassword),
                  errors.confirmPassword
                )}
              </View>
              <Button
                onPress={handleChangePassword}
                loading={isLoading}
                fullWidth
              >
                Update Password
              </Button>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      {/* Hostel Code Info Modal */}
      <Modal
        visible={showVerifyCodeModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowVerifyCodeModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot, paddingBottom: Spacing.xl }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Hostel Code</ThemedText>
              <Pressable onPress={() => setShowVerifyCodeModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalForm}>
              <View style={{ marginBottom: Spacing.lg, padding: Spacing.lg, backgroundColor: Colors.primary.main + '10', borderRadius: BorderRadius.md, borderColor: Colors.primary.main + '30', borderWidth: 1 }}>
                <ThemedText type="body" style={{ fontWeight: '600', marginBottom: Spacing.md }}>Your Hostel Code</ThemedText>
                <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.lg }}>
                  Your unique hostel code is a security feature that helps verify your identity when resetting your password.
                </ThemedText>
              </View>

              <ThemedText type="body" style={{ fontWeight: '600', marginBottom: Spacing.md }}>Where to find your code:</ThemedText>

              <View style={{ gap: Spacing.md, marginBottom: Spacing.lg }}>
                <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary.main, justifyContent: 'center', alignItems: 'center' }}>
                    <ThemedText style={{ color: 'white', fontWeight: 'bold' }}>1</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: '600' }}>Hostel Information</ThemedText>
                    <ThemedText type="caption" secondary>Check the Hostel Information section</ThemedText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary.main, justifyContent: 'center', alignItems: 'center' }}>
                    <ThemedText style={{ color: 'white', fontWeight: 'bold' }}>2</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: '600' }}>Hostel Display Board</ThemedText>
                    <ThemedText type="caption" secondary>Check the announcement board near the entrance</ThemedText>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary.main, justifyContent: 'center', alignItems: 'center' }}>
                    <ThemedText style={{ color: 'white', fontWeight: 'bold' }}>3</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: '600' }}>Contact Hostel Admin</ThemedText>
                    <ThemedText type="caption" secondary>Ask your hostel administrator for assistance</ThemedText>
                  </View>
                </View>
              </View>

              <Button onPress={() => setShowVerifyCodeModal(false)} fullWidth>Got it</Button>
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>

      {/* Update Phone Modal */}
      <Modal
        visible={showPhoneModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPhoneModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Update Phone Number</ThemedText>
              <Pressable onPress={() => setShowPhoneModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <View style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <ThemedText type="bodySmall" secondary>New Phone Number</ThemedText>
                <View style={[styles.inputContainer, { backgroundColor: theme.backgroundDefault, borderColor: Colors.primary.main + '20', borderWidth: 1 }]}>
                  <TextInput
                    style={[styles.input, { color: theme.text, outlineStyle: 'none' } as any]}
                    placeholder="Enter phone number"
                    placeholderTextColor={theme.textSecondary}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
              <Button
                onPress={handleUpdatePhone}
                loading={isLoading}
                fullWidth
              >
                Save Phone Number
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Absent Students Modal */}
      <Modal
        visible={showAbsentModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAbsentModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot, height: '70%' }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Absent Students</ThemedText>
              <Pressable onPress={() => setShowAbsentModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
              {!statsData.absentStudents || statsData.absentStudents.length === 0 ? (
                <View style={{ alignItems: 'center', marginTop: Spacing.xl }}>
                  <Feather name="check-circle" size={48} color={Colors.status.success} />
                  <ThemedText type="h3" style={{ marginTop: Spacing.md }}>All Present!</ThemedText>
                  <ThemedText secondary>No students are absent today.</ThemedText>
                </View>
              ) : (
                statsData.absentStudents.map((student: any, index: number) => (
                  <View key={index} style={[styles.detailRow, { borderBottomWidth: 1, borderBottomColor: theme.border, paddingVertical: Spacing.md, flexDirection: 'column', alignItems: 'stretch' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary.light + '40', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                          <ThemedText style={{ fontWeight: 'bold' }}>{student.name.charAt(0)}</ThemedText>
                        </View>
                        <View style={{ flex: 1 }}>
                          <ThemedText type="body" style={{ fontWeight: '600' }}>{student.name}</ThemedText>
                          <ThemedText type="caption" secondary>{student.registerId}</ThemedText>
                        </View>
                        {student.phone ? (
                          <ThemedText type="caption" style={{ color: Colors.primary.main, fontWeight: '500', fontSize: 14, marginRight: Spacing.sm }}>{student.phone}</ThemedText>
                        ) : null}
                      </View>
                      <Pressable
                        onPress={() => {
                          console.log('Phone button pressed, student.phone:', student.phone);
                          if (student.phone) {
                            handleCallStudent(student.phone, student.name);
                          } else {
                            Alert.alert('No Phone', `${student.name} does not have a phone number.`);
                          }
                        }}
                        style={({ pressed }) => ({
                          padding: Spacing.md,
                          opacity: pressed ? 0.7 : 1,
                          borderRadius: 8
                        })}>
                        <Feather name="phone" size={22} color={student.phone ? Colors.primary.main : theme.textSecondary} />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Support Team Modal */}
      <Modal
        visible={showSupportModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSupportModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: 'center', padding: Spacing.xl }}>
          <View style={{ backgroundColor: theme.backgroundDefault, borderRadius: BorderRadius.md, padding: Spacing.xl, ...Shadows.card }}>
            <View style={{ alignItems: 'center', marginBottom: Spacing.lg }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary.main + '20', justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md }}>
                <Feather name="globe" size={32} color={Colors.primary.main} />
              </View>
              <ThemedText type="h2" style={{ textAlign: 'center' }}>Global Impact Challenge</ThemedText>
              <ThemedText secondary style={{ textAlign: 'center' }}>Developed by Team</ThemedText>
            </View>

            <View style={{ gap: Spacing.md }}>
              {[
                { name: "Abishek M", role: "Lead Developer" },
                { name: "Prem M", role: "UI/UX Designer" },
                { name: "Sevesh SS", role: "Backend Engineer" }
              ].map((member, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, backgroundColor: theme.backgroundSecondary, borderRadius: BorderRadius.sm }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.secondary.main }} />
                  <View>
                    <ThemedText type="body" style={{ fontWeight: 'bold' }}>{member.name}</ThemedText>
                    <ThemedText type="caption" secondary>{member.role}</ThemedText>
                  </View>
                </View>
              ))}
            </View>

            <Button style={{ marginTop: Spacing.xl }} onPress={() => setShowSupportModal(false)} fullWidth>Close</Button>
          </View>
        </View>
      </Modal>
      <BrandedLoadingOverlay visible={statsLoading} message="Loading admin profile..." icon="shield" color={Colors.secondary.main} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  headerContainer: {
    marginBottom: Spacing.xl,
    marginTop: Spacing.sm
  },
  statusDashboard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xxl,
    ...Shadows.card,
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statusBox: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerBanner: {
    height: 80,
    borderRadius: BorderRadius.md,
    marginBottom: -40,
    opacity: 0.9
  },
  profileCard: {
    marginHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    paddingTop: 50, // space for avatar
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    ...Shadows.card,
  },
  avatarContainer: {
    position: "absolute",
    top: -40,
    borderWidth: 4,
    borderRadius: 50,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  onlineBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.status.success,
    borderWidth: 3,
  },
  editBadge: {
    padding: 6,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    marginBottom: 2,
    textAlign: 'center'
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl
  },
  statCard: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    minHeight: 80,
    overflow: 'hidden',
    ...Shadows.card
  },
  statIcon: {
    padding: 6,
    borderRadius: BorderRadius.full,
  },
  sectionHeader: {
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs
  },
  detailsCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xxl,
    ...Shadows.card,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    flex: 1
  },
  detailIcon: {
    width: 32,
    alignItems: 'center'
  },
  divider: {
    height: 1,
    marginVertical: Spacing.xs,
    marginLeft: 32 + Spacing.md
  },
  settingsSection: {
    gap: Spacing.md,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    ...Shadows.card,
  },
  settingsIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.sm,
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: Spacing.sm
  },
  settingsContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: Spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalForm: {
    padding: Spacing.xl,
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.sm,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
  },
  input: {
    flex: 1,
    height: "100%",
    fontSize: 16,
  },
  label: {
    marginBottom: 6,
    fontWeight: '600' as any,
  },
});
