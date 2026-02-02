import { ScrollView, Text, View, TouchableOpacity } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/lib/auth-context";
import { useSchedule } from "@/lib/schedule-context";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const { state: authState, signOut } = useAuth();
  const { state: scheduleState } = useSchedule();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut();
      router.replace("/(tabs)");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <ScreenContainer className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        <View className="flex-1 gap-8 p-6">
          {/* 欢迎区域 */}
          <View className="items-center gap-2">
            <Text className="text-4xl font-bold text-foreground">ZJU 课表</Text>
            <Text className="text-base text-muted text-center">浙江大学课表助手</Text>
          </View>

          {/* 用户信息卡片 */}
          {authState.userToken && (
            <View className="bg-surface rounded-2xl p-6 gap-4 border border-border">
              <View className="gap-2">
                <Text className="text-xs text-muted font-semibold">当前用户</Text>
                <Text className="text-lg font-bold text-foreground">{authState.username}</Text>
              </View>

              <View className="gap-2 border-t border-border pt-4">
                <Text className="text-xs text-muted font-semibold">课程统计</Text>
                <Text className="text-base text-foreground">已加载 {scheduleState.courses.length} 门课程</Text>
              </View>
            </View>
          )}

          {/* 功能介绍 */}
          <View className="bg-surface rounded-2xl p-6 gap-4 border border-border">
            <Text className="text-lg font-bold text-foreground">功能特性</Text>

            <View className="gap-3">
              <View className="flex-row gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
                  <Text className="text-primary font-bold">1</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">CAS 认证登录</Text>
                  <Text className="text-xs text-muted mt-1">使用浙江大学账号安全登录</Text>
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
                  <Text className="text-primary font-bold">2</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">智能课表显示</Text>
                  <Text className="text-xs text-muted mt-1">自动获取并展示您的课程信息</Text>
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
                  <Text className="text-primary font-bold">3</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">单双周区分</Text>
                  <Text className="text-xs text-muted mt-1">清晰区分单周和双周课程</Text>
                </View>
              </View>

              <View className="flex-row gap-3">
                <View className="w-8 h-8 rounded-full bg-primary/20 items-center justify-center">
                  <Text className="text-primary font-bold">4</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">周次切换</Text>
                  <Text className="text-xs text-muted mt-1">灵活切换查看不同周次的课程</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 使用说明 */}
          <View className="bg-surface rounded-2xl p-6 gap-4 border border-border">
            <Text className="text-lg font-bold text-foreground">使用说明</Text>
            <Text className="text-sm text-muted leading-relaxed">
              1. 在登录屏幕输入您的浙江大学学号和密码
            </Text>
            <Text className="text-sm text-muted leading-relaxed">
              2. 系统将自动通过 CAS 认证并获取您的课表
            </Text>
            <Text className="text-sm text-muted leading-relaxed">
              3. 切换到"课表"标签页查看您的课程安排
            </Text>
            <Text className="text-sm text-muted leading-relaxed">
              4. 使用周次按钮切换查看不同周的课程
            </Text>
            <Text className="text-sm text-muted leading-relaxed">
              5. 使用过滤按钮查看单周、双周或全部课程
            </Text>
          </View>

          {/* 退出登录按钮 */}
          {authState.userToken && (
            <TouchableOpacity
              onPress={handleLogout}
              className="bg-error/10 border border-error rounded-lg py-4 items-center justify-center"
            >
              <Text className="text-error font-semibold text-base">退出登录</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
