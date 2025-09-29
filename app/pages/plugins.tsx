import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { PluginManager } from '@/plugins';
import { usePlugins } from '@/plugins';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

const PluginsPage = () => {
  const router = useRouter();
  const { plugins, isLoading, isRefreshing, error, refreshPlugins } = usePlugins();
  const [repoUrl, setRepoUrl] = useState('https://github.com/your-org/your-plugin-repo');
  
  useEffect(() => {
    // Initialize plugins if needed
    if (plugins.length === 0 && !isLoading && !isRefreshing) {
      refreshPlugins();
    }
  }, []);

  const handleOpenRepository = useCallback(() => {
    Linking.openURL(repoUrl).catch(err => {
      Alert.alert('无法打开链接', '请确保您安装了浏览器应用。');
    });
  }, [repoUrl]);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>插件系统</Text>
      <Text style={styles.headerSubtitle}>
        管理图像生成和其他功能的扩展插件
      </Text>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{plugins.filter(p => p.status === 'installed').length}</Text>
          <Text style={styles.statLabel}>已安装</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{plugins.filter(p => p.status === 'available').length}</Text>
          <Text style={styles.statLabel}>可用</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{plugins.filter(p => ['image', 'img'].some(tag => p.metadata.tags?.includes(tag))).length}</Text>
          <Text style={styles.statLabel}>图像类</Text>
        </View>
      </View>

      <View style={styles.repoLinkContainer}>
        <Text style={styles.repoLinkLabel}>插件仓库:</Text>
        <Text style={styles.repoLink} onPress={handleOpenRepository}>{repoUrl}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      
      <Stack.Screen 
        options={{
          title: "插件管理",
          headerLeft: () => (
            <Ionicons 
              name="arrow-back" 
              size={24} 
              color="#fff" 
              style={{marginLeft: 8}} 
              onPress={() => router.back()}
            />
          ),
          headerStyle: {
            backgroundColor: theme.colors.cardBackground,
          },
          headerTintColor: '#fff',
        }}
      />
      
      {renderHeader()}
      
      <View style={styles.pluginManagerContainer}>
        <PluginManager />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerContainer: {
    backgroundColor: theme.colors.cardBackground,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    color: '#ff9f1c',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#ccc',
    fontSize: 12,
    marginTop: 4,
  },
  repoLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  repoLinkLabel: {
    color: '#aaa',
    fontSize: 12,
    marginRight: 4,
  },
  repoLink: {
    color: '#4a90e2',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  pluginManagerContainer: {
    flex: 1,
  },
});

export default PluginsPage;
