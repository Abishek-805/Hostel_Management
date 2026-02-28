import React from "react";
import { StyleSheet, View, ActivityIndicator, LogBox, Platform } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/theme";
import { NetworkStatusBanner } from "@/components/NetworkStatusBanner";
import { suppressProductionConsoleNoise } from "@/lib/logger";
import { captureException, initMonitoring, trackEvent } from "@/lib/monitoring";
import { useNetworkStatus } from "@/lib/query-client";

// Suppress known deprecation warnings from react-native-web that are handled by React Navigation
if (Platform.OS === 'web') {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('props.pointerEvents')) {
      return;
    }
    originalWarn(...args);
  };
} else {
  LogBox.ignoreLogs([
    'props.pointerEvents is deprecated. Use style.pointerEvents',
  ]);
  
  // Suppress update-related errors
  LogBox.ignoreLogs([
    'Failed to download remote update',
    'java.io.IOException',
    'Network request failed',
    'Updates',
  ]);

  // Global error handler for native errors
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: any, fatal: boolean) => {
    const errorString = error?.message || error?.toString() || '';
    const stackString = error?.stack || '';
    
    // Silently handle update/network errors
    if (errorString.includes('Failed to download remote update') || 
        errorString.includes('java.io.IOException') ||
        errorString.includes('Network request failed') ||
        errorString.includes('Updates') ||
        errorString.includes('IOException') ||
        stackString.includes('Updates')) {
      console.warn('Update check failed - app will continue normally');
      return; // Don't call original handler for update errors
    }
    
    // Pass other errors to the original handler
    originalHandler(error, fatal);
  });
}

suppressProductionConsoleNoise();

void initMonitoring();

if (Platform.OS === "web") {
  window.addEventListener("unhandledrejection", (event) => {
    void captureException(event.reason, { source: "unhandledrejection" });
  });
} else {
  const globalAny = globalThis as any;
  const originalUnhandledRejection = globalAny.onunhandledrejection;
  globalAny.onunhandledrejection = (event: any) => {
    const reason = event?.reason ?? event;
    void captureException(reason, { source: "native-unhandledrejection" });
    if (typeof originalUnhandledRejection === "function") {
      return originalUnhandledRejection(event);
    }
  };
}

function AppContent() {
  const { isLoading } = useAuth();
  const isOffline = useNetworkStatus();

  React.useEffect(() => {
    void trackEvent("app_opened", { platform: Platform.OS });
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary.main} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <NavigationContainer>
        <RootStackNavigator />
      </NavigationContainer>
      <NetworkStatusBanner isOffline={isOffline} />
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary onError={(error, stack) => { void captureException(error, { stack, source: "ErrorBoundary" }); }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <GestureHandlerRootView style={styles.root}>
            <KeyboardProvider>
              <AuthProvider>
                <AppContent />
              </AuthProvider>
              <StatusBar style="auto" />
            </KeyboardProvider>
          </GestureHandlerRootView>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
