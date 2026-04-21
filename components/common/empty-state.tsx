import { View, Text } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTheme, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";

export function EmptyState({ message }: { message: string }) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 60,
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 14, color: colors.muted, fontFamily:ff }}>{message}</Text>
    </View>
  );
}