import { ScreenContainer } from "@/components/screen-container";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { useTheme } from '@/lib/theme-provider';
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { SFSymbol } from "expo-symbols";
import { SFSymbols7_0 } from "sf-symbols-typescript";
import { useRouter } from "expo-router";

export default function SettingsScreen() {
  const { state: authState, signOut } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { themePreference, setThemePreference, resolvedTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogout = async () => {
    try {
      setLoading(true);
      await signOut();
      setUsername("");
      setPassword("");
      setError("");
      // 退出成功后跳转到首页（tabs 下的 index）
      router.replace('/(tabs)');
    } catch (error) {
      console.error("Logout error:", error);
      Alert.alert("错误", "退出登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  // 主题选项列表
  const themeOptions: { label: string; value: 'light' | 'dark' | 'system'; icon: SFSymbols7_0 }[] = [
    { label: '跟随系统', value: 'system', icon: 'circle.righthalf.fill' },
    { label: '浅色', value: 'light', icon: 'sun.max.fill' },
    { label: '深色', value: 'dark', icon: 'moon.fill' },
    
  ];

  return (
    <ScreenContainer className="flex-col bg-background">
      <ScrollView 
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between' }}
        showsVerticalScrollIndicator={false}
    >
        <View className="rounded-xl justify-center gap-3">
          <Text className="text-2xl font-bold text-foreground items-center self-center justify-center p-2 mx-auto">设置</Text>

        {/* 主题区域 - 圆角背景容器包含标题和按钮 */}
        <View className="bg-surface rounded-xl gap-3 p-3 mt-4 m-1/2">
        {/* 主题标题 */}
        <Text className="text-base text-foreground font-medium">主题</Text>
        
        {/* 按钮组 - 水平排列 */}
        <View className="flex-row gap-6">
            {themeOptions.map((option) => (
            <TouchableOpacity
                key={option.value}
                onPress={() => setThemePreference(option.value)}
                className={`py-2 flex-1 rounded-lg items-center justify-center ${
                themePreference === option.value ? 'bg-primary' : ''
                }`}
            >
                <View className="items-center gap-1 px-2">
                <IconSymbol
                    name={option.icon}
                    size={24}
                    color={themePreference === option.value ? 'white' : '#888'}
                />
                <Text
                    className={`text-sm font-medium ${
                    themePreference === option.value
                        ? 'text-white'
                        : 'text-foreground'
                    }`}
                >
                    {option.label}
                </Text>
                </View>
            </TouchableOpacity>
            ))}
        </View>
        </View>
        </View>
        {/* 底部：仅当用户已登录才显示退出登录按钮 */}
        {authState.userToken && (
        <View className="p-6">
          <TouchableOpacity
            onPress={handleLogout}
            disabled={loading}
            className="bg-error/10 border-2 border-orange-500/50 rounded-lg py-4 px-4 items-center justify-center flex-row gap-2 active:opacity-80 w-40 mx-auto"
          >
            <IconSymbol
              name="rectangle.portrait.and.arrow.right"
              size={20}
              color="#dc2626" // 与 text-error 颜色一致
            />
            <Text className="text-error font-semibold text-base">
              {loading ? '退出中...' : '退出登录'}
            </Text>
          </TouchableOpacity>
        </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}