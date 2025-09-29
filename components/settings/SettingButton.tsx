import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface SettingButtonProps {
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  buttonText?: string;
  description?: string;
}

const SettingButton: React.FC<SettingButtonProps> = React.memo(({
  label,
  onPress,
  icon,
  buttonText,
  description
}) => {
  return (
    <View>
      {label && <Text style={styles.settingLabel}>{label}</Text>}
      <TouchableOpacity
        style={styles.backgroundButton}
        onPress={onPress}
      >
        {icon && <MaterialIcons name={icon} size={24} color="#fff" />}
        <Text style={styles.backgroundButtonText}>
          {buttonText || label}
        </Text>
      </TouchableOpacity>
      {description && (
        <Text style={styles.settingDescription}>{description}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  settingLabel: {
    fontSize: 16,
    color: "#fff",
    fontWeight: '500',
    marginBottom: 8,
  },
  backgroundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    padding: 15,
    borderRadius: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    gap: 10,
    marginBottom: theme.spacing.md,
  },
  backgroundButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  settingDescription: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
});

export default SettingButton;
