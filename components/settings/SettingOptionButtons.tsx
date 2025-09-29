import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface SettingOptionButtonsProps {
  label: string;
  options: Array<{ value: any; label: string }>;
  selectedValue: any;
  onValueChange: (value: any) => void;
  description?: string;
}

const SettingOptionButtons: React.FC<SettingOptionButtonsProps> = React.memo(({
  label,
  options,
  selectedValue,
  onValueChange,
  description
}) => {
  return (
    <View style={styles.inputContainer}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.rowContainer}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.positionButton,
              selectedValue === option.value && styles.positionButtonSelected
            ]}
            onPress={() => onValueChange(option.value)}
          >
            <Text style={[
              styles.positionButtonText,
              selectedValue === option.value && styles.positionButtonTextSelected
            ]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {description && (
        <Text style={styles.settingDescription}>{description}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  inputContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
  },
  settingLabel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: '500',
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  positionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  positionButtonSelected: {
    backgroundColor: 'rgba(255, 224, 195, 0.3)',
    borderColor: 'rgb(255, 224, 195)',
    borderWidth: 1,
  },
  positionButtonText: {
    color: '#ddd',
    fontSize: 16,
    fontWeight: '500',
  },
  positionButtonTextSelected: {
    color: 'rgb(255, 224, 195)',
  },
  settingDescription: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
});

export default SettingOptionButtons;
