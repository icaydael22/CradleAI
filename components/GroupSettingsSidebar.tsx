import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  Alert,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Group } from '@/src/group/group-types';
import { GroupScheduler } from '@/src/group/group-scheduler';
import * as ImagePicker from 'expo-image-picker';
import { disbandGroup } from '@/src/group'; // 新增

const SIDEBAR_WIDTH = 280;

interface GroupChatSettings {
  dailyMessageLimit: number;
  replyIntervalMinutes: number;
  referenceMessageLimit: number;
  timedMessagesEnabled: boolean;
}

interface GroupSettingsSidebarProps {
  isVisible: boolean;
  onClose: () => void;
  animationValue: Animated.Value;
  selectedGroup: Group | null;
  currentUser: any;
  onGroupBackgroundChanged?: (groupId: string, newBackground: string | undefined) => void;
  onGroupDisbanded?: (disbandedGroupId: string) => void; // 新增
}

const GroupSettingsSidebar: React.FC<GroupSettingsSidebarProps> = ({
  isVisible,
  onClose,
  animationValue,
  selectedGroup,
  currentUser,
  onGroupBackgroundChanged,
  onGroupDisbanded, // 新增
}) => {
  const [settings, setSettings] = useState<GroupChatSettings>({
    dailyMessageLimit: 50,
    replyIntervalMinutes: 1,
    referenceMessageLimit: 5,
    timedMessagesEnabled: false,
  });
  const [groupBackground, setGroupBackground] = useState<string | undefined>(selectedGroup?.backgroundImage);

  useEffect(() => {
    if (selectedGroup) {
      setGroupBackground(selectedGroup.backgroundImage);
      const loadGroupSettings = async () => {
        try {
          const storageKey = `group_settings_${selectedGroup.groupId}`;
          const savedSettings = await AsyncStorage.getItem(storageKey);
          if (savedSettings) {
            setSettings(JSON.parse(savedSettings));
          } else {
            const scheduler = GroupScheduler.getInstance();
            setSettings(scheduler.getGroupSettings(selectedGroup.groupId));
          }
        } catch (error) {
          setSettings({
            dailyMessageLimit: 50,
            replyIntervalMinutes: 1,
            referenceMessageLimit: 5,
            timedMessagesEnabled: false,
          });
        }
      };
      loadGroupSettings();
    }
  }, [selectedGroup]);

  const sidebarTranslateX = animationValue.interpolate({
    inputRange: [0, SIDEBAR_WIDTH],
    outputRange: [SIDEBAR_WIDTH, 0],
  });

  const handleSaveSettings = async () => {
    if (selectedGroup) {
      try {
        const scheduler = GroupScheduler.getInstance();
        scheduler.setGroupSettings(selectedGroup.groupId, settings);
        const storageKey = `group_settings_${selectedGroup.groupId}`;
        await AsyncStorage.setItem(storageKey, JSON.stringify(settings));
        if (groupBackground !== selectedGroup.backgroundImage) {
          const updatedGroup = { ...selectedGroup, backgroundImage: groupBackground };
          await AsyncStorage.setItem(`group_${selectedGroup.groupId}`, JSON.stringify(updatedGroup));
          if (onGroupBackgroundChanged) {
            onGroupBackgroundChanged(selectedGroup.groupId, groupBackground);
          }
        }
        Alert.alert('设置已保存');
        onClose();
      } catch (error) {
        Alert.alert('保存失败', '无法保存群聊设置，请重试');
      }
    }
  };

  const handleChangeBackground = async () => {
    if (!selectedGroup) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setGroupBackground(result.assets[0].uri);
        Alert.alert('成功', '群聊背景已更新，保存后生效');
      }
    } catch (error) {
      Alert.alert('错误', '无法选择图片');
    }
  };

  const isOwner = selectedGroup && currentUser && selectedGroup.groupOwnerId === currentUser.id;

  const handleDisbandGroup = async () => {
    if (!selectedGroup) return;
    Alert.alert(
      "解散群聊",
      `确定要解散群聊"${selectedGroup.groupName}"吗？此操作不可撤销，所有群聊消息将被永久删除。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定解散",
          style: "destructive",
          onPress: async () => {
            try {
              const ok = await disbandGroup(currentUser, selectedGroup.groupId);
              if (ok) {
                if (onGroupDisbanded) onGroupDisbanded(selectedGroup.groupId);
                onClose();
              } else {
                Alert.alert('解散失败', '解散群聊失败，请重试');
              }
            } catch (e) {
              Alert.alert('解散失败', '解散群聊失败，请重试');
            }
          }
        }
      ]
    );
  };

  const handleClearChatHistory = () => {
    if (!selectedGroup) return;
    Alert.alert(
      "清空聊天记录",
      `确定要清空"${selectedGroup.groupName}"的所有聊天记录吗？此操作不可撤销，所有消息将被永久删除。`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定清空",
          style: "destructive",
          onPress: () => {
          }
        }
      ]
    );
  };

  if (!selectedGroup) return null;

  return (
    <View
      style={[
        styles.sidebarContainer,
        { pointerEvents: isVisible ? 'auto' : 'none', right: 0, left: undefined }
      ]}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      <Animated.View
        style={[
          styles.sidebar,
          { transform: [{ translateX: sidebarTranslateX }] }
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>群聊设置</Text>
        </View>

        <View style={styles.settingSection}>
          <Text style={styles.settingSectionTitle}>群聊背景</Text>
          <View style={styles.backgroundPreviewContainer}>
            {groupBackground ? (
              <Image
                source={{ uri: groupBackground }}
                style={styles.backgroundPreview}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.backgroundPreviewPlaceholder}>
                <Text style={{ color: '#aaa', fontSize: 12 }}>无背景</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.backgroundButton} onPress={handleChangeBackground}>
            <MaterialIcons name="image" size={18} color="#fff" />
            <Text style={styles.backgroundButtonText}>更换背景图片</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.settingSection}>
          <Text style={styles.settingSectionTitle}>消息设置</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLabelContainer}>
              <Text style={styles.settingLabel}>启用定时消息</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.toggleButton,
                settings.timedMessagesEnabled ? styles.toggleButtonActive : {}
              ]}
              onPress={() => setSettings(prev => ({
                ...prev,
                timedMessagesEnabled: !prev.timedMessagesEnabled
              }))}
            >
              <View style={[
                styles.toggleKnob,
                settings.timedMessagesEnabled ? styles.toggleKnobActive : {}
              ]} />
            </TouchableOpacity>
          </View>

          {settings.timedMessagesEnabled && (
            <View style={styles.settingItem}>
              <Text style={styles.settingLabel}>回复间隔 (分钟)</Text>
              <View style={styles.settingControl}>
                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => setSettings(prev => ({
                    ...prev,
                    replyIntervalMinutes: Math.max(0.5, prev.replyIntervalMinutes - 0.5)
                  }))}
                >
                  <Ionicons name="remove" size={16} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.settingValue}>
                  {settings.replyIntervalMinutes}
                </Text>
                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => setSettings(prev => ({
                    ...prev,
                    replyIntervalMinutes: Math.min(10, prev.replyIntervalMinutes + 0.5)
                  }))}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>每日消息数量限制</Text>
            <View style={styles.settingControl}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  dailyMessageLimit: Math.max(1, prev.dailyMessageLimit - 10)
                }))}
              >
                <Ionicons name="remove" size={16} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.settingValue}>
                {settings.dailyMessageLimit}
              </Text>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  dailyMessageLimit: Math.min(100, prev.dailyMessageLimit + 10)
                }))}
              >
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.settingItem}>
            <Text style={styles.settingLabel}>参考消息数量限制</Text>
            <View style={styles.settingControl}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  referenceMessageLimit: Math.max(1, prev.referenceMessageLimit - 1)
                }))}
              >
                <Ionicons name="remove" size={16} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.settingValue}>
                {settings.referenceMessageLimit}
              </Text>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setSettings(prev => ({
                  ...prev,
                  referenceMessageLimit: Math.min(10, prev.referenceMessageLimit + 1)
                }))}
              >
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.bottomButtonArea}>
          {isOwner && (
            <View style={styles.dangerRow}>
              <TouchableOpacity
                style={styles.disbandButton}
                onPress={handleDisbandGroup}
              >
                <Text style={styles.disbandButtonText}>解散群聊</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.clearHistoryButton}
                onPress={handleClearChatHistory}
              >
                <Text style={styles.clearHistoryButtonText}>清空聊天记录</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveSettings}
          >
            <Text style={styles.saveButtonText}>保存设置</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
      {isVisible && (
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sidebarContainer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SIDEBAR_WIDTH,
    zIndex: 30,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    height: '100%',
    backgroundColor: "rgba(40, 40, 40, 0.92)",
    paddingTop: 24,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 8,
    justifyContent: 'flex-start',
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    right: SIDEBAR_WIDTH,
    height: '100%',
    width: Dimensions.get('window').width - SIDEBAR_WIDTH,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
    minHeight: 36,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: "rgb(255, 224, 195)",
  },
  settingSection: {
    marginTop: 10,
    marginBottom: 6,
  },
  settingSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: "rgb(255, 224, 195)",
    marginBottom: 4,
  },
  backgroundPreviewContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
  },
  backgroundPreview: {
    width: 90,
    height: 130,
    borderRadius: 10,
    backgroundColor: '#222',
    marginBottom: 2,
  },
  backgroundPreviewPlaceholder: {
    width: 90,
    height: 130,
    borderRadius: 10,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  backgroundButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
    gap: 6,
    minHeight: 32,
  },
  backgroundButtonText: {
    color: '#fff',
    fontSize: 13,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(60, 60, 60, 0.7)',
    borderRadius: 8,
    marginBottom: 6,
    minHeight: 32,
  },
  settingLabel: {
    fontSize: 13,
    color: "#fff",
    fontWeight: '500',
  },
  settingLabelContainer: {
    flex: 1,
    marginRight: 8,
  },
  settingControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingValue: {
    fontSize: 14,
    color: 'rgb(255, 224, 195)',
    marginHorizontal: 3,
    width: 26,
    textAlign: 'center',
  },
  toggleButton: {
    width: 38,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.18)',
    padding: 1,
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(255, 224, 195, 0.38)',
  },
  toggleKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgb(255, 224, 195)',
  },
  bottomButtonArea: {
    marginTop: 10,
    marginBottom: 8,
    paddingBottom: 2,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(40,40,40,0.92)',
  },
  dangerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  disbandButton: {
    backgroundColor: 'rgba(255,59,48,0.7)',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
    marginRight: 4,
    minHeight: 32,
  },
  disbandButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  clearHistoryButton: {
    backgroundColor: 'rgba(255, 127, 0, 0.7)',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 7,
    marginLeft: 4,
    minHeight: 32,
  },
  clearHistoryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: 'rgb(255, 224, 195)',
    borderRadius: 7,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 0,
    minHeight: 36,
  },
  saveButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default GroupSettingsSidebar;
