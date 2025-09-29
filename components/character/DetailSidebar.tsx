import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  Keyboard,
  Switch,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  BackHandler,
  ViewStyle,
  FlatList,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Slider from '@react-native-community/slider';
import TextEditorModal from '../common/TextEditorModal';

interface DetailSidebarProps {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  content: string;
  onContentChange?: (text: string) => void;
  editable?: boolean;
  entryType?: 'worldbook' | 'preset' | 'author_note';
  entryOptions?: any;
  onOptionsChange?: (options: any) => void;
  name?: string;
  onNameChange?: (text: string) => void;
  onDelete?: () => void;
}

const { width, height } = Dimensions.get('window');
const COLOR_BEIGE = 'rgb(255, 224, 195)';
const COLOR_DANGER = '#FF5252';

const DetailSidebar: React.FC<DetailSidebarProps> = ({
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
}) => {
  const [localContent, setLocalContent] = useState(content);
  const [localName, setLocalName] = useState(name || '');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardShown, setKeyboardShown] = useState(false);
  const [localOptions, setLocalOptions] = useState(entryOptions || {});
  const [showTextEditor, setShowTextEditor] = useState(false);
  
  const translateYValue = useRef(new Animated.Value(0)).current;
  const textInputRef = useRef<TextInput>(null);
  const userCloseRef = useRef(false); // 标记是否用户主动关闭

  useEffect(() => {
    setLocalContent(content);
    setLocalName(name || '');
    setLocalOptions(entryOptions || {});
  }, [content, name, entryOptions]);

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
    if (isVisible) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (isVisible) {
          onClose();
          return true;
        }
        return false;
      });
      
      return () => {
        backHandler.remove();
      };
    }
  }, [isVisible, onClose]);

  useEffect(() => {
    if (!isVisible) {
      if (userCloseRef.current) {
        // 用户主动关闭
        userCloseRef.current = false;
      } else {
        // 其他原因导致关闭（如props变化）
        console.log('[DetailSidebar] Sidebar被动关闭（如props变化或父组件控制）');
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
    else if (entryType === 'author_note') {
      handleOptionsChange({ injection_depth: value });
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
      // 新增：保存 entryOptions
      if (onOptionsChange && entryOptions !== undefined) {
        onOptionsChange(localOptions);
      }
      onClose();
    }, 100);
  }, [localContent, localName, onContentChange, onNameChange, name, onClose, onOptionsChange, entryOptions, localOptions]);

  const handleCloseWithKeyboardDismiss = useCallback(() => {
    userCloseRef.current = true;
    console.log('[DetailSidebar] 用户手动关闭Sidebar');
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
    console.log('[DetailSidebar] Text editor content updated', newText.length);
  }, []);

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

      case 'author_note':
        return (
          <View style={styles.optionsContainer}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>深度: {localOptions.injection_depth}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={5}
                step={1}
                value={localOptions.injection_depth || 0}
                onValueChange={handleUpdateSlider}
                minimumTrackTintColor={COLOR_BEIGE}
                maximumTrackTintColor="#444"
              />
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCloseWithKeyboardDismiss}
      supportedOrientations={['portrait', 'landscape']}
    >
      {/* 全屏化：BlurView和内容都用flex:1撑满 */}
      <BlurView intensity={20} tint="dark" style={styles.fullscreenContainer}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.fullscreenWrapper}>
            <View style={styles.fullscreenContent}>
              <View style={styles.header}>
                <Text style={styles.title}>{title}</Text>
                <View style={styles.headerButtons}>
                  <TouchableOpacity 
                    style={styles.headerButton} 
                    onPress={handleCloseWithKeyboardDismiss}
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

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

              <View style={styles.scrollViewWrapper}>
                <ScrollView 
                  style={styles.scrollContainer}
                  contentContainerStyle={styles.scrollContentContainer}
                >
                  <TouchableOpacity 
                    style={styles.textPreview} 
                    onPress={handleTextPress}
                    disabled={!editable}
                  >
                    <Text style={styles.textPreviewContent} numberOfLines={0}>
                      {localContent || '点击编辑文本...'}
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>

              {editable && (
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={handleTextPress}
                >
                  <Ionicons name="create-outline" size={16} color="#000" />
                  <Text style={styles.editButtonText}>编辑文本内容</Text>
                </TouchableOpacity>
              )}

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
                {onDelete && (
                  <TouchableOpacity
                    style={[styles.button, styles.deleteButton]}
                    onPress={() => {
                      Alert.alert(
                        "确认删除",
                        "确定要删除这个条目吗？此操作不能撤销。",
                        [
                          {
                            text: "取消",
                            style: "cancel"
                          },
                          { 
                            text: "删除", 
                            onPress: () => {
                              onDelete();
                              onClose();
                            },
                            style: "destructive"
                          }
                        ]
                      );
                    }}
                  >
                    <Text style={styles.buttonText}>删除</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextEditorModal
                isVisible={showTextEditor}
                onClose={() => setShowTextEditor(false)}
                onSave={handleTextSave}
                initialText={localContent}
                title={`编辑${title || '条目'}内容`}
                placeholder="输入文本内容..."
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  modalWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: width * 0.9,
    maxWidth: 500,
    maxHeight: height * 0.8,
    backgroundColor: '#333',
    borderRadius: 10,
    overflow: 'hidden',
    flexDirection: 'column',
    display: 'flex',
  },
  scrollViewWrapper: {
    flex: 1,
    minHeight: 100,
    maxHeight: height * 0.4, // 响应式高度，按钮始终可见
    minWidth: 0,
  },
  scrollContainer: {
    flex: 1,
    minWidth: 0,
  },
  scrollContentContainer: {
    padding: 16,
    minWidth: 0,
  },
  textPreview: {
    backgroundColor: '#444',
    borderRadius: 8,
    padding: 16,
    minHeight: 120,
    minWidth: 0,
  },
  textPreviewContent: {
    color: '#fff',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    minHeight: 56,
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
  closeButton: {
    padding: 4,
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
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR_BEIGE,
    padding: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 4,
  },
  editButtonText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 4,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#444',
    backgroundColor: '#333',
    minWidth: 0,
  },
  buttonContainerWithKeyboard: {
    borderTopWidth: 1,
    borderTopColor: '#444',
    backgroundColor: '#333',
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
  deleteButton: {
    backgroundColor: COLOR_DANGER,
  },
  buttonText: {
    color: 'black',
    fontWeight: 'bold',
  },
  optionsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    minWidth: 0,
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
  // 替换container/modalWrapper/content为全屏样式
  fullscreenContainer: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  fullscreenWrapper: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 44 : 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    minWidth: 0,
    minHeight: 0,
  },
  fullscreenContent: {
    flex: 1,
    width: '100%',
    maxWidth: 600, // 限制最大宽度，适配大屏
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#333',
    borderRadius: Platform.OS === 'web' ? 12 : 0,
    overflow: 'hidden',
    flexDirection: 'column',
    display: 'flex',
    alignSelf: 'center',
  },
});

export default DetailSidebar;
