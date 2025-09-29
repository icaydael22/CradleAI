import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { GEMINI_TTS_VOICES } from '@/app/data/ttsVoices';

interface GeminiTTSSelectorProps {
  selectedVoice?: string;
  onSelectVoice: (voiceName: string) => void;
  visible?: boolean;
  onClose?: () => void;
}

const GeminiTTSSelector: React.FC<GeminiTTSSelectorProps> = ({
  selectedVoice,
  onSelectVoice,
  visible = true,
  onClose
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [checkedVoice, setCheckedVoice] = useState<string | undefined>(selectedVoice);

  const filteredVoices = GEMINI_TTS_VOICES.filter(voice => 
    voice.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    voice.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectVoice = (voiceName: string) => {
    setCheckedVoice(voiceName);
    onSelectVoice(voiceName);
  };

  const renderVoiceCard = (voice: typeof GEMINI_TTS_VOICES[0]) => {
    const isSelected = checkedVoice === voice.name;
    
    return (
      <TouchableOpacity
        key={voice.name}
        style={[
          styles.voiceCard,
          isSelected && styles.selectedVoiceCard
        ]}
        onPress={() => handleSelectVoice(voice.name)}
      >
        <View style={styles.voiceCardContent}>
          <View style={styles.voiceHeader}>
            <Text style={[
              styles.voiceName,
              isSelected && styles.selectedVoiceName
            ]}>
              {voice.name}
            </Text>
            {isSelected && (
              <Ionicons 
                name="checkmark-circle" 
                size={20} 
                color={theme.colors.primary} 
              />
            )}
          </View>
          <Text style={[
            styles.voiceDescription,
            isSelected && styles.selectedVoiceDescription
          ]}>
            {voice.description}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const content = (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>选择 Gemini TTS 声音</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜索声音..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.voiceCount}>
        {filteredVoices.length} 个声音可用
      </Text>

      <ScrollView 
        style={styles.voiceList}
        showsVerticalScrollIndicator={false}
      >
        {filteredVoices.map(renderVoiceCard)}
      </ScrollView>
    </View>
  );

  if (onClose) {
    // Modal mode
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={onClose}
      >
        {content}
      </Modal>
    );
  }

  // Inline mode
  return content;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
  },
  closeButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text,
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
  },
  voiceCount: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  voiceList: {
    flex: 1,
  },
  voiceCard: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  selectedVoiceCard: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryTransparent,
  },
  voiceCardContent: {
    padding: 16,
  },
  voiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  voiceName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  selectedVoiceName: {
    color: theme.colors.primary,
  },
  voiceDescription: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  selectedVoiceDescription: {
    color: theme.colors.primary,
  },
});

export default GeminiTTSSelector;
