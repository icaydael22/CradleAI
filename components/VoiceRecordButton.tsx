import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Text,
  Easing,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface VoiceRecordButtonProps {
  onStartRecording: () => Promise<void>;
  onStopRecording: () => Promise<void>;
  maxDuration?: number; // Max recording duration in seconds
  isProcessing?: boolean;
  disabled?: boolean;
}

const VoiceRecordButton: React.FC<VoiceRecordButtonProps> = ({
  onStartRecording,
  onStopRecording,
  maxDuration = 60,
  isProcessing = false,
  disabled = false,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const rippleAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<number | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Start the pulse animation
  const startPulse = () => {
    rippleAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(rippleAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rippleAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Start the progress animation
  const startProgress = () => {
    progressAnim.setValue(0);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: maxDuration * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  // Handle start recording
  const handleStartRecording = async () => {
    if (disabled || isProcessing) return;

    setIsRecording(true);
    setDuration(0);
    startPulse();
    startProgress();
    
    // Start timer
    timerRef.current = setInterval(() => {
      setDuration(prev => {
        const newDuration = prev + 1;
        if (newDuration >= maxDuration) {
          handleStopRecording();
          return maxDuration;
        }
        return newDuration;
      });
    }, 1000);

    try {
      await onStartRecording();
    } catch (error) {
      console.error('Failed to start recording:', error);
      handleStopRecording();
    }
  };

  // Handle stop recording
  const handleStopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
    rippleAnim.setValue(0);
    progressAnim.stopAnimation();

    try {
      await onStopRecording();
    } catch (error) {
      console.error('Failed to stop recording:', error);
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Handle press animation
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      friction: 8,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Create animated ripple styles
  const rippleStyle = {
    transform: [
      {
        scale: rippleAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.5],
        }),
      },
    ],
    opacity: rippleAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0],
    }),
  };

  // Create animated stroke dash styles
  const dashLength = 2 * Math.PI * 26; // circumference = 2πr
  const strokeDashoffset = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -dashLength],
  });

  return (
    <View style={styles.container}>
      {/* Recording time */}
      {isRecording && (
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>{formatTime(duration)}</Text>
        </View>
      )}

      {/* Button with animations */}
      <Animated.View
        style={[
          styles.outerButton,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {/* Circular progress indicator */}
        {isRecording && (
          <Animated.View style={styles.progressContainer}>
            <Svg width={60} height={60}>
              <Circle
                cx={30}
                cy={30}
                r={26}
                stroke="#FF9ECD"
                strokeWidth={3}
                strokeDasharray={dashLength}
                strokeDashoffset={strokeDashoffset}
                fill="transparent"
              />
            </Svg>
          </Animated.View>
        )}

        {/* Ripple effect */}
        {isRecording && (
          <Animated.View style={[styles.ripple, rippleStyle]} />
        )}

        {/* Main button */}
        <TouchableOpacity
          style={[
            styles.innerButton,
            isRecording && styles.recordingButton,
            disabled && styles.disabledButton,
          ]}
          onPress={isRecording ? handleStopRecording : handleStartRecording}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled || isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : isRecording ? (
            <View style={styles.stopButton} />
          ) : (
            <Ionicons name="mic" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

// Import SVG components for the circular progress
interface CircleProps {
  cx: number;
  cy: number;
  r: number;
  [key: string]: any;
}

const Circle = ({ cx, cy, r, ...props }: CircleProps) => {
  return (
    <svg>
      <circle cx={cx} cy={cy} r={r} {...props} />
    </svg>
  );
};

interface SvgProps {
  width: number;
  height: number;
  children: React.ReactNode;
}

const Svg = ({ width, height, children }: SvgProps) => {
  return (
    <View style={{ width, height }}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  recordingButton: {
    backgroundColor: '#FF4444',
  },
  disabledButton: {
    backgroundColor: '#888',
  },
  ripple: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FF4444',
    zIndex: 1,
  },
  timerContainer: {
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
  },
  timerText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  progressContainer: {
    position: 'absolute',
    zIndex: 1,
  },
  stopButton: {
    width: 20,
    height: 20,
    backgroundColor: '#fff',
    borderRadius: 4,
  },
});

export default VoiceRecordButton;

