import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { theme } from '@/constants/theme';

interface VoiceSelectorProps {
  selectedGender: 'male' | 'female';
  selectedTemplate: string | null;
  onSelectGender: (gender: 'male' | 'female') => void;
  onSelectTemplate: (templateId: string) => void;
}

interface VoiceTemplate {
  id: string;
  gender: 'male' | 'female';
  isLoading: boolean;
  error: string | null;
}

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ 
  selectedGender, 
  selectedTemplate, 
  onSelectGender,
  onSelectTemplate 
}) => {
  const [templates, setTemplates] = useState<VoiceTemplate[]>([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingTemplateId, setPlayingTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize audio
  useEffect(() => {
    return sound
      ? () => {
          console.log('Unloading Sound');
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  // Load templates based on gender selection
  useEffect(() => {
    loadTemplates(selectedGender);
  }, [selectedGender]);

  const loadTemplates = (gender: 'male' | 'female') => {
    setIsLoading(true);
    
    try {
      // Define template IDs based on gender
      const templateIds = gender === 'male' 
        ? ['template1', 'template2', 'template3', 'template4', 'template5', 'template6', 'template7', 'template8', 'template9'] 
        : ['template1a', 'template2a', 'template3a', 'template4a', 'template5a', 'template6a', 'template7a', 'template8a'];
      
      // Create templates with their IDs
      const loadedTemplates = templateIds.map(id => {
        return {
          id: id,
          gender,
          isLoading: false,
          error: null
        };
      });
      
      setTemplates(loadedTemplates);
    } catch (error) {
      console.error('Error loading voice templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const playSound = async (templateId: string) => {
    // Stop currently playing sound
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    
    try {
      setPlayingTemplateId(templateId);
      
      // Determine audio file path based on gender and template ID
      let audioSource;
      
      try {
        // This will throw an error if the asset doesn't exist
        if (templateId.endsWith('a')) {
          // Female templates
          switch(templateId) {
            case 'template1a': audioSource = require('@/assets/tts-audio/templates/female/template1a/source_audio.mp3'); break;
            case 'template2a': audioSource = require('@/assets/tts-audio/templates/female/template2a/source_audio.mp3'); break;
            case 'template3a': audioSource = require('@/assets/tts-audio/templates/female/template3a/source_audio.mp3'); break;
            case 'template4a': audioSource = require('@/assets/tts-audio/templates/female/template4a/source_audio.mp3'); break;
            case 'template5a': audioSource = require('@/assets/tts-audio/templates/female/template5a/source_audio.mp3'); break;
            case 'template6a': audioSource = require('@/assets/tts-audio/templates/female/template6a/source_audio.mp3'); break;
            case 'template7a': audioSource = require('@/assets/tts-audio/templates/female/template7a/source_audio.mp3'); break;
            case 'template8a': audioSource = require('@/assets/tts-audio/templates/female/template8a/source_audio.mp3'); break;
            default: throw new Error('Audio file not found');
          }
        } else {
          // Male templates
          switch(templateId) {
            case 'template1': audioSource = require('@/assets/tts-audio/templates/male/template1/source_audio.mp3'); break;
            case 'template2': audioSource = require('@/assets/tts-audio/templates/male/template2/source_audio.mp3'); break;
            case 'template3': audioSource = require('@/assets/tts-audio/templates/male/template3/source_audio.mp3'); break;
            case 'template4': audioSource = require('@/assets/tts-audio/templates/male/template4/source_audio.mp3'); break;
            case 'template5': audioSource = require('@/assets/tts-audio/templates/male/template5/source_audio.mp3'); break;
            case 'template6': audioSource = require('@/assets/tts-audio/templates/male/template6/source_audio.mp3'); break;
            case 'template7': audioSource = require('@/assets/tts-audio/templates/male/template7/source_audio.mp3'); break;
            case 'template8': audioSource = require('@/assets/tts-audio/templates/male/template8/source_audio.mp3'); break;
            case 'template9': audioSource = require('@/assets/tts-audio/templates/male/template9/source_audio.mp3'); break;
            default: throw new Error('Audio file not found');
          }
        }
      } catch (error) {
        console.warn(`Audio file not found for ${templateId}:`, error);
        setPlayingTemplateId(null);
        return;
      }
      
      // Load and play sound using the direct asset reference
      const { sound: newSound } = await Audio.Sound.createAsync(
        audioSource,
        { shouldPlay: true }
      );
      
      setSound(newSound);
      
      // When sound finishes playing
      newSound.setOnPlaybackStatusUpdate(status => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingTemplateId(null);
        }
      });
    } catch (error) {
      console.error('Error playing sound:', error);
      setPlayingTemplateId(null);
    }
  };

  const renderTemplateItem = ({ item }: { item: VoiceTemplate }) => {
    const isSelected = selectedTemplate === item.id;
    const isPlaying = playingTemplateId === item.id;
    
    // Format the display name
    const displayNumber = item.id.replace(/template/i, '').replace(/a$/, '');
    
    return (
      <TouchableOpacity
        style={[
          styles.templateItem,
          isSelected && styles.selectedTemplateItem
        ]}
        onPress={() => onSelectTemplate(item.id)}
      >
        <View style={styles.templateContent}>
          <Text style={[
            styles.templateTitle,
            isSelected && styles.selectedTemplateTitle
          ]}>
            声音 {displayNumber}
          </Text>
          
          {/* Play button with headphones icon */}
          <TouchableOpacity
            style={[
              styles.playButton,
              isPlaying && styles.playingButton
            ]}
            onPress={() => playSound(item.id)}
            disabled={isPlaying}
          >
            {isPlaying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons 
                name="headset-outline" 
                size={20} 
                color={isSelected ? "#fff" : "#aaa"} 
              />
            )}
          </TouchableOpacity>
        </View>
        
        {/* Selection indicator */}
        {isSelected && (
          <View style={styles.checkmarkContainer}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      
      {/* Gender selection */}
      <View style={styles.genderSelector}>
        <TouchableOpacity
          style={[
            styles.genderButton,
            selectedGender === 'male' && styles.selectedGender
          ]}
          onPress={() => onSelectGender('male')}
        >
          <Ionicons 
            name="male" 
            size={20} 
            color={selectedGender === 'male' ? '#fff' : '#aaa'} 
          />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.genderButton,
            selectedGender === 'female' && styles.selectedGender
          ]}
          onPress={() => onSelectGender('female')}
        >
          <Ionicons 
            name="female" 
            size={20} 
            color={selectedGender === 'female' ? '#fff' : '#aaa'} 
          />
        </TouchableOpacity>
      </View>
      
      {/* Template list */}
      <View style={styles.templateListContainer}>
        <Text style={styles.listTitle}>选择声音样本</Text>
        
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>正在加载声音样本...</Text>
          </View>
        ) : templates.length === 0 ? (
          <Text style={styles.emptyText}>未找到声音样本</Text>
        ) : (
          <FlatList
            data={templates}
            renderItem={renderTemplateItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.templateList}
          />
        )}
      </View>
      
      {/* Selected voice information */}
      {selectedTemplate && (
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedInfoText}>
            已选择: {selectedGender === 'male' ? '男性' : '女性'}声线 - 
            声音 {selectedTemplate.replace(/template/i, '').replace(/a$/, '')}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 16,
  },
  genderSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    marginHorizontal: 4,
  },
  selectedGender: {
    backgroundColor: theme.colors.primaryDark,
  },
  genderText: {
    color: '#aaa',
    marginLeft: 8,
  },
  selectedGenderText: {
    color: '#black',
    fontWeight: 'bold',
  },
  templateListContainer: {
    flex: 1,
    marginTop: 16,
  },
  listTitle: {
    fontSize: 12,
    color: theme.colors.text,
    marginBottom: 12,
  },
  templateList: {
    paddingBottom: 16,
  },
  templateItem: {
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  selectedTemplateItem: {
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
    borderColor: theme.colors.primary,
  },
  templateContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  templateTitle: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  selectedTemplateTitle: {
    color: theme.colors.primary,
  },
  playButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 18,
  },
  playingButton: {
    backgroundColor: theme.colors.primaryDark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  loadingText: {
    color: theme.colors.textSecondary,
    marginTop: 16,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 32,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
  selectedInfo: {
    backgroundColor: 'rgba(224, 196, 168, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  selectedInfoText: {
    color: theme.colors.primary,
    textAlign: 'center',
  },
});

export default VoiceSelector;
