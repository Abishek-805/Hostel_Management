import React, { useState, useEffect, useRef } from "react";
import { StyleSheet, View, TextInput, Pressable, Alert, Modal, FlatList, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { BlurView } from 'expo-blur';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeInRight,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  useAnimatedStyle,
  Easing
} from 'react-native-reanimated';

import { ThemedText } from "@/components/ThemedText";
import { Button } from "@/components/Button";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/contexts/AuthContext";
import { Colors, Spacing, BorderRadius, Typography, Shadows } from "@/constants/theme";
import { HOSTEL_BLOCKS, HOSTEL_CODES } from "@/constants/hostels";
import { FloatingBackground } from "@/components/FloatingBackground";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useModalFocus } from "@/hooks/useModalFocus";
import { apiRequest } from "@/lib/query-client";

const { width } = Dimensions.get('window');

// Feature data for the carousel
const FEATURES = [
  { id: 1, title: "Smart Attendance", subtitle: "Locate & Mark in seconds", icon: "map-pin", color: "#3B82F6" },
  { id: 2, title: "Digital Mess Menu", subtitle: "Check & Vote for dishes", icon: "coffee", color: "#F59E0B" },
  { id: 3, title: "Leave Requests", subtitle: "Apply & Track status live", icon: "file-text", color: "#8B5CF6" },
  { id: 4, title: "Issue Reporting", subtitle: "Anonymous complaints", icon: "alert-circle", color: "#EF4444" },
];

