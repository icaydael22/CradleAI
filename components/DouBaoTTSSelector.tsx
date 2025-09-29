import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import voiceData from '@/assets/data/douBaoVoices.json';

interface Voice {
  name: string;
  voiceType: string;
  timestampSupport: boolean;
  emotions: string[];
  languages: string[];
  scenarios: string[];
  emotionCount: number;
  languageCount?: number;
}

interface DouBaoTTSSelectorProps {
  selectedVoice?: string;
  onSelectVoice: (voiceType: string) => void;
  visible?: boolean;
  onClose?: () => void;
}

const DouBaoTTSSelector: React.FC<DouBaoTTSSelectorProps> = ({
  selectedVoice,
  onSelectVoice,
  visible = true,
  onClose
}) => {
  const [activeCategory, setActiveCategory] = useState<'general' | 'multilang' | 'dialect'>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedVoice, setCheckedVoice] = useState<string | undefined>(selectedVoice);

  const filterVoices = (voices: Voice[]) => {
    if (!searchQuery.trim()) return voices;
    return voices.filter(voice => 
      voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.voiceType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.scenarios.some(scenario => scenario.toLowerCase().includes(searchQuery.toLowerCase())) ||
      voice.emotions.some(emotion => emotion.toLowerCase().includes(searchQuery.toLowerCase())) // 新增情感搜索
    );
  };

  const renderVoiceCard = (voice: Voice) => (
    <TouchableOpacity
      key={voice.voiceType}
      style={[
        styles.voiceCard,
        checkedVoice === voice.voiceType && styles.selectedVoiceCard
      ]}
      activeOpacity={0.8}
      onPress={() => setCheckedVoice(voice.voiceType)}
    >
      <View style={styles.voiceCardHeader}>
        <View style={styles.voiceCardTitle}>
          <Text style={styles.voiceName}>{voice.name}</Text>
          <Text style={styles.voiceType}>{voice.voiceType}</Text>
        </View>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setCheckedVoice(voice.voiceType)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {checkedVoice === voice.voiceType ? (
            <Ionicons name="checkbox" size={22} color={theme.colors.primary} />
          ) : (
            <Ionicons name="square-outline" size={22} color={theme.colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>
      
      <View style={styles.voiceCardContent}>
        {/* Scenarios */}
        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={14} color={theme.colors.info} />
          <Text style={styles.infoLabel}>场景：</Text>
          <Text style={styles.infoText}>{voice.scenarios.join(', ')}</Text>
        </View>

        {/* Emotions */}
        {voice.emotions.length > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="happy-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.infoLabel}>情感：</Text>
            <Text style={styles.infoText} numberOfLines={2}>
              {voice.emotions.slice(0, 3).join(', ')}
              {voice.emotions.length > 3 && ` 等${voice.emotions.length}种`}
            </Text>
          </View>
        )}

        {/* Languages */}
        {voice.languages.length > 0 && (
          <View style={styles.infoRow}>
            <Ionicons name="globe-outline" size={14} color={theme.colors.success} />
            <Text style={styles.infoLabel}>语言：</Text>
            <Text style={styles.infoText} numberOfLines={2}>
              {voice.languages.slice(0, 3).join(', ')}
              {voice.languages.length > 3 && ` 等${voice.languages.length}种`}
            </Text>
          </View>
        )}

        {/* Features */}
        <View style={styles.voiceFeatures}>
          {voice.timestampSupport && (
            <View style={styles.featureBadge}>
              <Ionicons name="time-outline" size={10} color={theme.colors.success} />
              <Text style={styles.featureText}>时间戳</Text>
            </View>
          )}
          {voice.emotions.length > 0 && (
            <View style={styles.featureBadge}>
              <Ionicons name="happy-outline" size={10} color={theme.colors.primary} />
              <Text style={styles.featureText}>{voice.emotions.length}种情感</Text>
            </View>
          )}
          {voice.languages.length > 0 && (
            <View style={styles.featureBadge}>
              <Ionicons name="globe-outline" size={10} color={theme.colors.info} />
              <Text style={styles.featureText}>{voice.languages.length}种语言</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderCategoryContent = () => {
    const categoryData = voiceData[activeCategory];
    const filteredVoices = filterVoices(categoryData.voices);

    return (
      <ScrollView style={styles.categoryContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.categoryDescription}>{categoryData.title}</Text>
        <View style={styles.voicesContainer}>
          {filteredVoices.map(renderVoiceCard)}
        </View>
        {filteredVoices.length === 0 && searchQuery && (
          <View style={styles.noResultsContainer}>
            <Ionicons name="search-outline" size={40} color={theme.colors.textSecondary} />
            <Text style={styles.noResultsText}>未找到匹配的音色</Text>
            <Text style={styles.noResultsSubtext}>请尝试其他关键词或浏览其他分类</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  const content = (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onClose && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onClose}
            >
              <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>豆包TTS音色选择</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.confirmButton,
            !checkedVoice && styles.confirmButtonDisabled
          ]}
          disabled={!checkedVoice}
          onPress={() => {
            if (checkedVoice) {
              onSelectVoice(checkedVoice);
              if (onClose) onClose();
            }
          }}
        >
          <Ionicons 
            name="checkmark-circle" 
            size={18} 
            color={checkedVoice ? theme.colors.primary : theme.colors.textSecondary} 
          />
          <Text style={[
            styles.confirmButtonText,
            !checkedVoice && styles.confirmButtonTextDisabled
          ]}>确认</Text>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索音色名称或场景..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category Tabs */}
      <View style={styles.categoryTabs}>
        <TouchableOpacity
          style={[
            styles.categoryTab,
            activeCategory === 'general' && styles.activeCategoryTab
          ]}
          onPress={() => setActiveCategory('general')}
        >
          <Text style={[
            styles.categoryTabText,
            activeCategory === 'general' && styles.activeCategoryTabText
          ]}>
            通用音色
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.categoryTab,
            activeCategory === 'multilang' && styles.activeCategoryTab
          ]}
          onPress={() => setActiveCategory('multilang')}
        >
          <Text style={[
            styles.categoryTabText,
            activeCategory === 'multilang' && styles.activeCategoryTabText
          ]}>
            多语种
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.categoryTab,
            activeCategory === 'dialect' && styles.activeCategoryTab
          ]}
          onPress={() => setActiveCategory('dialect')}
        >
          <Text style={[
            styles.categoryTabText,
            activeCategory === 'dialect' && styles.activeCategoryTabText
          ]}>
            方言
          </Text>
        </TouchableOpacity>
      </View>

      {/* Category Content */}
      {renderCategoryContent()}
    </View>
  );

  if (onClose) {
    // Full screen modal mode
    return (
      <Modal
        visible={visible}
        transparent={false}
        animationType="slide"
        onRequestClose={onClose}
      >
        {content}
      </Modal>
    );
  }

  // Embedded mode
  return content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    backgroundColor: theme.colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(100, 100, 255, 0.15)',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  confirmButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  confirmButtonText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  confirmButtonTextDisabled: {
    color: theme.colors.textSecondary,
  },
  searchContainer: {
    padding: 12,
    backgroundColor: theme.colors.cardBackground,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    marginLeft: 8,
    fontSize: 14,
    color: theme.colors.text,
  },
  categoryTabs: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 12,
  },
  categoryTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  activeCategoryTab: {
    backgroundColor: 'rgba(100, 100, 255, 0.15)',
  },
  categoryTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.textSecondary,
  },
  activeCategoryTabText: {
    color: theme.colors.primary,
  },
  categoryContent: {
    flex: 1,
    paddingHorizontal: 12,
  },
  categoryDescription: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
  },
  voicesContainer: {
    paddingBottom: 16,
  },
  voiceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedVoiceCard: {
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(100, 100, 255, 0.1)',
  },
  voiceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  voiceCardTitle: {
    flex: 1,
  },
  voiceName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 2,
  },
  voiceType: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  checkbox: {
    marginLeft: 8,
    padding: 2,
  },
  voiceCardContent: {
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 4,
    marginRight: 4,
    minWidth: 32,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.text,
    lineHeight: 16,
  },
  voiceFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  featureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2,
  },
  featureText: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginLeft: 2,
  },
  noResultsContainer: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 16,
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  noResultsSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default DouBaoTTSSelector;
