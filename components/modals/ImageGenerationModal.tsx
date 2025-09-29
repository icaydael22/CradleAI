import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { InputImagen } from '@/services/InputImagen';
import { Character } from '@/shared/types';

interface ImageGenerationModalProps {
  visible: boolean;
  onClose: () => void;
  onGenerate: (imageId: string, prompt: string) => void;
  selectedCharacter: Character;
}

export const ImageGenerationModal: React.FC<ImageGenerationModalProps> = ({
  visible,
  onClose,
  onGenerate,
  selectedCharacter,
}) => {
  const [imagePrompt, setImagePrompt] = useState<string>('');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState<string>('');
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [customSeed, setCustomSeed] = useState<string>('');
  const [useSeed, setUseSeed] = useState<boolean>(false);
  const [novelAIConfig, setNovelAIConfig] = useState<any>(null);
  const [allPositiveTags, setAllPositiveTags] = useState<string[]>([]);

  React.useEffect(() => {
    if (visible && selectedCharacter) {
      // Load NovelAI configuration from character
      const config = InputImagen.getNovelAIConfig(selectedCharacter);
      setNovelAIConfig(config);
      setAllPositiveTags(config.positiveTags);

      // Set initial seed value
      if (config.seed !== undefined) {
        setCustomSeed(config.seed.toString());
        setUseSeed(true);
      } else {
        setCustomSeed(Math.floor(Math.random() * 2 ** 32).toString());
        setUseSeed(false);
      }
    }
  }, [visible, selectedCharacter]);

  const handleClose = () => {
    setImagePrompt('');
    setAiGeneratedPrompt('');
    onClose();
  };

  const handleGenerateAIPrompt = async () => {
    if (!selectedCharacter?.id) {
      Alert.alert('错误', '请先选择一个角色');
      return;
    }
    
    try {
      setIsGeneratingPrompt(true);
      const sceneDescription = await InputImagen.generateSceneDescription(selectedCharacter.id);
      
      if (sceneDescription) {
        setAiGeneratedPrompt(sceneDescription);
        setImagePrompt(prev => {
          const currentPrompt = prev.trim();
          if (currentPrompt) {
            return currentPrompt + ', ' + sceneDescription;
          } else {
            return sceneDescription;
          }
        });
      } else {
        Alert.alert('提示', '无法生成场景描述，请手动输入提示词');
      }
    } catch (e) {
      console.error('[ImageGenerationModal] Error generating scene description:', e);
      Alert.alert('错误', '生成场景描述失败，请手动输入提示词');
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const generateRandomSeed = () => {
    const randomSeed = Math.floor(Math.random() * 2 ** 32);
    setCustomSeed(randomSeed.toString());
  };

  const handleImageGeneration = async () => {
    if (!imagePrompt.trim()) {
      Alert.alert('错误', '请输入图像生成提示词');
      return;
    }

    try {
      setIsGeneratingImage(true);
      
      const userCustomSeed = useSeed && customSeed ? parseInt(customSeed, 10) : undefined;
      console.log('[ImageGenerationModal] Generating image with seed:', userCustomSeed);

      const result = await InputImagen.generateImage(
        novelAIConfig,
        imagePrompt,
        userCustomSeed
      );

      if (result.success && result.imageId) {
        console.log(`[ImageGenerationModal] Image generated successfully with ID: ${result.imageId}`);
        onGenerate(result.imageId, imagePrompt);
        
        setTimeout(() => {
          handleClose();
        }, 500);
      } else {
        Alert.alert('错误', `生成图片失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Error generating image:', error);
      Alert.alert('错误', '生成图片时出现了错误，请重试。');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>生成图片</Text>
          
          {novelAIConfig && (
            <View style={styles.configInfoContainer}>
              <Text style={styles.configInfoText}>
                使用角色设置: {novelAIConfig.model}, {novelAIConfig.sizePreset?.width}x{novelAIConfig.sizePreset?.height}
              </Text>
              {allPositiveTags && allPositiveTags.length > 0 && (
                <Text style={[styles.configInfoText, { marginTop: 4, color: '#b3e5fc', fontSize: 12 }]}>
                  正向提示词: {allPositiveTags.join(', ')}
                </Text>
              )}
            </View>
          )}
          
          <TextInput
            style={[styles.urlInput, { height: 100 }]}
            placeholder="描述你想要生成的图片..."
            placeholderTextColor="#999"
            value={imagePrompt}
            onChangeText={setImagePrompt}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          
          <View style={styles.promptActionsContainer}>
            <TouchableOpacity 
              style={[
                styles.autoPromptButton,
                isGeneratingPrompt && styles.disabledButton
              ]}
              onPress={handleGenerateAIPrompt}
              disabled={isGeneratingPrompt}
            >
              {isGeneratingPrompt ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={16} color="#fff" style={{ marginRight: 5 }} />
                  <Text style={styles.autoPromptText}>自动提示词</Text>
                </>
              )}
            </TouchableOpacity>
            
            {aiGeneratedPrompt ? (
              <Text style={styles.aiPromptText}>
                AI提示: {aiGeneratedPrompt}
              </Text>
            ) : null}
          </View>
          
          <View style={styles.seedContainer}>
            <View style={styles.seedToggleRow}>
              <Text style={styles.seedLabel}>Seed:</Text>
              <Switch
                value={useSeed}
                onValueChange={setUseSeed}
                trackColor={{ false: "#5a5a5a", true: "#81b0ff" }}
                thumbColor={useSeed ? "#2196F3" : "#c4c4c4"}
              />
            </View>
            
            {useSeed && (
              <View style={styles.seedInputRow}>
                <TextInput
                  style={styles.seedInput}
                  placeholder="输入种子值"
                  placeholderTextColor="#999"
                  value={customSeed}
                  onChangeText={setCustomSeed}
                  keyboardType="numeric"
                />
                <TouchableOpacity style={styles.randomSeedButton} onPress={generateRandomSeed}>
                  <Ionicons name="dice" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
          
          <View style={styles.modalButtons}>
            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={handleClose}
            >
              <Text style={styles.modalButtonText}>取消</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[
                styles.modalButton, 
                styles.modalButtonPrimary,
                isGeneratingImage && styles.disabledButton
              ]}
              onPress={handleImageGeneration}
              disabled={isGeneratingImage}
            >
              {isGeneratingImage ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.submitButtonText, { color: 'black' }]}>
                  生成
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#333',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  urlInput: {
    backgroundColor: '#444',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#555',
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: theme.colors.primary,
  },
  modalButtonText: {
    color: '#ddd',
    fontWeight: 'bold',
  },
  submitButtonText: {
    color: 'black',
    fontWeight: 'bold',
  },
  disabledButton: {
    opacity: 0.5,
  },
  configInfoContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.8)',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  configInfoText: {
    color: '#ddd',
    fontSize: 13,
  },
  promptActionsContainer: {
    marginBottom: 12,
  },
  autoPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8e44ad',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  autoPromptText: {
    color: '#fff',
    fontWeight: '500',
  },
  aiPromptText: {
    color: '#ddd',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 5,
    padding: 6,
    backgroundColor: 'rgba(40, 40, 40, 0.6)',
    borderRadius: 4,
  },
  seedContainer: {
    marginBottom: 20,
  },
  seedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  seedLabel: {
    color: '#ddd',
    fontSize: 14,
  },
  seedInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seedInput: {
    backgroundColor: '#444',
    color: '#fff',
    flex: 1,
    borderRadius: 6,
    padding: 8,
    marginRight: 8,
  },
  randomSeedButton: {
    backgroundColor: '#555',
    padding: 9,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ImageGenerationModal;