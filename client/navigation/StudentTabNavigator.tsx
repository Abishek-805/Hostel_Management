import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { HeaderBackButton } from "@react-navigation/elements";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Pressable } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

import StudentDashboardScreen from "@/screens/student/StudentDashboardScreen";
import MenuScreen from "@/screens/student/MenuScreen";
import AttendanceScreen from "@/screens/student/AttendanceScreen";
import RequestsScreen from "@/screens/student/RequestsScreen";
import StudentProfileScreen from "@/screens/student/StudentProfileScreen";
import AnnouncementsScreen from "@/screens/student/AnnouncementsScreen";
import ComplaintsScreen from "@/screens/student/ComplaintsScreen";
import RoomDetailsScreen from "@/screens/student/RoomDetailsScreen";
import FoodPollScreen from "@/screens/admin/FoodPollScreen";

export type StudentTabParamList = {
  HomeTab: undefined;
  MenuTab: undefined;
  AttendanceTab: undefined;
  RequestsTab: undefined;
  ProfileTab: undefined;
};

export type StudentStackParamList = {
  Dashboard: undefined;
  Announcements: undefined;
  Complaints: undefined;
  Menu: undefined;
  Attendance: undefined;
  Requests: undefined;
  Profile: undefined;
  RoomDetails: undefined;
  FoodPoll: undefined;
};

const Tab = createBottomTabNavigator<StudentTabParamList>();
const Stack = createNativeStackNavigator<StudentStackParamList>();

function BackToHomeButton({ pointerEvents, canGoBack, label, tintColor, style, ...props }: any) {
  const navigation = useNavigation<any>();
  return (
    <HeaderBackButton
      canGoBack={canGoBack}
      label={label}
      tintColor={tintColor}
      style={[style, pointerEvents && { pointerEvents }]}
      {...props}
      onPress={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.getParent()?.navigate("HomeTab", { screen: "Dashboard" });
        }
      }}
    />
  );
}

function HomeStack() {
  const screenOptions = useScreenOptions();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Dashboard"
        component={StudentDashboardScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Announcements"
        component={AnnouncementsScreen}
        options={{ headerTitle: "Announcements" }}
      />
      <Stack.Screen
        name="Complaints"
        component={ComplaintsScreen}
        options={{ headerTitle: "Complaints" }}
      />
      <Stack.Screen
        name="RoomDetails"
        component={RoomDetailsScreen}
        options={{
          headerTitle: "Room Details",
          headerLeft: (props) => <BackToHomeButton {...props} />
        }}
      />
    </Stack.Navigator>
  );
}

function MenuStack() {
  const screenOptions = useScreenOptions();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Menu"
        component={MenuScreen}
        options={{
          headerTitle: "Mess Menu",
          headerLeft: (props) => <BackToHomeButton {...props} />
        }}
      />
      <Stack.Screen
        name="FoodPoll"
        component={FoodPollScreen}
        options={{
          headerTitle: "Food Poll",
          headerLeft: (props) => <BackToHomeButton {...props} />
        }}
      />
    </Stack.Navigator>
  );
}

function AttendanceStack() {
  const screenOptions = useScreenOptions();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Attendance"
        component={AttendanceScreen}
        options={{
          headerTitle: "Attendance",
          headerLeft: (props) => <BackToHomeButton {...props} />
        }}
      />
    </Stack.Navigator>
  );
}

function RequestsStack() {
  const screenOptions = useScreenOptions();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Requests"
        component={RequestsScreen}
        options={{
          headerTitle: "Leave Requests",
          headerLeft: (props) => <BackToHomeButton {...props} />
        }}
      />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  const screenOptions = useScreenOptions();
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Profile"
        component={StudentProfileScreen}
        options={{
          headerTitle: "Profile",
          headerLeft: (props) => <BackToHomeButton {...props} />
        }}
      />
    </Stack.Navigator>
  );
}

export default function StudentTabNavigator() {
  const { theme, isDark } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        tabBarActiveTintColor: Colors.primary.main,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: Platform.select({
            ios: "transparent",
            android: theme.backgroundRoot,
          }),
          borderTopWidth: 0,
          elevation: 0,
          height: Spacing.tabBarHeight,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
        },
        tabBarBackground: Platform.OS === "ios" ? () => (
          <BlurView
            intensity={100}
            tint={isDark ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        ) : undefined,
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Feather name="home" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MenuTab"
        component={MenuStack}
        options={{
          title: "Menu",
          tabBarIcon: ({ color, size }) => (
            <Feather name="book-open" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AttendanceTab"
        component={AttendanceStack}
        options={{
          title: "Attendance",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={[
                styles.centerTab,
                { backgroundColor: focused ? Colors.primary.main : theme.backgroundSecondary },
              ]}
            >
              <Feather name="check-circle" size={24} color={focused ? "#FFFFFF" : color} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tab.Screen
        name="RequestsTab"
        component={RequestsStack}
        options={{
          title: "Requests",
          tabBarIcon: ({ color, size }) => (
            <Feather name="file-text" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  centerTab: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
});
