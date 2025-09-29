import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { theme } from '@/constants/theme';

interface SettingSliderProps {
  label: string;
  value: number;
  minimumValue: number;
  maximumValue: number;
  step?: number;
  onValueChange: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
  unit?: string;
  minLabel?: string;
  maxLabel?: string;
  description?: string;
}

const SettingSlider: React.FC<SettingSliderProps> = React.memo(({
  label,
  value,
  minimumValue,
  maximumValue,
  step = 1,
  onValueChange,
  onSlidingComplete,
  unit = '',
  minLabel,
  maxLabel,
  description
}) => {
  return (
    <View style={styles.sliderContainer}>
      <Text style={styles.settingLabel}>
        {label}：{value} {unit}
      </Text>
      <Slider
        style={styles.slider}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        step={step}
        value={value}
        onValueChange={onValueChange}
        onSlidingComplete={onSlidingComplete}
        minimumTrackTintColor="rgb(255, 224, 195)"
        maximumTrackTintColor="#767577"
        thumbTintColor="rgb(255, 224, 195)"
      />
      {(minLabel || maxLabel) && (
        <View style={styles.sliderRangeText}>
          <Text style={styles.sliderMinText}>{minLabel}</Text>
          <Text style={styles.sliderMaxText}>{maxLabel}</Text>
        </View>
      )}
      {description && (
        <Text style={styles.settingDescription}>{description}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  sliderContainer: {
    marginVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: theme.borderRadius.md,
    padding: 15,
  },
  settingLabel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: '500',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderRangeText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  sliderMinText: {
    color: '#ccc',
    fontSize: 12,
  },
  sliderMaxText: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'right',
  },
  settingDescription: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
});

export default SettingSlider;
