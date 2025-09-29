import React, { useRef, useState, useEffect, forwardRef, ForwardRefRenderFunction } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  TouchableOpacity,
  Animated,
  FlatList,
  ImageBackground
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CradleCharacter } from '@/shared/types';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Update card dimensions to 9:16 aspect ratio
const ITEM_WIDTH = SCREEN_WIDTH * 0.65;
const ITEM_HEIGHT = ITEM_WIDTH * (16/9);
const SPACING = 10;

interface CradleCharacterCarouselProps {
  characters: CradleCharacter[];
  selectedCharacterId?: string;
  onSelectCharacter: (character: CradleCharacter) => void;
  onFeedCharacter: (characterId: string) => void;
  customRenderItem?: (character: CradleCharacter, isSelected: boolean) => React.ReactElement;
}

// Change to use forwardRef to support ref passing
const CradleCharacterCarousel: ForwardRefRenderFunction<FlatList, CradleCharacterCarouselProps> = (
  {
    characters,
    onSelectCharacter,
    selectedCharacterId,
    onFeedCharacter
  },
  ref
) => {
  const scrollX = useRef(new Animated.Value(0)).current;
  // Only use the internal ref if an external ref isn't provided
  const internalFlatListRef = useRef<FlatList>(null);
  const flatListRef = (ref || internalFlatListRef) as React.RefObject<FlatList>;
  const [activeIndex, setActiveIndex] = useState(0);
  
  // Automatically scroll to the selected character if provided
  useEffect(() => {
    if (selectedCharacterId && characters.length > 0) {
      const index = characters.findIndex(char => char.id === selectedCharacterId);
      if (index !== -1 && flatListRef.current) {
        // Scroll to index safely with delay to ensure component is mounted
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToIndex({ 
              index, 
              animated: true,
              viewOffset: 0,
              viewPosition: 0.5
            });
          }
        }, 100);
      }
    }
  }, [selectedCharacterId, characters]);

  // Handle scroll to index failures
  const handleScrollToIndexFailed = (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    const { index } = info;
    
    // Fallback method - first scroll to a position that's likely to be before the item
    // then try scrolling to the target index again
    const wait = new Promise(resolve => setTimeout(resolve, 10));
    wait.then(() => {
      if (flatListRef.current) {
        // Scroll to beginning
        flatListRef.current.scrollToOffset({ offset: 0, animated: false });
        
        // Wait another tick and scroll to the item
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToIndex({
              index,
              animated: true,
              viewOffset: 0,
              viewPosition: 0.5
            });
          }
        }, 50);
      }
    });
  };

  // Provide explicit item layout dimensions to avoid measurement issues
  const getItemLayout = (data: any, index: number) => ({
    length: ITEM_WIDTH,
    offset: ITEM_WIDTH * index,
    index,
  });

  // Count the number of feeds processed vs total feeds
  const getFeedStats = (character: CradleCharacter) => {
    if (!character.feedHistory) return { total: 0, processed: 0 };
    
    const total = character.feedHistory.length;
    const processed = character.feedHistory.filter(feed => feed.processed).length;
    
    return { total, processed };
  };

  // Get character progress stage
  const getCharacterStage = (character: CradleCharacter) => {
    if (!character.cradle) return 'egg';
    return character.cradle.stage || 'egg';
  };

  // Get Stage Icon
  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'egg':
        return 'egg-outline';
      case 'growing':
        return 'leaf-outline';
      case 'mature':
        return 'flower-outline';
      default:
        return 'egg-outline';
    }
  };

  // Calculate progress color based on stage
  const getProgressColor = (stage: string): readonly [string, string] => {
    switch (stage) {
      case 'egg':
        return ['#FFB74D', '#FF9800'] as const;
      case 'growing':
        return ['#66BB6A', '#4CAF50'] as const;
      case 'mature':
        return ['#5C6BC0', '#3F51B5'] as const;
      default:
        return ['#FFB74D', '#FF9800'] as const;
    }
  };

  // Get default background image if none provided
  const getBackgroundImage = (character: CradleCharacter) => {
    // First try local image path
    if (character.localBackgroundImage) {
      return { uri: character.localBackgroundImage };
    }
    
    // Then try remote image path
    if (character.backgroundImage) {
      return { uri: character.backgroundImage };
    }
    
    // Default background based on stage
    const stage = getCharacterStage(character);
    switch (stage) {
      case 'egg':
        return require('@/assets/images/default-cradle-bg.jpg');
      case 'growing':
        return require('@/assets/images/default-growing-bg.jpg');
      case 'mature':
        return require('@/assets/images/default-mature-bg.jpg');
      default:
        return require('@/assets/images/default-cradle-bg.jpg');
    }
  };

  const renderItem = ({ item, index }: { item: CradleCharacter; index: number }) => {
    // Animation calculations for scaling and opacity
    const inputRange = [
      (index - 2) * ITEM_WIDTH,
      (index - 1) * ITEM_WIDTH,
      index * ITEM_WIDTH,
      (index + 1) * ITEM_WIDTH,
      (index + 2) * ITEM_WIDTH
    ];
    
    const scale = scrollX.interpolate({
      inputRange,
      outputRange: [0.8, 0.9, 1, 0.9, 0.8],
      extrapolate: 'clamp'
    });
    
    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.5, 0.8, 1, 0.8, 0.5],
      extrapolate: 'clamp'
    });
    
    const translateY = scrollX.interpolate({
      inputRange,
      outputRange: [30, 15, 0, 15, 30],
      extrapolate: 'clamp'
    });

    // Character data and stats
    const isSelected = selectedCharacterId === item.id;
    const { total: totalFeeds, processed: processedFeeds } = getFeedStats(item);
    const stage = getCharacterStage(item);
    const progressColors = getProgressColor(stage);
    const progress = item.cradle?.progress || 0;
    
    return (
      <Animated.View
        style={[
          styles.itemContainer,
          {
            transform: [{ scale }, { translateY }],
            opacity
          }
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          style={[
            styles.card,
            isSelected && styles.selectedCard
          ]}
          onPress={() => onSelectCharacter(item)}
        >
          <ImageBackground
            source={getBackgroundImage(item)}
            style={styles.backgroundImage}
            imageStyle={{ borderRadius: 20 }}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.9)']}
              style={styles.cardGradient}
            >
              {/* Remove avatar and position content at the bottom */}
              
              <View style={styles.cardContent}>
                {/* Character Name */}
                <Text style={styles.characterName}>
                  {item.name || '未命名角色'}
                </Text>
                
                {/* Character Stage Indicator */}
                <View style={styles.stageContainer}>
                  <Ionicons
                    name={getStageIcon(stage)}
                    size={18}
                    color="#FFD700"
                    style={styles.stageIcon}
                  />
                  <Text style={styles.stageText}>
                    {stage === 'egg' ? '孵化中' : stage === 'growing' ? '成长中' : '即将完成'}
                  </Text>
                </View>
                
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressBarBg}>
                    <View style={[
                      styles.progressBarContainer,
                      { flexDirection: 'row' }
                    ]}>
                      <LinearGradient
                        colors={progressColors}
                        start={[0, 0]}
                        end={[1, 0]}
                        style={[
                          styles.progressBarFill,
                          { flex: progress }
                        ]}
                      />
                      <View style={{ flex: 100 - progress }} />
                    </View>
                  </View>
                  <Text style={styles.progressText}>{progress}%</Text>
                </View>
                
                {/* Feed Button */}
                <TouchableOpacity 
                  style={styles.feedButton}
                  onPress={() => onFeedCharacter(item.id)}
                >
                  <LinearGradient
                    colors={['#FFD700', '#FFA500']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.feedButtonGradient}
                  >
                    <View style={styles.feedButtonContent}>
                      <Ionicons name="chatbox-outline" size={16} color="#fff" />
                      <Text style={styles.feedButtonText}>
                        {processedFeeds}/{totalFeeds} 投喂
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              
              {/* Selection Indicator - Move to corner */}
              {isSelected && (
                <View style={styles.selectionIndicator}>
                  <Ionicons name="checkmark-circle" size={24} color="#FFD700" />
                </View>
              )}
            </LinearGradient>
          </ImageBackground>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true }
  );

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index);
      const selectedCharacter = viewableItems[0].item;
      if (selectedCharacter && selectedCharacter.id !== selectedCharacterId) {
        onSelectCharacter(selectedCharacter);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50
  }).current;

  // Empty placeholder for when there are no characters
  if (characters.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="egg-outline" size={60} color="#FFD700" />
        <Text style={styles.emptyText}>还没有摇篮角色</Text>
        <Text style={styles.emptySubtext}>创建一个新的摇篮角色开始培育吧</Text>
      </View>
    );
  }

  // 添加keyExtractor确保使用唯一ID
  const keyExtractor = (item: CradleCharacter) => `cradle-character-${item.id}`;

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={characters}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_WIDTH}
        decelerationRate="fast"
        contentContainerStyle={styles.flatListContent}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={getItemLayout}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        removeClippedSubviews={false} // Help with rendering issues
      />
      
      {/* Pagination Dots */}
      {characters.length > 1 && (
        <View style={styles.paginationContainer}>
          {characters.map((_, index) => {
            const inputRange = [
              (index - 1) * ITEM_WIDTH,
              index * ITEM_WIDTH,
              (index + 1) * ITEM_WIDTH
            ];
            
            // Fix animation by using transform scaleX instead of width
            const dotScale = scrollX.interpolate({
              inputRange,
              outputRange: [1, 2, 1],
              extrapolate: 'clamp'
            });
            
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.5, 1, 0.5],
              extrapolate: 'clamp'
            });
            
            return (
              <Animated.View
                key={index}
                style={[
                  styles.paginationDot,
                  {
                    opacity: dotOpacity,
                    transform: [{ scaleX: dotScale }],
                    backgroundColor: index === activeIndex ? '#FFD700' : '#555'
                  }
                ]}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

// Export with forwardRef wrapper
export default forwardRef(CradleCharacterCarousel);

const styles = StyleSheet.create({
  container: {
    height: ITEM_HEIGHT,
    marginTop: 10,
    marginBottom: 20,
  },
  flatListContent: {
    paddingHorizontal: (SCREEN_WIDTH - ITEM_WIDTH) / 2,
    alignItems: 'center',
  },
  itemContainer: {
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT,
    padding: SPACING,
  },
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#222',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  selectedCard: {
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  cardGradient: {
    height: '100%',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  cardContent: {
    padding: 15,
    width: '100%',
  },
  characterName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'left',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  stageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  stageIcon: {
    marginRight: 6,
  },
  stageText: {
    color: '#FFD700',
    fontSize: 14,
    fontWeight: '500',
  },
  progressContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarContainer: {
    width: '100%',
    height: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: 'bold',
  },
  feedButton: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: 8,
  },
  feedButtonGradient: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  feedButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
    marginLeft: 6,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  paginationDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  emptyContainer: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#FFD700',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 10,
  },
  emptySubtext: {
    color: '#999',
    fontSize: 16,
    marginTop: 10,
  }
});
