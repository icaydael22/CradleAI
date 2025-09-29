import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ToastAndroid,
  Switch,
} from 'react-native';
import { defaultClient as vndb } from '@/src/services/vndb';
import { CharacterQueryOptions, VNDBCharacter } from '@/src/services/vndb/types';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

interface VNDBTestModalProps {
  visible: boolean;
  onClose: () => void;
}

interface AgeRange {
  min: string;
  max: string;
}

const VNDBTestModal: React.FC<VNDBTestModalProps> = ({ visible, onClose }) => {
  // 状态管理
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [characterId, setCharacterId] = useState('');
  const [results, setResults] = useState<VNDBCharacter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [queryType, setQueryType] = useState<'search' | 'id' | 'advanced'>('search');
  const [advancedOptions, setAdvancedOptions] = useState<Partial<CharacterQueryOptions>>({
    results: 5,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // 新增的过滤状态
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [traitInput, setTraitInput] = useState('');
  const [ageRange, setAgeRange] = useState<AgeRange>({ min: '', max: '' });
  const [useVNFilter, setUseVNFilter] = useState(false);

  // 添加日志
  const addLog = (message: string) => {
    setLogMessages(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // 重置结果
  const resetResults = () => {
    setResults([]);
    setError(null);
  };

  // 清空日志
  const clearLogs = () => {
    setLogMessages([]);
  };

  // 添加特征
  const addTrait = () => {
    if (traitInput && !selectedTraits.includes(traitInput)) {
      setSelectedTraits(prev => [...prev, traitInput]);
      setTraitInput('');
      addLog(`添加特征: ${traitInput}`);
    }
  };

  // 移除特征
  const removeTrait = (trait: string) => {
    setSelectedTraits(prev => prev.filter(t => t !== trait));
    addLog(`移除特征: ${trait}`);
  };

  // 构建高级查询过滤器
  const buildAdvancedFilters = () => {
    const filters = [];
    
    // 处理特征过滤
    if (selectedTraits.length > 0) {
      // 如果有多个特征，使用OR组合
      const traitFilters = selectedTraits.map(trait => ["trait", "=", trait]);
      if (traitFilters.length > 1) {
        filters.push(["or", ...traitFilters]);
      } else {
        filters.push(traitFilters[0]);
      }
    }
    
    // 处理性别过滤
    if (advancedOptions.sex) {
      filters.push(["sex", "=", advancedOptions.sex]);
    }
    
    // 处理年龄范围过滤
    if (ageRange.min && ageRange.max) {
      const minAge = parseInt(ageRange.min);
      const maxAge = parseInt(ageRange.max);
      if (!isNaN(minAge) && !isNaN(maxAge)) {
        filters.push(["and", 
          ["age", ">=", minAge], 
          ["age", "<=", maxAge]
        ]);
      }
    } else if (ageRange.min) {
      const minAge = parseInt(ageRange.min);
      if (!isNaN(minAge)) {
        filters.push(["age", ">=", minAge]);
      }
    } else if (ageRange.max) {
      const maxAge = parseInt(ageRange.max);
      if (!isNaN(maxAge)) {
        filters.push(["age", "<=", maxAge]);
      }
    }
    
    // 处理VN的过滤器
    if (useVNFilter) {
      filters.push(["vn", "=", [
        "and",
        ["rating", ">", 5.0],
        ["has_description", "=", 1],
        ["or", 
          ["olang", "=", "ja"], 
          ["olang", "=", "ch"]
        ]
      ]]);
    }
    
    // 如果有多个过滤条件，使用AND组合
    return filters.length > 1 ? ["and", ...filters] : filters.length === 1 ? filters[0] : [];
  };

  // 处理查询
  const handleQuery = async () => {
    resetResults();
    clearLogs();
    setIsLoading(true);
    addLog('开始查询...');

    try {
      if (queryType === 'search' && searchTerm) {
        addLog(`执行搜索查询: "${searchTerm}"`);
        const response = await vndb.searchCharacters(searchTerm, advancedOptions);
        setResults(response.results);
        addLog(`查询完成，找到 ${response.results.length} 个角色`);
      } else if (queryType === 'id' && characterId) {
        addLog(`执行ID查询: "${characterId}"`);
        const character = await vndb.getCharacterById(characterId);
        if (character) {
          setResults([character]);
          addLog(`查询完成，找到角色: ${character.name}`);
        } else {
          setResults([]);
          addLog(`未找到ID为 ${characterId} 的角色`);
        }
      } else if (queryType === 'advanced') {
        addLog(`执行高级过滤查询`);
        const filters = buildAdvancedFilters();
        
        if (Object.keys(filters).length === 0) {
          setError('请至少添加一个过滤条件');
          addLog('查询失败: 未设置过滤条件');
          setIsLoading(false);
          return;
        }
        
        addLog(`构建的过滤器: ${JSON.stringify(filters)}`);
        
        const customOptions = {
          ...advancedOptions,
          filters: filters
        };
        
        const response = await vndb.getCharacters(customOptions);
        setResults(response.results);
        addLog(`查询完成，找到 ${response.results.length} 个角色`);
      } else {
        setError('请输入有效的搜索词或角色ID');
        addLog('查询失败: 缺少必要参数');
      }
    } catch (err: any) {
      setError(err.message || '查询过程中发生错误');
      addLog(`查询失败: ${err.message || '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 更新高级选项
  const updateAdvancedOption = (key: keyof CharacterQueryOptions, value: any) => {
    setAdvancedOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // 保存结果到JSON文件
  const saveResultsToJson = async () => {
    if (results.length === 0) {
      addLog('没有查询结果可以保存');
      if (Platform.OS === 'android') {
        ToastAndroid.show('没有查询结果可以保存', ToastAndroid.SHORT);
      } else {
        Alert.alert('提示', '没有查询结果可以保存');
      }
      return;
    }

    try {
      setIsSaving(true);
      addLog('正在保存查询结果...');
      
      // 创建一个包含查询信息的结果对象
      const resultData = {
        query: {
          type: queryType,
          searchTerm: queryType === 'search' ? searchTerm : characterId,
          options: advancedOptions,
          advancedFilters: queryType === 'advanced' ? {
            traits: selectedTraits,
            ageRange: ageRange,
            useVNFilter: useVNFilter
          } : undefined
        },
        timestamp: new Date().toISOString(),
        count: results.length,
        results: results
      };
      
      // 创建文件名
      const fileName = `vndb-${queryType}-${Date.now()}.json`;
      
      // 确定文件保存路径
      const filePath = `${FileSystem.documentDirectory}${fileName}`;
      
      // 将对象转换为JSON字符串并保存
      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(resultData, null, 2), 
        { encoding: FileSystem.EncodingType.UTF8 }
      );
      
      addLog(`查询结果已保存到: ${filePath}`);
      
      // 检查是否可以分享
      const canShare = await Sharing.isAvailableAsync();
      
      if (canShare) {
        // 分享文件
        await Sharing.shareAsync(filePath);
        addLog('已打开分享选项');
      } else {
        if (Platform.OS === 'android') {
          ToastAndroid.show(`结果已保存至: ${filePath}`, ToastAndroid.LONG);
        } else {
          Alert.alert('保存成功', `结果已保存至: ${filePath}`);
        }
      }
    } catch (error: any) {
      const errorMsg = `保存失败: ${error.message || '未知错误'}`;
      addLog(errorMsg);
      setError(errorMsg);
      
      if (Platform.OS === 'android') {
        ToastAndroid.show(errorMsg, ToastAndroid.LONG);
      } else {
        Alert.alert('错误', errorMsg);
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 清空查询结果JSON文件
  const clearResultFiles = async () => {
    try {
      setIsClearing(true);
      addLog('正在清空查询结果文件...');

      if (!FileSystem.documentDirectory) {
        throw new Error('Document directory is not available');
      }
      // 获取文档目录中的文件列表
      const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
      
      // 过滤出VNDB查询结果文件
      const vndbFiles = files.filter(file => file.startsWith('vndb-') && file.endsWith('.json'));
      
      if (vndbFiles.length === 0) {
        addLog('没有找到需要清除的查询结果文件');
        if (Platform.OS === 'android') {
          ToastAndroid.show('没有找到需要清除的文件', ToastAndroid.SHORT);
        } else {
          Alert.alert('提示', '没有找到需要清除的文件');
        }
        setIsClearing(false);
        return;
      }
      
      // 删除所有VNDB查询结果文件
      const deletePromises = vndbFiles.map(file => {
        const filePath = `${FileSystem.documentDirectory}${file}`;
        return FileSystem.deleteAsync(filePath);
      });
      
      await Promise.all(deletePromises);
      
      addLog(`已清空 ${vndbFiles.length} 个查询结果文件`);
      
      if (Platform.OS === 'android') {
        ToastAndroid.show(`已清空 ${vndbFiles.length} 个查询结果文件`, ToastAndroid.LONG);
      } else {
        Alert.alert('成功', `已清空 ${vndbFiles.length} 个查询结果文件`);
      }
    } catch (error: any) {
      const errorMsg = `清空文件失败: ${error.message || '未知错误'}`;
      addLog(errorMsg);
      setError(errorMsg);
      
      if (Platform.OS === 'android') {
        ToastAndroid.show(errorMsg, ToastAndroid.LONG);
      } else {
        Alert.alert('错误', errorMsg);
      }
    } finally {
      setIsClearing(false);
    }
  };

  // 渲染角色结果
  const renderCharacterResult = (character: VNDBCharacter, index: number) => {
    return (
      <View key={index} style={styles.resultItem}>
        <Text style={styles.resultTitle}>
          {character.name} {character.original ? `(${character.original})` : ''}
        </Text>
        
        {character.image?.url && (
          <View style={styles.imageContainer}>
            <Text style={styles.resultSubtext}>图片: {character.image.url.substring(0, 30)}...</Text>
          </View>
        )}
        
        {character.description && (
          <Text style={styles.resultDescription} numberOfLines={3}>
            {character.description.replace(/\[.*?\]/g, '')}
          </Text>
        )}
        
        <View style={styles.resultInfo}>
          {character.sex && (
            <Text style={styles.resultInfoItem}>
              性别: {character.sex[0] === 'm' ? '男' : 
                    character.sex[0] === 'f' ? '女' : 
                    character.sex[0] === 'b' ? '双性' : '未知'}
            </Text>
          )}
          
          {character.blood_type && (
            <Text style={styles.resultInfoItem}>血型: {character.blood_type.toUpperCase()}</Text>
          )}
          
          {character.age !== null && character.age !== undefined && (
            <Text style={styles.resultInfoItem}>年龄: {character.age}</Text>
          )}
          
          {character.height && (
            <Text style={styles.resultInfoItem}>身高: {character.height}cm</Text>
          )}
        </View>
        
        {character.vns && character.vns.length > 0 && (
          <View style={styles.vnsContainer}>
            <Text style={styles.resultSubtext}>
              出现在 {character.vns.length} 部作品中，角色定位: 
              {character.vns.map(vn => 
                vn.role === 'main' ? '主角' : 
                vn.role === 'primary' ? '主要角色' : 
                vn.role === 'side' ? '配角' : '出场'
              ).filter((v, i, a) => a.indexOf(v) === i).join('/')}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>VNDB 角色查询测试</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.queryTypeSelector}>
            <TouchableOpacity
              style={[styles.queryTypeButton, queryType === 'search' && styles.activeQueryType]}
              onPress={() => setQueryType('search')}
            >
              <Text style={[styles.queryTypeText, queryType === 'search' && styles.activeQueryTypeText]}>
                搜索名称
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.queryTypeButton, queryType === 'id' && styles.activeQueryType]}
              onPress={() => setQueryType('id')}
            >
              <Text style={[styles.queryTypeText, queryType === 'id' && styles.activeQueryTypeText]}>
                按ID查询
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.queryTypeButton, queryType === 'advanced' && styles.activeQueryType]}
              onPress={() => setQueryType('advanced')}
            >
              <Text style={[styles.queryTypeText, queryType === 'advanced' && styles.activeQueryTypeText]}>
                高级过滤
              </Text>
            </TouchableOpacity>
          </View>

          {queryType === 'search' ? (
            <TextInput
              style={styles.input}
              placeholder="输入角色名称搜索 (例如: Saber)"
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
          ) : queryType === 'id' ? (
            <TextInput
              style={styles.input}
              placeholder="输入角色ID (例如: c1, c17)"
              value={characterId}
              onChangeText={setCharacterId}
            />
          ) : (
            <View style={styles.advancedFiltersContainer}>
              {/* 特征过滤 */}
              <Text style={styles.filterSectionTitle}>特征过滤</Text>
              <View style={styles.traitInputContainer}>
                <TextInput
                  style={styles.traitInput}
                  placeholder="输入特征ID (例如: i1, i2)"
                  value={traitInput}
                  onChangeText={setTraitInput}
                />
                <TouchableOpacity
                  style={styles.addTraitButton}
                  onPress={addTrait}
                  disabled={!traitInput}
                >
                  <Text style={styles.addTraitButtonText}>添加</Text>
                </TouchableOpacity>
              </View>
              
              {selectedTraits.length > 0 && (
                <ScrollView 
                  horizontal 
                  style={styles.traitsContainer}
                  showsHorizontalScrollIndicator={false}
                >
                  {selectedTraits.map(trait => (
                    <View key={trait} style={styles.traitTag}>
                      <Text style={styles.traitTagText}>{trait}</Text>
                      <TouchableOpacity
                        style={styles.removeTraitButton}
                        onPress={() => removeTrait(trait)}
                      >
                        <Text style={styles.removeTraitButtonText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}
              
              {/* 年龄范围 */}
              <Text style={styles.filterSectionTitle}>年龄范围</Text>
              <View style={styles.ageRangeContainer}>
                <TextInput
                  style={styles.ageInput}
                  placeholder="最小年龄"
                  keyboardType="number-pad"
                  value={ageRange.min}
                  onChangeText={(value) => setAgeRange(prev => ({ ...prev, min: value }))}
                />
                <Text style={styles.ageRangeSeparator}>至</Text>
                <TextInput
                  style={styles.ageInput}
                  placeholder="最大年龄"
                  keyboardType="number-pad"
                  value={ageRange.max}
                  onChangeText={(value) => setAgeRange(prev => ({ ...prev, max: value }))}
                />
              </View>
              
              {/* 性别选择 */}
              <Text style={styles.filterSectionTitle}>性别选择</Text>
              <View style={styles.buttonGroup}>
                {[
                  {value: 'm', label: '男'},
                  {value: 'f', label: '女'},
                  {value: 'b', label: '双性'}
                ].map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      advancedOptions.sex === option.value && styles.selectedOptionButton
                    ]}
                    onPress={() => {
                      advancedOptions.sex === option.value
                        ? updateAdvancedOption('sex', undefined)
                        : updateAdvancedOption('sex', option.value)
                    }}
                  >
                    <Text style={[
                      styles.optionButtonText,
                      advancedOptions.sex === option.value && styles.selectedOptionButtonText
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* VN过滤器选择 */}
              <View style={styles.switchContainer}>
                <Text style={styles.filterSectionTitle}>高分VN过滤</Text>
                <Switch
                  value={useVNFilter}
                  onValueChange={setUseVNFilter}
                  trackColor={{ false: '#767577', true: '#bfe8ff' }}
                  thumbColor={useVNFilter ? '#007bff' : '#f4f3f4'}
                />
              </View>
              {useVNFilter && (
                <Text style={styles.vnFilterHint}>
                  将筛选评分大于5.0，有详细描述，且原始语言为日语或中文的VN中的角色
                </Text>
              )}
            </View>
          )}
          
          {queryType !== 'advanced' && (
            <>
              <TouchableOpacity 
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced(!showAdvanced)}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvanced ? '隐藏高级选项 ▲' : '显示高级选项 ▼'}
                </Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View style={styles.advancedOptions}>
                  <View style={styles.optionRow}>
                    <Text style={styles.optionLabel}>结果数量:</Text>
                    <TextInput
                      style={styles.smallInput}
                      keyboardType="number-pad"
                      value={String(advancedOptions.results || 5)}
                      onChangeText={(value) => updateAdvancedOption('results', parseInt(value) || 5)}
                    />
                  </View>
                  
                  <View style={styles.optionRow}>
                    <Text style={styles.optionLabel}>血型:</Text>
                    <View style={styles.buttonGroup}>
                      {['a', 'b', 'ab', 'o'].map(type => (
                        <TouchableOpacity
                          key={type}
                          style={[
                            styles.optionButton,
                            advancedOptions.bloodType === type && styles.selectedOptionButton
                          ]}
                          onPress={() => {
                            advancedOptions.bloodType === type
                              ? updateAdvancedOption('bloodType', undefined)
                              : updateAdvancedOption('bloodType', type)
                          }}
                        >
                          <Text style={[
                            styles.optionButtonText,
                            advancedOptions.bloodType === type && styles.selectedOptionButtonText
                          ]}>
                            {type.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  
                  <View style={styles.optionRow}>
                    <Text style={styles.optionLabel}>性别:</Text>
                    <View style={styles.buttonGroup}>
                      {[
                        {value: 'm', label: '男'},
                        {value: 'f', label: '女'},
                        {value: 'b', label: '双性'}
                      ].map(option => (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.optionButton,
                            advancedOptions.sex === option.value && styles.selectedOptionButton
                          ]}
                          onPress={() => {
                            advancedOptions.sex === option.value
                              ? updateAdvancedOption('sex', undefined)
                              : updateAdvancedOption('sex', option.value)
                          }}
                        >
                          <Text style={[
                            styles.optionButtonText,
                            advancedOptions.sex === option.value && styles.selectedOptionButtonText
                          ]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              )}
            </>
          )}

          <TouchableOpacity 
            style={styles.queryButton} 
            onPress={handleQuery}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.queryButtonText}>查询</Text>
            )}
          </TouchableOpacity>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.resultsContainer}>
            <View style={styles.resultHeader}>
              <Text style={styles.sectionTitle}>
                查询结果 ({results.length})
              </Text>
              
              <View style={styles.resultActions}>
                {results.length > 0 && (
                  <TouchableOpacity 
                    style={styles.saveButton} 
                    onPress={saveResultsToJson}
                    disabled={isSaving}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <Text style={styles.saveButtonText}>保存结果</Text>
                    )}
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity 
                  style={styles.clearButton} 
                  onPress={clearResultFiles}
                  disabled={isClearing}
                >
                  {isClearing ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.clearButtonText}>清空JSON</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            
            <ScrollView style={styles.resultsList}>
              {results.length > 0 ? (
                results.map((character, index) => renderCharacterResult(character, index))
              ) : (
                !isLoading && !error && (
                  <Text style={styles.emptyText}>尚无查询结果</Text>
                )
              )}
            </ScrollView>
          </View>

          <View style={styles.logContainer}>
            <Text style={styles.sectionTitle}>操作日志</Text>
            <ScrollView style={styles.logScroll}>
              {logMessages.map((log, index) => (
                <Text key={index} style={styles.logMessage}>{log}</Text>
              ))}
              {logMessages.length === 0 && (
                <Text style={styles.emptyText}>尚无日志记录</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  queryTypeSelector: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  queryTypeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#eee',
  },
  activeQueryType: {
    borderBottomColor: '#007bff',
  },
  queryTypeText: {
    color: '#666',
  },
  activeQueryTypeText: {
    color: '#007bff',
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 15,
    fontSize: 16,
  },
  advancedToggle: {
    alignItems: 'center',
    marginBottom: 10,
  },
  advancedToggleText: {
    color: '#007bff',
    fontSize: 14,
  },
  advancedOptions: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  optionLabel: {
    width: 80,
    fontSize: 14,
  },
  smallInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    width: 60,
    textAlign: 'center',
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 5,
  },
  selectedOptionButton: {
    backgroundColor: '#007bff',
  },
  optionButtonText: {
    color: '#666',
    fontSize: 14,
  },
  selectedOptionButtonText: {
    color: 'white',
  },
  queryButton: {
    backgroundColor: '#007bff',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  queryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  errorText: {
    color: '#d32f2f',
  },
  resultsContainer: {
    flex: 1,
    marginBottom: 10,
    maxHeight: '30%',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  resultsList: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
  },
  resultItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#007bff',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  resultSubtext: {
    color: '#666',
    fontSize: 12,
    marginBottom: 5,
  },
  resultDescription: {
    color: '#333',
    fontSize: 14,
    marginBottom: 5,
  },
  resultInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 5,
  },
  resultInfoItem: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 5,
    fontSize: 12,
  },
  logContainer: {
    maxHeight: '25%',
  },
  logScroll: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
  },
  logMessage: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    padding: 10,
    fontStyle: 'italic',
  },
  imageContainer: {
    marginVertical: 5,
  },
  vnsContainer: {
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 8,
  },
  saveButton: {
    backgroundColor: '#28a745',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  clearButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  advancedFiltersContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  filterSectionTitle: {
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 8,
    color: '#333',
  },
  traitInputContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  traitInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 10,
  },
  addTraitButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 15,
    justifyContent: 'center',
    borderRadius: 8,
  },
  addTraitButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  traitsContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    maxHeight: 40,
  },
  traitTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e1f5fe',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    marginRight: 8,
    marginBottom: 8,
  },
  traitTagText: {
    fontSize: 12,
    color: '#0277bd',
    marginRight: 5,
  },
  removeTraitButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#b3e5fc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeTraitButtonText: {
    color: '#01579b',
    fontSize: 12,
    fontWeight: 'bold',
  },
  ageRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  ageInput: {
    width: 80,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
  },
  ageRangeSeparator: {
    marginHorizontal: 10,
    color: '#666',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  vnFilterHint: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 15,
  }
});

export default VNDBTestModal;