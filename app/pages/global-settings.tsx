import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
  Modal,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PresetJson, WorldBookJson, GlobalPresetConfig, GlobalWorldbookConfig, WorldBookEntry } from '@/shared/types';
import { theme } from '@/constants/theme';
import { DEFAULT_PRESET_ENTRIES } from './character-detail'; // 路径根据实际情况调整
import { PresetEntryUI } from '@/constants/types';
import * as DocumentPicker from 'expo-document-picker';
import { CharacterImporter } from '@/utils/CharacterImporter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import JSZip from 'jszip';
import GlobalDetailSidebar from '@/components/group/GlobalDetailSidebar';
import { NodeSTCore } from '@/NodeST/nodest/core/node-st-core';
import {StorageAdapter } from '@/NodeST/nodest/utils/storage-adapter';
// 新增：全局预设/世界书模板类型
type GlobalPresetTemplate = {
  id: string;
  name: string;
  presetJson: PresetJson;
};
type GlobalWorldbookTemplate = {
  id: string;
  name: string;
  worldbookJson: WorldBookJson;
};

// 新增：全局正则脚本类型
type GlobalRegexScript = {
  id: string;
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings: string[];
  placement: number[]; // 1=用户, 2=AI
  disabled: boolean;
  markdownOnly: boolean;
  promptOnly: boolean;
  runOnEdit: boolean;
  substituteRegex: number;
  minDepth: number | null;
  maxDepth: number | null;
  flags?: string; // 新增：正则表达式标志
};

// 新增：全局正则脚本组类型
type GlobalRegexScriptGroup = {
  id: string;
  name: string;
  scripts: GlobalRegexScript[];
  bindType?: 'character' | 'all';
  bindCharacterId?: string;
};

const DEFAULT_REGEX_SCRIPT: GlobalRegexScript = {
  id: '',
  scriptName: '',
  findRegex: '',
  replaceString: '',
  trimStrings: [],
  placement: [1, 2],
  disabled: false,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
  flags: 'g', // 新增：默认g
};

const defaultPreset: PresetJson = {
  prompts: [],
  prompt_order: [{ order: [] }],
};

const defaultWorldBook: WorldBookJson = {
  entries: {},
};

const TABS = [
  { key: 'preset', label: '全局预设' },
  { key: 'worldbook', label: '全局世界书' },
  { key: 'regex', label: '全局正则' },
];

// 类型转换：PresetJson.prompts -> PresetEntryUI[]
function promptsToPresetEntryUI(prompts: PresetJson['prompts']): PresetEntryUI[] {
  return prompts.map((p, idx) => ({
    id: p.identifier || String(idx),
    name: p.name,
    content: p.content,
    identifier: p.identifier,
    enable: p.enable,
    role: p.role,
    isEditable: true, // 或根据你的业务逻辑判断
    insertType: p.injection_position === 1 ? 'chat' : 'relative',
    order: idx,
    isDefault: false, // 可根据 identifier 判断是否默认
    depth: typeof p.injection_depth === 'number' ? p.injection_depth : 0
  }));
}

// 类型转换：PresetEntryUI[] -> PresetJson.prompts
function presetEntryUIToPrompts(entries: PresetEntryUI[]): PresetJson['prompts'] {
  return entries.map(entry => ({
    name: entry.name,
    content: entry.content || '',
    identifier: entry.identifier,
    enable: !!entry.enable,
    role: (entry.role === 'user' || entry.role === 'model' || entry.role === 'assistant') ? entry.role : 'user',
    injection_position: entry.insertType === 'chat' ? 1 : 0,
    injection_depth: typeof entry.depth === 'number' ? entry.depth : undefined
  }));
}

