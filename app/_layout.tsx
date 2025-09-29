import 'react-native-reanimated'; // 必须最顶层
import 'react-native-gesture-handler'; // 建议紧随其后
// import '@/lib/polyfills';
// // import '@/lib/matrix/init'; // 安全初始化Matrix SDK
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Animated, useWindowDimensions, Easing, View, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/useColorScheme';
import { CharactersProvider } from '@/constants/CharactersContext';
import { UserProvider } from '@/constants/UserContext';
import { DialogModeProvider } from '@/constants/DialogModeContext';
import Colors from '@/constants/Colors';
import { RegexProvider } from '@/constants/RegexContext';
import { MemoryProvider } from '@/src/memory/providers/MemoryProvider';
import Mem0Initializer from '@/src/memory/components/Mem0Initializer';
import { DialogProvider } from '@/components/DialogProvider';
import { initializeUtilSettings } from '@/app/pages/UtilSettings';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme() || 'light';
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const { height: windowHeight } = useWindowDimensions();


  // Use the correct theme structure that ReactNavigation expects
  const theme = colorScheme === 'dark' 
    ? { 
        ...DarkTheme, 
        colors: {
          ...DarkTheme.colors,
          primary: Colors.dark.tint,
          background: '#282828',
          card: '#333333',
          text: '#ffffff',
          border: 'rgba(255, 255, 255, 0.1)',
        }
      } 
    : { 
        ...DefaultTheme, 
        colors: {
          ...DefaultTheme.colors,
          primary: Colors.light.tint,
          background: '#333333',
          card: '#ffffff',
          text: '#333333',
          border: 'rgba(0, 0, 0, 0.1)',
        }
      };

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
      // 初始化 UtilSettings 默认配置
      initializeUtilSettings().catch(console.error);
    }
  }, [loaded]);

  return (
    <SafeAreaProvider>
      <UserProvider>
        <CharactersProvider>
          <DialogModeProvider>
            <MemoryProvider>
              {/* 初始化 Mem0 服务：在 App 启动时挂载一次以完成全局记忆服务的初始化 */}
              <Mem0Initializer />
              <RegexProvider>
                <DialogProvider>
                  <View style={styles.container}>
                    <ThemeProvider value={theme}>
                      <Stack screenOptions={{headerShown: false}}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen name="pages/character-detail" />
                        <Stack.Screen name="pages/create_char" />
                        <Stack.Screen name="pages/create_character_tabs" />
                        <Stack.Screen name="pages/[conversationId]" />
                        <Stack.Screen name="pages/group/[groupId]" />
                      </Stack>
                      <StatusBar style="dark" backgroundColor='black' />
                    </ThemeProvider>
                    {/* <MatrixDebugger /> */}
                  </View>
                </DialogProvider>
              </RegexProvider>
            </MemoryProvider>
          </DialogModeProvider>
        </CharactersProvider>
      </UserProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282828',
  },
});
