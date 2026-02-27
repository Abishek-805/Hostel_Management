import React from "react";
import { BrandedLoadingOverlay } from "@/components/BrandedLoadingOverlay";
import { Feather } from "@expo/vector-icons";

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  icon?: keyof typeof Feather.glyphMap;
  color?: string;
}

export function LoadingOverlay({ visible, message, icon, color }: LoadingOverlayProps) {
  return <BrandedLoadingOverlay visible={visible} message={message || "Loading..."} icon={icon} color={color} />;
}
