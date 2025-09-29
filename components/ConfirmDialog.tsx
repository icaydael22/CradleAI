import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmAction: () => void;
  cancelAction: () => void;
  confirmColor?: string;
  icon?: string; // Ionicons name
  iconColor?: string;
  destructive?: boolean;
  showCancel?: boolean; // NEW: allow single-button alert style
}

const { width } = Dimensions.get('window');
const DIALOG_WIDTH = Math.min(width - 48, 400);

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  confirmAction,
  cancelAction,
  confirmColor = theme.colors.primary,
  icon,
  iconColor,
  destructive = false,
  showCancel = true,
}) => {
  // Determine a readable text color for the confirm button given its background color
  const getTextColorForBackground = (bg: string) => {
    try {
      let r = 0, g = 0, b = 0;
      if (bg.startsWith('rgb')) {
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (m && m[1]) {
          const parts = m[1].split(',').map(p => parseFloat(p.trim()));
          [r, g, b] = parts;
        }
      } else if (bg.startsWith('#')) {
        const hex = bg.replace('#','');
        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16);
          g = parseInt(hex[1] + hex[1], 16);
          b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
          r = parseInt(hex.substring(0,2), 16);
          g = parseInt(hex.substring(2,4), 16);
          b = parseInt(hex.substring(4,6), 16);
        }
      }

      // relative luminance formula
      const srgb = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      const luminance = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];

      // if background is light, use dark text, otherwise use theme buttonText (light)
      return luminance > 0.6 ? '#282828' : theme.colors.buttonText;
    } catch (e) {
      return theme.colors.buttonText;
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={cancelAction}
    >
      <TouchableWithoutFeedback onPress={cancelAction}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <BlurView intensity={20} tint="dark" style={styles.blurContainer}>
              <View style={[styles.dialog, { width: DIALOG_WIDTH }]}>
                {icon && (
                  <View style={[
                    styles.iconContainer,
                    { backgroundColor: destructive ? 'rgba(255, 68, 68, 0.1)' : 'rgba(255, 224, 195, 0.1)' }
                  ]}>
                    <Ionicons 
                      name={icon as any} 
                      size={32} 
                      color={destructive ? theme.colors.danger : (iconColor || theme.colors.primary)} 
                    />
                  </View>
                )}
                
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.message}>{message}</Text>
                
                <View style={[styles.buttonContainer, !showCancel && { justifyContent: 'center' }]}>
                  {showCancel && (
                    <TouchableOpacity
                      style={[styles.button, styles.cancelButton]}
                      onPress={cancelAction}
                    >
                      <Text style={styles.cancelButtonText}>{cancelText}</Text>
                    </TouchableOpacity>
                  )}
                  
                  <TouchableOpacity
                    style={[
                      styles.button, 
                      styles.confirmButton,
                      !showCancel && { marginHorizontal: 0, width: '100%' },
                      { backgroundColor: destructive ? theme.colors.danger : confirmColor }
                    ]}
                    onPress={confirmAction}
                  >
                    <Text style={[styles.confirmButtonText, { color: getTextColorForBackground(destructive ? theme.colors.danger : confirmColor) }]}>{confirmText}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </BlurView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurContainer: {
    maxWidth: 420,
    width: '92%',
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
  },
  dialog: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  title: {
    fontSize: theme.fontSizes.lg,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontSize: theme.fontSizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  confirmButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  cancelButtonText: {
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: theme.fontSizes.md,
  },
  confirmButtonText: {
    color: theme.colors.buttonText,
    fontWeight: '600',
    fontSize: theme.fontSizes.md,
  },
});

export default ConfirmDialog;