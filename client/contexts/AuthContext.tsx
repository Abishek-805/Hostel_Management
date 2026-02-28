import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, queryClient, setTokenExpiredCallback } from "@/lib/query-client";
import { logger } from "@/lib/logger";

type UserRole = "student" | "admin" | "gatekeeper";

interface User {
  id: string;
  registerId: string;
  name: string;
  phone?: string;
  role: UserRole;
  roomNumber?: string;
  hostelBlock?: string;
  gateNumber?: number;
  profileImage?: string; // ✅ ADDED
}

interface RegisterData {
  registerId: string;
  password: string;
  name: string;
  phone?: string;
  role: UserRole;
  roomNumber?: string;
  hostelBlock?: string;
  gateNumber?: number;
  gateCode?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (registerId: string, password: string, role?: string, hostelBlock?: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<User>) => Promise<void>; // ✅ ADDED
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_STORAGE_KEY = "@hostelease_user";
const AUTH_TOKEN_KEY = "@hostelease_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();
    // Set up callback for when token expires
    setTokenExpiredCallback(() => {
      logger.warn("Token expired, logging out user");
      handleTokenExpired();
    });
  }, []);

  const handleTokenExpired = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      queryClient.clear();
    } catch (e) {
      console.error("Token expiration cleanup failed:", e);
    } finally {
      setUser(null);
    }
  };

  const loadStoredUser = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      const storedToken = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      logger.debug(`AuthContext loaded user: ${storedUser ? 'YES' : 'NO'}, token: ${storedToken ? 'YES' : 'NO'}`);
      
      // If we have both user and token, try to validate the token
      if (storedUser && storedToken) {
        try {
          // Try to make a test request to see if token is valid
          // We'll do this implicitly - just load the user
          // If the token is expired, the first query will catch it and clear everything
          setUser(JSON.parse(storedUser));
        } catch (err) {
          console.error("Failed to parse stored user:", err);
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
        }
      } else if (storedUser) {
        // User exists but no token - likely from previous logout, clear it
        await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to load stored user:", error);
    } finally {
      setIsLoading(false);
    }
  };

  /* ✅ LOGIN */
  const login = async (registerId: string, password: string, role?: string, hostelBlock?: string) => {
    try {
      const normalizedRegisterId = registerId.trim();
      const response = await apiRequest("POST", "/auth/login", {
        registerId: normalizedRegisterId,
        password,
        role,
        hostelBlock,
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("🔴 Login failed:", data.error);
        return { success: false, error: data.error || "Login failed" };
      }

      logger.info(`Login successful for ${normalizedRegisterId}`);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data.user));
      await AsyncStorage.setItem(AUTH_TOKEN_KEY, data.token);
      logger.debug("Auth token stored");
      setUser(data.user);
      return { success: true };
    } catch (err) {
      console.error("🔴 Login network error:", err);
      return { success: false, error: "Network error. Please try again." };
    }
  };

  /* ✅ REGISTER */
  const register = async (data: RegisterData) => {
    try {
      const response = await apiRequest("POST", "/auth/register", data);
      const responseData = await response.json();

      if (!response.ok) {
        return { success: false, error: responseData.error || "Registration failed" };
      }

      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(responseData.user));
      if (responseData.token) {
        await AsyncStorage.setItem(AUTH_TOKEN_KEY, responseData.token);
      }
      setUser(responseData.user);
      return { success: true };
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }
  };

  /* ✅ LOGOUT */
  const logout = async () => {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      queryClient.clear();
    } catch (e) {
      console.error("Logout cleanup failed:", e);
    } finally {
      setUser(null);
    }
  };

  /* ✅ UPDATE USER */
  const updateUser = async (userData: Partial<User>) => {
    if (!user) return;

    const updatedUser = { ...user, ...userData };
    setUser(updatedUser);

    try {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));
    } catch (e) {
      console.error("Failed to update stored user:", e);
    }
  };

  /* ✅ CHANGE PASSWORD */
  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user) return { success: false, error: "Not authenticated" };

    try {
      const response = await apiRequest("PUT", "/auth/password", {
        userId: user.id,
        currentPassword,
        newPassword,
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.error || "Password change failed" };
      }

      return { success: true };
    } catch {
      return { success: false, error: "Network error. Please try again." };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateUser,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
