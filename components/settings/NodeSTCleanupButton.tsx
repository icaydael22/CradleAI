import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';

interface NodeSTCleanupButtonProps {
  onCleanupComplete?: () => void;
  style?: object;
}

export const NodeSTCleanupButton: React.FC<NodeSTCleanupButtonProps> = ({ onCleanupComplete, style }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleCleanup = async () => {
    Alert.alert(
      "清理NodeST数据",
      "此操作将删除所有角色对话历史和设定数据，无法恢复。是否继续？",
      [
        {
          text: "取消",
          style: "cancel"
        },
        {
          text: "确认清理",
          style: "destructive",
          onPress: performCleanup
        }
      ],
      { cancelable: true }
    );
  };

  const performCleanup = async () => {
    try {
      setIsLoading(true);

      // 获取所有存储键
      const keys = await AsyncStorage.getAllKeys();
      
      // 筛选出NodeST相关的键
      const nodestKeys = keys.filter(key => key.startsWith('nodest_'));
      
      if (nodestKeys.length > 0) {
        // 删除所有NodeST相关数据
        await AsyncStorage.multiRemove(nodestKeys);
        console.log(`已清理 ${nodestKeys.length} 项NodeST数据`);
        Alert.alert("清理完成", `已成功清理 ${nodestKeys.length} 项数据。`);
      } else {
        Alert.alert("清理完成", "没有找到需要清理的NodeST数据。");
      }

      if (onCleanupComplete) {
        onCleanupComplete();
      }
    } catch (error) {
      console.error("清理NodeST数据时发生错误:", error);
      Alert.alert("清理失败", "清理数据时出错，请重试。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.button, style]} 
      onPress={handleCleanup}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <View style={styles.buttonContent}>
          <MaterialIcons name="cleaning-services" size={20} color="#fff" />
          <Text style={styles.buttonText}>清理所有角色数据</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#ff4757',
    padding: 12,
    borderRadius: 8,
    marginVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
});
