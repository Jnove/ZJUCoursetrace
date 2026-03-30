import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useTheme, CARD_RADIUS_VALUES } from '@/lib/theme-provider';
import { IconSymbol } from './icon-symbol';

interface ButtonConfig {
  text: string;
  onPress: () => void;
  type?: 'primary' | 'secondary' | 'danger';
}

interface CustomModalProps {
  visible: boolean;
  title?: string;
  message?: string;
  buttons?: ButtonConfig[];
  onClose?: () => void; // 关闭按钮（如果不需要可忽略）
  icon?: React.ReactNode; // 可选图标
}

export function CustomModal({
  visible,
  title,
  message,
  buttons = [],
  onClose,
  icon,
}: CustomModalProps) {
  const colors = useColors();
  const { primaryColor, cardRadius } = useTheme();
  const radius = CARD_RADIUS_VALUES[cardRadius];

  // 如果未提供按钮，默认一个“关闭”按钮
  const finalButtons = buttons.length > 0 ? buttons : [{ text: '关闭', onPress: onClose ?? (() => {}), type: 'secondary' }];

  const getButtonStyle = (type?: string) => {
  switch (type) {
    case 'primary':
      return { backgroundColor: primaryColor, textColor: '#fff' };
    case 'danger':
      return { backgroundColor: colors.error, textColor: '#fff' };
    default:
      return { backgroundColor: 'transparent', textColor: primaryColor };
  }
};

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { borderRadius: radius, backgroundColor: colors.surface }]}>
          {icon && <View style={styles.iconContainer}>{icon}</View>}
          {title && (
            <Text style={[styles.title, { color: colors.foreground }]}>
              {title}
            </Text>
          )}
          {message && (
            <Text style={[styles.message, { color: colors.muted }]}>
              {message}
            </Text>
          )}
          <View style={styles.buttonContainer}>
            {finalButtons.map((btn, idx) => {
              const { backgroundColor, textColor } = getButtonStyle(btn.type);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.button,
                    { backgroundColor },
                    idx === 0 && finalButtons.length > 1 ? styles.buttonLeft : null,
                    idx === finalButtons.length - 1 && finalButtons.length > 1 ? styles.buttonRight : null,
                    finalButtons.length === 1 ? styles.buttonSingle : null,
                  ]}
                  onPress={btn.onPress}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.buttonText, { color: textColor }]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    padding: 20,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonLeft: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  buttonRight: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  buttonSingle: {
    borderRadius: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '500',
  },
});