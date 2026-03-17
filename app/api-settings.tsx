import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import {
  getCurrentApiBaseUrl,
  setCustomApiUrl,
  resetCustomApiUrl,
} from '@/lib/api-url';

export default function ApiSettingsScreen() {
  const router = useRouter();
  const [currentUrl, setCurrentUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 加载当前有效的 URL
    const url = getCurrentApiBaseUrl();
    setCurrentUrl(url);
    setInputUrl(url);
  }, []);

  const handleSave = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      Alert.alert('错误', 'URL 不能为空');
      return;
    }
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      Alert.alert('错误', 'URL 必须以 http:// 或 https:// 开头');
      return;
    }

    setSaving(true);
    try {
      await setCustomApiUrl(trimmed);
      setCurrentUrl(trimmed);
      Alert.alert('成功', 'API 地址已更新');
    } catch (error) {
      Alert.alert('错误', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await resetCustomApiUrl();
      const defaultUrl = getCurrentApiBaseUrl();
      setCurrentUrl(defaultUrl);
      setInputUrl(defaultUrl);
      Alert.alert('已重置', '已恢复默认 API 地址');
    } catch (error) {
      Alert.alert('错误', '重置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const testUrl = inputUrl.trim() || currentUrl;
    if (!testUrl) {
      Alert.alert('错误', '没有可测试的 URL');
      return;
    }
    setTesting(true);
    try {
      const response = await fetch(`${testUrl}/api/test`);
      const data = await response.json();
      if (data.success) {
        Alert.alert('测试成功', `API 可正常访问\n响应: ${data.message}`);
      } else {
        Alert.alert('测试失败', '服务器返回错误');
      }
    } catch (error) {
      Alert.alert('测试失败', '无法连接到 API，请检查地址或网络');
    } finally {
      setTesting(false);
    }
  };

  return (
    <ScreenContainer className="bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        {/* 标题和返回按钮 */}
        <View className="flex-row items-center justify-between mb-4">
          <TouchableOpacity onPress={() => router.back()} className="p-2">
            <IconSymbol name="chevron.left" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-foreground">API 地址设置</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* 当前地址显示 */}
        <View className="bg-surface rounded-xl p-4">
          <Text className="text-sm text-foreground mb-1">当前使用的地址</Text>
          <Text className="text-base text-foreground font-mono">{currentUrl}</Text>
        </View>

        {/* 输入新地址 */}
        <View className="bg-surface rounded-xl p-4 gap-3">
          <Text className="text-base text-foreground font-medium">设置新地址</Text>
          <TextInput
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="例如 http://192.168.1.100:3000"
            placeholderTextColor="#888"
            className="border border-border rounded-lg p-3 text-foreground"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* 按钮组 */}
          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || testing}
              className="flex-1 bg-primary py-3 rounded-lg items-center"
            >
              {saving ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-semibold">保存</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleReset}
              disabled={saving || testing}
              className="flex-1 bg-gray-500 py-3 rounded-lg items-center"
            >
              <Text className="text-white font-semibold">重置为默认</Text>
            </TouchableOpacity>
          </View>

          {/* 测试按钮 */}
          <TouchableOpacity
            onPress={handleTest}
            disabled={testing || saving}
            className="bg-blue-500 py-3 rounded-lg items-center mt-2"
          >
            {testing ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold">测试连接</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text className="text-sm text-foreground text-center mt-4">
          修改后将立即生效，建议测试连接确保可用
        </Text>
      </ScrollView>
    </ScreenContainer>
  );
}