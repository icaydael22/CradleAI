import React, { ReactNode, useState, useEffect } from 'react';
import {
  View,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  StyleSheet,
  Keyboard,
  ViewStyle,
  KeyboardAvoidingViewProps,
  StatusBar,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface KeyboardAvoidingWrapperProps extends KeyboardAvoidingViewProps {
  children: ReactNode;
  containerStyle?: ViewStyle;
  scrollViewStyle?: ViewStyle;
  safeAreaStyle?: ViewStyle;
  disableAutomaticScroll?: boolean;
  disableDismissKeyboard?: boolean;
  disableSafeArea?: boolean;
  keyboardShouldPersistTaps?: 'never' | 'always' | 'handled';
  scrollEnabled?: boolean;
  contentContainerStyle?: ViewStyle;
  avoidStatusBar?: boolean;
  onKeyboardStateChange?: (visible: boolean) => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const KeyboardAvoidingWrapper: React.FC<KeyboardAvoidingWrapperProps> = ({
  children,
  containerStyle,
  scrollViewStyle,
  safeAreaStyle,
  disableAutomaticScroll = false,
  disableDismissKeyboard = false,
  disableSafeArea = false,
  keyboardShouldPersistTaps = 'handled',
  scrollEnabled = true,
  contentContainerStyle,
  behavior = Platform.OS === 'ios' ? 'padding' : undefined,
  avoidStatusBar = false,
  onKeyboardStateChange,
  ...keyboardAvoidingProps
}) => {
  // Track keyboard visibility
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  // Add keyboard listeners
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
        if (onKeyboardStateChange) {
          onKeyboardStateChange(true);
        }
      }
    );

    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
        if (onKeyboardStateChange) {
          onKeyboardStateChange(false);
        }
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [onKeyboardStateChange]);

  // Determine if we need additional bottom space
  // This helps when form inputs are at the bottom of the screen
  const needsExtraSpace = keyboardVisible && 
    contentHeight > SCREEN_HEIGHT - keyboardHeight && 
    !disableAutomaticScroll;
    
  // Calculate extra padding at bottom to ensure content doesn't hide behind keyboard
  const extraBottomPadding = needsExtraSpace ? keyboardHeight : 0;

  // Status bar height for Android
  const statusBarHeight = avoidStatusBar ? StatusBar.currentHeight || 0 : 0;
  
  // The main render function
  const renderContent = () => {
    // Create the scrollable content
    const scrollView = (
      <ScrollView
        style={[styles.scrollView, scrollViewStyle]}
        contentContainerStyle={[
          styles.contentContainer,
          contentContainerStyle,
          { paddingBottom: extraBottomPadding }
        ]}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        scrollEnabled={scrollEnabled}
        onLayout={(event) => {
          setContentHeight(event.nativeEvent.layout.height);
        }}
        showsVerticalScrollIndicator={true}
      >
        {children}
      </ScrollView>
    );

    // Wrap the scroll view with keyboard avoiding behavior
    const keyboardAvoidingView = (
      <KeyboardAvoidingView
        style={[styles.container, containerStyle]}
        behavior={behavior}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : statusBarHeight}
        {...keyboardAvoidingProps}
      >
        {scrollView}
      </KeyboardAvoidingView>
    );

    // Return the appropriate wrapper based on settings
    if (disableSafeArea) {
      return disableDismissKeyboard ? (
        keyboardAvoidingView
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          {keyboardAvoidingView}
        </TouchableWithoutFeedback>
      );
    }

    // SafeArea wrapper for proper device edge handling
    return (
      <SafeAreaView style={[styles.safeArea, safeAreaStyle]}>
        {disableDismissKeyboard ? (
          keyboardAvoidingView
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            {keyboardAvoidingView}
          </TouchableWithoutFeedback>
        )}
      </SafeAreaView>
    );
  };

  return renderContent();
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#282828',
  },
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
});

export default KeyboardAvoidingWrapper;
