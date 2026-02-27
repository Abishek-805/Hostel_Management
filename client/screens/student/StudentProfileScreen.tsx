import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, View, ScrollView, Pressable, Modal, TextInput, Alert, Image, Animated as RNAnimated, Platform, ActivityIndicator, RefreshControl } from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation, CommonActions, useFocusEffect } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import Animated, { FadeInDown, FadeInRight, useSharedValue, withRepeat, withTiming, useAnimatedStyle, Easing } from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";
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
        RNAnimated.timing(opacity, {
          toValue: maxOpacity,
          duration: duration / 2,
          useNativeDriver: Platform.OS !== 'web'
        }),
        RNAnimated.timing(opacity, {
          toValue: minOpacity,
          duration: duration / 2,
          useNativeDriver: Platform.OS !== 'web'
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [duration, minOpacity, maxOpacity]);

  return <RNAnimated.View style={[styles.dot, { backgroundColor: color, opacity }]} />;
};

interface SettingsItemProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  showArrow?: boolean;
  danger?: boolean;
  iconColor?: string;
  iconBgColor?: string;
}

// Helper function to sanitize profile image URIs
const sanitizeProfileImageUri = (uri: string | undefined): string | undefined => {
  if (!uri) return undefined;

  // Remove duplicate data URI prefixes that might exist
  // e.g., "data:image/jpeg;base64,data:image/png;base64,..." becomes valid
  const dataUriMatch = uri.match(/data:image\/[^;]+;base64,/);
  if (dataUriMatch) {
    const lastIndex = uri.lastIndexOf(dataUriMatch[0]);
    if (lastIndex > 0) {
      // If we found the prefix at a position other than 0, remove everything before it
      return uri.substring(lastIndex);
    }
  }

  // Ensure proper data URI format
  if (!uri.startsWith('data:image')) {
    return `data:image/jpeg;base64,${uri}`;
  }

  return uri;
};

function SettingsItem({ icon, title, subtitle, onPress, showArrow = true, danger = false, iconColor, iconBgColor }: SettingsItemProps) {
  const { theme } = useTheme();

  const finalIconColor = iconColor || (danger ? Colors.status.error : Colors.primary.main);
  const finalIconBgColor = iconBgColor || (danger ? Colors.status.error + "20" : Colors.primary.light + "20");

  return (
    <Pressable
      style={[styles.settingsItem, { backgroundColor: theme.backgroundDefault }]}
      onPress={onPress}
    >
      <View style={[styles.settingsIcon, { backgroundColor: finalIconBgColor }]}>
        <Feather name={icon} size={20} color={finalIconColor} />
      </View>
      <View style={styles.settingsContent}>
        <ThemedText type="body" style={[danger && { color: Colors.status.error }]}>{title}</ThemedText>
        {subtitle ? <ThemedText type="caption" secondary>{subtitle}</ThemedText> : null}
      </View>
      {showArrow ? <Feather name="chevron-right" size={20} color={theme.textSecondary} /> : null}
    </Pressable>
  );
}

