import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { Colors } from "@/constants/theme";
import GatekeeperScanScreen from "@/screens/gatekeeper/GatekeeperScanScreen";
import GatekeeperOutsideListScreen from "@/screens/gatekeeper/GatekeeperOutsideListScreen";
import GatekeeperProfileScreen from "@/screens/gatekeeper/GatekeeperProfileScreen";

type GatekeeperTabParamList = {
  Scan: undefined;
  Outside: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<GatekeeperTabParamList>();

export default function GatekeeperTabNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary.main,
        tabBarInactiveTintColor: theme.tabIconDefault,
      }}
    >
      <Tab.Screen
        name="Scan"
        component={GatekeeperScanScreen}
        options={{
          title: "Verify Token",
          tabBarIcon: ({ color, size }) => <Feather name="edit-3" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Outside"
        component={GatekeeperOutsideListScreen}
        options={{
          title: "Outside",
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={GatekeeperProfileScreen}
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}
