import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  Dimensions,
  Keyboard,
  Switch,
  Platform,
  Animated,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import TextEditorModal from '../common/TextEditorModal';

interface GlobalDetailSidebarProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  onContentChange?: (text: string) => void;
  editable?: boolean;
  entryType?: 'worldbook' | 'preset' | 'regex';
  entryOptions?: any;
  onOptionsChange?: (options: any) => void;
  name?: string;
  onNameChange?: (text: string) => void;
  onDelete?: () => void;
  flags?: string;
  onFlagsChange?: (flags: string) => void;
  inline?: boolean; // 新增：响应式内联模式
}

const { width } = Dimensions.get('window');
const COLOR_BEIGE = 'rgb(255, 224, 195)';
const COLOR_DANGER = '#FF5252';

const GlobalDetailSidebar: React.FC<GlobalDetailSidebarProps> = ({
  isVisible,
  onClose,
  title,
  content,
  onContentChange,
  editable = true,
  entryType,
  entryOptions,
  onOptionsChange,
  name,
  onNameChange,
  onDelete,
  flags,
  onFlagsChange,
  inline = false,
}) => {
  const [localContent, setLocalContent] = useState(content);
  const [localName, setLocalName] = useState(name || '');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [localOptions, setLocalOptions] = useState(entryOptions || {});
  const [showTextEditor, setShowTextEditor] = useState(false);
  const [localRegex, setLocalRegex] = useState<any>(entryOptions || {});
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');

  const translateYValue = useRef(new Animated.Value(0)).current;
  const userCloseRef = useRef(false); // 标记是否用户主动关闭

  useEffect(() => {
    setLocalContent(content);
    setLocalName(name || '');
    setLocalOptions(entryOptions || {});
    if (entryType === 'regex') setLocalRegex(entryOptions || {});
  }, [content, name, entryOptions, entryType]);

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      (event) => {
        const keyboardHeight = event.endCoordinates.height;
        setKeyboardHeight(keyboardHeight);
        setKeyboardShown(true);
        
        Animated.timing(translateYValue, {
          toValue: -keyboardHeight / 2,
          duration: 250,
          useNativeDriver: true
        }).start();
      }
    );
    
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (event) => {
        const keyboardHeight = event.endCoordinates.height;
        setKeyboardHeight(keyboardHeight);
        setKeyboardShown(true);
      }
    );
    
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      () => {
        setKeyboardHeight(0);
        setKeyboardShown(false);
        
        Animated.timing(translateYValue, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true
        }).start();
      }
    );
    
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
        setKeyboardShown(false);
      }
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardDidShowListener.remove();
      keyboardWillHideListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [translateYValue]);

  useEffect(() => {
    if (!isVisible) {
      if (userCloseRef.current) {
        // 用户主动关闭
        userCloseRef.current = false;
      } else {
        // 其他原因导致关闭（如props变化）
        console.log('[GlobalDetailSidebar] Sidebar被动关闭（如props变化或父组件控制）');
      }
    }
  }, [isVisible]);

  const handleOptionsChange = useCallback((updates: any) => {
    const newOptions = { ...localOptions, ...updates };
    setLocalOptions(newOptions);
    if (onOptionsChange) {
      onOptionsChange(newOptions);
    }
  }, [localOptions, onOptionsChange]);

  const handleUpdateSlider = useCallback((value: number) => {
    if (entryType === 'worldbook' && localOptions.position === 4) {
      handleOptionsChange({ depth: value });
    } 
    else if (entryType === 'preset' && localOptions.insertType === 'chat') {
      handleOptionsChange({ depth: value });
    }
  }, [entryType, localOptions, handleOptionsChange]);

  const handleSaveWithKeyboardDismiss = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => {
      if (onContentChange) {
        onContentChange(localContent);
      }
      if (onNameChange && name !== undefined) {
        onNameChange(localName);
      }
      onClose();
    }, 100);
  }, [localContent, localName, onContentChange, onNameChange, name, onClose]);

  const handleCloseWithKeyboardDismiss = useCallback(() => {
    userCloseRef.current = true;
    console.log('[GlobalDetailSidebar] 用户手动关闭Sidebar');
    Keyboard.dismiss();
    setTimeout(() => {
      onClose();
    }, 100);
  }, [onClose]);

  const handleTextPress = useCallback(() => {
    setShowTextEditor(true);
  }, []);

  const handleTextSave = useCallback((newText: string) => {
    setLocalContent(newText);
    if (onContentChange) {
      onContentChange(newText);
    }
  }, [onContentChange]);

  const handleRegexFieldChange = (key: string, value: any) => {
    const updated = { ...localRegex, [key]: value };
    setLocalRegex(updated);
    if (onOptionsChange) onOptionsChange(updated);
  };

  const handleAddTrimString = () => {
    const arr = Array.isArray(localRegex.trimStrings) ? [...localRegex.trimStrings] : [];
    arr.push('');
    handleRegexFieldChange('trimStrings', arr);
  };
  const handleTrimStringChange = (idx: number, val: string) => {
    const arr = Array.isArray(localRegex.trimStrings) ? [...localRegex.trimStrings] : [];
    arr[idx] = val;
    handleRegexFieldChange('trimStrings', arr);
  };
  const handleRemoveTrimString = (idx: number) => {
    const arr = Array.isArray(localRegex.trimStrings) ? [...localRegex.trimStrings] : [];
    arr.splice(idx, 1);
    handleRegexFieldChange('trimStrings', arr);
  };

  const handlePlacementToggle = (val: number) => {
    let arr = Array.isArray(localRegex.placement) ? [...localRegex.placement] : [];
    if (arr.includes(val)) arr = arr.filter(x => x !== val);
    else arr.push(val);
    handleRegexFieldChange('placement', arr);
  };

  const handleTestRegex = useCallback(() => {
    try {
      if (!localRegex.findRegex) {
        setTestOutput('请填写查找正则');
        return;
      }
      let pattern = localRegex.findRegex;
      let flags = localRegex.flags || '';
      
      // 支持 /pattern/flags 格式
      const regexMatch = /^\/(.+)\/([a-z]*)$/i.exec(localRegex.findRegex);
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
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags);
      } catch (e) {
        setTestOutput('正则表达式无效');
        return;
      }
      let result = testInput;
      let replaceStr = typeof localRegex.replaceString === 'string' ? localRegex.replaceString : '';
      // 修复：正确处理 {{match}}
      if (replaceStr.includes('{{match}}')) {
        result = result.replace(regex, (...args) => {
          // args[0] 是当前匹配内容
          return replaceStr.replace(/\{\{match\}\}/g, args[0]);
        });
      } else {
        result = result.replace(regex, replaceStr);
      }
      if (Array.isArray(localRegex.trimStrings)) {
        for (const s of localRegex.trimStrings) {
          if (s) result = result.split(s).join('');
        }
      }
      setTestOutput(result);
    } catch (e: any) {
      setTestOutput('测试出错: ' + e?.message);
    }
  }, [testInput, localRegex]);

  const renderEntryOptions = () => {
    if (!entryType || !localOptions) return null;

    switch (entryType) {
      case 'worldbook':
        return (
          <View style={styles.optionsContainer}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>位置:</Text>
              <View style={styles.radioGroup}>
                {[0, 1, 2, 3, 4].map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      styles.radioButton,
                      localOptions.position === pos && styles.radioButtonSelected,
                    ]}
                    onPress={() => handleOptionsChange({ position: pos })}
                  >
                    <Text
                      style={[
                        styles.radioText,
                        localOptions.position === pos && styles.radioTextSelected,
                      ]}
                    >
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>禁用:</Text>
              <Switch
                trackColor={{ false: "#767577", true: COLOR_BEIGE }}
                thumbColor={localOptions.disable ? COLOR_BEIGE : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={(value) => handleOptionsChange({ disable: value })}
                value={localOptions.disable}
              />
            </View>
            
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>常驻:</Text>
              <Switch
                trackColor={{ false: "#767577", true: COLOR_BEIGE }}
                thumbColor={localOptions.constant ? COLOR_BEIGE : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={(value) => handleOptionsChange({ constant: value })}
                value={localOptions.constant}
              />
            </View>

            {localOptions.position === 4 && (
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>深度: {localOptions.depth}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={5}
                  step={1}
                  value={localOptions.depth || 0}
                  onValueChange={handleUpdateSlider}
                  minimumTrackTintColor={COLOR_BEIGE}
                  maximumTrackTintColor="#444"
                />
              </View>
            )}
          </View>
        );

      case 'preset':
        return (
          <View style={styles.optionsContainer}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>启用:</Text>
              <Switch
                trackColor={{ false: "#767577", true: COLOR_BEIGE }}
                thumbColor={localOptions.enable ? COLOR_BEIGE : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={(value) => handleOptionsChange({ enable: value })}
                value={localOptions.enable}
              />
            </View>
            
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>角色:</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.role === 'user' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ role: 'user' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.role === 'user' && styles.radioTextSelected,
                    ]}
                  >
                    用户
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.role === 'model' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ role: 'model' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.role === 'model' && styles.radioTextSelected,
                    ]}
                  >
                    AI
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>插入类型:</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.insertType === 'relative' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ insertType: 'relative' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.insertType === 'relative' && styles.radioTextSelected,
                    ]}
                  >
                    相对位置
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    localOptions.insertType === 'chat' && styles.radioButtonSelected,
                  ]}
                  onPress={() => handleOptionsChange({ insertType: 'chat' })}
                >
                  <Text
                    style={[
                      styles.radioText,
                      localOptions.insertType === 'chat' && styles.radioTextSelected,
                    ]}
                  >
                    对话式
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {localOptions.insertType === 'chat' && (
              <View style={styles.optionRow}>
                <Text style={styles.optionLabel}>深度: {localOptions.depth}</Text>
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={5}
                  step={1}
                  value={localOptions.depth || 0}
                  onValueChange={handleUpdateSlider}
                  minimumTrackTintColor={COLOR_BEIGE}
                  maximumTrackTintColor="#444"
                />
              </View>
            )}
          </View>
        );

      case 'regex':
        return (
          <View style={styles.optionsContainer}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>启用:</Text>
              <Switch
                trackColor={{ false: "#767577", true: "#ffe0c3" }}
                thumbColor={!localRegex.disabled ? "#ffe0c3" : "#f4f3f4"}
                ios_backgroundColor="#3e3e3e"
                onValueChange={v => handleRegexFieldChange('disabled', !v)}
                value={!localRegex.disabled}
              />
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>应用于:</Text>
              <TouchableOpacity
                style={[
                  styles.radioButton,
                  Array.isArray(localRegex.placement) && localRegex.placement.includes(1) && styles.radioButtonSelected,
                ]}
                onPress={() => handlePlacementToggle(1)}
              >
                <Text style={[
                  styles.radioText,
                  Array.isArray(localRegex.placement) && localRegex.placement.includes(1) && styles.radioTextSelected,
                ]}>用户</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.radioButton,
                  Array.isArray(localRegex.placement) && localRegex.placement.includes(2) && styles.radioButtonSelected,
                ]}
                onPress={() => handlePlacementToggle(2)}
              >
                <Text style={[
                  styles.radioText,
                  Array.isArray(localRegex.placement) && localRegex.placement.includes(2) && styles.radioTextSelected,
                ]}>AI</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>查找正则:</Text>
              <TextInput
                style={[styles.nameInput, { flex: 1 }]}
                value={localRegex.findRegex || ''}
                onChangeText={text => handleRegexFieldChange('findRegex', text)}
                placeholder="输入正则表达式"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>标志(flags):</Text>
              <TextInput
                style={[styles.nameInput, { flex: 1 }]}
                value={typeof flags === 'string' ? flags : (localRegex.flags ?? 'g')}
                onChangeText={text => {
                  if (onFlagsChange) onFlagsChange(text);
                  else handleRegexFieldChange('flags', text);
                }}
                placeholder="g, i, m等"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={6}
              />
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>替换为:</Text>
              <TextInput
                style={[styles.nameInput, { flex: 1 }]}
                value={localRegex.replaceString || ''}
                onChangeText={text => handleRegexFieldChange('replaceString', text)}
                placeholder="替换字符串，可用{{match}}，或$1等捕获组"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>Trim:</Text>
              <View style={{ flex: 1 }}>
                {Array.isArray(localRegex.trimStrings) && localRegex.trimStrings.map((s: string, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <TextInput
                      style={[styles.nameInput, { flex: 1 }]}
                      value={s}
                      onChangeText={text => handleTrimStringChange(idx, text)}
                      placeholder="要移除的字符串"
                      placeholderTextColor="#999"
                    />
                    <TouchableOpacity onPress={() => handleRemoveTrimString(idx)} style={{ marginLeft: 6 }}>
                      <Ionicons name="close-circle" size={18} color="#ff5252" />
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={handleAddTrimString} style={{ marginTop: 4 }}>
                  <Ionicons name="add-circle-outline" size={18} color="#ffe0c3" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ marginTop: 16 }}>
              <Text style={{ color: '#fff', fontSize: 15, marginBottom: 6 }}>测试</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <TextInput
                  style={[styles.nameInput, { flex: 1, backgroundColor: '#222', color: '#fff' }]}
                  value={testInput}
                  onChangeText={setTestInput}
                  placeholder="输入要测试的文本"
                  placeholderTextColor="#888"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  onPress={handleTestRegex}
                  style={{
                    marginLeft: 8,
                    backgroundColor: '#ffe0c3',
                    borderRadius: 4,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: '#333', fontWeight: 'bold' }}>测试</Text>
                </TouchableOpacity>
              </View>
              <View style={{
                minHeight: 40,
                backgroundColor: '#222',
                borderRadius: 4,
                padding: 8,
              }}>
                <Text style={{ color: '#ffe0c3', fontSize: 15 }}>
                  {testOutput}
                </Text>
              </View>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  const handleDelete = useCallback(() => {
    if (onDelete) {
      Alert.alert(
        "删除确认",
        "确定要删除此条目吗？",
        [
          { text: "取消", style: "cancel" },
          { text: "删除", style: "destructive", onPress: () => {
            onDelete();
            onClose();
          }}
        ]
      );
    }
  }, [onDelete, onClose]);

  const sidebarContent = (
    <Animated.View 
      style={[
        styles.modalWrapper,
        { transform: [{ translateY: translateYValue }] },
        inline && { 
          width: '100%',
          maxWidth: 500,
          height: '100%',
          maxHeight: '100%',
          marginBottom: 0,
          borderRadius: 0,
          backgroundColor: '#333',
        }
      ]}
    >
      <View style={[styles.content, inline && { width: '100%', maxWidth: '100%', height: '100%', maxHeight: '100%' }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerButtons}>
            {onDelete && (
              <TouchableOpacity 
                style={styles.headerButton} 
                onPress={handleDelete}
                accessibilityLabel="Delete"
              >
                <Ionicons name="trash-outline" size={22} color={COLOR_DANGER} />
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={handleCloseWithKeyboardDismiss}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        
        <ScrollView style={styles.scrollViewContainer}>
          {name !== undefined && (
            <View style={styles.nameContainer}>
              <Text style={styles.nameLabel}>名称:</Text>
              <TextInput
                style={styles.nameInput}
                value={localName}
                onChangeText={setLocalName}
                editable={editable}
                placeholder="输入名称..."
                placeholderTextColor="#999"
              />
            </View>
          )}

          {renderEntryOptions()}

          <View style={styles.textContentContainer}>
            <TouchableOpacity 
              style={styles.textPreview} 
              onPress={handleTextPress}
              disabled={!editable}
            >
              <Text style={styles.textPreviewContent} numberOfLines={0}>
                {localContent || '点击编辑文本...'}
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={handleCloseWithKeyboardDismiss}
          >
            <Text style={styles.buttonText}>取消</Text>
          </TouchableOpacity>
          {editable && (
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSaveWithKeyboardDismiss}
            >
              <Text style={styles.buttonText}>保存</Text>
            </TouchableOpacity>
          )}
        </View>

        <TextEditorModal
          isVisible={showTextEditor}
          onClose={() => setShowTextEditor(false)}
          onSave={handleTextSave}
          initialText={localContent}
        />
      </View>
    </Animated.View>
  );

  if (inline) {
    return (
      <View style={{ flex: 1, backgroundColor: '#222', height: '100%' }}>
        {sidebarContent}
      </View>
    );
  }

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCloseWithKeyboardDismiss}
      supportedOrientations={['portrait', 'landscape']}
    >
      <BlurView intensity={20} tint="dark" style={styles.container}>
        {sidebarContent}
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Platform.OS === 'ios' ? 0 : 20,
  },
  content: {
    width: width * 0.9,
    maxWidth: 500,
    height: '80%',
    maxHeight: 600,
    backgroundColor: '#333',
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  scrollViewContainer: {
    flex: 1,
  },
  textContentContainer: {
    minHeight: 200,
    paddingBottom: 10,
  },
  textPreview: {
    padding: 16,
    backgroundColor: '#444',
    borderRadius: 8,
    margin: 16,
    minHeight: 150,
  },
  textPreviewContent: {
    color: '#fff',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 4,
    marginLeft: 8,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  nameLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    width: 60,
  },
  nameInput: {
    flex: 1,
    color: '#fff',
    padding: 8,
    backgroundColor: '#444',
    borderRadius: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
    backgroundColor: '#333',
    position: 'relative',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  saveButton: {
    backgroundColor: COLOR_BEIGE,
  },
  buttonText: {
    color: '#000',
    fontWeight: 'bold',
  },
  optionsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionLabel: {
    fontSize: 16,
    color: '#fff',
    width: 80,
  },
  radioGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  radioButton: {
    backgroundColor: '#444',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  radioButtonSelected: {
    backgroundColor: COLOR_BEIGE,
  },
  radioText: {
    color: '#ccc',
  },
  radioTextSelected: {
    color: '#000',
    fontWeight: 'bold',
  },
  slider: {
    flex: 1,
    height: 40,
  },
});

export default GlobalDetailSidebar;
