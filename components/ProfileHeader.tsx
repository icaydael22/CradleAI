import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { BlurView } from 'expo-blur';
import { User } from '@/shared/types';

interface ProfileHeaderProps {
  user: User | null;
  onEditAvatar?: () => void;
  onEditCover?: () => void;
  onBack?: () => void;
  showBackButton?: boolean;
  title?: string;
  stats?: { label: string; value: string | number }[];
}

const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  user,
  onEditAvatar,
  onEditCover,
  onBack,
  showBackButton = false,
  title,
  stats,
}) => {
  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />
      
      {/* Background Image */}
      <ImageBackground
        source={
          user?.coverImage 
            ? { uri: user.coverImage } 
            : require('@/assets/images/default-cover.jpg')
        }
        style={styles.coverImage}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.7)']}
          style={styles.gradient}
        >
          {/* Header Actions */}
          <View style={styles.headerActions}>
            {showBackButton && (
              <TouchableOpacity 
                style={styles.backButton}
                onPress={onBack}
              >
                <BlurView intensity={30} tint="dark" style={styles.blurButton}>
                  <Ionicons name="chevron-back" size={24} color="#fff" />
                </BlurView>
              </TouchableOpacity>
            )}
            
            {onEditCover && (
              <TouchableOpacity 
                style={styles.editCoverButton}
                onPress={onEditCover}
              >
                <BlurView intensity={30} tint="dark" style={styles.blurButton}>
                  <Ionicons name="camera" size={18} color="#fff" />
                </BlurView>
              </TouchableOpacity>
            )}
          </View>
          
          {/* User Info */}
          <View style={styles.userInfoContainer}>
            <View style={styles.avatarContainer}>
              <Image
                source={
                  user?.avatar 
                    ? { uri: user.avatar } 
                    : require('@/assets/images/default-avatar.png')
                }
                style={styles.avatar}
              />
              
              {onEditAvatar && (
                <TouchableOpacity 
                  style={styles.editAvatarButton}
                  onPress={onEditAvatar}
                >
                  <BlurView intensity={30} tint="dark" style={styles.editAvatarBlur}>
                    <Ionicons name="camera" size={14} color="#fff" />
                  </BlurView>
                </TouchableOpacity>
              )}
            </View>
            
            <Text style={styles.userName}>
              {user?.settings?.self.nickname || title || 'User Profile'}
            </Text>
          </View>

          {/* Stats if provided */}
          {stats && stats.length > 0 && (
            <View style={styles.statsContainer}>
              {stats.map((stat, index) => (
                <View key={`stat-${index}`} style={styles.statItem}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          )}
        </LinearGradient>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: Platform.OS === 'ios' ? 220 : 240,
    width: '100%',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight! + 10,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  blurButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  editCoverButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  userInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  editAvatarBlur: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginLeft: 16,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
  },
});

export default ProfileHeader;