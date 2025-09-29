import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import DiscordAuthDebugger from '@/components/DiscordAuthDebugger';
import { theme } from '@/constants/theme';

export default function DiscordAuthDebugPage() {
  return (
    <SafeAreaView style={styles.container}>
      <DiscordAuthDebugger />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
