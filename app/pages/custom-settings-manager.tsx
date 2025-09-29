
import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  Switch,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { UserCustomSetting } from '@/shared/types';
import Header from '@/components/Header';

interface CustomSettingItem {
  id: string;
  key: string;
  isGlobal: boolean;
  setting: UserCustomSetting;
  characterName?: string;
  hasCustom: boolean;
}

const CustomSettingsManager = () => {
  const [settings, setSettings] = useState<CustomSettingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSetting, setCurrentSetting] = useState<CustomSettingItem | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedSetting, setEditedSetting] = useState<UserCustomSetting | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const keys = await AsyncStorage.getAllKeys();
      const globalSettingKey = 'global_user_custom_setting';
      const settingsKeys = keys.filter(key =>
        key === globalSettingKey ||
        key.includes('_custom_setting') ||
        key.includes('_has_custom')
      );

      const characterIds = new Set<string>();
      const hasCustomKeys = new Map<string, boolean>();

      settingsKeys.forEach(key => {
        if (key.includes('character_') && key.includes('_custom_setting')) {
          const characterId = key.split('_custom_setting')[0].replace('character_', '');
          characterIds.add(characterId);
        }
        if (key.includes('_has_custom')) {
          const characterId = key.split('_has_custom')[0].replace('character_', '');
          hasCustomKeys.set(characterId, true);
        }
      });

      const characterKeys = keys.filter(key =>
        key.startsWith('character_') &&
        !key.includes('_custom_setting') &&
        !key.includes('_has_custom')
      );

      for (const key of characterKeys) {
        try {
          const charData = await AsyncStorage.getItem(key);
          if (charData) {
            const character = JSON.parse(charData);
            if (character.hasCustomUserSetting && character.customUserSetting) {
              const characterId = character.id;
              characterIds.add(characterId);
            }
          }
        } catch (error) {
          console.log("Error checking character for custom setting:", error);
        }
      }

      let settingsData: CustomSettingItem[] = [];
      const globalData = await AsyncStorage.getItem(globalSettingKey);

      if (globalData) {
        try {
          const globalSetting = JSON.parse(globalData);
          settingsData.push({
            id: 'global',
            key: globalSettingKey,
            isGlobal: true,
            setting: globalSetting,
            hasCustom: true
          });
        } catch (error) {
          console.error("Error parsing global setting:", error);
        }
      }

      for (const characterId of characterIds) {
        try {
          let characterSetting: UserCustomSetting | null = null;
          let characterName = '';
          let hasCustom = hasCustomKeys.has(characterId) || false;

          const customSettingKey = `character_${characterId}_custom_setting`;
          const customSettingData = await AsyncStorage.getItem(customSettingKey);

          if (customSettingData) {
            characterSetting = JSON.parse(customSettingData);
          }

          if (!characterSetting) {
            const characterKey = `character_${characterId}`;
            const characterData = await AsyncStorage.getItem(characterKey);

            if (characterData) {
              const character = JSON.parse(characterData);
              if (character.hasCustomUserSetting && character.customUserSetting) {
                characterSetting = character.customUserSetting;
                characterName = character.name || '';
                hasCustom = true;
              }
            }
          }

          if (characterSetting) {
            settingsData.push({
              id: characterId,
              key: customSettingKey,
              isGlobal: false,
              setting: characterSetting,
              characterName,
              hasCustom
            });
          }
        } catch (error) {
          console.error(`Error loading setting for character ${characterId}:`, error);
        }
      }

      setSettings(settingsData);
    } catch (error) {
      console.error("Error loading custom settings:", error);
      Alert.alert('错误', '加载自设数据时出错');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: CustomSettingItem) => {
    setCurrentSetting(item);
    setEditedSetting({ ...item.setting });
    setIsEditing(true);
  };

  const handleDelete = (item: CustomSettingItem) => {
    Alert.alert(
      '确认删除',
      `确定要删除${item.isGlobal ? '全局自设' : `角色"${item.characterName || item.id}"的自设`}吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              if (item.isGlobal) {
                await AsyncStorage.removeItem('global_user_custom_setting');
              } else {
                await AsyncStorage.removeItem(`character_${item.id}_custom_setting`);
                await AsyncStorage.removeItem(`character_${item.id}_has_custom`);

                try {
                  const characterKey = `character_${item.id}`;
                  const characterData = await AsyncStorage.getItem(characterKey);

                  if (characterData) {
                    const character = JSON.parse(characterData);
                    if (character.hasCustomUserSetting) {
                      character.hasCustomUserSetting = false;
                      character.customUserSetting = null;
                      await AsyncStorage.setItem(characterKey, JSON.stringify(character));
                    }
                  }
                } catch (charError) {
                  console.error("Error updating character object:", charError);
                }
              }

              await loadSettings();
              Alert.alert('成功', '自设已删除');
            } catch (error) {
              console.error("Error deleting custom setting:", error);
              Alert.alert('错误', '删除自设时出错');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const saveEditedSetting = async () => {
    if (!currentSetting || !editedSetting) return;

    try {
      setLoading(true);

      if (currentSetting.isGlobal) {
        await AsyncStorage.setItem('global_user_custom_setting', JSON.stringify({
          ...editedSetting,
          global: true
        }));
      } else {
        await AsyncStorage.setItem(
          `character_${currentSetting.id}_custom_setting`,
          JSON.stringify(editedSetting)
        );
        await AsyncStorage.setItem(
          `character_${currentSetting.id}_has_custom`,
          'true'
        );

        try {
          const characterKey = `character_${currentSetting.id}`;
          const characterData = await AsyncStorage.getItem(characterKey);

          if (characterData) {
            try {
              const character = JSON.parse(characterData);
              character.hasCustomUserSetting = true;
              character.customUserSetting = editedSetting;

              await AsyncStorage.setItem(characterKey, JSON.stringify(character));
            } catch (parseError) {
              console.error("Error parsing character data:", parseError);
            }
          }
        } catch (charError) {
          console.error("Error updating character object:", charError);
        }
      }

      await loadSettings();
      setIsEditing(false);
      setCurrentSetting(null);
      setEditedSetting(null);

      Alert.alert('成功', '自设已保存');
    } catch (error) {
      console.error("Error saving custom setting:", error);
      Alert.alert('错误', '保存自设时出错');
    } finally {
      setLoading(false);
    }
  };

  const renderSettingItem = ({ item }: { item: CustomSettingItem }) => {
    const displayName = item.isGlobal
      ? '全局自设'
      : `${item.characterName || `角色 ${item.id.substring(0, 8)}...`}的自设`;

    const commentPreview = item.setting?.comment || '自设';
    const contentPreview = item.setting?.content
      ? (item.setting.content.length > 40
        ? item.setting.content.substring(0, 40) + '...'
        : item.setting.content)
      : '无内容';

    const disabledStyle = item.setting?.disable ? styles.disabledItem : null;

    return (
      <View style={[styles.section, disabledStyle]}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{displayName}</Text>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
          </TouchableOpacity>
        </View>
        <Text style={styles.settingLabel}>标题</Text>
        <Text style={styles.settingValue}>{commentPreview}</Text>
        <Text style={styles.settingLabel}>内容</Text>
        <Text style={styles.settingValue}>{contentPreview}</Text>
        <Text style={styles.settingMeta}>
          位置: {item.setting?.position || 4} | 深度: {item.setting?.depth || 1} | {item.setting?.disable ? '已禁用' : '已启用'}
        </Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEdit(item)}
        >
          <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
          <Text style={styles.editButtonText}>编辑</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEditor = () => {
    if (!isEditing || !editedSetting) return null;
    return (
      <View style={styles.editorOverlay}>
        <View style={styles.editorCard}>
          <View style={styles.editorHeader}>
            <Text style={styles.editorTitle}>
              编辑{currentSetting?.isGlobal ? '全局自设' : '角色自设'}
            </Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setIsEditing(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.editorContent}>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>标题</Text>
              <TextInput
                style={styles.input}
                value={editedSetting.comment}
                onChangeText={(value) => setEditedSetting({ ...editedSetting, comment: value })}
                placeholder="自设标题"
                placeholderTextColor="#999"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>内容</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editedSetting.content}
                onChangeText={(value) => setEditedSetting({ ...editedSetting, content: value })}
                placeholder="自设内容"
                placeholderTextColor="#999"
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>插入位置</Text>
              <View style={styles.positionSelector}>
                {[0, 1, 2, 3, 4].map(pos => (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      styles.positionButton,
                      editedSetting.position === pos && styles.positionButtonSelected
                    ]}
                    onPress={() => setEditedSetting({
                      ...editedSetting,
                      position: pos as 0 | 1 | 2 | 3 | 4
                    })}
                  >
                    <Text style={[
                      styles.positionButtonText,
                      editedSetting.position === pos && styles.positionButtonTextSelected
                    ]}>
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formDescription}>
                推荐选择 4，代表在对话内按深度动态插入
              </Text>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>插入深度</Text>
              <View style={styles.positionSelector}>
                {[0, 1, 2, 3].map(depth => (
                  <TouchableOpacity
                    key={depth}
                    style={[
                      styles.positionButton,
                      editedSetting.depth === depth && styles.positionButtonSelected
                    ]}
                    onPress={() => setEditedSetting({ ...editedSetting, depth: depth })}
                  >
                    <Text style={[
                      styles.positionButtonText,
                      editedSetting.depth === depth && styles.positionButtonTextSelected
                    ]}>
                      {depth}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.formDescription}>
                0: 在最新消息后，1: 在上一条用户消息前，2+: 在更早消息前
              </Text>
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.formLabel}>启用状态</Text>
              <Switch
                value={!editedSetting.disable}
                onValueChange={(value) => setEditedSetting({ ...editedSetting, disable: !value })}
                trackColor={{ false: '#767577', true: theme.colors.primary + '99' }}
                thumbColor={!editedSetting.disable ? theme.colors.primary : '#f4f3f4'}
              />
            </View>
            {currentSetting?.isGlobal && (
              <View style={styles.switchRow}>
                <Text style={styles.formLabel}>全局应用</Text>
                <Switch
                  value={editedSetting.global || false}
                  onValueChange={(value) => setEditedSetting({ ...editedSetting, global: value })}
                  trackColor={{ false: '#767577', true: theme.colors.primary + '99' }}
                  thumbColor={editedSetting.global ? theme.colors.primary : '#f4f3f4'}
                />
              </View>
            )}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={saveEditedSetting}
            >
              <Text style={styles.saveButtonText}>保存</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    );
  };

  const renderListHeader = () => (
    <View style={styles.introContainer}>
      <Text style={styles.introTitle}>统一管理您的自定义设定</Text>
      <Text style={styles.introDescription}>
        在这里可以查看、编辑和删除所有角色和全局的自定义设定。
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <Header title="自设管理" showBackButton onBackPress={() => router.back()} />
      <FlatList
        data={loading ? [] : settings}
        renderItem={renderSettingItem}
        keyExtractor={item => (item.isGlobal ? 'global' : item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>加载中...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color="#777" />
              <Text style={styles.emptyText}>没有找到自设数据</Text>
              <Text style={styles.emptySubtext}>
                在角色设置中创建自设后，可以在这里统一管理
              </Text>
            </View>
          )
        }
      />
      {isEditing && renderEditor()}
      {loading && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  introContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  introTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 8,
  },
  introDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  deleteButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,71,87,0.08)',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,224,195,0.13)',
  },
  editButtonText: {
    color: theme.colors.primary,
    fontSize: 14,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  settingLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  settingValue: {
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 2,
    marginTop: 2,
  },
  settingMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  disabledItem: {
    opacity: 0.5,
  },
  listContent: {
    paddingBottom: 32,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.7,
  },
  emptyText: {
    fontSize: 18,
    color: theme.colors.text,
    marginTop: 16,
    fontWeight: 'bold',
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  // Editor styles
  editorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  editorCard: {
    width: '92%',
    maxHeight: '98%',
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  editorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  closeButton: {
    padding: 4,
  },
  editorContent: {
    height: 'auto',
    minHeight: 320,
    maxHeight: 600,
    padding: 18,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 15,
    color: theme.colors.text,
    marginBottom: 6,
    fontWeight: 'bold',
  },
  formDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 12,
    color: theme.colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  positionSelector: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginVertical: 8,
  },
  positionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  positionButtonSelected: {
    backgroundColor: `black`,
    borderColor: theme.colors.primary,
  },
  positionButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: '500',
  },
  positionButtonTextSelected: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  saveButtonText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default CustomSettingsManager;
