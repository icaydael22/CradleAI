import 'react-native-reanimated'; // 必须最顶层
import 'react-native-gesture-handler'; // 建议紧随其后
import React, { useState, useEffect } from 'react';
// import '@/lib/polyfills';
import { Tabs } from 'expo-router';
import { useColorScheme, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RegexProvider } from '@/constants/RegexContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventRegister } from 'react-native-event-listeners';
import { DialogModeProvider } from '@/constants/DialogModeContext';

export default function TabLayout() {
  const colorScheme = useColorScheme() || 'light';
  const [unreadCount, setUnreadCount] = useState<number>(0);
  
  // Define fallback theme to prevent undefined tint error
  const colorTheme = {
    text: colorScheme === 'dark' ? '#fff' : '#000',
    background: colorScheme === 'dark' ? 'dark' : 'dark',
    tint: colorScheme === 'dark' ? '#fff' :'rgb(255, 224, 195)',
    
    tabIconDefault: '#ccc',
    tabIconSelected: colorScheme === 'dark' ? '#fff' :'rgb(255, 224, 195)',
  };

  // Load unread messages count on app start
  useEffect(() => {
    const loadUnreadCount = async () => {
      try {
        const storedCount = await AsyncStorage.getItem('unreadMessagesCount');
        if (storedCount) {
          setUnreadCount(parseInt(storedCount, 10));
        }
      } catch (error) {
        console.error('Failed to load unread messages count:', error);
      }
    };

    loadUnreadCount();
  }, []);

  // Listen for unread messages updates using React Native EventRegister
  useEffect(() => {
    // Add listener for unread messages updates
    const eventListener = EventRegister.addEventListener(
      'unreadMessagesUpdated',
      (data) => {
        const count = typeof data === 'number' ? data : 0;
        setUnreadCount(count);
      }
    );

    return () => {
      // Clean up event listener
      EventRegister.removeEventListener(eventListener as string);
    };
  }, []);

  // Reset unread count when user navigates to chat tab
  const handleTabPress = (tabName: string) => {
    if (tabName === 'index' && unreadCount > 0) {
      // Reset unread count when user presses the chat tab
      setUnreadCount(0);
      // Save to AsyncStorage
      AsyncStorage.setItem('unreadMessagesCount', '0').catch(err => 
        console.error('Failed to reset unread messages count:', err)
      );
    }
  };

  return (
    <DialogModeProvider>
      <RegexProvider>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colorTheme.tabIconSelected,
            tabBarStyle: {
              backgroundColor: '#282828',
              borderTopColor: 'rgba(255, 255, 255, 0.1)',
            },
            tabBarLabelStyle: {
              fontWeight: '500',
            },
            headerStyle: {
              backgroundColor: '#282828',
            },
            headerTitleStyle: {
              color: 'rgb(255, 224, 195)',
              fontWeight: 'bold',
            },
            headerTintColor: 'rgb(255, 224, 195)',
          }}>
          <Tabs.Screen
            name="index"
            listeners={{
              tabPress: () => handleTabPress('index'),
            }}
            options={{
              title: '聊天',
              headerShown: false,
              tabBarIcon: ({ color, focused }) => (
                <View style={styles.iconContainer}>
                  <Ionicons
                    name={focused ? 'chatbubbles' : 'chatbubbles-outline'}
                    size={26}
                    color={color}
                  />
                  {unreadCount > 0 && (
                    <View style={styles.badgeContainer}>
                      <Text style={styles.badgeText}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              ),
            }}
          />
          <Tabs.Screen
            name="explore"
            options={{
              title: '发现',
              headerShown: false,
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'compass' : 'compass-outline'}
                  size={26}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="Character"
            options={{
              title: '角色',
              headerShown: false,
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'document-text' : 'document-text-outline'}
                  size={26}
                  color={color}
                />
              ),
            }}
          />
          {/* <Tabs.Screen
            name="server"
            options={{
              title: '摇篮',
              headerShown: false,
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'leaf' : 'leaf-outline'}
                  size={26}
                  color={color}
                />
              ),
            }}
          /> */}
          <Tabs.Screen
            name="profile"
            options={{
              title: '我的',
              headerShown: false,
              tabBarIcon: ({ color, focused }) => (
                <Ionicons
                  name={focused ? 'person' : 'person-outline'}
                  size={26}
                  color={color}
                />
              ),
            }}
          />
        </Tabs>
      </RegexProvider>
    </DialogModeProvider>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeContainer: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: -1,
  },
});
