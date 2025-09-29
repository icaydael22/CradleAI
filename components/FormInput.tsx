import React, { useState, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  TextInputProps,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export interface FormInputRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
  hasError: () => boolean;
  setError: (error: string | null) => void;
}

interface FormInputProps extends TextInputProps {
  label?: string;
  icon?: string;
  error?: string | null;
  hint?: string;
  containerStyle?: ViewStyle;
  labelStyle?: TextStyle;
  inputStyle?: TextStyle;
  errorStyle?: TextStyle;
  hintStyle?: TextStyle;
  iconColor?: string;
  secureTextEntry?: boolean;
  showClearButton?: boolean;
  onClear?: () => void;
  required?: boolean;
  mandatory?: boolean; // Shows a red asterisk
  rounded?: boolean;
  outlined?: boolean;
  backgroundColor?: string;
  validationFunction?: (text: string) => string | null;
  onValidationChange?: (isValid: boolean) => void;
  rightComponent?: React.ReactNode;
  onIconPress?: () => void;
}

const FormInput = forwardRef<FormInputRef, FormInputProps>((props, ref) => {
  const {
    label,
    icon,
    error,
    hint,
    containerStyle,
    labelStyle,
    inputStyle,
    errorStyle,
    hintStyle,
    iconColor = theme.colors.textSecondary,
    secureTextEntry = false,
    showClearButton = false,
    onClear,
    placeholder,
    value,
    onChangeText,
    required = false,
    mandatory = false,
    rounded = false,
    outlined = false,
    backgroundColor = 'rgba(60, 60, 60, 0.5)',
    validationFunction,
    onValidationChange,
    rightComponent,
    onIconPress,
    ...restProps
  } = props;

  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(error || null);
  const [secureEntry, setSecureEntry] = useState(secureTextEntry);
  const inputRef = React.useRef<TextInput>(null);
  const shakeAnimation = React.useRef(new Animated.Value(0)).current;

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
    blur: () => {
      inputRef.current?.blur();
    },
    clear: () => {
      setInputValue('');
      inputRef.current?.clear();
      if (onChangeText) {
        onChangeText('');
      }
      if (onClear) {
        onClear();
      }
    },
    getValue: () => inputValue,
    setValue: (val: string) => {
      setInputValue(val);
      if (onChangeText) {
        onChangeText(val);
      }
    },
    hasError: () => !!errorMessage,
    setError: (error: string | null) => {
      setErrorMessage(error);
      if (error) {
        startShakeAnimation();
      }
    },
  }));

  // Apply validation when the input value changes
  const handleChangeText = (text: string) => {
    setInputValue(text);
    
    if (validationFunction) {
      const validationError = validationFunction(text);
      setErrorMessage(validationError);
      
      if (onValidationChange) {
        onValidationChange(!validationError);
      }
    }
    
    if (onChangeText) {
      onChangeText(text);
    }
  };

  // Start shake animation for error feedback
  const startShakeAnimation = () => {
    Animated.sequence([
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Update error message when prop changes
  React.useEffect(() => {
    if (error !== undefined && error !== errorMessage) {
      setErrorMessage(error);
      if (error) {
        startShakeAnimation();
      }
    }
  }, [error]);

  // Update input value when prop changes
  React.useEffect(() => {
    if (value !== undefined && value !== inputValue) {
      setInputValue(value);
    }
  }, [value]);

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Label */}
      {label && (
        <View style={styles.labelContainer}>
          <Text style={[styles.label, labelStyle]}>
            {label}
            {mandatory && <Text style={styles.mandatory}>*</Text>}
          </Text>
        </View>
      )}

      {/* Input Container */}
      <Animated.View
        style={[
          styles.inputContainer,
          {
            borderRadius: rounded ? 20 : 8,
            backgroundColor: outlined ? 'transparent' : backgroundColor,
            borderWidth: outlined || (isFocused && !errorMessage) ? 1 : 0,
            borderColor: 
              errorMessage ? 
                theme.colors.danger : 
                isFocused ? 
                  theme.colors.primary : 
                  outlined ? 'rgba(255, 255, 255, 0.2)' : undefined,
            transform: [{ translateX: shakeAnimation }],
          },
        ]}
      >
        {/* Left Icon */}
        {icon && (
          <TouchableOpacity
            style={styles.iconContainer}
            onPress={onIconPress}
            disabled={!onIconPress}
          >
            <Ionicons
              name={icon as any}
              size={20}
              color={iconColor}
            />
          </TouchableOpacity>
        )}

        {/* Text Input */}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            icon && { paddingLeft: 0 },
            inputStyle,
          ]}
          value={inputValue}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          placeholderTextColor="rgba(255, 255, 255, 0.4)"
          secureTextEntry={secureEntry}
          {...restProps}
        />

        {/* Right Actions */}
        <View style={styles.rightActionsContainer}>
          {/* Clear Button */}
          {showClearButton && inputValue.length > 0 && (
            <TouchableOpacity 
              style={styles.clearButton} 
              onPress={() => {
                setInputValue('');
                if (onChangeText) onChangeText('');
                if (onClear) onClear();
              }}
            >
              <Ionicons name="close-circle" size={16} color="rgba(255, 255, 255, 0.5)" />
            </TouchableOpacity>
          )}

          {/* Toggle Password Visibility */}
          {secureTextEntry && (
            <TouchableOpacity
              style={styles.secureButton}
              onPress={() => setSecureEntry(!secureEntry)}
            >
              <Ionicons
                name={secureEntry ? 'eye-off' : 'eye'}
                size={20}
                color="rgba(255, 255, 255, 0.5)"
              />
            </TouchableOpacity>
          )}

          {/* Custom Right Component */}
          {rightComponent}
        </View>
      </Animated.View>

      {/* Error Message */}
      {errorMessage && (
        <Text style={[styles.errorText, errorStyle]}>
          {errorMessage}
        </Text>
      )}

      {/* Hint Text */}
      {hint && !errorMessage && (
        <Text style={[styles.hintText, hintStyle]}>
          {hint}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  labelContainer: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  mandatory: {
    color: theme.colors.danger,
    marginLeft: 2,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 12,
  },
  iconContainer: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    paddingVertical: 8,
  },
  rightActionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButton: {
    padding: 4,
  },
  secureButton: {
    padding: 4,
    marginLeft: 4,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.danger,
    marginTop: 4,
    marginLeft: 4,
  },
  hintText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
    marginLeft: 4,
  },
});

export default FormInput;