export default function StudentProfileScreen() {
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { user: authUser, logout, changePassword, updateUser } = useAuth();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

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

  const userProfileQueryKey = ['userProfile', authUser?.id];

  const { data: user, refetch, isLoading: queryLoading } = useQuery({
    queryKey: userProfileQueryKey,
    queryFn: async () => {
      if (!authUser?.id) return null;
      const res = await apiRequest("GET", `/users/${authUser.id}`);
      return res.json();
    },
    initialData: authUser,
    enabled: !!authUser?.id,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [skipCurrentPassword, setSkipCurrentPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPinModal, setShowPinModal] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinAction, setPinAction] = useState<"image" | "phone" | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [showVerifyCodeModal, setShowVerifyCodeModal] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [phoneError, setPhoneError] = useState("");

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleTakePicture = async () => {
    // If user already has a profile image, they need a PIN to update it
    if (user?.profileImage) {
      setPinAction("image");
      setShowPinModal(true);
      return;
    }

    // First time capture
    if (!permission?.granted) {
      const { status } = await requestPermission();
      if (status !== 'granted') {
        Alert.alert("Permission Error", "Camera access is required to register Face ID.");
        return;
      }
    }
    setIsCameraOpen(true);
  };

  const handlePhoneUpdate = () => {
    setNewPhone(user?.phone || "");
    setPhoneError("");
    setShowPhoneModal(true);
  };

  const executeImageUpdate = async (imageBase64: string) => {
    try {
      const targetId = (user as any)?._id || (user as any)?.id;
      if (!targetId) {
        throw new Error("User ID not found");
      }

      setIsLoading(true);
      setUploadStatus("📤 Uploading photo...");
      console.log("🔄 Sending to server...");

      await apiRequest("PUT", `/users/${targetId}`, {
        profileImage: imageBase64,
      });

      console.log("✅ Server responded successfully");

      await updateUser({ profileImage: imageBase64 });
      queryClient.setQueryData(userProfileQueryKey, (old: any) => ({
        ...(old || {}),
        profileImage: imageBase64,
      }));
      queryClient.invalidateQueries({ queryKey: userProfileQueryKey });
      await refetch();

      // Successfully updated, can clear loading state
      setUploadStatus(null);
      setIsLoading(false);
      Alert.alert("Success", "Face ID registered successfully!");
    } catch (e: any) {
      console.error("❌ Profile update error:", e);
      setUploadStatus(null);
      setIsLoading(false);
      const errorMsg = e?.message || "Failed to register Face ID";
      Alert.alert("Error", errorMsg);
    }
  };

  const takePicture = async () => {
    if (cameraRef.current && isCameraReady) {
      try {
        setIsLoading(true);
        console.log("📸 Capturing photo...");

        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: true,
        });

        if (photo?.base64) {
          // Exit camera mode immediately after capture
          setIsCameraOpen(false);
          setIsCameraReady(false);

          // Ensure we don't double-prefix the base64 data
          let base64 = photo.base64;
          if (!base64.startsWith('data:image')) {
            base64 = `data:image/jpeg;base64,${base64}`;
          }
          console.log(`✓ Photo captured (${(base64.length / 1024).toFixed(1)}KB), extracting face...`);

          // Now proceed with update on the main screen (which will show BrandedLoadingOverlay)
          await executeImageUpdate(base64);
        } else {
          setIsLoading(false);
          Alert.alert("Camera Error", "Failed to capture photo. Please try again.");
        }
      } catch (err) {
        console.error("❌ Camera error:", err);
        setIsLoading(false);
        Alert.alert("Camera Error", "Failed to take photo. Please try again.");
      }
    }
  };

  const handleVerifyPin = async () => {
    if (!user?.hostelBlock) {
      Alert.alert("Error", "Hostel block not assigned. Please contact admin.");
      return;
    }

    const correctPin = HOSTEL_CODES[user.hostelBlock];
    if (adminPin === correctPin) {
      setShowPinModal(false);
      setAdminPin("");
      setPinError("");

      if (pinAction === "image") {
        if (!permission?.granted) {
          const { status } = await requestPermission();
          if (status !== 'granted') {
            Alert.alert("Permission Error", "Camera access is required to register Face ID.");
            return;
          }
        }
        setIsCameraOpen(true);
      } else if (pinAction === "phone") {
        executePhoneUpdate();
      }
      setPinAction(null);
    } else {
      setPinError("Incorrect PIN number. Please contact your hostel block admin.");
    }
  };

  const executePhoneUpdate = async () => {
    try {
      const targetId = (user as any)?._id || (user as any)?.id;
      setIsLoading(true);

      await apiRequest("PUT", `/users/${targetId}`, {
        phone: newPhone,
      });

      await updateUser({ phone: newPhone });
      queryClient.setQueryData(userProfileQueryKey, (old: any) => ({
        ...(old || {}),
        phone: newPhone,
      }));
      queryClient.invalidateQueries({ queryKey: userProfileQueryKey });
      await refetch();

      setIsLoading(false);
      Alert.alert("Success", "Phone number updated successfully!");
    } catch (e: any) {
      console.error("❌ Phone update error:", e);
      setIsLoading(false);
      Alert.alert("Error", e?.message || "Failed to update phone number");
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

  const handleLogout = async () => {
    try {
      await logout();
      // No need to manually reset navigation. 
      // RootStackNavigator will automatically redirect to Auth when user becomes null.
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const renderPasswordInput = (
    placeholder: string,
    value: string,
    onChangeText: (text: string) => void,
    field: string,
    showPass: boolean,
    toggleShowPass: () => void,
    error?: string,
  ) => (
    <View>
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: theme.backgroundDefault,
            borderColor: error ? Colors.status.error : theme.border,
            borderWidth: error ? 1 : 0
          }
        ]}
      >
        <TextInput
          style={[styles.input, { color: theme.text, flex: 1, paddingHorizontal: 0, outlineStyle: 'none' } as any]}
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

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: headerHeight + Spacing.lg, paddingBottom: tabBarHeight + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary.main} />}
      >
        {/* Profile Card Animation */}
        <Animated.View entering={FadeInDown.delay(100).springify()} style={[styles.profileCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.avatarContainer}>
            <Pressable onPress={handleTakePicture} style={styles.avatarWrapper}>
              <PulsingIcon style={{}}>
                {user?.profileImage ? (
                  <Image source={{ uri: sanitizeProfileImageUri(user.profileImage) }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: Colors.primary.light + "30" }]}>
                    <ThemedText type="h1" style={{ color: Colors.primary.main }}>
                      {user?.name?.charAt(0).toUpperCase() || "S"}
                    </ThemedText>
                  </View>
                )}
              </PulsingIcon>
              <View style={styles.editAvatarBadge}>
                <Feather name="camera" size={14} color="#FFFFFF" />
              </View>
            </Pressable>
          </View>
          <ThemedText type="h2" style={styles.userName} numberOfLines={2}>{user?.name}</ThemedText>
          <ThemedText type="bodySmall" secondary numberOfLines={1}>{user?.registerId}</ThemedText>

          {user?.roomNumber && user?.hostelBlock ? (
            <View style={styles.roomBadge}>
              <Feather name="home" size={16} color={Colors.primary.main} />
              <ThemedText type="bodySmall" style={{ color: Colors.primary.main }}>
                Block {user.hostelBlock}, Room {user.roomNumber}
              </ThemedText>
            </View>
          ) : null}
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

        <ThemedText type="h3" style={styles.sectionTitle}>Room Details</ThemedText>
        <Animated.View entering={FadeInDown.delay(300).springify()} style={[styles.detailsCard, { backgroundColor: theme.backgroundDefault }]}>
          <View style={styles.detailRow}>
            <ThemedText type="bodySmall" secondary>Student Name</ThemedText>
            <ThemedText type="body" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>{user?.name}</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.detailRow}>
            <ThemedText type="bodySmall" secondary>Registration ID</ThemedText>
            <ThemedText type="body">{user?.registerId}</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.detailRow}>
            <ThemedText type="bodySmall" secondary>Room Number</ThemedText>
            <ThemedText type="body">{user?.roomNumber || "Not assigned"}</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.detailRow}>
            <ThemedText type="bodySmall" secondary>Hostel Block</ThemedText>
            <ThemedText type="body">{user?.hostelBlock || "Not assigned"}</ThemedText>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.detailRow}>
            <ThemedText type="bodySmall" secondary>Phone Number</ThemedText>
            <View style={{ alignItems: 'flex-end' }}>
              <Pressable
                onPress={handlePhoneUpdate}
                style={{ padding: 2, marginBottom: -2 }}
              >
                <Feather name="edit-2" size={10} color={theme.textSecondary} />
              </Pressable>
              <ThemedText type="body">{user?.phone || "Not provided"}</ThemedText>
            </View>
          </View>
        </Animated.View>

        <ThemedText type="h3" style={styles.sectionTitle}>Settings</ThemedText>
        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.settingsSection}>
          <SettingsItem
            icon="lock"
            title="Change Password"
            subtitle="Update your account password"
            onPress={() => setShowPasswordModal(true)}
          />
          <SettingsItem
            icon="help-circle"
            title="Help & Support"
            subtitle="Global Impact Team"
            onPress={() => setShowSupportModal(true)}
            iconColor={Colors.status.warning}
            iconBgColor={Colors.status.warning + "20"}
          />
          <SettingsItem
            icon="log-out"
            title="Logout"
            subtitle="Sign out of your account"
            onPress={handleLogout}
            danger
          />
        </Animated.View>
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

              <View style={[styles.inputGroup, { marginBottom: Spacing.lg }]}>
                <ThemedText type="bodySmall" secondary style={styles.label}>New Password</ThemedText>
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

              <View style={[styles.inputGroup, { marginBottom: Spacing.lg }]}>
                <ThemedText type="bodySmall" secondary style={styles.label}>Confirm New Password</ThemedText>
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
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: 'bold' }} numberOfLines={1}>{member.name}</ThemedText>
                    <ThemedText type="caption" secondary numberOfLines={1}>{member.role}</ThemedText>
                  </View>
                </View>
              ))}
            </View>

            <Button style={{ marginTop: Spacing.xl }} onPress={() => setShowSupportModal(false)} fullWidth>Close</Button>
          </View>
        </View>
      </Modal>

      {/* Hostel Code Verification Modal */}
      <Modal
        visible={showVerifyCodeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowVerifyCodeModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Hostel Code Information</ThemedText>
              <Pressable onPress={() => setShowVerifyCodeModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>
            <KeyboardAwareScrollViewCompat contentContainerStyle={styles.modalForm}>
              <View style={[{ backgroundColor: Colors.primary.main + '10', borderColor: Colors.primary.main + '30', borderWidth: 2, padding: Spacing.xl, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.lg }]}>
                <Feather name="key" size={40} color={Colors.primary.main} style={{ marginBottom: Spacing.md }} />
                <ThemedText type="h3" style={{ textAlign: 'center', marginBottom: Spacing.md }}>Your Hostel Code</ThemedText>
                <ThemedText type="h2" style={{ fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center', fontWeight: 'bold', color: Colors.primary.main, marginBottom: Spacing.md }}>
                  {user?.hostelUniqueCode || "N/A"}
                </ThemedText>
                <ThemedText secondary style={{ textAlign: 'center' }}>
                  This unique code identifies your hostel for password reset verification
                </ThemedText>
              </View>

              <ThemedText type="body" style={{ marginBottom: Spacing.md }}>
                <ThemedText type="bodySmall" secondary>You can find this code:</ThemedText>
              </ThemedText>
              
              <View style={{ gap: Spacing.md, marginBottom: Spacing.xl }}>
                <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary.main, justifyContent: 'center', alignItems: 'center' }}>
                    <ThemedText style={{ color: 'white', fontWeight: 'bold' }}>1</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="body" style={{ fontWeight: '600' }}>In your Profile</ThemedText>
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
      <BrandedLoadingOverlay visible={queryLoading || isLoading} message={isLoading ? "Updating profile..." : "Loading profile..."} icon="user" />

      {/* Admin PIN Modal */}
      <Modal
        visible={showPinModal}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowPinModal(false);
          setPinAction(null);
          setAdminPin("");
          setPinError("");
        }}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.backgroundRoot, paddingBottom: Spacing.xl }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">
                {pinAction === "image" ? "Update Profile Picture" : "Update Phone Number"}
              </ThemedText>
              <Pressable onPress={() => {
                setShowPinModal(false);
                setPinAction(null);
                setAdminPin("");
                setPinError("");
              }}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.modalForm}>
              <ThemedText type="body" style={{ textAlign: 'center', marginBottom: Spacing.md }}>
                This action can only be performed with the Hostel Admin's PIN.
              </ThemedText>

              <View style={styles.inputGroup}>
                <ThemedText type="bodySmall" secondary style={styles.label}>Admin PIN Number</ThemedText>
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: theme.backgroundDefault,
                      borderColor: pinError ? Colors.status.error : theme.border,
                      borderWidth: 1
                    }
                  ]}
                >
                  <TextInput
                    style={[styles.input, { color: theme.text, flex: 1, outlineStyle: 'none' } as any]}
                    placeholder="Enter Admin PIN"
                    placeholderTextColor={theme.textSecondary}
                    value={adminPin}
                    onChangeText={(text) => {
                      setAdminPin(text);
                      if (pinError) setPinError("");
                    }}
                    secureTextEntry
                  />
                </View>
                {pinError ? (
                  <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                    {pinError}
                  </ThemedText>
                ) : null}
              </View>

              <Button
                onPress={handleVerifyPin}
                style={{ marginTop: Spacing.md }}
                fullWidth
              >
                Verify & Continue
              </Button>
            </View>
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
              <ThemedText type="h3">Change Phone Number</ThemedText>
              <Pressable onPress={() => setShowPhoneModal(false)}>
                <Feather name="x" size={24} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <ThemedText type="bodySmall" secondary style={styles.label}>New Phone Number</ThemedText>
                <View
                  style={[
                    styles.inputContainer,
                    {
                      backgroundColor: theme.backgroundDefault,
                      borderColor: phoneError ? Colors.status.error : theme.border,
                      borderWidth: 1
                    }
                  ]}
                >
                  <TextInput
                    style={[styles.input, { color: theme.text, flex: 1, outlineStyle: 'none' } as any]}
                    placeholder="Enter phone number"
                    placeholderTextColor={theme.textSecondary}
                    value={newPhone}
                    onChangeText={(text) => {
                      setNewPhone(text);
                      if (phoneError) setPhoneError("");
                    }}
                    keyboardType="phone-pad"
                  />
                </View>
                {phoneError ? (
                  <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                    {phoneError}
                  </ThemedText>
                ) : null}
              </View>

              <Button
                onPress={() => {
                  if (!newPhone || newPhone.length < 10) {
                    setPhoneError("Please enter a valid phone number");
                    return;
                  }
                  setShowPhoneModal(false);
                  setPinAction("phone");
                  setShowPinModal(true);
                }}
                style={{ marginTop: Spacing.md }}
                fullWidth
              >
                Proceed to Verfication
              </Button>
            </View>
          </View>
        </View>
      </Modal>

      {/* Camera Capture Modal */}
      <Modal
        visible={isCameraOpen}
        animationType="slide"
        onRequestClose={() => !isLoading && setIsCameraOpen(false)}
        accessibilityViewIsModal={true}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="front"
            onCameraReady={() => setIsCameraReady(true)}
          />
          <View style={styles.cameraOverlay}>
            <Pressable
              style={styles.closeCameraButton}
              onPress={() => !isLoading && setIsCameraOpen(false)}
              disabled={isLoading}
            >
              <Feather name="x" size={28} color="#FFF" />
            </Pressable>

            <View style={styles.captureButtonContainer}>
              <Pressable
                style={[styles.captureButton, isLoading && { opacity: 0.6 }]}
                onPress={takePicture}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <View style={styles.captureButtonInner} />
                )}
              </Pressable>
              <ThemedText style={{ color: '#FFF', marginTop: 10 }}>
                {uploadStatus || "Capture Face ID"}
              </ThemedText>
            </View>
          </View>

          {/* Loading/Status Overlay */}
          {uploadStatus && (
            <View style={styles.statusOverlay}>
              <View style={styles.statusContent}>
                <ActivityIndicator size="large" color={Colors.primary.main} />
                <ThemedText type="h3" style={{ marginTop: Spacing.lg, textAlign: 'center' }}>
                  {uploadStatus}
                </ThemedText>
              </View>
            </View>
          )}
        </View>
      </Modal>
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
  profileCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    marginBottom: Spacing.md,
    ...Shadows.card,
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
  avatarContainer: {
    marginBottom: Spacing.lg,
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarWrapper: {
    position: 'relative',
  },
  editBadge: {
    padding: 8,
    borderRadius: 8,
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primary.main,
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userName: {
    marginBottom: Spacing.xs,
  },
  roomBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary.light + "15",
    borderRadius: BorderRadius.full,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  detailsCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xxl,
    ...Shadows.card,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  divider: {
    height: 1,
    marginVertical: Spacing.sm,
  },
  settingsSection: {
    gap: Spacing.sm,
  },
  settingsItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.sm,
    ...Shadows.card,
  },
  settingsIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.xs,
    justifyContent: "center",
    alignItems: "center",
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
    padding: Spacing.xl,
    maxHeight: '80%',
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 30,
  },
  closeCameraButton: {
    alignSelf: 'flex-end',
    marginTop: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 25,
  },
  captureButtonContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFF',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  statusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusContent: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    ...Platform.select({
      web: { backdropFilter: 'blur(10px)' } as any,
    }),
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
  label: {
    marginBottom: Spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: Spacing.inputHeight,
    borderRadius: BorderRadius.xs,
    paddingHorizontal: Spacing.lg,
  },
  input: {
    height: '100%',
    fontSize: 16,
  },
});
