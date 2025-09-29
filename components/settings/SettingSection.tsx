import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

interface SettingSectionProps {
  title?: string;
  children: React.ReactNode;
}

const SettingSection: React.FC<SettingSectionProps> = React.memo(({
  title,
  children
}) => {
  return (
    <View style={styles.settingSection}>
      {title && (
        <Text style={styles.settingSectionTitle}>{title}</Text>
      )}
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  settingSection: {
    marginTop: 20,
  },
  settingSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: "rgb(255, 224, 195)",
    marginBottom: theme.spacing.sm,
  },
});

export default SettingSection;
