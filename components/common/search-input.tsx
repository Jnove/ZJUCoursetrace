/**
 * 通用搜索框：课件课程选择器 / 作业列表共用。
 * 受控组件，右侧带一键清空；容器样式可由 style 覆盖（如背景色随所在页面调整）。
 */
import { View, TextInput, TouchableOpacity, type StyleProp, type ViewStyle } from "react-native";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useTheme, FONT_FAMILY_META } from "@/lib/theme-provider";

export function SearchInput({
  value,
  onChangeText,
  placeholder,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const { fontFamily } = useTheme();
  const ff = FONT_FAMILY_META[fontFamily].value;

  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: colors.surface,
          borderRadius: 10,
          paddingHorizontal: 10,
          borderWidth: 0.5,
          borderColor: colors.border,
        },
        style,
      ]}
    >
      <IconSymbol name="magnifyingglass" size={15} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "搜索"}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ flex: 1, paddingVertical: 8, fontSize: 14, color: colors.foreground, fontFamily: ff }}
      />
      {value.length > 0 && (
        <TouchableOpacity
          onPress={() => onChangeText("")}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <IconSymbol name="xmark" size={14} color={colors.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}
