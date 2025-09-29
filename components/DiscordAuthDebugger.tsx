import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import { discordAuthService } from '@/services/discordAuthService';
import { theme } from '@/constants/theme';

export const DiscordAuthDebugger: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [authStatus, setAuthStatus] = useState<string>('未知');

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-10), `[${timestamp}] ${message}`]);
    console.log(`[DiscordAuthDebugger] ${message}`);
  };

  useEffect(() => {
    // 检查当前认证状态
    checkAuthStatus();

    // 监听深链接
    const subscription = Linking.addEventListener('url', ({ url }) => {
      addLog(`🔗 Deep link received: ${url}`);
      handleDeepLink(url);
    });

    // 检查初始URL
    Linking.getInitialURL().then((url) => {
      if (url) {
        addLog(`🔗 Initial URL: ${url}`);
        handleDeepLink(url);
      }
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  const checkAuthStatus = async () => {
    try {
      const isLoggedIn = await discordAuthService.isLoggedIn();
      const token = await discordAuthService.getToken();
      const user = await discordAuthService.getUser();
      
      setAuthStatus(isLoggedIn ? '已登录' : '未登录');
      addLog(`✅ Auth status: ${isLoggedIn ? '已登录' : '未登录'}`);
      addLog(`🔑 Token exists: ${!!token}`);
      addLog(`👤 User exists: ${!!user}`);
      
      if (user) {
        addLog(`👤 User: ${user.username} (${user.id})`);
      }
    } catch (error) {
      addLog(`❌ Failed to check auth status: ${error}`);
    }
  };

  const handleDeepLink = async (url: string) => {
    try {
      const parsedUrl = Linking.parse(url);
      addLog(`🔍 Parsed URL: ${JSON.stringify(parsedUrl)}`);
      
      if (parsedUrl.path === 'auth/success') {
        const { token, user: userParam } = parsedUrl.queryParams || {};
        
        if (token && typeof token === 'string') {
          addLog(`✅ Token received: ${token.substring(0, 20)}...`);
          
          if (userParam && typeof userParam === 'string') {
            try {
              const user = JSON.parse(decodeURIComponent(userParam));
              await discordAuthService.handleAuthSuccess(token, user);
              addLog(`✅ Auth success handled: ${user.username}`);
              setAuthStatus('已登录');
            } catch (err) {
              addLog(`❌ Failed to parse user: ${err}`);
            }
          }
        }
      } else if (parsedUrl.path === 'auth/error') {
        const { error } = parsedUrl.queryParams || {};
        addLog(`❌ Auth error: ${error}`);
      }
    } catch (error) {
      addLog(`❌ Failed to handle deep link: ${error}`);
    }
  };

  const testDeepLink = () => {
    const testUrl = 'cradleapp://auth/success?token=test123&user=%7B%22id%22%3A%22123%22%2C%22username%22%3A%22testuser%22%2C%22avatar%22%3A%22%22%2C%22roles%22%3A%5B%5D%7D';
    addLog(`🧪 Testing deep link: ${testUrl}`);
    Linking.openURL(testUrl).catch((err) => {
      addLog(`❌ Failed to open test URL: ${err}`);
    });
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const logout = async () => {
    try {
      await discordAuthService.logout();
      addLog('✅ Logged out successfully');
      setAuthStatus('未登录');
    } catch (error) {
      addLog(`❌ Logout failed: ${error}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discord 认证调试器</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>状态: {authStatus}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={testDeepLink}>
          <Text style={styles.buttonText}>测试深链接</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={checkAuthStatus}>
          <Text style={styles.buttonText}>检查状态</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={logout}>
          <Text style={styles.buttonText}>登出</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.clearButton} onPress={clearLogs}>
          <Text style={styles.buttonText}>清除日志</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.logContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.logTitle}>调试日志:</Text>
        {logs.map((log, index) => (
          <Text key={index} style={styles.logText}>
            {log}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    padding: 15,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  button: {
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: 8,
    flex: 1,
    minWidth: 80,
  },
  dangerButton: {
    backgroundColor: theme.colors.danger,
  },
  clearButton: {
    backgroundColor: theme.colors.textSecondary,
    flex: 1,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
  },
  logContainer: {
    flex: 1,
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    padding: 15,
  },
  logTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  logText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 5,
  },
});

export default DiscordAuthDebugger;
