import { View, Text, TouchableOpacity } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useTheme, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";

function hexToRgba(hex: string, alpha: number): string {
  const c = hex.replace("#", "").slice(0, 6);
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${alpha})`;
}

export function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
  return (
    <View
      style={{
        borderRadius: 12,
        backgroundColor: hexToRgba(colors.error, 0.08),
        borderWidth: 0.5,
        borderColor: hexToRgba(colors.error, 0.3),
        padding: 16,
        gap: 10,
      }}
    >
      <Text style={{ fontSize: 13, color: colors.error, fontFamily: ff }}>{message}</Text>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 14,
          paddingVertical: 7,
          borderRadius: 8,
          backgroundColor: hexToRgba(colors.error, 0.1),
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.error, fontFamily: ff }}>
          重试
        </Text>
      </TouchableOpacity>
    </View>
  );
}