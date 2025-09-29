import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface RewriteOpinionModalProps {
  isVisible: boolean;
  onClose: () => void;
  onRegenerate: (opinion: string) => void;
  onRegenerateWithoutOpinion: () => void;
  isProcessing?: boolean;
}

const { width, height } = Dimensions.get('window');

const RewriteOpinionModal: React.FC<RewriteOpinionModalProps> = ({
  isVisible,
  onClose,
  onRegenerate,
  onRegenerateWithoutOpinion,
  isProcessing = false,
}) => {
  const [opinion, setOpinion] = useState('');
  // Internal visible state for fade animation (keep mounted while animating out)
  const [internalVisible, setInternalVisible] = useState(isVisible);
  const opacity = useRef(new Animated.Value(isVisible ? 1 : 0)).current;

  useEffect(() => {
    // Reset opinion when modal is requested to open
    if (isVisible) {
      setOpinion('');
    }

    if (isVisible) {
      setInternalVisible(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      // animate out then hide
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setInternalVisible(false));
    }
  }, [isVisible, opacity]);

  const handleRegenerate = () => {
    if (opinion.trim()) {
      onRegenerate(opinion.trim());
    } else {
      onRegenerateWithoutOpinion();
    }
  };

  const handleDirectRegenerate = () => {
    onRegenerateWithoutOpinion();
  };

  return (
    <Modal
      visible={internalVisible}
      animationType="none"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* No backdrop / dimming — modal content will be centered without overlay */}
        <Animated.View style={[styles.animatedContainer, { opacity }]}> 
          <View style={[styles.modalContainer, styles.shadow]}>
            <View style={styles.header}>
              <Text style={styles.title}>重新生成</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onClose}
                disabled={isProcessing}
              >
                <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.content}>
              <Text style={styles.label}>重写意见（可选）</Text>
              <Text style={styles.description}>可输入对重写的期望。留空则直接重新生成。</Text>

              <TextInput
                style={styles.textInput}
                multiline
                placeholder="例如：回复不要含省略号..."
                placeholderTextColor={theme.colors.textSecondary}
                value={opinion}
                onChangeText={setOpinion}
                maxLength={500}
                editable={!isProcessing}
              />

              <View style={styles.footerRow}>
                <Text style={styles.charCount}>{opinion.length}/500</Text>
              </View>
            </View>

            <View style={styles.buttonsRow}>


              <TouchableOpacity
                style={[styles.button, styles.primaryButton]}
                onPress={handleRegenerate}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={theme.colors.buttonText} />
                ) : (
                  <Text style={styles.primaryText}>{opinion.trim() ? '按要求重新生成' : '直接重新生成'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: theme.borderRadius.lg,
    width: Math.min(width * 0.9, 420),
    maxHeight: height * 0.8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    fontSize: theme.fontSizes.lg,
    fontWeight: '600',
    color: theme.colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSizes.md,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  description: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    fontSize: theme.fontSizes.md,
    minHeight: 100,
    maxHeight: 200,
    textAlignVertical: 'top',
    color: theme.colors.text,
    backgroundColor: 'rgba(255,255,255,0.02)'
  },
  charCount: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    marginTop: theme.spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  buttonsRow: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    gap: 12,
    backgroundColor: theme.colors.background,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 6,
  },
  primaryButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  primaryText: {
    color: `black`,
    fontSize: theme.fontSizes.md,
    fontWeight: '600',
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: theme.fontSizes.md,
    fontWeight: '600',
  },
  shadow: {
    ...theme.shadows.medium,
  },
  animatedContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
});

export default RewriteOpinionModal;
