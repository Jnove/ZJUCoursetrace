import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; 
import { IconSymbol } from "@/components/ui/icon-symbol";

interface PasswordInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  loading?: boolean;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChangeText,
  placeholder = '请输入您的密码',
  loading = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View>
      <Text className="text-sm font-semibold text-foreground mb-2">密码</Text>
      <View className="relative">
        <TextInput
          placeholder={placeholder}
          placeholderTextColor="#999"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!showPassword}
          editable={!loading}
          className="bg-surface border border-border rounded-lg px-4 py-3 text-foreground pr-12" // 预留右侧空间给图标
        />
        <TouchableOpacity
          onPress={() => setShowPassword(!showPassword)}
          style={{
            position: 'absolute',
            right: 12,
            top: '50%',
            transform: [{ translateY: -12 }], // 垂直居中（假设图标高度24）
          }}
        >
          <IconSymbol
            name={showPassword ? 'eye.slash' : 'eye'}
            size={24}
            color="#999"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};