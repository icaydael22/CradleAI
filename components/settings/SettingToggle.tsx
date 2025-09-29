import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface SettingToggleProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string;
}

const SettingToggle: React.FC<SettingToggleProps> = React.memo(({
  label,
  value,
  onValueChange,
  description
}) => {
  return (
    <View>
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#767577', true: 'rgba(255, 224, 195, 0.7)' }}
          thumbColor={value ? 'rgb(255, 224, 195)' : '#f4f3f4'}
        />
      </View>
      {description && (
        <Text style={styles.settingDescription}>{description}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.small,
    marginBottom: theme.spacing.sm,
  },
  settingLabel: {
    fontSize: 16,
    color: "#fff",
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

export default SettingToggle;