export default function GlobalSettingsPage() {
  // 新增：响应式布局
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWide = windowWidth >= 900;

  // 新增：全局世界书导入
  const handleImportWorldbook = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || '';
      // 用CharacterImporter解析（改为只导入世界书结构）
      const worldBook = await CharacterImporter.importWorldBookOnlyFromJson(fileUri);
      // 名称为文件名（去扩展名）
      const baseName = fileName.replace(/\.[^/.]+$/, '') || `导入世界书_${Date.now()}`;
      const timestamp = Date.now();
      const newId = `worldbook_${timestamp}`;
      const newWorldbook: GlobalWorldbookTemplate = {
        id: newId,
        name: baseName,
        worldbookJson: worldBook,
      };
      setGlobalWorldbookList(list => [...list, newWorldbook]);
      setSelectedWorldbookId(newId);
      setWorldbookConfig({
        enabled: false,
        priority: '全局优先',
        worldbookJson: newWorldbook.worldbookJson,
      });
      Alert.alert('导入成功', '已成功导入世界书JSON');
    } catch (e) {
      Alert.alert('导入失败', String(e));
    }
  };
  const router = useRouter();
  const params = useLocalSearchParams();
  const characterId = params.characterId as string | undefined;
  const characterName = params.charactername as string | undefined;
  // --- 新增：追踪 characterId ---
  useEffect(() => {
    if (characterId) {
      console.log('[GlobalSettings] Received characterId:', characterId);
    }
  }, [characterId]);
  const [activeTab, setActiveTab] = useState<'preset' | 'worldbook' | 'regex'>('preset');
  const [presetConfig, setPresetConfig] = useState<GlobalPresetConfig>({
    enabled: false,
    presetJson: defaultPreset,
  });
  const [worldbookConfig, setWorldbookConfig] = useState<GlobalWorldbookConfig>({
    enabled: false,
    priority: '全局优先',
    worldbookJson: defaultWorldBook,
  });
  const [presetEntries, setPresetEntries] = useState<PresetEntryUI[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // 新增：全局预设/世界书模板列表与选中项
  const [globalPresetList, setGlobalPresetList] = useState<GlobalPresetTemplate[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [globalWorldbookList, setGlobalWorldbookList] = useState<GlobalWorldbookTemplate[]>([]);
  const [selectedWorldbookId, setSelectedWorldbookId] = useState<string>('');

  // 新增：模板命名/选择相关状态
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  const [showWorldbookDropdown, setShowWorldbookDropdown] = useState(false);
  const [newTemplateModal, setNewTemplateModal] = useState<{
    visible: boolean;
    type: 'preset' | 'worldbook';
    name: string;
  }>({ visible: false, type: 'preset', name: '' });

  // 新增：模板删除确认弹窗状态
  const [showDeleteTemplateModal, setShowDeleteTemplateModal] = useState<null | 'preset' | 'worldbook'>(null);

  // 新增：重命名模板弹窗状态
  const [renameModal, setRenameModal] = useState<{
    visible: boolean;
    type: 'preset' | 'worldbook' | 'regexGroup';
    id: string;
    name: string;
  }>({ visible: false, type: 'preset', id: '', name: '' });

  // 管理模式状态
  const [presetManaging, setPresetManaging] = useState(false);
  const [presetSelectedIndexes, setPresetSelectedIndexes] = useState<number[]>([]);
  const [worldbookManaging, setWorldbookManaging] = useState(false);
  const [worldbookSelectedIndexes, setWorldbookSelectedIndexes] = useState<number[]>([]);

  // 新增：世界书条目UI顺序
  const [worldbookEntryOrder, setWorldbookEntryOrder] = useState<string[]>([]);

  // 新增：DetailSidebar 状态
  const [detailSidebar, setDetailSidebar] = useState<{
    isVisible: boolean;
    title: string;
    content: string;
    entryType?: 'preset' | 'worldbook';
    entryOptions?: any;
    entryIndex?: number;
    entryKey?: string;
    name?: string;
  }>({
    isVisible: false,
    title: '',
    content: '',
  });

  // 修改：全局正则脚本状态
  const [regexScriptGroups, setRegexScriptGroups] = useState<GlobalRegexScriptGroup[]>([]);
  const [selectedRegexGroupId, setSelectedRegexGroupId] = useState<string>('');
  const [selectedRegexScript, setSelectedRegexScript] = useState<GlobalRegexScript | null>(null);
  const [showRegexDropdown, setShowRegexDropdown] = useState(false);
  const [regexViewMode, setRegexViewMode] = useState<'compact' | 'regular'>('compact');
  const [regexManaging, setRegexManaging] = useState(false);
  const [regexSelectedIndexes, setRegexSelectedIndexes] = useState<number[]>([]);
  const [regexEnabled, setRegexEnabled] = useState(false);

  // 新增：正则脚本组新建弹窗
  const [newRegexGroupModal, setNewRegexGroupModal] = useState<{ visible: boolean; name: string }>({ visible: false, name: '' });

  // 新增：正则脚本侧边栏
  const [regexDetailSidebar, setRegexDetailSidebar] = useState<{
    isVisible: boolean;
    index?: number;
  }>({ isVisible: false });

  // 新增：正则脚本新建弹窗
  const [newRegexModal, setNewRegexModal] = useState<{ visible: boolean; name: string }>({ visible: false, name: '' });

  // 新增：正则脚本删除弹窗
  const [showDeleteRegexModal, setShowDeleteRegexModal] = useState(false);

  // 视图模式状态，默认compact
  const [presetViewMode, setPresetViewMode] = useState<'compact' | 'regular'>('compact');
  const [worldbookViewMode, setWorldbookViewMode] = useState<'compact' | 'regular'>('compact');

  // 新增：控制是否显示被禁用的条目
  const [showDisabledPreset, setShowDisabledPreset] = useState(true);
  const [showDisabledWorldbook, setShowDisabledWorldbook] = useState(true);

  // 新增：角色ID到角色名的映射（用于显示绑定角色名）
  const [characterNameMap, setCharacterNameMap] = useState<{ [id: string]: string }>({});

  // 页面加载时，恢复角色名映射
  useEffect(() => {
    (async () => {
      try {
        const mapStr = await AsyncStorage.getItem('nodest_global_regex_character_name_map');
        if (mapStr) setCharacterNameMap(JSON.parse(mapStr));
      } catch {}
    })();
  }, []);

  // 页面参数变化时，自动补充当前角色名到映射（如果有）
  useEffect(() => {
    if (characterId && characterName) {
      setCharacterNameMap(prev => {
        if (prev[characterId] === characterName) return prev;
        const updated = { ...prev, [characterId]: characterName };
        AsyncStorage.setItem('nodest_global_regex_character_name_map', JSON.stringify(updated));
        return updated;
      });
    }
  }, [characterId, characterName]);

  // 加载初始配置和模板列表
  useEffect(() => {
    (async () => {
      try {
                // 读取所有全局预设模板
        const presetList: GlobalPresetTemplate[] = await StorageAdapter.loadGlobalPresetList?.() || [];
        setGlobalPresetList(presetList);
        // 读取当前选中id
        const selectedPresetId = await StorageAdapter.loadSelectedGlobalPresetId?.();
        setSelectedPresetId(selectedPresetId || (presetList[0]?.id ?? ''));
        // 读取当前选中模板内容
        const selectedPreset = presetList.find(t => t.id === (selectedPresetId || presetList[0]?.id));
        if (selectedPreset) {
          setPresetConfig({ enabled: false, presetJson: selectedPreset.presetJson });
          setPresetEntries(promptsToPresetEntryUI(selectedPreset.presetJson.prompts));
        }

        // 读取所有全局世界书模板
        const worldbookList: GlobalWorldbookTemplate[] = await StorageAdapter.loadGlobalWorldbookList?.() || [];
        setGlobalWorldbookList(worldbookList);
        const selectedWorldbookId = await StorageAdapter.loadSelectedGlobalWorldbookId?.();
        setSelectedWorldbookId(selectedWorldbookId || (worldbookList[0]?.id ?? ''));
        const selectedWorldbook = worldbookList.find(t => t.id === (selectedWorldbookId || worldbookList[0]?.id));
        if (selectedWorldbook) {
          setWorldbookConfig({
            enabled: false,
            priority: '全局优先',
            worldbookJson: selectedWorldbook.worldbookJson,
          });
        }

        // 恢复全局预设/世界书开关状态
        const presetEnabled = await AsyncStorage.getItem('nodest_global_preset_enabled');
        const worldbookEnabled = await AsyncStorage.getItem('nodest_global_worldbook_enabled');
        if (presetEnabled !== null) {
          setPresetConfig(cfg => ({ ...cfg, enabled: presetEnabled === 'true' }));
        }
        if (worldbookEnabled !== null) {
          setWorldbookConfig(cfg => ({ ...cfg, enabled: worldbookEnabled === 'true' }));
        }

        // 读取所有正则脚本组
        const loadedGroups = await StorageAdapter.loadGlobalRegexScriptGroups?.() || [];
        const regexGroups: GlobalRegexScriptGroup[] = loadedGroups.map(group => ({
          ...group,
          bindType: group.bindType === 'character' || group.bindType === 'all' ? group.bindType : undefined,
          scripts: group.scripts || []
        }));

        // 如果没有脚本组，将现有脚本转换为一个默认组
        if (regexGroups.length === 0) {
          const defaultGroup: GlobalRegexScriptGroup = {
            id: `group_${Date.now()}`,
            name: '默认脚本组',
            scripts: [],
          };
          setRegexScriptGroups([defaultGroup]);
          setSelectedRegexGroupId(defaultGroup.id);
        } else {
          setRegexScriptGroups(regexGroups);
          const selectedGroupId = await StorageAdapter.loadSelectedGlobalRegexGroupId?.();
          setSelectedRegexGroupId(selectedGroupId || (regexGroups[0]?.id ?? ''));
        }

        // 读取正则脚本启用状态
        const regexEnabledVal = await AsyncStorage.getItem('nodest_global_regex_enabled');
        if (regexEnabledVal !== null) setRegexEnabled(regexEnabledVal === 'true');
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // 初始化世界书条目顺序
  useEffect(() => {
    if (activeTab === 'worldbook') {
      const keys = Object.keys(worldbookConfig.worldbookJson?.entries || {});
      setWorldbookEntryOrder(keys);
    }
  }, [worldbookConfig.worldbookJson, activeTab]);

  // 点击预设条目，打开详情侧边栏
  const handlePresetEntryClick = (entry: PresetEntryUI, index: number) => {
    // 在管理模式下点击条目只是选中，不打开侧边栏
    if (presetManaging) {
      togglePresetSelect(index);
      return;
    }

    setDetailSidebar({
      isVisible: true,
      title: '编辑预设条目',
      content: entry.content || '',
      entryType: 'preset',
      entryOptions: {
        enable: entry.enable,
        role: entry.role,
        insertType: entry.insertType,
        depth: entry.depth
      },
      entryIndex: index,
      name: entry.name
    });
  };

  // 点击世界书条目，打开详情侧边栏
  const handleWorldbookEntryClick = (key: string, entry: WorldBookEntry) => {
    // 在管理模式下点击条目只是选中，不打开侧边栏
    if (worldbookManaging) {
      const index = worldbookEntryOrder.findIndex(k => k === key);
      if (index !== -1) {
        toggleWorldbookSelect(index);
      }
      return;
    }

    setDetailSidebar({
      isVisible: true,
      title: '编辑世界书条目',
      content: entry.content || '',
      entryType: 'worldbook',
      entryOptions: {
        disable: entry.disable,
        constant: entry.constant,
        position: entry.position,
        depth: entry.depth || 0
      },
      entryKey: key,
      name: entry.comment
    });
  };

  // 点击正则脚本，打开详情侧边栏
  const handleRegexScriptClick = (script: GlobalRegexScript, idx: number) => {
    if (regexManaging) {
      toggleRegexSelect(idx);
      return;
    }
    // 设置当前选中脚本
    setSelectedRegexScript(script);
    setRegexDetailSidebar({ isVisible: true, index: idx });
  };

  // 关闭侧边栏
  const handleCloseSidebar = () => {
    setDetailSidebar(prev => ({ ...prev, isVisible: false }));
  };

  const handleCloseRegexSidebar = () => setRegexDetailSidebar({ isVisible: false });

  // 保存预设条目更改
  const handlePresetContentChange = (text: string) => {
    if (detailSidebar.entryIndex === undefined) return;

    setPresetEntries(entries => {
      const updatedEntries = [...entries];
      const index = detailSidebar.entryIndex!;
      updatedEntries[index] = {
        ...updatedEntries[index],
        content: text
      };
      return updatedEntries;
    });
  };

  // 保存预设条目名称更改
  const handlePresetNameChange = (text: string) => {
    if (detailSidebar.entryIndex === undefined) return;

    setPresetEntries(entries => {
      const updatedEntries = [...entries];
      const index = detailSidebar.entryIndex!;
      updatedEntries[index] = {
        ...updatedEntries[index],
        name: text
      };
      return updatedEntries;
    });
  };

  // 保存预设条目选项更改
  const handlePresetOptionsChange = (options: any) => {
    if (detailSidebar.entryIndex === undefined) return;

    setPresetEntries(entries => {
      const updatedEntries = [...entries];
      const index = detailSidebar.entryIndex!;
      updatedEntries[index] = {
        ...updatedEntries[index],
        enable: options.enable,
        role: options.role,
        insertType: options.insertType,
        depth: options.depth
      };
      return updatedEntries;
    });
  };

  // 保存世界书条目更改
  const handleWorldbookContentChange = (text: string) => {
    if (!detailSidebar.entryKey) return;

    setWorldbookConfig(cfg => {
      const entries = { ...(cfg.worldbookJson?.entries || {}) };
      const key = detailSidebar.entryKey!;
      entries[key] = { ...entries[key], content: text };
      // 同步到模板
      setGlobalWorldbookList(list =>
        list.map(tpl =>
          tpl.id === selectedWorldbookId
            ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
            : tpl
        )
      );
      return {
        ...cfg,
        worldbookJson: { ...cfg.worldbookJson, entries },
      };
    });
  };

  // 保存世界书条目注释更改
  const handleWorldbookNameChange = (text: string) => {
    if (!detailSidebar.entryKey) return;

    setWorldbookConfig(cfg => {
      const entries = { ...(cfg.worldbookJson?.entries || {}) };
      const key = detailSidebar.entryKey!;
      entries[key] = { ...entries[key], comment: text };
      // 同步到模板
      setGlobalWorldbookList(list =>
        list.map(tpl =>
          tpl.id === selectedWorldbookId
            ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
            : tpl
        )
      );
      return {
        ...cfg,
        worldbookJson: { ...cfg.worldbookJson, entries },
      };
    });
  };

  // 保存世界书条目选项更改
  const handleWorldbookOptionsChange = (options: any) => {
    if (!detailSidebar.entryKey) return;

    setWorldbookConfig(cfg => {
      const entries = { ...(cfg.worldbookJson?.entries || {}) };
      const key = detailSidebar.entryKey!;
      entries[key] = {
        ...entries[key],
        disable: options.disable,
        constant: options.constant,
        position: options.position,
        depth: options.depth
      };
      // 同步到模板
      setGlobalWorldbookList(list =>
        list.map(tpl =>
          tpl.id === selectedWorldbookId
            ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
            : tpl
        )
      );
      return {
        ...cfg,
        worldbookJson: { ...cfg.worldbookJson, entries },
      };
    });
  };

  // 保存正则脚本更改
  const handleRegexSidebarSave = async (updated: GlobalRegexScript) => {
    if (regexDetailSidebar.index === undefined) return;

    setRegexScriptGroups(groups =>
      groups.map(group => {
        if (group.id === selectedRegexGroupId) {
          const updatedScripts = [...group.scripts];
          // 修正：flags为空时自动补全为g
          updatedScripts[regexDetailSidebar.index!] = {
            ...updated,
            flags: updated.flags?.trim() || 'g'
          };
          return { ...group, scripts: updatedScripts };
        }
        return group;
      })
    );

    // 持久化保存
    try {
            await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
    } catch (e) {
      // ignore
    }

    handleCloseRegexSidebar();
  };

  // 删除预设条目
  const handleDeletePresetEntry = () => {
    if (detailSidebar.entryIndex === undefined) return;

    Alert.alert("删除确认", "确定要删除此预设条目吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          setPresetEntries(entries =>
            entries.filter((_, idx) => idx !== detailSidebar.entryIndex)
          );
          handleCloseSidebar();
        }
      }
    ]);
  };

  // 删除世界书条目
  const handleDeleteWorldbookEntry = () => {
    if (!detailSidebar.entryKey) return;

    Alert.alert("删除确认", "确定要删除此世界书条目吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          setWorldbookConfig(cfg => {
            const entries = { ...(cfg.worldbookJson?.entries || {}) };
            delete entries[detailSidebar.entryKey!];
            // 同步到模板
            setGlobalWorldbookList(list =>
              list.map(tpl =>
                tpl.id === selectedWorldbookId
                  ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
                  : tpl
              )
            );
            return {
              ...cfg,
              worldbookJson: { ...cfg.worldbookJson, entries },
            };
          });
          handleCloseSidebar();
        }
      }
    ]);
  };

  // 删除正则脚本
  const handleDeleteCurrentRegexScript = () => setShowDeleteRegexModal(true);
  const confirmDeleteRegexScript = () => {
    setRegexScriptGroups(groups =>
      groups.map(group => {
        if (group.id === selectedRegexGroupId) {
          const updatedScripts = group.scripts.filter(s => s.id !== selectedRegexScript?.id);
          return { ...group, scripts: updatedScripts };
        }
        return group;
      })
    );
    setShowDeleteRegexModal(false);
  };

  // 删除世界书条目（批量）
  const handleDeleteWorldbookEntries = () => {
    if (worldbookSelectedIndexes.length === 0) {
      Alert.alert('未选中', '请选择要删除的世界书条目。');
      return;
    }
    Alert.alert('删除世界书条目', `确定要删除选中的 ${worldbookSelectedIndexes.length} 个世界书条目吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setWorldbookConfig(cfg => {
            const entries = { ...(cfg.worldbookJson?.entries || {}) };
            const keys = Object.keys(entries);
            worldbookSelectedIndexes.forEach(idx => {
              const key = keys[idx];
              delete entries[key];
            });
            // 同步到模板
            setGlobalWorldbookList(list =>
              list.map(tpl =>
                tpl.id === selectedWorldbookId
                  ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
                  : tpl
              )
            );
            return {
              ...cfg,
              worldbookJson: { ...cfg.worldbookJson, entries },
            };
          });
          setWorldbookSelectedIndexes([]);
          setWorldbookManaging(false);
        },
      },
    ]);
  };

  // 切换管理模式
  const handlePresetManage = () => {
    setPresetManaging(v => !v);
    setPresetSelectedIndexes([]);
  };
  const handleWorldbookManage = () => {
    setWorldbookManaging(v => !v);
    setWorldbookSelectedIndexes([]);
  };
  const handleRegexManage = () => {
    setRegexManaging(v => !v);
    setRegexSelectedIndexes([]);
  };

  // 勾选条目
  const togglePresetSelect = (idx: number) => {
    setPresetSelectedIndexes(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };
  const toggleWorldbookSelect = (idx: number) => {
    setWorldbookSelectedIndexes(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };
  const toggleRegexSelect = (idx: number) => {
    setRegexSelectedIndexes(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    );
  };

  // 删除条目
  const handleDeletePresetEntries = () => {
    if (presetSelectedIndexes.length === 0) {
      Alert.alert('未选中', '请选择要删除的预设条目。');
      return;
    }
    Alert.alert('删除预设条目', `确定要删除选中的 ${presetSelectedIndexes.length} 个预设条目吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setPresetEntries(prev =>
            prev.filter((_, idx) => !presetSelectedIndexes.includes(idx))
          );
          setPresetSelectedIndexes([]);
          setPresetManaging(false);
        },
      },
    ]);
  };



  const handleDeleteRegexScripts = () => {
    if (regexSelectedIndexes.length === 0) {
      Alert.alert('未选中', '请选择要删除的正则脚本。');
      return;
    }
    Alert.alert('删除正则脚本', `确定要删除选中的 ${regexSelectedIndexes.length} 个正则脚本吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          setRegexScriptGroups(groups =>
            groups.map(group => {
              if (group.id === selectedRegexGroupId) {
                const updatedScripts = group.scripts.filter((_, idx) => !regexSelectedIndexes.includes(idx));
                return { ...group, scripts: updatedScripts };
              }
              return group;
            })
          );
          setRegexSelectedIndexes([]);
          setRegexManaging(false);
        },
      },
    ]);
  };

  // ======= 全局预设相关 =======
  const handlePresetSwitch = async (value: boolean) => {
    setPresetConfig(cfg => ({ ...cfg, enabled: value }));
    await AsyncStorage.setItem('nodest_global_preset_enabled', value ? 'true' : 'false');
    if (NodeSTCore) {
      const core = new NodeSTCore('');
      if (value) {
        await core.setGlobalPreset('开启', JSON.stringify(presetConfig.presetJson));
        Alert.alert('全局预设已开启');
      } else {
        await core.setGlobalPreset('关闭', '');
        Alert.alert('全局预设已关闭');
      }
    }
  };

  const handlePresetPromptChange = (idx: number, key: string, val: any) => {
    setPresetEntries(entries => {
      const updatedEntries = [...entries];
      updatedEntries[idx] = { ...updatedEntries[idx], [key]: val };
      return updatedEntries;
    });
  };

  const handlePresetPromptOrderChange = (from: number, to: number) => {
    setPresetEntries(entries => {
      const updatedEntries = [...entries];
      const moved = updatedEntries.splice(from, 1)[0];
      updatedEntries.splice(to, 0, moved);
      return updatedEntries.map((entry, idx) => ({ ...entry, order: idx }));
    });
  };

  const handleAddPrompt = () => {
    setPresetEntries(entries => [
      ...entries,
      {
        id: `prompt_${Date.now()}`,
        name: '',
        content: '',
        identifier: `prompt_${Date.now()}`,
        enable: true,
        role: 'user',
        isEditable: true,
        insertType: 'relative',
        order: entries.length,
        isDefault: false,
        depth: 0,
      },
    ]);
  };

  // 修改 handleImportPreset 逻辑，导入后直接用导入预设的顺序
  const handleImportPreset = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || '';
      const presetJson = await CharacterImporter.importPresetForCharacter(fileUri, 'global');
      setPresetConfig(cfg => ({
        ...cfg,
        presetJson,
      }));
      // 直接用导入的 prompts 顺序
      setPresetEntries(promptsToPresetEntryUI(presetJson.prompts));
      if (selectedPresetId) {
        setGlobalPresetList(list =>
          list.map(tpl =>
            tpl.id === selectedPresetId ? { ...tpl, presetJson } : tpl
          )
        );
      } else {
        // 名称为文件名（去扩展名）
        const baseName = fileName.replace(/\.[^/.]+$/, '') || `导入模板_${Date.now()}`;
        const timestamp = Date.now();
        const newId = `preset_${timestamp}`;
        const newPreset: GlobalPresetTemplate = {
          id: newId,
          name: baseName,
          presetJson,
        };
        setGlobalPresetList(list => [...list, newPreset]);
        setSelectedPresetId(newId);
      }
      Alert.alert('导入成功', '已成功导入预设JSON');
    } catch (e) {
      Alert.alert('导入失败', String(e));
    }
  };

  // 切换全局预设模板
  const handlePresetTemplateChange = (id: string) => {
    // 保持启用状态不变
    const wasEnabled = presetConfig.enabled;

    setSelectedPresetId(id);
    const tpl = globalPresetList.find(t => t.id === id);
    if (tpl) {
      setPresetConfig(cfg => ({ ...cfg, presetJson: tpl.presetJson, enabled: wasEnabled }));
      setPresetEntries(promptsToPresetEntryUI(tpl.presetJson.prompts));
    }
    setShowPresetDropdown(false);
  };

  // 创建全局预设模板
  const handleCreatePresetTemplate = () => {
    setNewTemplateModal({ visible: true, type: 'preset', name: '' });
  };

  // 确认创建新模板
  const handleConfirmCreateTemplate = () => {
    const { type, name } = newTemplateModal;
    const timestamp = Date.now();
    if (type === 'preset') {
      const newId = `preset_${timestamp}`;
      const newName = name || `新预设模板_${timestamp}`;
      const fixed = Array.isArray(DEFAULT_PRESET_ENTRIES.FIXED) ? DEFAULT_PRESET_ENTRIES.FIXED : [];
      const user = Array.isArray(DEFAULT_PRESET_ENTRIES.EDITABLE) ? DEFAULT_PRESET_ENTRIES.EDITABLE : [];
      const allEntries = [...fixed, ...user];
      const newPreset: GlobalPresetTemplate = {
        id: newId,
        name: newName,
        presetJson: {
          prompts: allEntries.map(e => ({
            name: e.name,
            content: e.content || '',
            identifier: e.identifier,
            enable: true,
            role: e.role,
            injection_position: e.insertType === 'chat' ? 1 : 0,
            injection_depth: typeof e.depth === 'number' ? e.depth : undefined
          })),
          prompt_order: [{
            order: allEntries.map(e => ({
              identifier: e.identifier,
              enabled: true
            }))
          }]
        }
      };
      setGlobalPresetList(list => [...list, newPreset]);
      setSelectedPresetId(newId);
      setPresetConfig({ enabled: false, presetJson: newPreset.presetJson });
      setPresetEntries(promptsToPresetEntryUI(newPreset.presetJson.prompts));
    } else if (type === 'worldbook') {
      const newId = `worldbook_${timestamp}`;
      const newName = name || `新世界书模板_${timestamp}`;
      const newWorldbook: GlobalWorldbookTemplate = {
        id: newId,
        name: newName,
        worldbookJson: { entries: {} }
      };
      setGlobalWorldbookList(list => [...list, newWorldbook]);
      setSelectedWorldbookId(newId);
      setWorldbookConfig({
        enabled: false,
        priority: '全局优先',
        worldbookJson: newWorldbook.worldbookJson,
      });
    }
    setNewTemplateModal({ visible: false, type: 'preset', name: '' });
  };
  // 微缩视图下切换预设条目启用
  const handleTogglePresetEnable = (idx: number) => {
    setPresetEntries(prev => {
      const arr = [...prev];
      
      arr[idx] = { ...arr[idx], enable: !arr[idx].enable };
      return arr;
    });
  };

  // 微缩视图下切换世界书条目禁用
  const handleToggleWorldbookDisable = (key: string) => {
    setWorldbookConfig(cfg => {
      const entries = { ...(cfg.worldbookJson?.entries || {}) };
      if (entries[key]) {
        entries[key] = { ...entries[key], disable: !entries[key].disable };
      }
      // 同步到模板
      setGlobalWorldbookList(list =>
        list.map(tpl =>
          tpl.id === selectedWorldbookId
            ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
            : tpl
        )
      );
      return {
        ...cfg,
        worldbookJson: { ...cfg.worldbookJson, entries },
      };
    });
  };

  // 微缩视图渲染预设条目
  const renderCompactPresetEntry = (entry: PresetEntryUI, idx: number) => (
    <View key={entry.id} style={styles.compactCard}>
      <TouchableOpacity
        style={styles.compactName}
        onPress={() => handlePresetEntryClick(entry, idx)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.compactNameText} numberOfLines={1}>{entry.name || '未命名'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.compactSwitch}
        onPress={() => handleTogglePresetEnable(idx)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={entry.enable ? 'checkmark-circle' : 'close-circle'}
          size={22}
          color={entry.enable ? theme.colors.primary : '#888'}
        />
      </TouchableOpacity>
    </View>
  );
  // 模板删除逻辑
  const handleDeleteCurrentPresetTemplate = () => {
    if (!selectedPresetId) return;
    setShowDeleteTemplateModal('preset');
  };
  const handleDeleteCurrentWorldbookTemplate = () => {
    if (!selectedWorldbookId) return;
    setShowDeleteTemplateModal('worldbook');
  };

  const confirmDeleteTemplate = () => {
    if (showDeleteTemplateModal === 'preset') {
      setGlobalPresetList(list => {
        const newList = list.filter(tpl => tpl.id !== selectedPresetId);
        setSelectedPresetId('');
        setPresetConfig(cfg => ({ ...cfg, presetJson: defaultPreset }));
        setPresetEntries([]);
        return newList;
      });
    } else if (showDeleteTemplateModal === 'worldbook') {
      setGlobalWorldbookList(list => {
        const newList = list.filter(tpl => tpl.id !== selectedWorldbookId);
        setSelectedWorldbookId('');
        setWorldbookConfig(cfg => ({ ...cfg, worldbookJson: defaultWorldBook }));
        return newList;
      });
    }
    setShowDeleteTemplateModal(null);
  };
  const handleRegexSwitch = async (value: boolean) => {
    setRegexEnabled(value);
    await AsyncStorage.setItem('nodest_global_regex_enabled', value ? 'true' : 'false');
  };
  // 下拉重命名
  const handleRenameTemplate = (type: 'preset' | 'worldbook' | 'regexGroup', id: string, name: string) => {
    setRenameModal({ visible: true, type, id, name });
  };

  const handleRenameModalConfirm = async () => {
    if (renameModal.type === 'preset') {
      setGlobalPresetList(list =>
        list.map(tpl =>
          tpl.id === renameModal.id ? { ...tpl, name: renameModal.name.trim() || tpl.name } : tpl
        )
      );
      // 持久化保存
      try {
                await StorageAdapter.saveGlobalPresetList?.(
          globalPresetList.map(tpl =>
            tpl.id === renameModal.id ? { ...tpl, name: renameModal.name.trim() || tpl.name } : tpl
          )
        );
      } catch {}
    } else if (renameModal.type === 'worldbook') {
      setGlobalWorldbookList(list =>
        list.map(tpl =>
          tpl.id === renameModal.id ? { ...tpl, name: renameModal.name.trim() || tpl.name } : tpl
        )
      );
      // 持久化保存
      try {
                await StorageAdapter.saveGlobalWorldbookList?.(
          globalWorldbookList.map(tpl =>
            tpl.id === renameModal.id ? { ...tpl, name: renameModal.name.trim() || tpl.name } : tpl
          )
        );
      } catch {}
    } else if (renameModal.type === 'regexGroup') {
      setRegexScriptGroups(groups =>
        groups.map(g =>
          g.id === renameModal.id ? { ...g, name: renameModal.name.trim() || g.name } : g
        )
      );
      // 持久化保存
      try {
                await StorageAdapter.saveGlobalRegexScriptGroups?.(
          regexScriptGroups.map(g =>
            g.id === renameModal.id ? { ...g, name: renameModal.name.trim() || g.name } : g
          )
        );
      } catch {}
    }
    setRenameModal({ visible: false, type: 'preset', id: '', name: '' });
  };

  // 预设条目排序
  const movePresetEntry = (from: number, to: number) => {
    if (to < 0 || to >= presetEntries.length) return;
    setPresetEntries(entries => {
      const arr = [...entries];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      // 更新order
      return arr.map((e, idx) => ({ ...e, order: idx }));
    });
  };

  // ======= 全局世界书相关 =======
  const handleWorldbookSwitch = async (value: boolean) => {
    setWorldbookConfig(cfg => ({ ...cfg, enabled: value }));
    await AsyncStorage.setItem('nodest_global_worldbook_enabled', value ? 'true' : 'false');
    if (NodeSTCore) {
      const core = new NodeSTCore('');
      if (value) {
        await core.setGlobalWorldbook('开启', worldbookConfig.priority, JSON.stringify(worldbookConfig.worldbookJson));
        Alert.alert('全局世界书已开启');
      } else {
        await core.setGlobalWorldbook('关闭', worldbookConfig.priority, '');
        Alert.alert('全局世界书已关闭');
      }
    }
  };

  const handleWorldbookPriorityChange = (priority: '全局优先' | '角色优先') => {
    setWorldbookConfig(cfg => ({ ...cfg, priority }));
  };

  const handleWorldbookEntryChange = (key: string, field: keyof WorldBookEntry, val: any) => {
    setWorldbookConfig(cfg => {
      const entries = { ...(cfg.worldbookJson?.entries || {}) };
      entries[key] = { ...entries[key], [field]: val };
      // 同步到模板
      setGlobalWorldbookList(list =>
        list.map(tpl =>
          tpl.id === selectedWorldbookId
            ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
            : tpl
        )
      );
      return {
        ...cfg,
        worldbookJson: { ...cfg.worldbookJson, entries },
      };
    });
  };

  const handleAddWorldbookEntry = () => {
    setWorldbookConfig(cfg => {
      const entries = { ...(cfg.worldbookJson?.entries || {}) };
      const newKey = `entry_${Date.now()}`;
      entries[newKey] = {
        comment: '',
        content: '',
        disable: false,
        position: 4,
        constant: true,
        order: 1,
        depth: 0,
        vectorized: false,
      };
      // 同步到模板
      setGlobalWorldbookList(list =>
        list.map(tpl =>
          tpl.id === selectedWorldbookId
            ? { ...tpl, worldbookJson: { ...tpl.worldbookJson, entries } }
            : tpl
        )
      );
      return {
        ...cfg,
        worldbookJson: { ...cfg.worldbookJson, entries },
      };
    });
  };

  // 切换全局世界书模板
  const handleWorldbookTemplateChange = (id: string) => {
    // 保持启用状态不变
    const wasEnabled = worldbookConfig.enabled;
    const wasPriority = worldbookConfig.priority;

    setSelectedWorldbookId(id);
    const tpl = globalWorldbookList.find(t => t.id === id);
    if (tpl) {
      setWorldbookConfig(cfg => ({
        ...cfg,
        worldbookJson: tpl.worldbookJson,
        enabled: wasEnabled,
        priority: wasPriority,
      }));
    }
    setShowWorldbookDropdown(false);
  };

  // 创建全局世界书模板
  const handleCreateWorldbookTemplate = () => {
    const timestamp = Date.now();
    const newId = `worldbook_${timestamp}`;
    const newName = `新世界书模板_${timestamp}`;
    const newWorldbook: GlobalWorldbookTemplate = {
      id: newId,
      name: newName,
      worldbookJson: { entries: {} }
    };
    setGlobalWorldbookList(list => [...list, newWorldbook]);
    setSelectedWorldbookId(newId);
    setWorldbookConfig({
      enabled: false,
      priority: '全局优先',
      worldbookJson: newWorldbook.worldbookJson,
    });
  };

  // 世界书条目排序（仅UI）
  const moveWorldbookEntry = (from: number, to: number) => {
    setWorldbookEntryOrder(order => {
      if (to < 0 || to >= order.length) return order;
      const arr = [...order];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  };

  // ======= 全局正则脚本相关 =======
  // 绑定角色
  const handleBindCharacter = (groupId: string) => {
    setRegexScriptGroups(groups =>
      groups.map(group => {
        if (group.id === groupId) {
          // 互斥逻辑：如果已全部绑定则不能角色绑定
          if (group.bindType === 'all') return group;
          // 切换绑定/解绑
          if (group.bindType === 'character' && group.bindCharacterId === characterId) {
            // 解绑时不移除映射，保留历史
            persistRegexScriptGroups(groups.map(g =>
              g.id === groupId ? { ...g, bindType: undefined, bindCharacterId: undefined } : g
            ));
            return { ...group, bindType: undefined, bindCharacterId: undefined };
          }
          // 绑定时，保存角色名到映射
          if (characterId && characterName) {
            setCharacterNameMap(prev => {
              if (prev[characterId] === characterName) return prev;
              const updated = { ...prev, [characterId]: characterName };
              AsyncStorage.setItem('nodest_global_regex_character_name_map', JSON.stringify(updated));
              return updated;
            });
          }
          const updatedGroups = groups.map(g =>
            g.id === groupId ? { ...g, bindType: 'character' as 'character', bindCharacterId: characterId } : g
          );
          persistRegexScriptGroups(updatedGroups);
          return { ...group, bindType: 'character' as 'character', bindCharacterId: characterId };
        }
        return group;
      })
    );
  };

  // 全部绑定
  const handleBindAll = (groupId: string) => {
    setRegexScriptGroups(groups =>
      groups.map(group => {
        if (group.id === groupId) {
          if (group.bindType === 'character') return group;
          if (group.bindType === 'all') {
            persistRegexScriptGroups(groups.map(g =>
              g.id === groupId ? { ...g, bindType: undefined, bindCharacterId: undefined } : g
            ));
            return { ...group, bindType: undefined, bindCharacterId: undefined };
          }
          const updatedGroups = groups.map(g =>
            g.id === groupId ? { ...g, bindType: 'all' as 'all', bindCharacterId: undefined } : g
          );
          persistRegexScriptGroups(updatedGroups);
          return { ...group, bindType: 'all' as 'all', bindCharacterId: undefined };
        }
        return group;
      })
    );
  };

  // 持久化正则脚本组和角色名映射
  const persistRegexScriptGroups = async (groups: GlobalRegexScriptGroup[]) => {
    try {
            await StorageAdapter.saveGlobalRegexScriptGroups?.(
        groups.map(g => ({
          ...g,
          bindType: g.bindType as 'character' | 'all' | undefined,
          bindCharacterId: g.bindCharacterId
        }))
      );
      await AsyncStorage.setItem('nodest_global_regex_character_name_map', JSON.stringify(characterNameMap));
    } catch {}
  };

  // 渲染绑定按钮
  const renderBindButtons = (group: GlobalRegexScriptGroup) => {
    // 获取已绑定角色名（优先用映射，其次用当前页面参数）
    let boundName: string | undefined;
    if (group.bindType === 'character' && group.bindCharacterId) {
      boundName = characterNameMap[group.bindCharacterId] || (group.bindCharacterId === characterId ? characterName : undefined);
    }
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
        {/* 绑定角色按钮 */}
        <TouchableOpacity
          onPress={() => handleBindCharacter(group.id)}
          disabled={!characterId || group.bindType === 'all'}
          style={{ padding: 4, opacity: group.bindType === 'all' ? 0.4 : 1 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {group.bindType === 'character' && group.bindCharacterId ? (
            boundName ? (
              // 显示已绑定角色名
              <View style={{
                minWidth: 36, height: 22, borderRadius: 11, backgroundColor: '#eee',
                alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#888', paddingHorizontal: 6
              }}>
                <Text style={{ fontSize: 12, color: '#333' }}>
                  {boundName}
                </Text>
              </View>
            ) : (
              // 没有角色名时显示首字
              <View style={{
                width: 22, height: 22, borderRadius: 11, backgroundColor: '#eee',
                alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#888'
              }}>
                <Text style={{ fontSize: 12, color: '#333' }}>
                  {group.bindCharacterId[0] || '角'}
                </Text>
              </View>
            )
          ) : (
            <Ionicons name="person-add-outline" size={18} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
        {/* 全部绑定按钮 */}
        <TouchableOpacity
          onPress={() => handleBindAll(group.id)}
          disabled={group.bindType === 'character'}
          style={{ padding: 4, opacity: group.bindType === 'character' ? 0.4 : 1 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {group.bindType === 'all' ? (
            <Ionicons name="star" size={18} color="#f7c325" />
          ) : (
            <Ionicons name="star-outline" size={18} color={theme.colors.primary} />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const handleCreateRegexGroup = () => setNewRegexGroupModal({ visible: true, name: '' });
  const handleConfirmCreateRegexGroup = () => {
    const timestamp = Date.now();
    const newId = `group_${timestamp}`;
    const newGroup: GlobalRegexScriptGroup = {
      id: newId,
      name: newRegexGroupModal.name || `新脚本组_${timestamp}`,
      scripts: []
    };
    setRegexScriptGroups(groups => [...groups, newGroup]);
    setSelectedRegexGroupId(newId);
    setNewRegexGroupModal({ visible: false, name: '' });
  };

  const handleDeleteCurrentRegexGroup = () => {
    if (!selectedRegexGroupId) return;

    Alert.alert("删除确认", "确定要删除此脚本组及其所有脚本吗？", [
      { text: "取消", style: "cancel" },
      {
        text: "删除",
        style: "destructive",
        onPress: () => {
          setRegexScriptGroups(groups => groups.filter(g => g.id !== selectedRegexGroupId));
          if (regexScriptGroups.length > 1) {
            const remainingGroups = regexScriptGroups.filter(g => g.id !== selectedRegexGroupId);
            setSelectedRegexGroupId(remainingGroups[0]?.id || '');
          } else {
            setSelectedRegexGroupId('');
          }
        }
      }
    ]);
  };

  const handleRegexGroupChange = (id: string) => {
    setSelectedRegexGroupId(id);
    setShowRegexDropdown(false);
  };

  const handleCreateRegexScript = () => {
    if (!selectedRegexGroupId) {
      Alert.alert("提示", "请先创建或选择一个脚本组");
      return;
    }
    setNewRegexModal({ visible: true, name: '' });
  };

  const handleConfirmCreateRegex = () => {
    const timestamp = Date.now();
    const newId = `regex_${timestamp}`;
    const newScript: GlobalRegexScript = {
      ...DEFAULT_REGEX_SCRIPT,
      id: newId,
      scriptName: newRegexModal.name || `新正则脚本_${timestamp}`,
      flags: 'g', // 新建时默认g
    };

    // 添加到当前选中的组
    setRegexScriptGroups(groups =>
      groups.map(group =>
        group.id === selectedRegexGroupId
          ? { ...group, scripts: [...group.scripts, newScript] }
          : group
      )
    );

    setSelectedRegexScript(newScript);
    setNewRegexModal({ visible: false, name: '' });
  };

  const getCurrentGroupScripts = (): GlobalRegexScript[] => {
    const currentGroup = regexScriptGroups.find(g => g.id === selectedRegexGroupId);
    return currentGroup?.scripts || [];
  };

  const handleToggleRegexEnable = (idx: number) => {
    setRegexScriptGroups(groups =>
      groups.map(group => {
        if (group.id === selectedRegexGroupId) {
          const updatedScripts = [...group.scripts];
          updatedScripts[idx] = { ...updatedScripts[idx], disabled: !updatedScripts[idx].disabled };
          return { ...group, scripts: updatedScripts };
        }
        return group;
      })
    );
  };

  const handleTestRegex = async () => {
    try {
      // 1. 样例数据
      const userInputSample = "The test was rejected.";
      const aiResponseSample = "This is the end.</Assistant>";
      const expectedUserOutput = "OK.";
      const expectedAiOutput = "This is the end.";

      // 2. 从所有组中读取所有启用的正则脚本
      const allEnabledScripts: GlobalRegexScript[] = [];
      regexScriptGroups.forEach(group => {
        group.scripts
          .filter(s => !s.disabled)
          .forEach(script => allEnabledScripts.push(script));
      });

      // 3. 动态导入 NodeSTCore
      let NodeSTCoreClass = NodeSTCore;

      // 4. 调用静态方法进行正则处理，增加详细日志
      let log = '';
      log += `【测试开始】\n`;
      log += `启用的正则脚本数量: ${allEnabledScripts.length}\n`;
      allEnabledScripts.forEach((s, idx) => {
        log += `脚本#${idx + 1}: 名称=${s.scriptName}, findRegex=${s.findRegex}, replaceString=${s.replaceString}, placement=${JSON.stringify(s.placement)}\n`;
      });
        // === 关键：为每个脚本注入 groupBindType/groupBindCharacterId 字段 ===
        const scriptsWithBindInfo = allEnabledScripts.map(script => {
          // 找到所在组
          const group = regexScriptGroups.find(g => g.scripts.some(s => s.id === script.id));
          return {
            ...script,
            groupBindType: group?.bindType,
            groupBindCharacterId: group?.bindCharacterId
          };
        });
      log += `\n【用户输入测试】\n原始: ${userInputSample}\n`;
      const processedUser = NodeSTCoreClass.applyGlobalRegexScripts(
        userInputSample,
        allEnabledScripts,
        1 // placement=1, 用户输入
      );
      log += `处理后: ${processedUser}\n期望: ${expectedUserOutput}\n`;

      // 详细逐步追踪每个脚本的应用
      let tempUser = userInputSample;
      allEnabledScripts.forEach((script, idx) => {
        if (!script.placement.includes(1)) {
          log += `脚本#${idx + 1}（${script.scriptName}）未应用于用户输入（placement不含1）\n`;
          return;
        }
        try {
          let pattern = script.findRegex;
          let flags = script.flags || '';
          
          // 如果 findRegex 形如 /xxx/gi，解析出 pattern 和 flags
          const regexMatch = /^\/(.+)\/([a-z]*)$/i.exec(script.findRegex);
          if (regexMatch) {
            pattern = regexMatch[1];
            const regexFlags = regexMatch[2];
            
            // 优先使用 findRegex 中的 flags，如果为空才使用 script.flags
            if (regexFlags && regexFlags.trim() !== '') {
              flags = regexFlags;
            }
          }

          // flags 为空时自动补全为 'g'
          if (!flags || flags.trim() === '') flags = 'g';
          
          const regex = new RegExp(pattern, flags);
          const before = tempUser;
          tempUser = tempUser.replace(regex, script.replaceString);
          log += `脚本#${idx + 1} 应用后: ${before} => ${tempUser}\n`;
        } catch (e) {
          log += `脚本#${idx + 1} 应用异常: ${e}\n`;
        }
      });

      log += `\n【AI响应测试】\n原始: ${aiResponseSample}\n`;
      const processedAi = NodeSTCoreClass.applyGlobalRegexScripts(
        aiResponseSample,
        allEnabledScripts,
        2 // placement=2, AI输出
      );
      log += `处理后: ${processedAi}\n期望: ${expectedAiOutput}\n`;

      let tempAi = aiResponseSample;
      allEnabledScripts.forEach((script, idx) => {
        if (!script.placement.includes(2)) {
          log += `脚本#${idx + 1}（${script.scriptName}）未应用于AI输出（placement不含2）\n`;
          return;
        }
        try {
          let pattern = script.findRegex;
          let flags = script.flags || '';
          
          // 如果 findRegex 形如 /xxx/gi，解析出 pattern 和 flags
          const regexMatch = /^\/(.+)\/([a-z]*)$/i.exec(script.findRegex);
          if (regexMatch) {
            pattern = regexMatch[1];
            const regexFlags = regexMatch[2];
            
            // 优先使用 findRegex 中的 flags，如果为空才使用 script.flags
            if (regexFlags && regexFlags.trim() !== '') {
              flags = regexFlags;
            }
          }

          // flags 为空时自动补全为 'g'
          if (!flags || flags.trim() === '') flags = 'g';
          
          const regex = new RegExp(pattern, flags);
          const before = tempAi;
          tempAi = tempAi.replace(regex, script.replaceString);
          log += `脚本#${idx + 1} 应用后: ${before} => ${tempAi}\n`;
        } catch (e) {
          log += `脚本#${idx + 1} 应用异常: ${e}\n`;
        }
      });

      // 5. 生成测试报告
      const userPass = processedUser === expectedUserOutput;
      const aiPass = processedAi === expectedAiOutput;
      log += `\n【结果汇总】\n`;
      log += `用户输入: ${userPass ? "✅ 通过" : "❌ 不通过"}\n`;
      log += `AI响应: ${aiPass ? "✅ 通过" : "❌ 不通过"}\n`;

      Alert.alert("全局正则测试结果", log);
    } catch (e) {
      Alert.alert("测试失败", String(e));
    }
  };
  // 下拉选择器组件，增加重命名按钮
  const renderDropdown = (
    list: { id: string; name: string }[],
    selectedId: string,
    onChange: (id: string) => void,
    label: string,
    isOpen: boolean,
    toggleOpen: () => void,
    type: 'preset' | 'worldbook'
  ) => (
    <View style={{ marginVertical: 8 }}>
      <Text style={{ color: theme.colors.text, marginBottom: 4 }}>{label}</Text>
      <TouchableOpacity
        onPress={toggleOpen}
        style={{
          borderWidth: 1,
          borderColor: '#444',
          borderRadius: 6,
          backgroundColor: theme.colors.cardBackground,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          height: 40,
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="list" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
        <Text style={{ flex: 1, color: theme.colors.text }}>
          {list.find(t => t.id === selectedId)?.name || '请选择模板'}
        </Text>
        <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color="#888" />
      </TouchableOpacity>
      {isOpen && (
        <View style={{
          backgroundColor: theme.colors.cardBackground,
          borderWidth: 1,
          borderColor: '#444',
          borderRadius: 6,
          zIndex: 10,
          maxHeight: 200,
          maxWidth: 360,
          marginTop: 4,
        }}>
          <ScrollView nestedScrollEnabled={true}>
            {list.map(tpl => (
              <View key={tpl.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
                <TouchableOpacity
                  onPress={() => onChange(tpl.id)}
                  style={{
                    flex: 1,
                    padding: 10,
                    backgroundColor: tpl.id === selectedId ? '#333' : theme.colors.cardBackground,
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{
                    color: tpl.id === selectedId ? theme.colors.primary : theme.colors.text
                  }}>
                    {tpl.name}
                  </Text>
                </TouchableOpacity>
                {/* 重命名按钮 */}
                <TouchableOpacity
                  onPress={() => handleRenameTemplate(type, tpl.id, tpl.name)}
                  style={{ padding: 6 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
            ))}
            {list.length === 0 && (
              <Text style={{ padding: 10, color: '#888', textAlign: 'center' }}>
                尚无可用模板
              </Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
  const handleImportRegexScript = async () => {
    if (!selectedRegexGroupId) {
      Alert.alert("提示", "请先创建或选择一个脚本组");
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/zip'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name || '';
      
      let importedScripts: GlobalRegexScript[] = [];

      if (fileName.toLowerCase().endsWith('.zip')) {
        // 处理ZIP文件
        const response = await fetch(fileUri);
        const arrayBuffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        // 查找ZIP中的JSON文件
        const jsonFiles = Object.keys(zip.files).filter(fileName => 
          fileName.toLowerCase().endsWith('.json') && !zip.files[fileName].dir
        );
        
        if (jsonFiles.length === 0) {
          Alert.alert('导入失败', 'ZIP文件中未找到任何JSON文件');
          return;
        }

        // 处理每个JSON文件
        for (const jsonFileName of jsonFiles) {
          try {
            const fileContent = await zip.files[jsonFileName].async('text');
            const script: GlobalRegexScript = JSON.parse(fileContent);
            
            // 校验基本字段
            if (script && script.scriptName) {
              importedScripts.push(script);
            }
          } catch (e) {
            // 跳过无效的JSON文件
            console.warn(`跳过无效的JSON文件: ${jsonFileName}`, e);
          }
        }

        if (importedScripts.length === 0) {
          Alert.alert('导入失败', 'ZIP文件中没有找到有效的正则脚本JSON');
          return;
        }
      } else {
        // 处理单个JSON文件
        const fileContent = await fetch(fileUri).then(r => r.text());
        const importedScript: GlobalRegexScript = JSON.parse(fileContent);

        // 校验基本字段
        if (!importedScript || !importedScript.scriptName) {
          Alert.alert('导入失败', '不是有效的正则脚本JSON');
          return;
        }
        
        importedScripts = [importedScript];
      }

      // 处理导入的脚本
      const currentScripts = getCurrentGroupScripts();
      const existNames = currentScripts.map(s => s.scriptName);
      const newScripts: GlobalRegexScript[] = [];

      importedScripts.forEach((script, index) => {
        // 自动重命名逻辑
        let baseName = script.scriptName;
        let newName = baseName;
        let suffix = 1;
        
        // 检查是否与现有脚本名重复（包括本次导入的其他脚本）
        const allUsedNames = [...existNames, ...newScripts.map(s => s.scriptName)];
        while (allUsedNames.includes(newName)) {
          newName = `${baseName}（${suffix}）`;
          suffix++;
        }

        // 创建新脚本
        const timestamp = Date.now() + index; // 避免ID重复
        const newId = `regex_${timestamp}`;
        const newScript: GlobalRegexScript = {
          ...script,
          id: newId,
          scriptName: newName,
        };

        newScripts.push(newScript);
      });

      // 批量添加到当前组
      setRegexScriptGroups(groups =>
        groups.map(group =>
          group.id === selectedRegexGroupId
            ? { ...group, scripts: [...group.scripts, ...newScripts] }
            : group
        )
      );

      // 设置最后一个导入的脚本为选中状态
      if (newScripts.length > 0) {
        setSelectedRegexScript(newScripts[newScripts.length - 1]);
      }

      // 持久化保存
      try {
                await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
        await StorageAdapter.saveSelectedGlobalRegexGroupId?.(selectedRegexGroupId);
      } catch (e) {
        // ignore
      }

      const successMessage = newScripts.length === 1 
        ? '已成功导入正则脚本'
        : `已成功导入 ${newScripts.length} 个正则脚本`;
      Alert.alert('导入成功', successMessage);
    } catch (e) {
      Alert.alert('导入失败', String(e));
    }
  };

  const renderCompactRegexScript = (script: GlobalRegexScript, idx: number) => {
    const group = regexScriptGroups.find(g => g.id === selectedRegexGroupId);
    return (
      <View key={script.id} style={styles.compactCard}>
        <TouchableOpacity
          style={styles.compactName}
          onPress={() => handleRegexScriptClick(script, idx)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.compactNameText} numberOfLines={1}>{script.scriptName || '未命名'}</Text>
        </TouchableOpacity>
        {/* 绑定状态展示 */}
        {group?.bindType === 'character' && group.bindCharacterId === characterId && (
          <View style={{ marginRight: 4 }}>
            <Ionicons name="person-circle" size={18} color={theme.colors.primary} />
          </View>
        )}
        {group?.bindType === 'all' && (
          <View style={{ marginRight: 4 }}>
            <Ionicons name="star" size={18} color="#f7c325" />
          </View>
        )}
        <TouchableOpacity
          style={styles.compactSwitch}
          onPress={() => handleToggleRegexEnable(idx)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={!script.disabled ? 'checkmark-circle' : 'close-circle'}
            size={22}
            color={!script.disabled ? theme.colors.primary : '#888'}
          />
        </TouchableOpacity>
      </View>
    );
  };

  const renderRegexGroupDropdown = () => (
    <View style={{ marginVertical: 8 }}>
      <Text style={{ color: theme.colors.text, marginBottom: 4 }}>选择正则脚本组</Text>
      <TouchableOpacity
        onPress={() => setShowRegexDropdown(!showRegexDropdown)}
        style={{
          borderWidth: 1,
          borderColor: '#444',
          borderRadius: 6,
          backgroundColor: theme.colors.cardBackground,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
          height: 40,
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="list" size={18} color={theme.colors.primary} style={{ marginRight: 6 }} />
        <Text style={{ flex: 1, color: theme.colors.text }}>
          {regexScriptGroups.find(g => g.id === selectedRegexGroupId)?.name || '请选择脚本组'}
        </Text>
        <Ionicons name={showRegexDropdown ? "chevron-up" : "chevron-down"} size={18} color="#888" />
      </TouchableOpacity>
      {showRegexDropdown && (
        <View style={{
          backgroundColor: theme.colors.cardBackground,
          borderWidth: 1,
          borderColor: '#444',
          borderRadius: 6,
          zIndex: 10,
          maxHeight: 200,
          maxWidth: 360,
          marginTop: 4,
        }}>
          <ScrollView nestedScrollEnabled={true}>
            {regexScriptGroups.map(group => (
              <View key={group.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
                <TouchableOpacity
                  onPress={() => handleRegexGroupChange(group.id)}
                  style={{
                    flex: 1,
                    padding: 10,
                    backgroundColor: group.id === selectedRegexGroupId ? '#333' : theme.colors.cardBackground,
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={{
                    color: group.id === selectedRegexGroupId ? theme.colors.primary : theme.colors.text
                  }}>
                    {group.name} ({group.scripts.length})
                  </Text>
                </TouchableOpacity>
                {/* 重命名按钮 */}
                <TouchableOpacity
                  onPress={() => handleRenameTemplate('regexGroup', group.id, group.name)}
                  style={{ padding: 6 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="pencil-outline" size={18} color={theme.colors.primary} />
                </TouchableOpacity>
                {/* 绑定按钮 */}
                {renderBindButtons(group)}
              </View>
            ))}
            {regexScriptGroups.length === 0 && (
              <Text style={{ padding: 10, color: '#888', textAlign: 'center' }}>
                尚无可用脚本组
              </Text>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );

  // ======= 保存 =======
 const handleSave = async () => {
    setIsSaving(true);
    try {
      // 直接用当前 presetEntries 顺序
      const promptOrder = {
        order: presetEntries.map(entry => ({
          identifier: entry.identifier,
          enabled: entry.enable
        }))
      };
      const normalizedPresetJson = {
        prompts: presetEntryUIToPrompts(presetEntries),
        prompt_order: [promptOrder]
      };

      // 保存时直接更新 globalPresetList
      const updatedGlobalPresetList = globalPresetList.map(tpl =>
        tpl.id === selectedPresetId
          ? { ...tpl, presetJson: normalizedPresetJson }
          : tpl
      );
      setGlobalPresetList(updatedGlobalPresetList);

      // 世界书同理
      const updatedGlobalWorldbookList = globalWorldbookList.map(tpl =>
        tpl.id === selectedWorldbookId
          ? { ...tpl, worldbookJson: worldbookConfig.worldbookJson || { entries: {} } }
          : tpl
      );
      setGlobalWorldbookList(updatedGlobalWorldbookList);

      // 保存所有模板和当前选中id
            await StorageAdapter.saveGlobalPresetList?.(updatedGlobalPresetList);
      await StorageAdapter.saveSelectedGlobalPresetId?.(selectedPresetId);
      await StorageAdapter.saveGlobalWorldbookList?.(updatedGlobalWorldbookList.map(tpl => ({
        ...tpl,
        worldbookJson: tpl.worldbookJson || { entries: {} }
      })));
      await StorageAdapter.saveSelectedGlobalWorldbookId?.(selectedWorldbookId);

      // === 关键：保存正则脚本组时给每个脚本加上bindType/bindCharacterId ===
      const groupsWithBindInfo = regexScriptGroups.map(g => ({
        ...g,
        scripts: (g.scripts || []).map(s => ({
          ...s,
          bindType: g.bindType,
          bindCharacterId: g.bindCharacterId
        })),
        bindType: g.bindType,
        bindCharacterId: g.bindCharacterId
      }));
      await StorageAdapter.saveGlobalRegexScriptGroups?.(groupsWithBindInfo);
      await StorageAdapter.saveSelectedGlobalRegexGroupId?.(selectedRegexGroupId);

      // 持久化开关状态
      await AsyncStorage.setItem('nodest_global_preset_enabled', presetConfig.enabled ? 'true' : 'false');
      await AsyncStorage.setItem('nodest_global_worldbook_enabled', worldbookConfig.enabled ? 'true' : 'false');
      await AsyncStorage.setItem('nodest_global_regex_enabled', regexEnabled ? 'true' : 'false');

      // 联动后端
      if (NodeSTCore) {
        const core = new NodeSTCore('');
        if (presetConfig.enabled) {
          await core.setGlobalPreset('开启', JSON.stringify(normalizedPresetJson));
        }
        if (!presetConfig.enabled) {
          await core.setGlobalPreset('关闭', '');
        }
        if (worldbookConfig.enabled) {
          await core.setGlobalWorldbook('开启', worldbookConfig.priority, JSON.stringify(worldbookConfig.worldbookJson));
        }
        if (!worldbookConfig.enabled) {
          await core.setGlobalWorldbook('关闭', worldbookConfig.priority, '');
        }
      }
      Alert.alert('保存成功');
    } catch (e) {
      Alert.alert('保存失败', String(e));
    } finally {
      setIsSaving(false);
    }
  };


  const renderCompactWorldbookEntry = (key: string, entry: WorldBookEntry, idx: number) => (
    <View key={key} style={styles.compactCard}>
      <TouchableOpacity
        style={styles.compactName}
        onPress={() => handleWorldbookEntryClick(key, entry)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.compactNameText} numberOfLines={1}>{entry.comment || '未命名'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.compactSwitch}
        onPress={() => handleToggleWorldbookDisable(key)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={entry.disable ? 'close-circle' : 'checkmark-circle'}
          size={22}
          color={entry.disable ? '#888' : theme.colors.primary}
        />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={styles.headerBtn} 
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >

        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.headerBtn} 
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >

        </TouchableOpacity>
      </View>

      {/* 标签页 */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as any)}
            hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 响应式主内容区 */}
      <View style={[isWide ? styles.responsiveRow : { flex: 1 }]}>
        {/* 主内容 */}
        <ScrollView 
          style={[{ flex: 1, minWidth: 0 }, isWide && { maxWidth: 600 }]} 
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          {activeTab === 'preset' && (
            <View style={{ padding: 16 }}>
              <View style={styles.row}>
                <Text style={styles.label}>启用全局预设</Text>
                <Switch
                  value={presetConfig.enabled}
                  onValueChange={handlePresetSwitch}
                  trackColor={{ false: '#ccc', true: theme.colors.primary }}
                  thumbColor={worldbookConfig.enabled ? theme.colors.primary : '#eee'}
                />
              </View>
              {/* 全局预设补充说明 */}
              <Text style={{ color: '#c77c00', fontSize: 13, marginBottom: 8 }}>
                关闭全局预设后，需在角色卡详情页面重新设置和保存单角色的预设。
              </Text>
              {/* 预设下拉选择器 - 使用新的renderDropdown组件 */}
              {renderDropdown(
                globalPresetList,
                selectedPresetId,
                handlePresetTemplateChange,
                '选择全局预设模板',
                showPresetDropdown,
                () => {
                  setShowPresetDropdown(!showPresetDropdown);
                  setShowWorldbookDropdown(false);
                },
                'preset'
              )}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>预设条目</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  {/* 新增：显示/隐藏被禁用条目按钮 */}
                  <TouchableOpacity
                    onPress={() => setShowDisabledPreset(v => !v)}
                    style={{ marginRight: 8 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showDisabledPreset ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                  {/* 视图切换按钮 */}
                  <TouchableOpacity
                    onPress={() => setPresetViewMode(v => v === 'compact' ? 'regular' : 'compact')}
                    style={{ marginRight: 8 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={presetViewMode === 'compact' ? 'list' : 'grid'}
                      size={22}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                  {/* 新增管理按钮 */}
                  <TouchableOpacity onPress={handlePresetManage} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                      name="construct-outline"
                      size={22}
                      color={presetManaging ? theme.colors.primary : '#888'}
                    />
                  </TouchableOpacity>
                  {/* 新增模板删除按钮 */}
                  <TouchableOpacity
                    onPress={handleDeleteCurrentPresetTemplate}
                    style={{ marginRight: 8 }}
                    disabled={!selectedPresetId}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={selectedPresetId ? theme.colors.danger : '#ccc'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCreatePresetTemplate} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="duplicate-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleImportPreset} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="download-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleAddPrompt} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {/* 条目列表 */}
              {presetViewMode === 'compact'
                ? presetEntries
                  .filter(entry => showDisabledPreset || entry.enable)
                  .map((entry, idx) => renderCompactPresetEntry(entry, idx))
                : presetEntries
                  .filter(entry => showDisabledPreset || entry.enable)
                  .map((entry, idx) => (
                    <TouchableOpacity
                      key={entry.id}
                      style={styles.promptCard}
                      onPress={() => handlePresetEntryClick(entry, idx)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* 管理模式下显示多选框 */}
                        {presetManaging && (
                          <TouchableOpacity
                            onPress={() => togglePresetSelect(idx)}
                            style={{
                              marginRight: 10,
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              borderWidth: 2,
                              borderColor: theme.colors.primary,
                              backgroundColor: presetSelectedIndexes.includes(idx) ? theme.colors.primary : '#fff',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            {presetSelectedIndexes.includes(idx) && (
                              <Ionicons name="checkmark" size={14} color="#fff" />
                            )}
                          </TouchableOpacity>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={styles.promptRow}>
                            <Text style={styles.promptLabel}>名称</Text>
                            <Text style={styles.promptValue}>{entry.name}</Text>
                          </View>
                          <View style={styles.promptRow}>
                            <Text style={styles.promptLabel}>启用</Text>
                            <Ionicons name={entry.enable !== false ? 'checkmark-circle' : 'close-circle'} size={18} color={entry.enable !== false ? theme.colors.primary : '#ccc'} />
                          </View>
                          <View style={styles.promptRow}>
                            <Text style={styles.promptLabel}>角色</Text>
                            <Text style={styles.promptValue}>{entry.role}</Text>
                          </View>
                          <View style={styles.promptRow}>
                            <Text style={styles.promptLabel}>插入类型</Text>
                            <Text style={styles.promptValue}>{entry.insertType === 'chat' ? '对话式' : '相对位置'}</Text>
                          </View>
                          {entry.insertType === 'chat' && (
                            <View style={styles.promptRow}>
                              <Text style={styles.promptLabel}>深度</Text>
                              <Text style={styles.promptValue}>{entry.depth}</Text>
                            </View>
                          )}
                        </View>
                        {/* 排序按钮 */}
                        {!presetManaging && (
                          <View style={{ flexDirection: 'column', marginLeft: 8 }}>
                            <TouchableOpacity
                              onPress={() => movePresetEntry(idx, idx - 1)}
                              disabled={idx === 0}
                              style={{ opacity: idx === 0 ? 0.3 : 1, padding: 2 }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="arrow-up" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => movePresetEntry(idx, idx + 1)}
                              disabled={idx === presetEntries.length - 1}
                              style={{ opacity: idx === presetEntries.length - 1 ? 0.3 : 1, padding: 2 }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="arrow-down" size={18} color={theme.colors.primary} />
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))
              }
              {/* 管理模式下显示删除按钮 */}
              {presetManaging && (
                <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: theme.colors.danger,
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 24,
                    }}
                    onPress={handleDeletePresetEntries}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>删除选中条目</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {activeTab === 'worldbook' && (
            <View style={{ padding: 16 }}>
              <View style={styles.row}>
                <Text style={styles.label}>启用全局世界书</Text>
                <Switch
                  value={worldbookConfig.enabled}
                  onValueChange={handleWorldbookSwitch}
                  trackColor={{ false: '#ccc', true: theme.colors.primary }}
                  thumbColor={presetConfig.enabled ? theme.colors.primary : '#eee'}
                />
              </View>

              {/* 世界书下拉选择器 - 使用新的renderDropdown组件 */}
              {renderDropdown(
                globalWorldbookList,
                selectedWorldbookId,
                handleWorldbookTemplateChange,
                '选择全局世界书模板',
                showWorldbookDropdown,
                () => {
                  setShowWorldbookDropdown(!showWorldbookDropdown);
                  setShowPresetDropdown(false);
                },
                'worldbook'
              )}

              <View style={styles.row}>
                <Text style={styles.label}>优先级</Text>
                <TouchableOpacity
                  style={[
                    styles.priorityBtn,
                    worldbookConfig.priority === '全局优先' && styles.priorityBtnActive,
                  ]}
                  onPress={() => handleWorldbookPriorityChange('全局优先')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={worldbookConfig.priority === '全局优先' ? styles.priorityTextActive : styles.priorityText}>全局优先</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.priorityBtn,
                    worldbookConfig.priority === '角色优先' && styles.priorityBtnActive,
                  ]}
                  onPress={() => handleWorldbookPriorityChange('角色优先')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={worldbookConfig.priority === '角色优先' ? styles.priorityTextActive : styles.priorityText}>角色优先</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>世界书条目</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  {/* 新增：显示/隐藏被禁用条目按钮 */}
                  <TouchableOpacity
                    onPress={() => setShowDisabledWorldbook(v => !v)}
                    style={{ marginRight: 8 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={showDisabledWorldbook ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                  {/* 视图切换按钮 */}
                  <TouchableOpacity
                    onPress={() => setWorldbookViewMode(v => v === 'compact' ? 'regular' : 'compact')}
                    style={{ marginRight: 8 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={worldbookViewMode === 'compact' ? 'list' : 'grid'}
                      size={22}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                  {/* 新增管理按钮 */}
                  <TouchableOpacity onPress={handleWorldbookManage} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                      name="construct-outline"
                      size={22}
                      color={worldbookManaging ? theme.colors.primary : '#888'}
                    />
                  </TouchableOpacity>
                  {/* 新增模板删除按钮 */}
                  <TouchableOpacity
                    onPress={handleDeleteCurrentWorldbookTemplate}
                    style={{ marginRight: 8 }}
                    disabled={!selectedWorldbookId}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={selectedWorldbookId ? theme.colors.danger : '#ccc'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCreateWorldbookTemplate} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="duplicate-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  {/* 新增：导入按钮 */}
                  <TouchableOpacity onPress={handleImportWorldbook} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="download-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleAddWorldbookEntry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="add-circle-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {/* 条目列表 */}
              {worldbookViewMode === 'compact'
                ? worldbookEntryOrder
                  .filter(key => {
                    const entry = worldbookConfig.worldbookJson?.entries?.[key];
                    return showDisabledWorldbook || !entry?.disable;
                  })
                  .map((key, idx) => {
                    const entry = worldbookConfig.worldbookJson?.entries?.[key];
                    if (!entry) return null;
                    return renderCompactWorldbookEntry(key, entry, idx);
                  })
                : worldbookEntryOrder
                  .filter(key => {
                    const entry = worldbookConfig.worldbookJson?.entries?.[key];
                    return showDisabledWorldbook || !entry?.disable;
                  })
                  .map((key, idx) => {
                    const entry = worldbookConfig.worldbookJson?.entries?.[key];
                    if (!entry) return null;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.promptCard}
                        onPress={() => handleWorldbookEntryClick(key, entry)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {worldbookManaging && (
                            <TouchableOpacity
                              onPress={() => toggleWorldbookSelect(idx)}
                              style={{
                                marginRight: 10,
                                width: 22,
                                height: 22,
                                borderRadius: 11,
                                borderWidth: 2,
                                borderColor: theme.colors.primary,
                                backgroundColor: worldbookSelectedIndexes.includes(idx) ? theme.colors.primary : '#fff',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              {worldbookSelectedIndexes.includes(idx) && (
                                <Ionicons name="checkmark" size={14} color="#fff" />
                              )}
                            </TouchableOpacity>
                          )}
                          <View style={{ flex: 1 }}>
                            <View style={styles.promptRow}>
                              <Text style={styles.promptLabel}>名称</Text>
                              <Text style={styles.promptValue}>{entry.comment}</Text>
                            </View>
                            <View style={styles.promptRow}>
                              <Text style={styles.promptLabel}>禁用</Text>
                              <Ionicons name={entry.disable ? 'close-circle' : 'checkmark-circle'} size={18} color={entry.disable ? '#ccc' : theme.colors.primary} />
                            </View>
                            <View style={styles.promptRow}>
                              <Text style={styles.promptLabel}>常量</Text>
                              <Ionicons name={entry.constant ? 'checkmark-circle' : 'close-circle'} size={18} color={entry.constant ? theme.colors.primary : '#ccc'} />
                            </View>
                            <View style={styles.promptRow}>
                              <Text style={styles.promptLabel}>位置</Text>
                              <Text style={styles.promptValue}>{entry.position}</Text>
                            </View>
                            <View style={styles.promptRow}>
                              <Text style={styles.promptLabel}>深度</Text>
                              <Text style={styles.promptValue}>{entry.depth}</Text>
                            </View>
                          </View>
                          {!worldbookManaging && (
                            <View style={{ flexDirection: 'column', marginLeft: 8 }}>
                              <TouchableOpacity
                                onPress={() => moveWorldbookEntry(idx, idx - 1)}
                                disabled={idx === 0}
                                style={{ opacity: idx === 0 ? 0.3 : 1, padding: 2 }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="arrow-up" size={18} color={theme.colors.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => moveWorldbookEntry(idx, idx + 1)}
                                disabled={idx === worldbookEntryOrder.length - 1}
                                style={{ opacity: idx === worldbookEntryOrder.length - 1 ? 0.3 : 1, padding: 2 }}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="arrow-down" size={18} color={theme.colors.primary} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
              }
              {worldbookManaging && (
                <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: theme.colors.danger,
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 24,
                    }}
                    onPress={handleDeleteWorldbookEntries}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>删除选中条目</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {activeTab === 'regex' && (
            <View style={{ padding: 16 }}>
              <View style={styles.row}>
                <Text style={styles.label}>启用全局正则</Text>
                <Switch
                  value={regexEnabled}
                  onValueChange={handleRegexSwitch}
                  trackColor={{ false: '#ccc', true: theme.colors.primary }}
                  thumbColor={regexEnabled ? theme.colors.primary : '#eee'}
                />
              </View>

              {/* 正则脚本组下拉选择器 */}
              {renderRegexGroupDropdown()}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>正则脚本列表</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  {/* 视图切换按钮 */}
                  <TouchableOpacity
                    onPress={() => setRegexViewMode(v => v === 'compact' ? 'regular' : 'compact')}
                    style={{ marginRight: 8 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={regexViewMode === 'compact' ? 'list' : 'grid'}
                      size={22}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                  {/* 管理按钮 */}
                  <TouchableOpacity onPress={handleRegexManage} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons
                      name="construct-outline"
                      size={22}
                      color={regexManaging ? theme.colors.primary : '#888'}
                    />
                  </TouchableOpacity>
                  {/* 删除按钮 - 删除当前组 */}
                  <TouchableOpacity
                    onPress={handleDeleteCurrentRegexGroup}
                    style={{ marginRight: 8 }}
                    disabled={!selectedRegexGroupId}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={selectedRegexGroupId ? theme.colors.danger : '#ccc'} />
                  </TouchableOpacity>
                  {/* 新建组按钮 */}
                  <TouchableOpacity onPress={handleCreateRegexGroup} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="folder-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  {/* 新建脚本按钮 */}
                  <TouchableOpacity onPress={handleCreateRegexScript} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="duplicate-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  {/* 导入按钮 */}
                  <TouchableOpacity onPress={handleImportRegexScript} style={{ marginRight: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="download-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                  {/* 测试按钮 */}
                  <TouchableOpacity onPress={handleTestRegex} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="flask-outline" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* 正则脚本列表 */}
              {regexViewMode === 'compact'
                ? getCurrentGroupScripts().map((script, idx) => renderCompactRegexScript(script, idx))
                : getCurrentGroupScripts().map((script, idx) => (
                  <TouchableOpacity
                    key={script.id}
                    style={styles.promptCard}
                    onPress={() => handleRegexScriptClick(script, idx)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {regexManaging && (
                        <TouchableOpacity
                          onPress={() => toggleRegexSelect(idx)}
                          style={{
                            marginRight: 10,
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            borderWidth: 2,
                            borderColor: theme.colors.primary,
                            backgroundColor: regexSelectedIndexes.includes(idx) ? theme.colors.primary : '#fff',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          {regexSelectedIndexes.includes(idx) && (
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          )}
                        </TouchableOpacity>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>名称</Text>
                          <Text style={styles.promptValue}>{script.scriptName}</Text>
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>启用</Text>
                          <Ionicons name={!script.disabled ? 'checkmark-circle' : 'close-circle'} size={18} color={!script.disabled ? theme.colors.primary : '#ccc'} />
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>正则</Text>
                          <Text style={styles.promptValue} numberOfLines={1}>{script.findRegex}</Text>
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>替换</Text>
                          <Text style={styles.promptValue} numberOfLines={1}>{script.replaceString}</Text>
                        </View>
                        <View style={styles.promptRow}>
                          <Text style={styles.promptLabel}>作用域</Text>
                          <Text style={styles.promptValue}>
                            {script.placement?.includes(1) && '用户 '}
                            {script.placement?.includes(2) && 'AI'}
                          </Text>
                        </View>
                      </View>
                      {/* 启用/禁用按钮 */}
                      <TouchableOpacity
                        style={{ marginLeft: 8 }}
                        onPress={() => handleToggleRegexEnable(idx)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={!script.disabled ? 'checkmark-circle' : 'close-circle'}
                          size={22}
                          color={!script.disabled ? theme.colors.primary : '#888'}
                        />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))
              }

              {/* 当前组没有脚本时显示提示 */}
              {getCurrentGroupScripts().length === 0 && selectedRegexGroupId && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="document-text-outline" size={40} color="#666" />
                  <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>
                    当前脚本组没有脚本
                  </Text>
                  <TouchableOpacity
                    style={{
                      marginTop: 16,
                      backgroundColor: theme.colors.primary,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 8
                    }}
                    onPress={handleCreateRegexScript}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: 'black', fontWeight: '500' }}>创建新脚本</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 没有任何脚本组时显示提示 */}
              {regexScriptGroups.length === 0 && (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="folder-open-outline" size={40} color="#666" />
                  <Text style={{ color: '#666', marginTop: 10, textAlign: 'center' }}>
                    请先创建一个脚本组
                  </Text>
                  <TouchableOpacity
                    style={{
                      marginTop: 16,
                      backgroundColor: theme.colors.primary,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 8
                    }}
                    onPress={handleCreateRegexGroup}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: 'black', fontWeight: '500' }}>创建脚本组</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 管理模式下显示删除按钮 */}
              {regexManaging && getCurrentGroupScripts().length > 0 && (
                <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
                  <TouchableOpacity
                    style={{
                      backgroundColor: theme.colors.danger,
                      borderRadius: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 24,
                    }}
                    onPress={handleDeleteRegexScripts}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>删除选中脚本</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* 侧边栏（宽屏时内联，窄屏时用Modal） */}
        {isWide && (detailSidebar.isVisible || regexDetailSidebar.isVisible) && (
          <View style={styles.sidebarContainer}>
            {detailSidebar.isVisible && (
              <GlobalDetailSidebar
                isVisible={true}
                onClose={handleCloseSidebar}
                title={detailSidebar.title}
                content={detailSidebar.content}
                entryType={detailSidebar.entryType}
                entryOptions={detailSidebar.entryOptions}
                name={detailSidebar.name}
                onContentChange={
                  detailSidebar.entryType === 'preset'
                    ? handlePresetContentChange
                    : handleWorldbookContentChange
                }
                onNameChange={
                  detailSidebar.entryType === 'preset'
                    ? handlePresetNameChange
                    : handleWorldbookNameChange
                }
                onOptionsChange={
                  detailSidebar.entryType === 'preset'
                    ? handlePresetOptionsChange
                    : handleWorldbookOptionsChange
                }
                onDelete={
                  detailSidebar.entryType === 'preset'
                    ? handleDeletePresetEntry
                    : handleDeleteWorldbookEntry
                }
                inline // 新增：标记为内联模式
              />
            )}
            {regexDetailSidebar.isVisible && (
              <GlobalDetailSidebar
                isVisible={true}
                onClose={handleCloseRegexSidebar}
                title="编辑正则脚本"
                content={
                  typeof regexDetailSidebar.index === 'number'
                    ? getCurrentGroupScripts()[regexDetailSidebar.index]?.findRegex || ''
                    : ''
                }
                entryType="regex"
                entryOptions={
                  typeof regexDetailSidebar.index === 'number'
                    ? getCurrentGroupScripts()[regexDetailSidebar.index]
                    : undefined
                }
                name={
                  typeof regexDetailSidebar.index === 'number'
                    ? getCurrentGroupScripts()[regexDetailSidebar.index]?.scriptName
                    : undefined
                }
                flags={
                  typeof regexDetailSidebar.index === 'number'
                    ? getCurrentGroupScripts()[regexDetailSidebar.index]?.flags ?? 'g'
                    : 'g'
                }
                onFlagsChange={async (text: string) => {
                  if (
                    typeof regexDetailSidebar.index !== 'number' ||
                    regexDetailSidebar.index < 0 ||
                    !selectedRegexGroupId
                  ) return;

                  setRegexScriptGroups(groups =>
                    groups.map(group => {
                      if (group.id === selectedRegexGroupId) {
                        const updatedScripts = [...group.scripts];
                        if (regexDetailSidebar.index! < updatedScripts.length) {
                          updatedScripts[regexDetailSidebar.index!] = {
                            ...updatedScripts[regexDetailSidebar.index!],
                            flags: text.trim() || 'g'
                          };
                        }
                        return { ...group, scripts: updatedScripts };
                      }
                      return group;
                    })
                  );

                  // 持久化保存
                  try {
                                        await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
                  } catch (e) { }
                }}
                onContentChange={async (text: string) => {
                  if (
                    typeof regexDetailSidebar.index !== 'number' ||
                    regexDetailSidebar.index < 0 ||
                    !selectedRegexGroupId
                  ) return;

                  setRegexScriptGroups(groups =>
                    groups.map(group => {
                      if (group.id === selectedRegexGroupId) {
                        const updatedScripts = [...group.scripts];
                        if (regexDetailSidebar.index! < updatedScripts.length) {
                          updatedScripts[regexDetailSidebar.index!] = {
                            ...updatedScripts[regexDetailSidebar.index!],
                            findRegex: text
                          };
                        }
                        return { ...group, scripts: updatedScripts };
                      }
                      return group;
                    })
                  );

                  // 持久化保存
                  try {
                                        await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
                  } catch (e) { }
                }}
                onNameChange={async text => {
                  if (
                    typeof regexDetailSidebar.index !== 'number' ||
                    regexDetailSidebar.index < 0 ||
                    !selectedRegexGroupId
                  ) return;

                  setRegexScriptGroups(groups =>
                    groups.map(group => {
                      if (group.id === selectedRegexGroupId) {
                        const updatedScripts = [...group.scripts];
                        if (regexDetailSidebar.index! < updatedScripts.length) {
                          updatedScripts[regexDetailSidebar.index!] = {
                            ...updatedScripts[regexDetailSidebar.index!],
                            scriptName: text
                          };
                        }
                        return { ...group, scripts: updatedScripts };
                      }
                      return group;
                    })
                  );

                  // 持久化保存
                  try {
                                        await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
                  } catch (e) { }
                }}
                onOptionsChange={async opts => {
                  if (
                    typeof regexDetailSidebar.index !== 'number' ||
                    regexDetailSidebar.index < 0 ||
                    !selectedRegexGroupId
                  ) return;

                  setRegexScriptGroups(groups =>
                    groups.map(group => {
                      if (group.id === selectedRegexGroupId) {
                        const updatedScripts = [...group.scripts];
                        if (regexDetailSidebar.index! < updatedScripts.length) {
                          updatedScripts[regexDetailSidebar.index!] = {
                            ...updatedScripts[regexDetailSidebar.index!],
                            ...opts,
                            flags: (opts.flags ?? updatedScripts[regexDetailSidebar.index!].flags ?? 'g') || 'g'
                          };
                        }
                        return { ...group, scripts: updatedScripts };
                      }
                      return group;
                    })
                  );

                  // 持久化保存
                  try {
                                        await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
                  } catch (e) { }
                }}
                onDelete={async () => {
                  if (
                    typeof regexDetailSidebar.index !== 'number' ||
                    regexDetailSidebar.index < 0 ||
                    !selectedRegexGroupId
                  ) return;

                  Alert.alert("删除确认", "确定要删除此正则脚本吗？", [
                    { text: "取消", style: "cancel" },
                    {
                      text: "删除",
                      style: "destructive",
                      onPress: () => {
                        setRegexScriptGroups(groups =>
                          groups.map(group => {
                            if (group.id === selectedRegexGroupId) {
                              const updatedScripts = group.scripts.filter((_, idx) => idx !== regexDetailSidebar.index);
                              return { ...group, scripts: updatedScripts };
                            }
                            return group;
                          })
                        );

                        // 持久化保存
                        (async () => {
                          try {
                                                        await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
                          } catch (e) { }
                        })();

                        handleCloseRegexSidebar();
                      }
                    }
                  ]);
                }}
                inline // 新增：标记为内联模式
              />
            )}
          </View>
        )}
      </View>

      {/* 底部保存按钮 */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={isSaving}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
        >
          <Text style={styles.saveBtnText}>{isSaving ? '保存中...' : '保存设置'}</Text>
        </TouchableOpacity>
      </View>

      {/* 新模板命名模态框 */}
      <Modal
        visible={newTemplateModal.visible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {newTemplateModal.type === 'preset' ? '新建预设模板' : '新建世界书模板'}
            </Text>
            <Text style={styles.modalLabel}>模板名称</Text>
            <TextInput
              style={styles.modalInput}
              value={newTemplateModal.name}
              onChangeText={(text) => setNewTemplateModal({ ...newTemplateModal, name: text })}
              placeholder="请输入模板名称"
              placeholderTextColor="#999"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setNewTemplateModal({ ...newTemplateModal, visible: false })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmCreateTemplate}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonTextConfirm}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 新增模板删除确认弹窗 */}
      <Modal
        visible={!!showDeleteTemplateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteTemplateModal(null)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center'
        }}>
          <View style={{
            backgroundColor: '#fff', borderRadius: 10, padding: 24, width: 300, alignItems: 'center'
          }}>
            <Ionicons name="warning-outline" size={36} color={theme.colors.danger} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 17, fontWeight: 'bold', color: theme.colors.danger, marginBottom: 10 }}>
              确认删除模板？
            </Text>
            <Text style={{ color: '#333', fontSize: 15, marginBottom: 18, textAlign: 'center' }}>
              删除后不可恢复，且不会影响已保存的角色数据。
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#eee', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginRight: 12
                }}
                onPress={() => setShowDeleteTemplateModal(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: '#333', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: theme.colors.danger, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24
                }}
                onPress={confirmDeleteTemplate}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 重命名模板弹窗 */}
      <Modal
        visible={renameModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModal({ ...renameModal, visible: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>重命名模板</Text>
            <TextInput
              style={styles.modalInput}
              value={renameModal.name}
              onChangeText={text => setRenameModal({ ...renameModal, name: text })}
              placeholder="请输入新名称"
              placeholderTextColor="#999"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setRenameModal({ ...renameModal, visible: false })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleRenameModalConfirm}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonTextConfirm}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 新建正则脚本弹窗 */}
      <Modal
        visible={newRegexModal.visible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>新建正则脚本</Text>
            <Text style={styles.modalLabel}>脚本名称</Text>
            <TextInput
              style={styles.modalInput}
              value={newRegexModal.name}
              onChangeText={text => setNewRegexModal({ ...newRegexModal, name: text })}
              placeholder="请输入脚本名称"
              placeholderTextColor="#999"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setNewRegexModal({ ...newRegexModal, visible: false })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmCreateRegex}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonTextConfirm}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 删除正则脚本弹窗 */}
      <Modal
        visible={showDeleteRegexModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteRegexModal(false)}
      >
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center'
        }}>
          <View style={{
            backgroundColor: '#fff', borderRadius: 10, padding: 24, width: 300, alignItems: 'center'
          }}>
            <Ionicons name="warning-outline" size={36} color={theme.colors.danger} style={{ marginBottom: 12 }} />
            <Text style={{ fontSize: 17, fontWeight: 'bold', color: theme.colors.danger, marginBottom: 10 }}>
              确认删除正则脚本？
            </Text>
            <Text style={{ color: '#333', fontSize: 15, marginBottom: 18, textAlign: 'center' }}>
              删除后不可恢复。
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#eee', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginRight: 12
                }}
                onPress={() => setShowDeleteRegexModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: '#333', fontSize: 16 }}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: theme.colors.danger, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24
                }}
                onPress={confirmDeleteRegexScript}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 新建脚本组模态框 */}
      <Modal
        visible={newRegexGroupModal.visible}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>新建正则脚本组</Text>
            <Text style={styles.modalLabel}>组名称</Text>
            <TextInput
              style={styles.modalInput}
              value={newRegexGroupModal.name}
              onChangeText={text => setNewRegexGroupModal({ ...newRegexGroupModal, name: text })}
              placeholder="请输入脚本组名称"
              placeholderTextColor="#999"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setNewRegexGroupModal({ ...newRegexGroupModal, visible: false })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleConfirmCreateRegexGroup}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.modalButtonTextConfirm}>确认</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 新增：全局详情侧边栏（窄屏时用Modal） */}
      {!isWide && (
        <GlobalDetailSidebar
          isVisible={detailSidebar.isVisible}
          onClose={handleCloseSidebar}
          title={detailSidebar.title}
          content={detailSidebar.content}
          entryType={detailSidebar.entryType}
          entryOptions={detailSidebar.entryOptions}
          name={detailSidebar.name}
          onContentChange={
            detailSidebar.entryType === 'preset'
              ? handlePresetContentChange
              : handleWorldbookContentChange
          }
          onNameChange={
            detailSidebar.entryType === 'preset'
              ? handlePresetNameChange
              : handleWorldbookNameChange
          }
          onOptionsChange={
            detailSidebar.entryType === 'preset'
              ? handlePresetOptionsChange
              : handleWorldbookOptionsChange
          }
          onDelete={
            detailSidebar.entryType === 'preset'
              ? handleDeletePresetEntry
              : handleDeleteWorldbookEntry
          }
        />
      )}

      {/* 正则脚本编辑侧边栏（窄屏时用Modal） */}
      {!isWide && (
        <GlobalDetailSidebar
          isVisible={regexDetailSidebar.isVisible}
          onClose={handleCloseRegexSidebar}
          title="编辑正则脚本"
          content={
            typeof regexDetailSidebar.index === 'number'
              ? getCurrentGroupScripts()[regexDetailSidebar.index]?.findRegex || ''
              : ''
          }
          entryType="regex"
          entryOptions={
            typeof regexDetailSidebar.index === 'number'
              ? getCurrentGroupScripts()[regexDetailSidebar.index]
              : undefined
          }
          name={
            typeof regexDetailSidebar.index === 'number'
              ? getCurrentGroupScripts()[regexDetailSidebar.index]?.scriptName
              : undefined
          }
          flags={
            typeof regexDetailSidebar.index === 'number'
              ? getCurrentGroupScripts()[regexDetailSidebar.index]?.flags ?? 'g'
              : 'g'
          }
          onFlagsChange={async (text: string) => {
            if (
              typeof regexDetailSidebar.index !== 'number' ||
              regexDetailSidebar.index < 0 ||
              !selectedRegexGroupId
            ) return;

            setRegexScriptGroups(groups =>
              groups.map(group => {
                if (group.id === selectedRegexGroupId) {
                  const updatedScripts = [...group.scripts];
                  if (regexDetailSidebar.index! < updatedScripts.length) {
                    updatedScripts[regexDetailSidebar.index!] = {
                      ...updatedScripts[regexDetailSidebar.index!],
                      flags: text.trim() || 'g'
                    };
                  }
                  return { ...group, scripts: updatedScripts };
                }
                return group;
              })
            );

            // 持久化保存
            try {
                            await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
            } catch (e) { }
          }}
          onContentChange={async (text: string) => {
            if (
              typeof regexDetailSidebar.index !== 'number' ||
              regexDetailSidebar.index < 0 ||
              !selectedRegexGroupId
            ) return;

            setRegexScriptGroups(groups =>
              groups.map(group => {
                if (group.id === selectedRegexGroupId) {
                  const updatedScripts = [...group.scripts];
                  if (regexDetailSidebar.index! < updatedScripts.length) {
                    updatedScripts[regexDetailSidebar.index!] = {
                      ...updatedScripts[regexDetailSidebar.index!],
                      findRegex: text
                    };
                  }
                  return { ...group, scripts: updatedScripts };
                }
                return group;
              })
            );

            // 持久化保存
            try {
                            await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
            } catch (e) { }
          }}
          onNameChange={async text => {
            if (
              typeof regexDetailSidebar.index !== 'number' ||
              regexDetailSidebar.index < 0 ||
              !selectedRegexGroupId
            ) return;

            setRegexScriptGroups(groups =>
              groups.map(group => {
                if (group.id === selectedRegexGroupId) {
                  const updatedScripts = [...group.scripts];
                  if (regexDetailSidebar.index! < updatedScripts.length) {
                    updatedScripts[regexDetailSidebar.index!] = {
                      ...updatedScripts[regexDetailSidebar.index!],
                      scriptName: text
                    };
                  }
                  return { ...group, scripts: updatedScripts };
                }
                return group;
              })
            );

            // 持久化保存
            try {
                            await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
            } catch (e) { }
          }}
          onOptionsChange={async opts => {
            if (
              typeof regexDetailSidebar.index !== 'number' ||
              regexDetailSidebar.index < 0 ||
              !selectedRegexGroupId
            ) return;

            setRegexScriptGroups(groups =>
              groups.map(group => {
                if (group.id === selectedRegexGroupId) {
                  const updatedScripts = [...group.scripts];
                  if (regexDetailSidebar.index! < updatedScripts.length) {
                    updatedScripts[regexDetailSidebar.index!] = {
                      ...updatedScripts[regexDetailSidebar.index!],
                      ...opts,
                      flags: (opts.flags ?? updatedScripts[regexDetailSidebar.index!].flags ?? 'g') || 'g'
                    };
                  }
                  return { ...group, scripts: updatedScripts };
                }
                return group;
              })
            );

            // 持久化保存
            try {
                            await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
            } catch (e) { }
          }}
          onDelete={async () => {
            if (
              typeof regexDetailSidebar.index !== 'number' ||
              regexDetailSidebar.index < 0 ||
              !selectedRegexGroupId
            ) return;

            Alert.alert("删除确认", "确定要删除此正则脚本吗？", [
              { text: "取消", style: "cancel" },
              {
                text: "删除",
                style: "destructive",
                onPress: () => {
                  setRegexScriptGroups(groups =>
                    groups.map(group => {
                      if (group.id === selectedRegexGroupId) {
                        const updatedScripts = group.scripts.filter((_, idx) => idx !== regexDetailSidebar.index);
                        return { ...group, scripts: updatedScripts };
                      }
                      return group;
                    })
                  );

                  // 持久化保存
                  (async () => {
                    try {
                                            await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
                    } catch (e) { }
                  })();

                  handleCloseRegexSidebar();
                }
              }
            ]);
          }}
        />
      )}

      {/* 其它模态框... */}
      {/* ...existing code... */}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 60, // 增加高度
    backgroundColor: theme.colors.black,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16, // 增加水平间距
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 44, // 增加按钮宽度
    height: 44, // 增加按钮高度
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    minHeight: 48, // 确保标签高度足够
  },
  tab: {
    flex: 1,
    paddingVertical: 14, // 增加垂直内边距
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    color: '#888',
    fontSize: 16,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    flex: 1,
    color: theme.colors.text,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  promptCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    padding: 14, // 原12
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    minHeight: 56,
  },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  promptLabel: {
    width: 60,
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  promptInput: {
    flex: 1,
    borderBottomWidth: Platform.OS === 'ios' ? 1 : 0,
    borderBottomColor: '#eee',
    fontSize: 14,
    color: theme.colors.black,
    paddingVertical: 2,
    marginLeft: 8,
  },
  promptValue: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    marginLeft: 8,
  },
  footer: {
    padding: 16,
    backgroundColor: theme.colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    minWidth: 0,
  },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 14, // 增加按钮高度
    alignItems: 'center',
  },
  saveBtnText: {
    color: 'black',
    fontSize: 16,
    fontWeight: 'bold',
  },
  priorityBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ccc',
    marginHorizontal: 4,
  },
  priorityBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  priorityText: {
    color: '#666',
  },
  priorityTextActive: {
    color: theme.colors.black,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 10,
    padding: 20,
    width: '90%', // 原80%
    maxWidth: 400,
    minWidth: 260,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: theme.colors.text,
  },
  modalLabel: {
    fontSize: 14,
    marginBottom: 6,
    color: theme.colors.text,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    padding: 10,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: '#333',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12, // 增加按钮高度
    borderRadius: 6,
    marginLeft: 10,
    minWidth: 80, // 确保按钮有足够的宽度
  },
  modalButtonCancel: {
    backgroundColor: '#f0f0f0',
  },
  modalButtonConfirm: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonText: {
    color: '#666',
    fontSize: 16,
  },
  modalButtonTextConfirm: {
    color: 'black',
    fontSize: 16,
    fontWeight: 'bold',
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 8,
    marginBottom: 6,
    paddingHorizontal: 16, // 增加水平内边距
    paddingVertical: 12, // 增加垂直内边距
    minHeight: 52, // 增加最小高度
  },
  compactName: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 6, // 增加垂直内边距
  },
  compactNameText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  compactSwitch: {
    paddingHorizontal: 12, // 增加水平内边距
    paddingVertical: 8, // 增加垂直内边距
  },
  responsiveRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 0,
    minWidth: 0,
  },
  sidebarContainer: {
    width: '100%',
    maxWidth: 500,
    minWidth: 260,
    backgroundColor: '#222',
    borderLeftWidth: 1,
    borderLeftColor: '#444',
    height: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
});

// 新增：导出全局设置的加载和保存函数
export async function loadGlobalSettingsState() {
  try {
        const presetList: GlobalPresetTemplate[] = await StorageAdapter.loadGlobalPresetList?.() || [];
    const selectedPresetId = await StorageAdapter.loadSelectedGlobalPresetId?.();
    const selectedPreset = presetList.find(t => t.id === (selectedPresetId || presetList[0]?.id));
    const worldbookList: GlobalWorldbookTemplate[] = await StorageAdapter.loadGlobalWorldbookList?.() || [];
    const selectedWorldbookId = await StorageAdapter.loadSelectedGlobalWorldbookId?.();
    const selectedWorldbook = worldbookList.find(t => t.id === (selectedWorldbookId || worldbookList[0]?.id));
    const presetEnabled = await AsyncStorage.getItem('nodest_global_preset_enabled');
    const worldbookEnabled = await AsyncStorage.getItem('nodest_global_worldbook_enabled');
    const loadedGroups = await StorageAdapter.loadGlobalRegexScriptGroups?.() || [];
    const regexGroups: GlobalRegexScriptGroup[] = loadedGroups.map(group => ({
      ...group,
      bindType: group.bindType === 'character' || group.bindType === 'all' ? group.bindType : undefined,
      scripts: group.scripts || []
    }));

    // 如果没有脚本组但有旧格式的脚本列表，进行迁移
    let migratedRegexGroups = regexGroups;
    if (regexGroups.length === 0) {
      const oldRegexList: GlobalRegexScript[] = await StorageAdapter.loadGlobalRegexScriptList?.() || [];
      if (oldRegexList.length > 0) {
        migratedRegexGroups = [{
          id: `group_${Date.now()}`,
          name: '默认脚本组',
          scripts: oldRegexList
        }];
        // 保存迁移后的数据
        await StorageAdapter.saveGlobalRegexScriptGroups?.(migratedRegexGroups);
      }
    }

    const selectedRegexGroupId = await StorageAdapter.loadSelectedGlobalRegexGroupId?.() || (migratedRegexGroups[0]?.id ?? '');
    const regexEnabledVal = await AsyncStorage.getItem('nodest_global_regex_enabled');

    return {
      globalPresetList: presetList,
      selectedPresetId: selectedPresetId || (presetList[0]?.id ?? ''),
      presetConfig: {
        enabled: presetEnabled === 'true',
        presetJson: selectedPreset?.presetJson || defaultPreset,
      },
      presetEntries: selectedPreset ? promptsToPresetEntryUI(selectedPreset.presetJson.prompts) : [],
      globalWorldbookList: worldbookList,
      selectedWorldbookId: selectedWorldbookId || (worldbookList[0]?.id ?? ''),
      worldbookConfig: {
        enabled: worldbookEnabled === 'true',
        priority: '全局优先',
        worldbookJson: selectedWorldbook?.worldbookJson || defaultWorldBook,
      },
      regexScriptGroups: migratedRegexGroups,
      selectedRegexGroupId,
      regexEnabled: regexEnabledVal === 'true',
    };
  } catch (e) {
    return null;
  }
}

export async function saveGlobalSettingsState({
  globalPresetList,
  selectedPresetId,
  globalWorldbookList,
  selectedWorldbookId,
  regexScriptGroups,
  selectedRegexGroupId,
  presetConfig,
  worldbookConfig,
  regexEnabled,
}: any) {
  try {
        await StorageAdapter.saveGlobalPresetList?.(globalPresetList);
    await StorageAdapter.saveSelectedGlobalPresetId?.(selectedPresetId);
    await StorageAdapter.saveGlobalWorldbookList?.(globalWorldbookList);
    await StorageAdapter.saveSelectedGlobalWorldbookId?.(selectedWorldbookId);
    await StorageAdapter.saveGlobalRegexScriptGroups?.(regexScriptGroups);
    await StorageAdapter.saveSelectedGlobalRegexGroupId?.(selectedRegexGroupId);
    await AsyncStorage.setItem('nodest_global_preset_enabled', presetConfig.enabled ? 'true' : 'false');
    await AsyncStorage.setItem('nodest_global_worldbook_enabled', worldbookConfig.enabled ? 'true' : 'false');
    await AsyncStorage.setItem('nodest_global_regex_enabled', regexEnabled ? 'true' : 'false');
  } catch (e) {
    // ignore
  }
}