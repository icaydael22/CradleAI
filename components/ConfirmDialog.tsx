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
}) => {
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
                
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={cancelAction}
                  >
                    <Text style={styles.cancelButtonText}>{cancelText}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[
                      styles.button, 
                      styles.confirmButton,
                      { backgroundColor: destructive ? theme.colors.danger : confirmColor }
                    ]}
                    onPress={confirmAction}
                  >
                    <Text style={styles.confirmButtonText}>{confirmText}</Text>
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
    maxWidth: 400,
    width: '90%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  dialog: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 24,
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
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
  },
  cancelButtonText: {
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  confirmButtonText: {
    color: '#282828',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default ConfirmDialog;