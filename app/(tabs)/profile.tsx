import React, { useCallback, useState, useEffect } from 'react';
import { 
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '@/constants/UserContext';
import { useRouter } from 'expo-router';
import ListItem from '@/components/ListItem';
import ConfirmDialog from '@/components/ConfirmDialog';
import LoadingIndicator from '@/components/LoadingIndicator';
import DiscordOAuth2WebView from '@/components/DiscordOAuth2WebView';
import { discordAuthService, DiscordUser } from '@/services/discordAuthService';
import { theme } from '@/constants/theme';
import { isDiscordConfigured } from '@/utils/appConfig';
import { ImageBackground } from 'react-native';

const Profile: React.FC = () => {
  const { user, updateAvatar } = useUser();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [showNovelAITestModal, setShowNovelAITestModal] = useState(false);
  const [showDiscordAuth, setShowDiscordAuth] = useState(false);
  const [showVariableSystemTester, setShowVariableSystemTester] = useState(false);
  const [discordUser, setDiscordUser] = useState<DiscordUser | null>(null);
  const [discordAuthLoading, setDiscordAuthLoading] = useState(false);

  // 检查Discord登录状态
  useEffect(() => {
    checkDiscordAuthStatus();
  }, []);

  const checkDiscordAuthStatus = async () => {
    try {
      const isLoggedIn = await discordAuthService.isLoggedIn();
      if (isLoggedIn) {
        const userData = await discordAuthService.getUser();
        if (userData) {
          setDiscordUser(userData);
        }
      }
    } catch (error) {
      console.error('Failed to check Discord auth status:', error);
    }
  };

  const pickImage = useCallback(async () => {
    try {
      setIsLoading(true);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setShowPermissionDialog(true);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await updateAvatar(result.assets[0].uri);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [updateAvatar]);


  const handleNovelAIImageGenerated = (imageUrl: string, taskId?: string) => {
    console.log('NovelAI 图像已生成:', imageUrl, '任务ID:', taskId);
    Alert.alert('成功', '图像已成功生成并保存到应用中');
  };

  // Discord OAuth2 处理函数
  const handleDiscordLogin = () => {
    if (!isDiscordConfigured()) {
      Alert.alert(
        '配置错误',
        'Discord认证配置不完整，请检查环境变量配置。',
        [{ text: '确定' }]
      );
      return;
    }
    setShowDiscordAuth(true);
  };

  const handleDiscordAuthSuccess = async (token: string, user: DiscordUser) => {
    try {
      setDiscordAuthLoading(true);
      await discordAuthService.handleAuthSuccess(token, user);
      setDiscordUser(user);
      Alert.alert(
        '登录成功',
        `欢迎, ${user.username}!\n您已成功连接Discord账号。`,
        [{ text: '确定' }]
      );
    } catch (error) {
      console.error('Failed to handle Discord auth success:', error);
      Alert.alert('登录失败', '保存认证信息时出错，请重试。');
    } finally {
      setDiscordAuthLoading(false);
    }
  };

  const handleDiscordAuthError = (error: string) => {
    Alert.alert('Discord登录失败', error);
  };

  const handleDiscordLogout = () => {
    Alert.alert(
      '确认登出',
      '您确定要断开Discord连接吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认',
          style: 'destructive',
          onPress: async () => {
            try {
              await discordAuthService.logout();
              setDiscordUser(null);
              Alert.alert('已登出', 'Discord连接已断开');
            } catch (error) {
              console.error('Failed to logout from Discord:', error);
              Alert.alert('登出失败', '断开连接时出错');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" translucent={false} backgroundColor={theme.colors.background} />
      <ImageBackground
        source={require('../../assets/images/default-background.jpg')}
        style={{ flex: 1 }}
        imageStyle={{ resizeMode: 'cover', opacity: 0.35 }}
      >
      {/* User Profile */}
      <View style={styles.header}>
        <View style={styles.userInfoContainer}>
          <TouchableOpacity onPress={pickImage}>
            <Image
              source={user?.avatar ? { uri: user.avatar } : require('../../assets/images/default-avatar.png')}
              style={styles.avatar}
            />
            <View style={styles.editAvatarButton}>
              <Ionicons name="camera" size={16} color="black" />
            </View>
          </TouchableOpacity>
          <View style={styles.userInfoDetails}>
            {discordUser ? (
              <>
                <Text style={styles.username}>{discordUser.username}</Text>
                <TouchableOpacity onPress={handleDiscordLogout} style={[styles.discordButton, {backgroundColor: theme.colors.danger}]}>
                  <Text style={styles.discordButtonText}>断开连接</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity onPress={handleDiscordLogin} style={[styles.discordButton, styles.loginButton]}>
                <Ionicons name="logo-discord" size={20} color="white" style={{ marginRight: 8 }} />
                <Text style={styles.discordButtonText}>连接 Discord</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Menu Items */}
      <ScrollView 
        style={styles.menuContainer}
        contentContainerStyle={styles.menuContent}
        showsVerticalScrollIndicator={false}
      >


        <ListItem
          title="API 设置"
          leftIcon="cloud-outline"
          chevron={true}
          onPress={() => router.push('/pages/api-settings')}
        />


        {/* Add new option for custom user settings manager */}
        <ListItem
          title="自设管理"
          leftIcon="person-outline"
          chevron={true}
          onPress={() => router.push('../pages/custom-settings-manager')}
        />

        {/* NovelAI Test
        <ListItem
          title="NovelAI 测试"
          leftIcon="image-outline"
          chevron={true}
          onPress={() => setShowNovelAITestModal(true)}
          subtitle="测试NovelAI连接和图像生成"
        /> */}


        {/* 新增：工具设置入口 */}
        <ListItem
          title="工具设置"
          leftIcon="construct-outline"
          chevron={true}
          onPress={() => router.push('/pages/UtilSettings')}
          subtitle="自动消息提示词配置"
        />

        {/* 全局设置按钮 */}
        <ListItem
          title="全局设置"
          leftIcon="settings-outline"
          chevron={true}
          onPress={() => router.push('/pages/global-settings')}
          subtitle="预设 | 世界书 | 正则"
        />
        
        {/* Chat UI Settings button */}
        <ListItem
          title="界面设置"
          leftIcon="color-palette-outline"
          chevron={true}
          onPress={() => router.push('/pages/chat-ui-settings')}
          subtitle="自定义聊天界面外观"
        />
        
        {/* New: Plugin manager option */}
        {/* <ListItem
          title="插件管理"
          leftIcon="extension-puzzle-outline"
          chevron={true}
          onPress={() => router.push('/pages/plugins')}
          subtitle="管理插件"
        /> */}

        {/* Discord认证调试 - 开发时使用 */}
        {/* {__DEV__ && (
          <>
            <ListItem
              title="Discord认证调试"
              leftIcon="bug-outline"
              chevron={true}
              onPress={() => router.push('/pages/discord-auth-debug')}
              subtitle="测试Discord OAuth2认证"
            />
            

          </>
        )} */}

        {/* <ListItem
          title="加入社区"
          leftIcon="people-outline"
          onPress={() => {
            // Add community links handling
          }}
          subtitle="Discord | QQ群"
        /> */}
        

        {/* <ListItem
          title="调试工具"
          leftIcon="construct-outline"
          chevron={true}
          onPress={() => router.push('../pages/debug-tools')}
          subtitle="角色数据检查"
        /> */}
        
        <ListItem
          title="关于"
          leftIcon="information-circle-outline"
          chevron={false}
          subtitle="GitHub | CradleAI | 1.0.6"
          onPress={() => Linking.openURL('https://github.com/AliceSyndrome285/CradleAI')}
        />
      </ScrollView>

      {/* 图片权限确认对话框 */}
      <ConfirmDialog
        visible={showPermissionDialog}
        title="需要权限"
        message="请允许访问相册以便选择头像图片"
        confirmText="确定"
        cancelText="取消"
        confirmAction={() => setShowPermissionDialog(false)}
        cancelAction={() => setShowPermissionDialog(false)}
        destructive={false}
        icon="alert-circle"
      />

      {/* 使用新的LoadingIndicator组件 */}
      <LoadingIndicator 
        visible={isLoading || discordAuthLoading} 
        text={discordAuthLoading ? "处理Discord认证..." : "处理中..."}
        overlay={true}
        useModal={true}
      />

      {/* Discord OAuth2 WebView */}
      <DiscordOAuth2WebView
        visible={showDiscordAuth}
        onClose={() => setShowDiscordAuth(false)}
        onSuccess={handleDiscordAuthSuccess}
        onError={handleDiscordAuthError}
      />


      </ImageBackground>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 0) + 12 : 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 0,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: theme.colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  userInfoDetails: {
    flex: 1,
    marginLeft: 16,
    height: 80,
    justifyContent: 'center',
  },
  username: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  discordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  loginButton: {
    backgroundColor: '#5865F2', // Discord blue
  },
  discordButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  menuContainer: {
    flex: 1,
    paddingHorizontal: 8,
  },
  menuContent: {
    paddingVertical: 18,
    paddingBottom: 20,
  },
  content: {
    flex: 1,
  },
});

export default Profile;