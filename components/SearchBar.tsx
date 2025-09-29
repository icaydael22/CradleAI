import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ViewStyle,
  TextStyle,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { BlurView } from 'expo-blur';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  autoFocus?: boolean;
  style?: ViewStyle;
  inputStyle?: TextStyle;
  searchIconColor?: string;
  clearIconColor?: string;
  backgroundColor?: string;
  blurBackground?: boolean;
  blurIntensity?: number;
  returnKeyType?: 'done' | 'go' | 'next' | 'search' | 'send';
  showCancelButton?: boolean;
  onCancel?: () => void;
  cancelText?: string;
  testID?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = '搜索...',
  value,
  onChangeText,
  onSubmit,
  onClear,
  autoFocus = false,
  style,
  inputStyle,
  searchIconColor = theme.colors.textSecondary,
  clearIconColor = theme.colors.textSecondary,
  backgroundColor = 'rgba(60, 60, 60, 0.5)',
  blurBackground = false,
  blurIntensity = 15,
  returnKeyType = 'search',
  showCancelButton = false,
  onCancel,
  cancelText = '取消',
  testID,
}) => {
  const [isFocused, setIsFocused] = useState(autoFocus);
  const inputRef = useRef<TextInput>(null);
  const cancelButtonWidth = useRef(new Animated.Value(0)).current;
  const containerWidth = useRef(new Animated.Value(100)).current;
  
  // Focus the input on mount if autoFocus is true
  useEffect(() => {
    if (autoFocus) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [autoFocus]);
  
  // Handle focus state changes
  const handleFocus = () => {
    setIsFocused(true);
    
    if (showCancelButton) {
      Animated.timing(cancelButtonWidth, {
        toValue: 60, // Width of cancel button
        duration: 200,
        useNativeDriver: false,
      }).start();
      
      Animated.timing(containerWidth, {
        toValue: 85, // Percentage of container width
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  };
  
  const handleBlur = () => {
    setIsFocused(false);
    
    if (showCancelButton) {
      Animated.timing(cancelButtonWidth, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
      
      Animated.timing(containerWidth, {
        toValue: 100,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  };
  
  // Handle clear button press
  const handleClear = () => {
    onChangeText('');
    if (onClear) {
      onClear();
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };
  
  // Handle cancel button press
  const handleCancel = () => {
    onChangeText('');
    Keyboard.dismiss();
    if (onCancel) {
      onCancel();
    }
    handleBlur();
  };
  
  // Render the search input
  const renderSearchInput = () => (
    <View style={[
      styles.inputContainer,
      { backgroundColor: blurBackground ? 'transparent' : backgroundColor },
    ]}>
      <Ionicons
        name="search"
        size={18}
        color={searchIconColor}
        style={styles.searchIcon}
      />
      
      <TextInput
        ref={inputRef}
        style={[styles.input, inputStyle]}
        placeholder={placeholder}
        placeholderTextColor="rgba(255, 255, 255, 0.5)"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        onFocus={handleFocus}
        onBlur={handleBlur}
        returnKeyType={returnKeyType}
        autoCapitalize="none"
        autoCorrect={false}
        blurOnSubmit={true}
      />
      
      {value.length > 0 && (
        <TouchableOpacity
          onPress={handleClear}
          style={styles.clearButton}
          testID={`${testID}-clear-button`}
        >
          <View style={styles.clearIconContainer}>
            <Ionicons name="close-circle" size={18} color={clearIconColor} />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
  
  return (
    <View style={[styles.container, style]}>
      <Animated.View
        style={[
          styles.searchContainer,
          { width: containerWidth.interpolate({
            inputRange: [85, 100],
            outputRange: ['85%', '100%'],
          })},
        ]}
      >
        {blurBackground ? (
          <BlurView 
            intensity={blurIntensity} 
            tint="dark" 
            style={styles.blurContainer}
          >
            {renderSearchInput()}
          </BlurView>
        ) : (
          renderSearchInput()
        )}
      </Animated.View>
      
      {showCancelButton && (
        <Animated.View
          style={[
            styles.cancelButtonContainer,
            { width: cancelButtonWidth }
          ]}
        >
          <TouchableOpacity
            onPress={handleCancel}
            style={styles.cancelButton}
            testID={`${testID}-cancel-button`}
          >
            <Animated.Text style={styles.cancelButtonText}>
              {cancelText}
            </Animated.Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    height: 40,
    maxWidth: '100%',
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  blurContainer: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#fff',
    fontSize: 16,
    paddingVertical: 8,
    paddingRight: 36, // Space for the clear button
  },
  clearButton: {
    padding: 8,
    position: 'absolute',
    right: 4,
  },
  clearIconContainer: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonContainer: {
    height: 40,
    overflow: 'hidden',
  },
  cancelButton: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  cancelButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
  },
});

export default SearchBar;