type AuthMode = "login" | "register";
type UserRole = "student" | "admin" | "gatekeeper";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [role, setRole] = useState<UserRole>("student");
  const [registerId, setRegisterId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [hostelBlock, setHostelBlock] = useState("");
  const [gateNumber, setGateNumber] = useState("");
  const [gateCode, setGateCode] = useState("");
  const [showHostelModal, setShowHostelModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [studentHostelCode, setStudentHostelCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Forgot Password States
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<"verify" | "reset">("verify");
  const [forgotUserRole, setForgotUserRole] = useState<UserRole>("student");
  const [forgotRegisterId, setForgotRegisterId] = useState("");
  const [forgotStudentHostelCode, setForgotStudentHostelCode] = useState("");
  const [forgotHostelBlock, setForgotHostelBlock] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [forgotErrors, setForgotErrors] = useState<Record<string, string>>({});
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const hostelModalRef = useRef<View>(null);
  const forgotModalRef = useRef<View>(null);
  const registerSwitcherRef = useRef<View>(null);

  useModalFocus(hostelModalRef, showHostelModal);
  useModalFocus(forgotModalRef, showForgotModal);
  useModalFocus(registerSwitcherRef, mode === "register");

  const logoScale = useSharedValue(1);

  useEffect(() => {
    logoScale.value = withRepeat(
      withTiming(1.08, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }));

  const handleSubmit = async () => {
    setErrors({});
    const newErrors: Record<string, string> = {};

    if (!registerId) newErrors.registerId = "Register Number / Staff ID is required";
    if (!password) newErrors.password = "Password is required";

    if (mode === "register") {
      if (!name) newErrors.name = "Name is required";
      // Phone is optional
      if (role === "student" && !roomNumber) newErrors.roomNumber = "Room Number is required";
      if ((role === "student" || role === "admin") && !hostelBlock) {
        newErrors.hostelBlock = "Hostel Block is required";
      }
      if (role === "gatekeeper" && !gateNumber.trim()) {
        newErrors.gateNumber = "Gate Number is required";
      } else if (role === "gatekeeper") {
        const parsedGateNumber = Number(gateNumber.trim());
        if (!Number.isInteger(parsedGateNumber) || parsedGateNumber < 1 || parsedGateNumber > 11) {
          newErrors.gateNumber = "Gate Number must be between 1 and 11";
        }
      }
      if (role === "gatekeeper" && !gateCode.trim()) {
        newErrors.gateCode = "Gate Code is required";
      }

      if (password && confirmPassword && password !== confirmPassword) {
        newErrors.password = "Passwords do not match";
      }
      if (password && password.length < 6) {
        newErrors.password = "Password must be at least 6 characters";
      }
    }

    // Hostel Block Validation (Only for registration)
    if (mode === "register" && (role === "student" || role === "admin") && !hostelBlock) {
      newErrors.hostelBlock = "Hostel Block is required";
    }

    // Admin Security Code Validation (Only for admin login/register)
    if (role === "admin") {
      if (mode === "register" && !adminCode) {
        newErrors.adminCode = "Unique Hostel Code is required";
      } else if (mode === "register" && adminCode !== HOSTEL_CODES[hostelBlock]) {
        newErrors.adminCode = "Incorrect unique code for this hostel";
      }
    }

    // Student Hostel Code Validation (Only for registration)
    if (role === "student" && mode === "register") {
      if (!studentHostelCode) {
        newErrors.studentHostelCode = "Unique Hostel Code is required";
      } else if (studentHostelCode !== HOSTEL_CODES[hostelBlock]) {
        newErrors.studentHostelCode = "Incorrect unique code for this hostel";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      if (mode === "login") {
        const result = await login(registerId, password, role);
        if (!result.success) {
          const errMsg = result.error || "Invalid credentials";
          if (errMsg.includes("Register Number") || errMsg.includes("Staff ID") || errMsg.includes("User not found")) {
            setErrors({ registerId: errMsg });
          } else if (errMsg.includes("Password") || errMsg.includes("credentials")) {
            setErrors({ password: errMsg });
          } else {
            // Fallback for generic errors
            Alert.alert("Login Failed", errMsg);
          }
        }
      } else {
        const result = await register({
          registerId,
          password,
          name,
          phone: phone || undefined,
          role,
            gateNumber: role === "gatekeeper" ? Number(gateNumber.trim()) : undefined,
            gateCode: role === "gatekeeper" ? gateCode.trim() : undefined,
          roomNumber: role === "student" ? roomNumber : undefined,
            hostelBlock: role === "student" || role === "admin" ? hostelBlock : undefined,
        });
        if (!result.success) {
          const errMsg = result.error || "Could not create account";
          if (errMsg.includes("User already exists")) {
            setErrors({ registerId: errMsg });
          } else if (errMsg.toLowerCase().includes("room") && (errMsg.toLowerCase().includes("full") || errMsg.toLowerCase().includes("invalid"))) {
            setErrors({ roomNumber: errMsg });
          } else {
            // Show more detailed error message for better debugging
            Alert.alert("Registration Failed", errMsg);
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setRegisterId("");
    setPassword("");
    setConfirmPassword("");
    setName("");
    setPhone("");
    setRoomNumber("");
    setHostelBlock("");
    setGateNumber("");
    setGateCode("");
    setAdminCode("");
    setStudentHostelCode("");
    setErrors({});
  };

  const clearError = (field: string) => {
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Forgot Password - Verify Admin
  const handleForgotPasswordVerify = async () => {
    setForgotErrors({});
    const newErrors: Record<string, string> = {};

    if (forgotUserRole === "admin") {
      if (!forgotRegisterId) newErrors.registerId = "Register Number / Staff ID is required";
    } else {
      if (!forgotRegisterId) newErrors.registerId = "Register Number is required";
      if (!forgotStudentHostelCode) newErrors.studentHostelCode = "Unique Hostel Code is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setForgotErrors(newErrors);
      return;
    }

    setForgotLoading(true);
    try {
      const response = await apiRequest('POST', '/auth/forgot-password/verify', {
        role: forgotUserRole,
        registerId: forgotRegisterId,
        studentHostelCode: forgotUserRole === "student" ? forgotStudentHostelCode : undefined,
        hostelBlock: forgotHostelBlock
      });

      const data = await response.json();

      if (!response.ok) {
        setForgotErrors({ general: data.error || "Verification failed" });
        return;
      }

      setResetToken(data.resetToken);
      setForgotStep("reset");
      const userType = forgotUserRole === "admin" ? "Admin" : "Student";
      Alert.alert("Verified", `Welcome ${data.user.name}! Now please set your new password.`);
    } catch (error: any) {
      setForgotErrors({ general: error.message || "Network error" });
    } finally {
      setForgotLoading(false);
    }
  };

  // Forgot Password - Reset Password
  const handleForgotPasswordReset = async () => {
    setForgotErrors({});
    const newErrors: Record<string, string> = {};

    if (!forgotPassword) newErrors.password = "New password is required";
    if (!forgotConfirmPassword) newErrors.confirmPassword = "Confirm password is required";

    if (forgotPassword && forgotPassword.length < 6) {
      newErrors.password = "Password must be at least 6 characters";
    }

    if (forgotPassword && forgotConfirmPassword && forgotPassword !== forgotConfirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(newErrors).length > 0) {
      setForgotErrors(newErrors);
      return;
    }

    setForgotLoading(true);
    try {
      const response = await apiRequest('POST', '/auth/forgot-password/reset', {
        resetToken,
        newPassword: forgotPassword
      });

      const data = await response.json();

      if (!response.ok) {
        setForgotErrors({ general: data.error || "Password reset failed" });
        return;
      }

      Alert.alert("Success", data.message);

      // Reset forgot password state
      setShowForgotModal(false);
      setForgotStep("verify");
      setForgotUserRole("student");
      setForgotRegisterId("");
      setForgotStudentHostelCode("");
      setForgotHostelBlock("");
      setForgotPassword("");
      setForgotConfirmPassword("");
      setResetToken("");
      setForgotErrors({});
    } catch (error: any) {
      setForgotErrors({ general: error.message || "Network error" });
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgotModal = () => {
    setShowForgotModal(false);
    setForgotStep("verify");
    setForgotUserRole("student");
    setForgotRegisterId("");
    setForgotStudentHostelCode("");
    setForgotHostelBlock("");
    setForgotPassword("");
    setForgotConfirmPassword("");
    setResetToken("");
    setForgotErrors({});
  };

  const hasActiveModal = showHostelModal || showForgotModal;

  return (
    <LinearGradient
      colors={[Colors.primary.main, Colors.primary.pressed]}
      style={styles.container}
    >
      <FloatingBackground primaryColor="#FFFFFF" secondaryColor="#FFFFFF" />

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        importantForAccessibility={hasActiveModal ? "no-hide-descendants" : "auto"}
      >
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.logoContainer}>
          <Animated.View style={[styles.logoCircle, logoAnimatedStyle]}>
            <Feather name="home" size={48} color={Colors.primary.main} />
          </Animated.View>
          <ThemedText type="h1" style={styles.appName}>HostelEase</ThemedText>
          <ThemedText type="body" style={styles.tagline}>Your hostel, simplified</ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(400).springify()} style={styles.formContainer}>
          <View style={styles.roleToggle}>
            <Pressable
              style={[styles.roleButton, role === "student" && styles.roleButtonActive]}
              onPress={() => setRole("student")}
            >
              <Feather name="user" size={18} color={role === "student" ? "#FFFFFF" : Colors.primary.main} />
              <ThemedText
                type="bodySmall"
                style={[styles.roleText, role === "student" && styles.roleTextActive]}
              >
                Student
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.roleButton, role === "admin" && styles.roleButtonActive]}
              onPress={() => setRole("admin")}
            >
              <Feather name="shield" size={18} color={role === "admin" ? "#FFFFFF" : Colors.primary.main} />
              <ThemedText
                type="bodySmall"
                style={[styles.roleText, role === "admin" && styles.roleTextActive]}
              >
                Admin
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.roleButton, role === "gatekeeper" && styles.roleButtonActive]}
              onPress={() => setRole("gatekeeper")}
            >
              <Feather name="lock" size={18} color={role === "gatekeeper" ? "#FFFFFF" : Colors.primary.main} />
              <ThemedText
                type="bodySmall"
                style={[styles.roleText, role === "gatekeeper" && styles.roleTextActive]}
              >
                Gatekeeper
              </ThemedText>
            </Pressable>
          </View>

          {errors.role ? (
            <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
              {errors.role}
            </ThemedText>
          ) : null}

          <ThemedText type="h2" style={styles.formTitle}>
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </ThemedText>

          {mode === "register" && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.name ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="user" size={20} color={errors.name ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#9CA3AF"
                  value={name}
                  onChangeText={(text) => {
                    setName(text);
                    clearError("name");
                  }}
                  autoCapitalize="words"
                />
              </View>
              {errors.name && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.name}
                </ThemedText>
              )}
            </Animated.View>
          )}

          <View style={{ marginBottom: Spacing.lg }}>
            <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.registerId ? Colors.status.error : "#E5E7EB" }]}>
              <Feather name="hash" size={20} color={errors.registerId ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { outlineStyle: 'none' } as any]}
                placeholder={role === "student" ? "Register Number" : role === "gatekeeper" ? "Gatekeeper ID" : "Staff ID"}
                placeholderTextColor="#9CA3AF"
                value={registerId}
                onChangeText={(text) => {
                  setRegisterId(text);
                  clearError("registerId");
                }}
                autoCapitalize="none"
              />
            </View>
            {errors.registerId && (
              <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                {errors.registerId}
              </ThemedText>
            )}
          </View>

          {mode === "register" && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.phone ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="phone" size={20} color={errors.phone ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' } as any]}
                  placeholder="Phone Number (Optional)"
                  placeholderTextColor="#9CA3AF"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    clearError("phone");
                  }}
                  keyboardType="phone-pad"
                />
              </View>
              {errors.phone && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.phone}
                </ThemedText>
              )}
            </Animated.View>
          )}

          {/* Hostel Block Selection - Visible ONLY in Register */}
          {mode === 'register' && role !== 'gatekeeper' && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.hostelBlock ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="map-pin" size={20} color={errors.hostelBlock ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <Pressable
                  style={[styles.input, { justifyContent: 'center' }]}
                  onPress={() => setShowHostelModal(true)}
                >
                  <ThemedText style={{ color: hostelBlock ? "#000000" : "#9CA3AF" }}>
                    {hostelBlock || "Select Hostel Block"}
                  </ThemedText>
                </Pressable>
                <Feather name="chevron-down" size={20} color="#9CA3AF" style={{ marginRight: Spacing.md }} />
              </View>
              {errors.hostelBlock && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.hostelBlock}
                </ThemedText>
              )}
            </Animated.View>
          )}

          {/* Admin Unique Code Input - Only show for Admin */}
          {mode === "register" && role === "admin" && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.adminCode ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="shield" size={20} color={errors.adminCode ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' } as any]}
                  placeholder="Unique Hostel Code"
                  placeholderTextColor="#9CA3AF"
                  value={adminCode}
                  onChangeText={(text) => {
                    setAdminCode(text);
                    clearError("adminCode");
                  }}
                  autoCapitalize="none"
                />
              </View>
              {errors.adminCode && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.adminCode}
                </ThemedText>
              )}
            </Animated.View>
          )}

          {mode === "register" && role === "gatekeeper" && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.gateNumber ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="grid" size={20} color={errors.gateNumber ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' } as any]}
                  placeholder="Gate Number (1-11)"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  value={gateNumber}
                  onChangeText={(text) => {
                    setGateNumber(text);
                    clearError("gateNumber");
                  }}
                />
              </View>
              {errors.gateNumber && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.gateNumber}
                </ThemedText>
              )}
            </Animated.View>
          )}

          {mode === "register" && role === "gatekeeper" && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.gateCode ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="key" size={20} color={errors.gateCode ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' } as any]}
                  placeholder="Gate Code"
                  placeholderTextColor="#9CA3AF"
                  value={gateCode}
                  onChangeText={(text) => {
                    setGateCode(text);
                    clearError("gateCode");
                  }}
                  autoCapitalize="none"
                />
              </View>
              {errors.gateCode && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.gateCode}
                </ThemedText>
              )}
            </Animated.View>
          )}

          {/* Student Unique Code Input - Only show for Student */}
          {mode === "register" && role === "student" && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.studentHostelCode ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="shield" size={20} color={errors.studentHostelCode ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' } as any]}
                  placeholder="Unique Hostel Code"
                  placeholderTextColor="#9CA3AF"
                  value={studentHostelCode}
                  onChangeText={(text) => {
                    setStudentHostelCode(text);
                    clearError("studentHostelCode");
                  }}
                  autoCapitalize="none"
                />
              </View>
              {errors.studentHostelCode && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.studentHostelCode}
                </ThemedText>
              )}
            </Animated.View>
          )}

          {mode === "register" && role === "student" && (
            <Animated.View entering={FadeInDown} style={{ marginBottom: Spacing.lg }}>
              <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.roomNumber ? Colors.status.error : "#E5E7EB" }]}>
                <Feather name="home" size={20} color={errors.roomNumber ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { outlineStyle: 'none' } as any]}
                  placeholder="Room Number"
                  placeholderTextColor="#9CA3AF"
                  value={roomNumber}
                  onChangeText={(text) => {
                    setRoomNumber(text);
                    clearError("roomNumber");
                  }}
                />
              </View>
              {errors.roomNumber && (
                <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                  {errors.roomNumber}
                </ThemedText>
              )}
            </Animated.View>
          )}

          <View style={{ marginBottom: Spacing.lg }}>
            <View style={[styles.inputContainer, { marginBottom: 0, borderColor: errors.password ? Colors.status.error : "#E5E7EB" }]}>
              <Feather name="lock" size={20} color={errors.password ? Colors.status.error : "#6B7280"} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { outlineStyle: 'none' } as any]}
                placeholder="Password"
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  clearError("password");
                }}
                secureTextEntry={!showPassword}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                hitSlop={8}
                android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
              >
                <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#6B7280" />
              </Pressable>
            </View>
            {errors.password && (
              <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4, marginLeft: 4 }}>
                {errors.password}
              </ThemedText>
            )}
            {mode === "login" && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                <ThemedText type="caption" style={{ color: '#6B7280' }}>
                  Trouble signing in?
                </ThemedText>
                <Pressable
                  onPress={() => setShowForgotModal(true)}
                  style={styles.forgotButton}
                  accessibilityRole="button"
                  accessibilityLabel="Open forgot password dialog"
                  hitSlop={8}
                >
                  <ThemedText type="caption" style={styles.forgotText}>
                    Forgot Password?
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </View>

          {mode === "register" && (
            <Animated.View entering={FadeInDown} style={styles.inputContainer}>
              <Feather name="lock" size={20} color="#6B7280" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm Password"
                placeholderTextColor="#9CA3AF"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
              />
            </Animated.View>
          )}

          <Button
            onPress={handleSubmit}
            loading={isLoading}
            fullWidth
            style={styles.submitButton}
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </Button>

          <View ref={registerSwitcherRef} style={styles.switchModeContainer}>
            <ThemedText type="bodySmall" style={styles.switchModeText}>
              {mode === "login" ? "Don't have an account?" : "Already have an account?"}
            </ThemedText>
            <Pressable
              onPress={() => {
                setMode(mode === "login" ? "register" : "login");
                resetForm();
              }}
              accessibilityRole="button"
              accessibilityLabel={mode === "login" ? "Switch to registration" : "Switch to sign in"}
              hitSlop={8}
            >
              <ThemedText type="bodySmall" style={styles.switchModeLink}>
                {mode === "login" ? "Register" : "Sign In"}
              </ThemedText>
            </Pressable>
          </View>
        </Animated.View>

        {/* Feature Carousel */}
        <Animated.View entering={FadeInRight.delay(600)} style={styles.carouselContainer}>
          <ThemedText type="caption" style={styles.carouselTitle}>EXPLORE FEATURES</ThemedText>
          <FlatList
            horizontal
            data={FEATURES}
            keyExtractor={(item) => item.id.toString()}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselList}
            renderItem={({ item, index }) => (
              <Animated.View
                entering={FadeInRight.delay(800 + index * 100)}
                style={[styles.featureCard, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.2)' }]}
              >
                <View style={[styles.featureIcon, { backgroundColor: item.color + '30' }]}>
                  <Feather name={item.icon as any} size={20} color="#FFFFFF" />
                </View>
                <View>
                  <ThemedText type="bodySmall" style={{ color: '#FFFFFF', fontWeight: 'bold' }}>{item.title}</ThemedText>
                  <ThemedText type="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>{item.subtitle}</ThemedText>
                </View>
              </Animated.View>
            )}
          />
        </Animated.View>
      </KeyboardAwareScrollViewCompat>

      <LoadingOverlay
        visible={isLoading}
        message={mode === 'login' ? 'Signing you in...' : 'Creating account...'}
        icon="home"
        color={Colors.primary.main}
      />
      <Modal
        visible={showHostelModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowHostelModal(false)}
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View ref={hostelModalRef} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Select Hostel Block</ThemedText>
              <Pressable
                onPress={() => setShowHostelModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Close hostel selector"
                hitSlop={10}
                android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
              >
                <Feather name="x" size={24} color="#000" />
              </Pressable>
            </View>
            <FlatList
              data={HOSTEL_BLOCKS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalItem}
                  onPress={() => {
                    if (showForgotModal) {
                      setForgotHostelBlock(item);
                      if (forgotErrors.hostelBlock) setForgotErrors({ ...forgotErrors, hostelBlock: "" });
                    } else {
                      setHostelBlock(item);
                      clearError("hostelBlock");
                    }
                    setShowHostelModal(false);
                  }}
                >
                  <ThemedText type="body" style={styles.modalItemText}>{item}</ThemedText>
                  {hostelBlock === item && <Feather name="check" size={20} color={Colors.primary.main} />}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeForgotModal}
        accessibilityViewIsModal={true}
      >
        <View style={[styles.modalOverlay, { zIndex: 1000 }]}>
          <View ref={forgotModalRef} style={[styles.modalContent, { maxHeight: '85%', zIndex: 1000 }]}>
            <View style={styles.modalHeader}>
              <ThemedText type="h3">Reset Password</ThemedText>
              <Pressable
                onPress={closeForgotModal}
                accessibilityRole="button"
                accessibilityLabel="Close reset password"
                hitSlop={10}
                android_ripple={{ color: "rgba(0,0,0,0.08)", borderless: true }}
              >
                <Feather name="x" size={24} color="#000" />
              </Pressable>
            </View>

            {forgotStep === "verify" ? (
              // Step 1: Verify User Identity
              <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
                <View style={{ backgroundColor: '#F0F4FF', padding: Spacing.md, borderRadius: BorderRadius.md, borderLeftWidth: 4, borderLeftColor: Colors.primary.main, marginBottom: Spacing.md }}>
                  <ThemedText type="bodySmall" style={{ color: Colors.primary.main, fontWeight: '600' }}>
                    🔐 Forgot Your Password?
                  </ThemedText>
                  <ThemedText type="caption" style={{ color: '#4B5563', marginTop: 4 }}>
                    Select your role and verify your identity to reset your password.
                  </ThemedText>
                </View>

                <ThemedText type="body" style={{ marginBottom: Spacing.md, fontWeight: '600', color: '#1F2937' }}>
                  Who are you?
                </ThemedText>

                {/* Role Selection Buttons */}
                <View style={{ flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg }}>
                  <Pressable
                    onPress={() => setForgotUserRole("admin")}
                    style={[
                      styles.roleButton,
                      forgotUserRole === "admin" && styles.roleButtonActive
                    ]}
                  >
                    <ThemedText type="bodySmall" style={{ color: forgotUserRole === "admin" ? "#fff" : "#000" }}>
                      Admin
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => setForgotUserRole("student")}
                    style={[
                      styles.roleButton,
                      forgotUserRole === "student" && styles.roleButtonActive
                    ]}
                  >
                    <ThemedText type="bodySmall" style={{ color: forgotUserRole === "student" ? "#fff" : "#000" }}>
                      Student
                    </ThemedText>
                  </Pressable>
                </View>

                {/* Verification Instructions */}
                <View style={{ backgroundColor: '#FFFBEB', padding: Spacing.md, borderRadius: BorderRadius.md, marginBottom: Spacing.md }}>
                  {forgotUserRole === "admin" && (
                    <ThemedText type="caption" style={{ color: '#92400E' }}>
                      ℹ️ Enter your staff register number, Unique Hostel Code (provided during registration) and select your hostel block.
                    </ThemedText>
                  )}
                  {forgotUserRole === "student" && (
                    <ThemedText type="caption" style={{ color: '#92400E' }}>
                      ℹ️ Enter your Register Number, Unique Hostel Code (provided during registration) and select your hostel block.
                    </ThemedText>
                  )}
                </View>

                {forgotErrors.general && (
                  <View style={{ backgroundColor: '#FEE2E2', padding: Spacing.md, borderRadius: BorderRadius.sm }}>
                    <ThemedText type="caption" style={{ color: Colors.status.error }}>
                      {forgotErrors.general}
                    </ThemedText>
                  </View>
                )}

                {/* Admin: Register Number & Unique Hostel Code */}
                {forgotUserRole === "admin" && (
                  <View style={{ gap: Spacing.md }}>
                    <View>
                      <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.xs }}>
                        📋 Register Number / Staff ID
                      </ThemedText>
                      <View style={[styles.inputContainer, { borderColor: forgotErrors.registerId ? Colors.status.error : 'transparent' }]}>
                        <Feather name="user" size={20} color="#6B7280" style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="Enter your staff ID"
                          placeholderTextColor="#9CA3AF"
                          value={forgotRegisterId}
                          onChangeText={(text) => {
                            setForgotRegisterId(text);
                            if (forgotErrors.registerId) setForgotErrors({ ...forgotErrors, registerId: "" });
                          }}
                        />
                      </View>
                      {forgotErrors.registerId && (
                        <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                          {forgotErrors.registerId}
                        </ThemedText>
                      )}
                    </View>

                    <View>
                      <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.xs }}>
                        🛡️ Unique Hostel Code
                      </ThemedText>
                      <View style={[styles.inputContainer, { borderColor: forgotErrors.studentHostelCode ? Colors.status.error : 'transparent' }]}>
                        <Feather name="shield" size={20} color="#6B7280" style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="Enter your hostel code"
                          placeholderTextColor="#9CA3AF"
                          value={forgotStudentHostelCode}
                          onChangeText={(text) => {
                            setForgotStudentHostelCode(text);
                            if (forgotErrors.studentHostelCode) setForgotErrors({ ...forgotErrors, studentHostelCode: "" });
                          }}
                          autoCapitalize="none"
                        />
                      </View>
                      {forgotErrors.studentHostelCode && (
                        <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                          {forgotErrors.studentHostelCode}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                )}

                {/* Student: Register Number & Unique Hostel Code */}
                {forgotUserRole === "student" && (
                  <View style={{ gap: Spacing.md }}>
                    <View>
                      <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.xs }}>
                        📋 Register Number
                      </ThemedText>
                      <View style={[styles.inputContainer, { borderColor: forgotErrors.registerId ? Colors.status.error : 'transparent' }]}>
                        <Feather name="user" size={20} color="#6B7280" style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="Enter your Register Number"
                          placeholderTextColor="#9CA3AF"
                          value={forgotRegisterId}
                          onChangeText={(text) => {
                            setForgotRegisterId(text);
                            if (forgotErrors.registerId) setForgotErrors({ ...forgotErrors, registerId: "" });
                          }}
                        />
                      </View>
                      {forgotErrors.registerId && (
                        <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                          {forgotErrors.registerId}
                        </ThemedText>
                      )}
                    </View>

                    <View>
                      <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.xs }}>
                        🛡️ Unique Hostel Code
                      </ThemedText>
                      <View style={[styles.inputContainer, { borderColor: forgotErrors.studentHostelCode ? Colors.status.error : 'transparent' }]}>
                        <Feather name="shield" size={20} color="#6B7280" style={styles.inputIcon} />
                        <TextInput
                          style={styles.input}
                          placeholder="Enter your hostel code"
                          placeholderTextColor="#9CA3AF"
                          value={forgotStudentHostelCode}
                          onChangeText={(text) => {
                            setForgotStudentHostelCode(text);
                            if (forgotErrors.studentHostelCode) setForgotErrors({ ...forgotErrors, studentHostelCode: "" });
                          }}
                          autoCapitalize="none"
                        />
                      </View>
                      {forgotErrors.studentHostelCode && (
                        <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                          {forgotErrors.studentHostelCode}
                        </ThemedText>
                      )}
                    </View>
                  </View>
                )}

                {/* All hostel blocks are now identified automatically based on ID or Code */}

                <Button
                  onPress={handleForgotPasswordVerify}
                  loading={forgotLoading}
                  fullWidth
                  style={{ marginTop: Spacing.lg }}
                >
                  Verify & Continue
                </Button>
              </KeyboardAwareScrollViewCompat>
            ) : (
              // Step 2: Reset Password
              <KeyboardAwareScrollViewCompat contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.md }}>
                <ThemedText type="body" style={{ marginBottom: Spacing.sm }}>
                  Enter your new password below.
                </ThemedText>

                {forgotErrors.general && (
                  <View style={{ backgroundColor: '#FEE2E2', padding: Spacing.md, borderRadius: BorderRadius.sm }}>
                    <ThemedText type="caption" style={{ color: Colors.status.error }}>
                      {forgotErrors.general}
                    </ThemedText>
                  </View>
                )}

                {/* New Password */}
                <View>
                  <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.xs }}>
                    New Password
                  </ThemedText>
                  <View style={[styles.inputContainer, { borderColor: forgotErrors.password ? Colors.status.error : 'transparent' }]}>
                    <Feather name="lock" size={20} color="#6B7280" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Enter new password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showForgotPassword}
                      value={forgotPassword}
                      onChangeText={setForgotPassword}
                    />
                    <Pressable
                      onPress={() => setShowForgotPassword(!showForgotPassword)}
                      accessibilityRole="button"
                      accessibilityLabel={showForgotPassword ? "Hide new password" : "Show new password"}
                      hitSlop={8}
                    >
                      <Feather name={showForgotPassword ? "eye" : "eye-off"} size={20} color="#6B7280" />
                    </Pressable>
                  </View>
                  {forgotErrors.password && (
                    <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                      {forgotErrors.password}
                    </ThemedText>
                  )}
                </View>

                {/* Confirm Password */}
                <View>
                  <ThemedText type="bodySmall" secondary style={{ marginBottom: Spacing.xs }}>
                    Confirm Password
                  </ThemedText>
                  <View style={[styles.inputContainer, { borderColor: forgotErrors.confirmPassword ? Colors.status.error : 'transparent' }]}>
                    <Feather name="lock" size={20} color="#6B7280" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry={!showForgotPassword}
                      value={forgotConfirmPassword}
                      onChangeText={setForgotConfirmPassword}
                    />
                  </View>
                  {forgotErrors.confirmPassword && (
                    <ThemedText type="caption" style={{ color: Colors.status.error, marginTop: 4 }}>
                      {forgotErrors.confirmPassword}
                    </ThemedText>
                  )}
                </View>

                <Button
                  onPress={handleForgotPasswordReset}
                  loading={forgotLoading}
                  fullWidth
                  style={{ marginTop: Spacing.lg }}
                >
                  Reset Password
                </Button>

                <Pressable
                  onPress={() => setForgotStep("verify")}
                  style={{ alignItems: 'center', marginTop: Spacing.md }}
                >
                  <ThemedText type="caption" style={{ color: Colors.primary.main }}>
                    Back to verification
                  </ThemedText>
                </Pressable>
              </KeyboardAwareScrollViewCompat>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: Spacing.xxl,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
    ...Shadows.fab, // Added shadow for premium feel
  },
  appName: {
    color: "#FFFFFF",
    marginBottom: Spacing.xs,
  },
  tagline: {
    color: "rgba(255, 255, 255, 0.8)",
  },
  formContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    ...Shadows.modal, // Deeper shadow like Admin dashboard modality
  },
  roleToggle: {
    flexDirection: "row",
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  roleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md, // Softer corners
    borderWidth: 1,
    borderColor: Colors.primary.main,
    gap: Spacing.sm,
  },
  roleButtonActive: {
    backgroundColor: Colors.primary.main,
  },
  roleText: {
    color: Colors.primary.main,
  },
  roleTextActive: {
    color: "#FFFFFF",
  },
  formTitle: {
    color: "#111827",
    marginBottom: Spacing.xl,
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: BorderRadius.md, // Rounded like admin cards
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: Spacing.lg,
    height: Spacing.inputHeight,
  },
  inputIcon: {
    marginLeft: Spacing.lg,
  },
  input: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    fontSize: Typography.body.fontSize,
    color: "#111827",
  },
  eyeIcon: {
    padding: Spacing.md,
  },
  submitButton: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    ...Shadows.card,
  },
  switchModeContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: Spacing.xl,
    gap: Spacing.xs,
  },
  switchModeText: {
    color: "#6B7280",
  },
  switchModeLink: {
    color: Colors.primary.main,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "60%",
    ...Shadows.modal,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 10,
  },
  modalItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  modalItemText: {
    color: "#000000",
  },
  // New Styles
  carouselContainer: {
    marginTop: Spacing.xxl,
    paddingBottom: Spacing.lg,
  },
  carouselTitle: {
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  carouselList: {
    paddingHorizontal: Spacing.xs,
    gap: Spacing.md,
  },
  featureCard: {
    width: 220,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.md,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  loadingCircle: {
    backgroundColor: '#FFFFFF',
    padding: 30,
    borderRadius: 24,
    alignItems: 'center',
    ...Shadows.modal,
    gap: 10,
  },
  forgotButton: {
    paddingVertical: 4,
  },
  forgotText: {
    color: Colors.primary.main,
    fontWeight: '600',
  },
});
