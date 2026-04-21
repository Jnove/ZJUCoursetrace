import { View, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/use-colors";

export function LoadingView() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}