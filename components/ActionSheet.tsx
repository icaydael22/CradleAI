import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { theme } from '@/constants/theme';

export interface ActionSheetOption {
  title: string;
  icon?: string; // Ionicons name
  iconColor?: string;
  onPress: () => void;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelText?: string;
}

const { height } = Dimensions.get('window');

const ActionSheet: React.FC<ActionSheetProps> = ({
  visible,
  onClose,
  title,
  message,
  options,
  cancelText = '取消',
}) => {
  const translateY = useRef(new Animated.Value(height)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    if (visible) {
      showActionSheet();
    } else {
      hideActionSheet();
    }
  }, [visible]);
  
  const showActionSheet = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };
  
  const hideActionSheet = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: height,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };
  
  const handleOptionPress = (option: ActionSheetOption) => {
    // Close the action sheet first
    onClose();
    // Set timeout to allow animation to finish before executing the action
    setTimeout(() => {
      option.onPress();
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[
          styles.backdrop,
          { opacity }
        ]}>
          <TouchableWithoutFeedback>
            <Animated.View style={[
              styles.container,
              { transform: [{ translateY }] }
            ]}>
              <BlurView intensity={30} tint="dark" style={styles.blurContainer}>
                {/* Header */}
                {(title || message) && (
                  <View style={styles.header}>
                    {title && <Text style={styles.title}>{title}</Text>}
                    {message && <Text style={styles.message}>{message}</Text>}
                  </View>
                )}
                
                {/* Options */}
                <ScrollView style={styles.optionsContainer}>
                  {options.map((option, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.option,
                        index === options.length - 1 && styles.lastOption,
                      ]}
                      onPress={() => handleOptionPress(option)}
                    >
                      {option.icon && (
                        <Ionicons
                          name={option.icon as any}
                          size={24}
                          color={option.destructive ? theme.colors.danger : (option.iconColor || theme.colors.primary)}
                          style={styles.optionIcon}
                        />
                      )}
                      <Text style={[
                        styles.optionText,
                        option.destructive && styles.destructiveText,
                      ]}>
                        {option.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                {/* Cancel Button */}
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                >
                  <Text style={styles.cancelText}>{cancelText}</Text>
                </TouchableOpacity>
              </BlurView>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: height * 0.8,
    marginHorizontal: 8,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  blurContainer: {
    width: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  optionsContainer: {
    maxHeight: height * 0.6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  lastOption: {
    borderBottomWidth: 0,
  },
  optionIcon: {
    marginRight: 16,
  },
  optionText: {
    fontSize: 16,
    color: theme.colors.text,
  },
  destructiveText: {
    color: theme.colors.danger,
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    marginTop: 8,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.primary,
  },
});

export default ActionSheet;
