import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCharacters } from '@/constants/CharactersContext';

interface CradleStatusBadgeProps {
  characterId: string;
  compact?: boolean;
}

/**
 * 显示角色在摇篮系统中的状态徽标
 * 在角色详情页和列表中可以使用此组件
 */
const CradleStatusBadge: React.FC<CradleStatusBadgeProps> = ({ characterId, compact = false }) => {
  const { getCradleCharacters, getCradleSettings } = useCharacters();
  
  // 检查角色是否在摇篮系统中
  const cradleCharacters = getCradleCharacters();
  const cradleCharacter = cradleCharacters.find(
    char => char.importedFromCharacter && char.importedCharacterId === characterId
  );
  
  // 如果角色不在摇篮系统中，不显示任何内容
  if (!cradleCharacter) {
    return null;
  }
  
  // 计算培育进度
  const cradleSettings = getCradleSettings();
  let progress = 0;
  let daysRemaining = 0;
  
  if (cradleSettings.enabled && cradleSettings.startDate) {
    const startDate = new Date(cradleSettings.startDate);
    const currentDate = new Date();
    const elapsedDays = (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const totalDuration = cradleSettings.duration || 7;
    
    progress = Math.min(Math.round((elapsedDays / totalDuration) * 100), 100);
    daysRemaining = Math.max(0, totalDuration - elapsedDays);
  }
  
  // 紧凑模式，只显示图标和简短状态
  if (compact) {
    return (
      <View style={styles.compactBadge}>
        <Ionicons 
          name="leaf" 
          size={14} 
          color={cradleSettings.enabled ? "#4CAF50" : "#FFC107"} 
        />
        <Text style={styles.compactText}>
          培育中 {progress}%
        </Text>
      </View>
    );
  }
  
  // 完整显示模式
  return (
    <View style={styles.container}>
      <View style={styles.badgeHeader}>
        <View style={styles.iconContainer}>
          <Ionicons 
            name="leaf" 
            size={18} 
            color={cradleSettings.enabled ? "#4CAF50" : "#FFC107"} 
          />
        </View>
        <Text style={styles.title}>摇篮培育中</Text>
      </View>
      
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${progress}%` }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>{progress}%</Text>
      </View>
      
      <Text style={styles.statusText}>
        {cradleSettings.enabled 
          ? (progress >= 100 
            ? "已完成培育，可应用更新" 
            : `还需约 ${daysRemaining.toFixed(1)} 天完成`) 
          : "摇篮系统已暂停"}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#4A90E2',
  },
  badgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(74, 144, 226, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    marginRight: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4A90E2',
    borderRadius: 3,
  },
  progressText: {
    width: 36,
    fontSize: 12,
    color: '#ccc',
    textAlign: 'right',
  },
  statusText: {
    fontSize: 13,
    color: '#aaa',
  },
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 12,
  },
  compactText: {
    fontSize: 12,
    color: '#ccc',
    marginLeft: 4,
  },
});

export default CradleStatusBadge;
