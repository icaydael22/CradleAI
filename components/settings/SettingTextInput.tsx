import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface SettingTextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onSave?: () => void;
  placeholder?: string;
  description?: string;
  multiline?: boolean;
  height?: number;
  showSaveButton?: boolean;
}

const SettingTextInput: React.FC<SettingTextInputProps> = React.memo(({
  label,
  value,
  onChangeText,
  onSave,
  placeholder,
  description,
  multiline = false,
  height,
  showSaveButton = false
}) => {
  return (
    <View style={styles.inputContainer}>
      <Text style={styles.settingLabel}>{label}</Text>
      <TextInput
        style={[
          styles.textInput,
          height ? { height } : undefined,
          multiline ? { textAlignVertical: 'top' } : undefined
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#999"
        multiline={multiline}
      />
      {showSaveButton && onSave && (
        <TouchableOpacity
          style={styles.saveButton}
          onPress={onSave}
        >
          <Text style={styles.saveButtonText}>保存</Text>
        </TouchableOpacity>
      )}
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
  textInput: {
    backgroundColor: 'rgba(80, 80, 80, 0.8)',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginVertical: 8,
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  saveButtonText: {
    color: 'rgb(255, 224, 195)',
    fontWeight: '600',
  },
  settingDescription: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
});

export default SettingTextInput;
