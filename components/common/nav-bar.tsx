import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useTheme, FONT_FAMILY_META, FontFamily } from "@/lib/theme-provider";


export function CommonNavBar({ title }: { title: string }) {
  const router = useRouter();
  const colors = useColors();
  const { primaryColor } = useTheme();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;
    
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <IconSymbol name="chevron.left" size={22} color={primaryColor} />
      </TouchableOpacity>
      <Text
        style={{
          flex: 1,
          textAlign: "center",
          fontSize: 17,
          fontWeight: "600",
          color: colors.foreground, fontFamily: ff
        }}
      >
        {title}
      </Text>
      {/* 占位保持标题居中 */}
      <View style={{ width: 22 }} />
    </View>
  );
}