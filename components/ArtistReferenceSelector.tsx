import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import artistData from '@/app/data/v4-artist.json';
import { Ionicons } from '@expo/vector-icons';

// Get screen dimensions for responsive layout
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEMS_PER_ROW = 2;
const ITEM_MARGIN = 8;
const ITEM_WIDTH = (SCREEN_WIDTH - 32 - (ITEM_MARGIN * 2 * ITEMS_PER_ROW)) / ITEMS_PER_ROW;

interface ArtistImage {
  image_filename: string;
  artist_prompt: string;
  gender: string;
}

interface ArtistReferenceSelectorProps {
  selectedGender: 'male' | 'female' | 'other';
  onSelectArtist: (artistPrompt: string) => void;
  selectedArtistPrompt: string | null;
}

const ArtistReferenceSelector: React.FC<ArtistReferenceSelectorProps> = ({ 
  onSelectArtist,
  selectedArtistPrompt
}) => {
  // Use all artists without filtering by gender
  const allArtists = artistData;

  const handleSelectArtist = (artist: ArtistImage) => {
    onSelectArtist(artist.artist_prompt);
    console.log(`[摇篮角色创建] 选择画师风格: ${artist.artist_prompt}`);
  };

  const clearSelection = () => {
    onSelectArtist('');
    console.log(`[摇篮角色创建] 清除画师风格选择`);
  };

  // 随机选择一个画师风格
  const rollArtist = () => {
    if (allArtists.length === 0) return;
    const idx = Math.floor(Math.random() * allArtists.length);
    const artist = allArtists[idx];
    onSelectArtist(artist.artist_prompt);
    console.log(`[摇篮角色创建] 随机选择画师风格: ${artist.artist_prompt}`);
  };

  // Modified function to directly use the original artist_prompt without extraction
  const getArtistDisplayName = (prompt: string): string => {
    if (!prompt) return '';
    return prompt;
  };

  // Check if an artist is currently selected
  const isSelected = (artist: ArtistImage): boolean => {
    return artist.artist_prompt === selectedArtistPrompt;
  };

  return (
    <SafeAreaView style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        {/* 操作按钮区域 */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={rollArtist}
          >
            <Ionicons name="dice-outline" size={18} color="#ff9f1c" />
            <Text style={styles.actionButtonText}>Roll</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={clearSelection}
          >
            <Ionicons name="close-circle-outline" size={18} color="#aaa" />
            <Text style={styles.actionButtonText}>清除选择</Text>
          </TouchableOpacity>
        </View>

        {/* Display how many styles are available */}
        <Text style={styles.resultCountText}>
          共 {allArtists.length} 个风格参考
        </Text>
        
        <FlatList
          data={allArtists}
          numColumns={2}
          keyExtractor={(item, index) => `artist-${index}-${item.artist_prompt}`}
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[
                styles.artistItemContainer,
                isSelected(item) && styles.selectedArtistContainer
              ]}
              onPress={() => handleSelectArtist(item)}
            >
              <Text style={[
                styles.artistNameText,
                isSelected(item) && styles.selectedArtistText
              ]} numberOfLines={2}>
                {getArtistDisplayName(item.artist_prompt)}
              </Text>
              {isSelected(item) && (
                <View style={styles.selectedIndicator}>
                  <Ionicons name="checkmark-circle" size={16} color="black" />
                </View>
              )}
            </TouchableOpacity>
          )}
          contentContainerStyle={styles.artistList}
          ListEmptyComponent={
            <View style={styles.noItemsContainer}>
              <Text style={styles.noItemsText}>
                没有可用的画风参考
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  // Selected artist styles
  selectedArtistContainer: {
    borderWidth: 2,
    backgroundColor: `#ff9f1c`,
  },
  selectedArtistText: {
    color: 'black',
    fontWeight: 'bold',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  
  noItemsContainer: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noItemsText: {
    color: '#aaa',
    textAlign: 'center',
  },
  
  resultCountText: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
    padding: 8,
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#282828',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
    paddingTop: Platform.OS === 'ios' ? 16 : 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  artistList: {
    padding: 8,
  },
  artistItemContainer: {
    flex: 1,
    margin: ITEM_MARGIN,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#333',
    width: ITEM_WIDTH,
    height: ITEM_WIDTH / 2,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    position: 'relative',
  },
  artistNameText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 8,
    marginRight: 8,
    marginBottom: 0,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  actionButtonText: {
    color: '#ff9f1c',
    fontSize: 13,
    marginLeft: 4,
  },
});

export default ArtistReferenceSelector;
