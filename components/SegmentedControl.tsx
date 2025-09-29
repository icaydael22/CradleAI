import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  LayoutChangeEvent,
  ViewStyle,
} from 'react-native';
import { theme } from '@/constants/theme';

interface Segment {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  selectedValue: string;
  onChange: (value: string) => void;
  style?: ViewStyle;
  backgroundColor?: string;
  activeColor?: string;
  textColor?: string;
  activeTextColor?: string;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({
  segments,
  selectedValue,
  onChange,
  style,
  backgroundColor = 'rgba(60, 60, 60, 0.8)',
  activeColor = theme.colors.primary,
  textColor = '#aaa',
  activeTextColor = '#282828',
}) => {
  const [segmentWidths, setSegmentWidths] = useState<number[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const selectedSegmentWidth = useRef(new Animated.Value(0)).current;

  // Calculate position of active segment indicator
  useEffect(() => {
    const selectedIndex = segments.findIndex(
      segment => segment.value === selectedValue
    );
    
    if (selectedIndex !== -1 && segmentWidths.length > selectedIndex) {
      // Calculate X position (sum widths of preceding segments)
      const xPosition = segmentWidths
        .slice(0, selectedIndex)
        .reduce((acc, width) => acc + width, 0);
      
      // Animate the indicator
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: xPosition,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(selectedSegmentWidth, {
          toValue: segmentWidths[selectedIndex],
          duration: 300,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [selectedValue, segmentWidths]);

  // Handle container layout to get total width
  const handleContainerLayout = (event: LayoutChangeEvent) => {
    setContainerWidth(event.nativeEvent.layout.width);
  };

  // Handle segment layout to store individual widths
  const handleSegmentLayout = (index: number, event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setSegmentWidths(prev => {
      const newWidths = [...prev];
      newWidths[index] = width;
      return newWidths;
    });
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor },
        style,
      ]}
      onLayout={handleContainerLayout}
    >
      {/* Active segment indicator */}
      <Animated.View
        style={[
          styles.activeSegment,
          {
            width: selectedSegmentWidth,
            transform: [{ translateX }],
            backgroundColor: activeColor,
          },
        ]}
      />

      {/* Segments */}
      {segments.map((segment, index) => (
        <TouchableOpacity
          key={segment.value}
          style={styles.segment}
          onPress={() => onChange(segment.value)}
          onLayout={(event) => handleSegmentLayout(index, event)}
        >
          <Text
            style={[
              styles.segmentText,
              {
                color: selectedValue === segment.value ? activeTextColor : textColor,
                fontWeight: selectedValue === segment.value ? 'bold' : 'normal',
              },
            ]}
          >
            {segment.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    height: 40,
    position: 'relative',
  },
  segment: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    paddingHorizontal: 8,
  },
  segmentText: {
    fontSize: 14,
  },
  activeSegment: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 6,
    zIndex: 0,
  },
});

export default SegmentedControl;