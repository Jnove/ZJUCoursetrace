import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";
import { cn } from "@/lib/utils";

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { state: authState, signIn } = useAuth();
  const { fetchSchedule } = useSchedule();
  const router = useRouter();

  const handleLogin = async () => {
    try {
      await signIn(username, password);
      // 登录成功后获取课表
      await fetchSchedule();
      router.replace("/(tabs)");
    } catch (error) {
      // 错误已在context中处理
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <ScreenContainer className="justify-center px-6" edges={["top", "left", "right", "bottom"]}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
          {/* 标题区域 */}
          <View className="items-center mb-12">
            <Text className="text-4xl font-bold text-primary mb-2">ZJU 课表</Text>
            <Text className="text-base text-muted">浙江大学课表助手</Text>
          </View>

          {/* 错误提示 */}
          {authState.error && (
            <View className="bg-error/10 border border-error rounded-lg p-4 mb-6">
              <Text className="text-error text-sm">{authState.error}</Text>
            </View>
          )}

          {/* 输入框 */}
          <View className="gap-4 mb-8">
            {/* 用户名输入 */}
            <View>
              <Text className="text-foreground font-semibold mb-2">用户名</Text>
              <TextInput
                className={cn(
                  "bg-surface border border-border rounded-lg px-4 py-3",
                  "text-foreground text-base",
                  "placeholder:text-muted"
                )}
                placeholder="请输入浙江大学学号"
                value={username}
                onChangeText={setUsername}
                editable={!authState.isLoading}
                placeholderTextColor="#9BA1A6"
              />
            </View>

            {/* 密码输入 */}
            <View>
              <Text className="text-foreground font-semibold mb-2">密码</Text>
              <TextInput
                className={cn(
                  "bg-surface border border-border rounded-lg px-4 py-3",
                  "text-foreground text-base",
                  "placeholder:text-muted"
                )}
                placeholder="请输入密码"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!authState.isLoading}
                placeholderTextColor="#9BA1A6"
              />
            </View>
          </View>

          {/* 登录按钮 */}
          <TouchableOpacity
            onPress={handleLogin}
            disabled={authState.isLoading || !username || !password}
            className={cn(
              "bg-primary rounded-lg py-4 items-center justify-center",
              authState.isLoading || !username || !password ? "opacity-60" : ""
            )}
          >
            {authState.isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text className="text-white font-semibold text-base">登 录</Text>
            )}
          </TouchableOpacity>

          {/* 提示文本 */}
          <View className="mt-8 p-4 bg-surface rounded-lg border border-border">
            <Text className="text-muted text-xs leading-relaxed">
              💡 提示：请使用您的浙江大学本科教学管理信息服务平台账号登录。首次登录时需要进行身份验证。
            </Text>
          </View>
        </ScrollView>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}
