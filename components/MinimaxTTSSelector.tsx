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
import voiceData from '@/assets/data/voice-type-minimax.json';

interface MinimaxVoice {
  voice_id: string;
  voice_name: string;
  description?: string[];
  created_time?: string;
}

interface MinimaxTTSSelectorProps {
  selectedVoice?: string;
  onSelectVoice: (voiceId: string) => void;
  visible?: boolean;
  onClose?: () => void;
}

const MinimaxTTSSelector: React.FC<MinimaxTTSSelectorProps> = ({
  selectedVoice,
  onSelectVoice,
  visible = true,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedVoice, setCheckedVoice] = useState<string | undefined>(selectedVoice);

  // Filter valid voices (exclude incomplete entries)
  const validVoices = voiceData.system_voice.filter(voice => 
    voice.voice_id && voice.voice_name
  ) as MinimaxVoice[];

  const filterVoices = (voices: MinimaxVoice[]) => {
    if (!searchQuery.trim()) return voices;
    return voices.filter(voice => 
      voice.voice_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      voice.voice_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const filteredVoices = filterVoices(validVoices);

  // Categorize voices by language/type
  const categorizeVoices = (voices: MinimaxVoice[]) => {
    const chinese = voices.filter(voice => 
      /[\u4e00-\u9fff]/.test(voice.voice_name) || 
      voice.voice_id.includes('Chinese')
    );
    const english = voices.filter(voice => 
      !chinese.includes(voice) && 
      !/[\u4e00-\u9fff]/.test(voice.voice_name)
    );
    
    return { chinese, english };
  };

  const { chinese: chineseVoices, english: englishVoices } = categorizeVoices(filteredVoices);

  const renderVoiceCard = (voice: MinimaxVoice) => (
    <TouchableOpacity
      key={voice.voice_id}
      style={[
        styles.voiceCard,
        checkedVoice === voice.voice_id && styles.selectedVoiceCard
      ]}
      activeOpacity={0.8}
      onPress={() => setCheckedVoice(voice.voice_id)}
    >
      <View style={styles.voiceCardHeader}>
        <View style={styles.voiceCardTitle}>
          <Text style={styles.voiceName}>{voice.voice_name}</Text>
          <Text style={styles.voiceId}>{voice.voice_id}</Text>
        </View>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setCheckedVoice(voice.voice_id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {checkedVoice === voice.voice_id ? (
            <Ionicons name="checkbox" size={22} color={theme.colors.primary} />
          ) : (
            <Ionicons name="square-outline" size={22} color={theme.colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderVoiceSection = (title: string, voices: MinimaxVoice[]) => {
    if (voices.length === 0) return null;
    
    return (
      <View style={styles.voiceSection}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.voicesContainer}>
          {voices.map(renderVoiceCard)}
        </View>
      </View>
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
          <Text style={styles.headerTitle}>Minimax音色选择</Text>
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
            placeholder="搜索音色名称..."
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

      {/* Voice List */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderVoiceSection('中文音色', chineseVoices)}
        {renderVoiceSection('English Voices', englishVoices)}
        
        {filteredVoices.length === 0 && searchQuery && (
          <View style={styles.noResultsContainer}>
            <Ionicons name="search-outline" size={40} color={theme.colors.textSecondary} />
            <Text style={styles.noResultsText}>未找到匹配的音色</Text>
            <Text style={styles.noResultsSubtext}>请尝试其他关键词</Text>
          </View>
        )}
      </ScrollView>
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
  content: {
    flex: 1,
    paddingHorizontal: 12,
  },
  voiceSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 12,
    marginTop: 8,
  },
  voicesContainer: {
    gap: 8,
  },
  voiceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 12,
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
  voiceId: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  checkbox: {
    marginLeft: 8,
    padding: 2,
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

export default MinimaxTTSSelector;
