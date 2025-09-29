import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import bytesToSize from '@/utils/bytesToSize';

interface StorageItem {
  key: string;
  size: number;
  selected?: boolean;
  value?: string;
}

const StorageManager = () => {
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalSize, setTotalSize] = useState(0);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');
  const [isViewingItem, setIsViewingItem] = useState(false);
  const [currentItem, setCurrentItem] = useState<StorageItem | null>(null);
  const router = useRouter();

  const loadStorageData = useCallback(async () => {
    setLoading(true);
    try {
      // Get all keys
      const keys = await AsyncStorage.getAllKeys();
      let storageItems: StorageItem[] = [];
      let total = 0;

      // Get values and sizes for each key
      for (const key of keys) {
        try {
          const value = await AsyncStorage.getItem(key);
          const size = value ? new Blob([value]).size : 0;
          storageItems.push({ key, size, value: value ?? undefined });
          total += size;
        } catch (error) {
          console.error(`Error loading key ${key}:`, error);
          storageItems.push({ key, size: 0, value: 'Error loading data' });
        }
      }

      // Sort by size (largest first)
      storageItems.sort((a, b) => b.size - a.size);
      setItems(storageItems);
      setTotalSize(total);
    } catch (error) {
      console.error('Error loading AsyncStorage data:', error);
      Alert.alert('错误', '无法加载存储数据');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorageData();
  }, [loadStorageData]);

  const toggleSelectItem = (key: string) => {
    if (selectedItems.includes(key)) {
      setSelectedItems(selectedItems.filter(k => k !== key));
    } else {
      setSelectedItems([...selectedItems, key]);
    }
  };

  const selectAll = () => {
    const filteredKeys = items
      .filter(item => item.key.toLowerCase().includes(filterText.toLowerCase()))
      .map(item => item.key);
    setSelectedItems(filteredKeys);
  };

  const clearSelection = () => {
    setSelectedItems([]);
  };

  const viewItemContent = async (item: StorageItem) => {
    try {
      setCurrentItem(item);
      setIsViewingItem(true);
    } catch (error) {
      console.error('Error viewing item content:', error);
      Alert.alert('错误', '无法查看内容');
    }
  };

  const deleteSelectedItems = async () => {
    if (selectedItems.length === 0) return;

    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${selectedItems.length} 项内容吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          onPress: async () => {
            setLoading(true);
            try {
              await Promise.all(selectedItems.map(key => AsyncStorage.removeItem(key)));
              setSelectedItems([]);
              await loadStorageData(); // Reload data after deletion
            } catch (error) {
              console.error('Error deleting items:', error);
              Alert.alert('错误', '删除时遇到问题');
            } finally {
              setLoading(false);
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: StorageItem }) => {
    // Skip items that don't match the filter
    if (filterText && !item.key.toLowerCase().includes(filterText.toLowerCase())) {
      return null;
    }

    const isSelected = selectedItems.includes(item.key);

    return (
      <TouchableOpacity
        style={[styles.item, isSelected && styles.selectedItem]}
        onPress={() => viewItemContent(item)}
        onLongPress={() => toggleSelectItem(item.key)}
      >
        <View style={styles.itemContainer}>
          <View style={styles.itemHeader}>
            <TouchableOpacity 
              style={styles.checkbox}
              onPress={() => toggleSelectItem(item.key)}
            >
              {isSelected ? 
                <Ionicons name="checkbox" size={22} color={theme.colors.primary} /> : 
                <Ionicons name="square-outline" size={22} color="#888" />
              }
            </TouchableOpacity>
            <Text style={styles.itemKey} numberOfLines={1} ellipsizeMode="middle">
              {item.key}
            </Text>
          </View>
          <View style={styles.itemDetails}>
            <Text style={styles.itemSize}>{bytesToSize(item.size)}</Text>
            <Ionicons name="chevron-forward" size={18} color="#888" />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredItems = filterText 
    ? items.filter(item => item.key.toLowerCase().includes(filterText.toLowerCase()))
    : items;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen 
        options={{ 
          headerTitle: '存储管理器',
          headerRight: () => (
            <TouchableOpacity 
              style={styles.refreshButton} 
              onPress={loadStorageData}
            >
              <Ionicons name="refresh" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          )
        }} 
      />

      {isViewingItem && currentItem ? (
        <View style={styles.itemViewContainer}>
          <View style={styles.itemViewHeader}>
            <Text style={styles.itemViewTitle} numberOfLines={1} ellipsizeMode="middle">
              {currentItem.key}
            </Text>
            <TouchableOpacity onPress={() => setIsViewingItem(false)}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.itemViewSize}>大小: {bytesToSize(currentItem.size)}</Text>
          <View style={styles.itemViewContent}>
            <ScrollView style={styles.valueScroll}>
              <Text style={styles.itemViewValue}>{currentItem.value}</Text>
            </ScrollView>
          </View>
          <View style={styles.itemViewActions}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.deleteButton]} 
              onPress={() => {
                Alert.alert(
                  '确认删除',
                  `确定要删除 ${currentItem.key} 吗？`,
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '删除',
                      onPress: async () => {
                        try {
                          await AsyncStorage.removeItem(currentItem.key);
                          setIsViewingItem(false);
                          loadStorageData();
                        } catch (error) {
                          console.error('Error deleting item:', error);
                          Alert.alert('错误', '删除时遇到问题');
                        }
                      },
                      style: 'destructive'
                    }
                  ]
                );
              }}
            >
              <Ionicons name="trash" size={18} color="#fff" />
              <Text style={styles.actionButtonText}>删除</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          <View style={styles.searchContainer}>
            <View style={styles.searchWrapper}>
              <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="搜索键名..."
                placeholderTextColor="#888"
                value={filterText}
                onChangeText={setFilterText}
              />
              {filterText ? (
                <TouchableOpacity onPress={() => setFilterText('')} style={styles.clearButton}>
                  <Ionicons name="close-circle" size={16} color="#888" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.statsContainer}>
            <Text style={styles.statsText}>
              {loading ? '计算中...' : `总计: ${items.length} 项, ${bytesToSize(totalSize)}`}
            </Text>
            {filteredItems.length !== items.length && (
              <Text style={styles.statsText}>
                过滤后: {filteredItems.length} 项
              </Text>
            )}
          </View>

          <View style={styles.selectionToolbar}>
            <TouchableOpacity 
              style={styles.toolbarButton} 
              onPress={selectAll}
              disabled={items.length === 0}
            >
              <Text style={[styles.toolbarButtonText, items.length === 0 && styles.disabledText]}>
                全选
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.toolbarButton} 
              onPress={clearSelection}
              disabled={selectedItems.length === 0}
            >
              <Text style={[styles.toolbarButtonText, selectedItems.length === 0 && styles.disabledText]}>
                取消选择
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.toolbarButton, styles.deleteToolbarButton]} 
              onPress={deleteSelectedItems}
              disabled={selectedItems.length === 0}
            >
              <Text style={[styles.toolbarButtonText, selectedItems.length === 0 && styles.disabledText]}>
                删除 ({selectedItems.length})
              </Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>加载存储数据...</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              renderItem={renderItem}
              keyExtractor={item => item.key}
              style={styles.list}
              contentContainerStyle={items.length === 0 && styles.emptyList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="folder-open-outline" size={64} color="#888" />
                  <Text style={styles.emptyText}>没有存储数据</Text>
                </View>
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: theme.colors.text,
    fontSize: 16,
  },
  clearButton: {
    padding: 4,
  },
  refreshButton: {
    marginRight: 8,
    padding: 4,
  },
  statsContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  statsText: {
    fontSize: 12,
    color: '#aaa',
  },
  selectionToolbar: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  toolbarButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  deleteToolbarButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  toolbarButtonText: {
    color: theme.colors.text,
    fontSize: 14,
  },
  disabledText: {
    color: '#666',
  },
  list: {
    flex: 1,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#888',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: theme.colors.text,
    fontSize: 16,
  },
  item: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedItem: {
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
  },
  itemContainer: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: 8,
  },
  itemKey: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
  },
  itemDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: 30,
  },
  itemSize: {
    fontSize: 14,
    color: '#aaa',
    marginRight: 4,
  },
  itemViewContainer: {
    flex: 1,
    padding: 16,
  },
  itemViewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemViewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    flex: 1,
  },
  itemViewSize: {
    fontSize: 14,
    color: '#aaa',
    marginBottom: 12,
  },
  itemViewContent: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  valueScroll: {
    flex: 1,
  },
  itemViewValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  itemViewActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
  },
  actionButtonText: {
    color: '#fff',
    marginLeft: 4,
    fontWeight: '500',
  },
});

export default StorageManager;
