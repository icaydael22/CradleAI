import React, { useCallback, useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Keyboard,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WorldBookEntryUI, PresetEntryUI } from '@/constants/types';

// Enhanced SwipeableEntry component 
interface SwipeableEntryProps {
  children: React.ReactNode;
  onDelete?: () => void;
  disabled?: boolean;
}

const SwipeableEntry: React.FC<SwipeableEntryProps> = ({ 
  children, 
  onDelete, 
  disabled = false
}) => {
  const pan = useRef(new Animated.Value(0)).current;
  const deleteWidth = 80; // Width of delete area
  const screenWidth = Dimensions.get('window').width;
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Use a ref to track current animated value
  const panValueRef = useRef(0);
  
  // Set up a listener to track the animated value
  useEffect(() => {
    const id = pan.addListener(({ value }) => {
      panValueRef.current = value;
    });
    
    return () => {
      pan.removeListener(id);
    };
  }, [pan]);
  
  // Reset swipe position animation
  const resetSwipe = () => {
    Animated.spring(pan, {
      toValue: 0,
      tension: 100,
      friction: 10,
      useNativeDriver: true,
    }).start();
    setIsDeleting(false);
  };

  // Handle delete action (no Alert here, just call onDelete)
  const handleDelete = () => {
    setIsDeleting(true);
    if (onDelete) {
      Animated.timing(pan, {
        toValue: -screenWidth,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        onDelete();
        pan.setValue(0); // Reset value after animation completes
      });
    }
  };

  // Animated background color for delete area
  const deleteBackgroundColor = pan.interpolate({
    inputRange: [-deleteWidth, -deleteWidth/3],
    outputRange: ['#FF3B30', '#FF6B64'],
    extrapolate: 'clamp',
  });
  
  // Animated opacity for delete icon
  const deleteOpacity = pan.interpolate({
    inputRange: [-deleteWidth, -deleteWidth/2, 0],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });
  
  // Animated scale for delete icon
  const deleteScale = pan.interpolate({
    inputRange: [-deleteWidth, -deleteWidth/2, 0],
    outputRange: [1, 0.8, 0.5],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal movements greater than a small threshold
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 20;
      },
      onPanResponderGrant: () => {
        // Reset the animated value
        pan.setOffset(panValueRef.current);
        pan.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow left swipes (negative dx) or right swipes to reset
        if (gestureState.dx <= 0 || panValueRef.current < 0) {
          // Limit maximum left swipe to delete button width
          const newValue = Math.max(gestureState.dx, -deleteWidth);
          pan.setValue(newValue);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        
        if (gestureState.dx < -deleteWidth / 2) {
          // Snap to delete position
          Animated.spring(pan, {
            toValue: -deleteWidth,
            tension: 100,
            friction: 6,
            useNativeDriver: true,
          }).start(() => {
            // Auto trigger delete after slight delay to give visual feedback
            setTimeout(handleDelete, 100);
          });
        } else {
          // Snap back to original position
          resetSwipe();
        }
      },
      onPanResponderTerminate: () => {
        resetSwipe();
      },
    })
  ).current;

  // If disabled or no delete function, just render children
  if (disabled || !onDelete) {
    return <View style={styles.swipeContainer}>{children}</View>;
  }

  return (
    <View style={styles.swipeContainer}>
      {/* Delete action background */}
      <Animated.View
        style={[
          styles.deleteBackground,
          {
            backgroundColor: deleteBackgroundColor,
            right: 0,
            width: deleteWidth,
          }
        ]}
      >
        <Animated.View
          style={{
            opacity: deleteOpacity,
            transform: [{ scale: deleteScale }],
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <Ionicons name="trash-outline" size={24} color="#FFF" />
        </Animated.View>
      </Animated.View>
      
      {/* Main content with swipe animation */}
      <Animated.View
        style={[
          styles.swipeableContent,
          {
            transform: [{ translateX: pan }],
          }
        ]}
        {...(!isDeleting ? panResponder.panHandlers : {})}
      >
        {children}
      </Animated.View>
    </View>
  );
};

// WorldBookSection Component
interface WorldBookSectionProps {
  entries: WorldBookEntryUI[];
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<WorldBookEntryUI>) => void;
  onViewDetail: (
    title: string, 
    content: string,
    onContentChange?: (text: string) => void,
    editable?: boolean,
    entryType?: 'worldbook' | 'preset' | 'author_note',
    entryOptions?: any,
    onOptionsChange?: (options: any) => void,
    name?: string,
    onNameChange?: (text: string) => void,
    entryId?: string // Add entryId parameter
  ) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete?: (id: string) => void;
}

export const WorldBookSection: React.FC<WorldBookSectionProps> = ({
  entries,
  onAdd,
  onUpdate,
  onViewDetail,
  onReorder,
  onDelete
}) => {
  // Add a handler for entry press with delayed execution
  const handleEntryPress = useCallback((entry: WorldBookEntryUI) => {
    // Dismiss keyboard first if it's showing
    Keyboard.dismiss();
    
    // Use setTimeout to ensure touch events are fully processed
    setTimeout(() => {
      onViewDetail(
        entry.name || '世界书条目',
        entry.content,
        (text) => onUpdate(entry.id, { content: text }),
        true,
        'worldbook',
        {
          position: entry.position,
          disable: entry.disable,
          constant: entry.constant,
          depth: entry.depth,
        },
        (options) => onUpdate(entry.id, options),
        entry.name,
        (name) => onUpdate(entry.id, { name }),
        entry.id // Pass entry ID
      );
    }, 100);
  }, [onViewDetail, onUpdate]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>世界书</Text>
        <TouchableOpacity style={styles.addButton} onPress={onAdd}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <Text style={styles.emptyText}>
          没有世界书条目。添加条目可以增强角色的知识。
        </Text>
      ) : (
        <View style={styles.entriesList}>
          {entries.map((entry, index) => (
            <SwipeableEntry 
              key={entry.id}
              onDelete={() => onDelete && onDelete(entry.id)}
            >
              <TouchableOpacity
                style={[
                  styles.entryItem,
                  entry.disable && styles.disabledEntry
                ]}
                activeOpacity={0.7}
                onPress={() => handleEntryPress(entry)}
              >
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>
                    {entry.name || '未命名条目'}
                  </Text>
                  <View style={styles.entryBadges}>
                    <View style={styles.positionBadge}>
                      <Text style={styles.positionText}>{entry.position}</Text>
                    </View>
                    {entry.disable && (
                      <View style={styles.disabledBadge}>
                        <Text style={styles.disabledText}>已禁用</Text>
                      </View>
                    )}
                    {entry.constant && (
                      <View style={styles.constantBadge}>
                        <Text style={styles.constantText}>常驻</Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text style={styles.entryPreview} numberOfLines={1}>
                  {entry.content || '无内容'}
                </Text>
              </TouchableOpacity>
            </SwipeableEntry>
          ))}
        </View>
      )}
    </View>
  );
};

// PresetSection Component with improved ordering functionality
interface PresetSectionProps {
  entries: PresetEntryUI[];
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<PresetEntryUI>) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onViewDetail: (
    title: string, 
    content: string,
    onContentChange?: (text: string) => void,
    editable?: boolean,
    entryType?: 'worldbook' | 'preset' | 'author_note',
    entryOptions?: any,
    onOptionsChange?: (options: any) => void,
    name?: string,
    onNameChange?: (text: string) => void,
    entryId?: string // Add entryId parameter
  ) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onDelete?: (id: string) => void;
}

export const PresetSection: React.FC<PresetSectionProps> = ({
  entries,
  onAdd,
  onUpdate,
  onMove,
  onViewDetail,
  onReorder,
  onDelete
}) => {
  // Helper function to reorder entry
  const handleReorder = useCallback((id: string, direction: 'up' | 'down') => {
    const index = entries.findIndex(entry => entry.id === id);
    if ((direction === 'up' && index === 0) || 
        (direction === 'down' && index === entries.length - 1)) {
      return;
    }
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    onReorder(index, newIndex);
  }, [entries, onReorder]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>预设提示</Text>
        <TouchableOpacity style={styles.addButton} onPress={onAdd}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <Text style={styles.emptyText}>
          没有预设提示。添加提示可以自定义对话体验。
        </Text>
      ) : (
        <View style={styles.entriesList}>
          {entries.map((entry, index) => (
            <SwipeableEntry 
              key={entry.id}
              onDelete={entry.isDefault ? undefined : () => onDelete && onDelete(entry.id)}
              disabled={entry.isDefault} // Disable swipe for default entries
            >
              <TouchableOpacity
                style={[
                  styles.entryItem,
                  !entry.enable && styles.disabledEntry
                ]}
                onPress={() => {
                  onViewDetail(
                    entry.name || '预设条目',
                    entry.content,
                    entry.isEditable ? (text) => onUpdate(entry.id, { content: text }) : undefined,
                    entry.isEditable,
                    'preset',
                    {
                      enable: entry.enable,
                      role: entry.role,
                      insertType: entry.insertType,
                      depth: entry.depth,
                      order: entry.order,
                    },
                    (options) => onUpdate(entry.id, options),
                    entry.name,
                    (name) => onUpdate(entry.id, { name }),
                    entry.id // Pass entry ID
                  );
                }}
              >
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>
                    {entry.name || entry.identifier || '未命名预设'}
                  </Text>
                  <View style={styles.entryControls}>
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderText}>{index + 1}</Text>
                    </View>
                    <View style={styles.moveControls}>
                      <TouchableOpacity
                        style={[styles.moveButton, index === 0 && styles.disabledButton]}
                        onPress={() => handleReorder(entry.id, 'up')}
                        disabled={index === 0}
                      >
                        <Ionicons name="chevron-up" size={16} color={index === 0 ? '#555' : '#fff'} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.moveButton, index === entries.length - 1 && styles.disabledButton]}
                        onPress={() => handleReorder(entry.id, 'down')}
                        disabled={index === entries.length - 1}
                      >
                        <Ionicons name="chevron-down" size={16} color={index === entries.length - 1 ? '#555' : '#fff'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                
                <View style={styles.entryDetails}>
                  <Text style={styles.entryDetail}>
                    {entry.role === 'user' ? '用户' : 'AI'} | 
                    {entry.insertType === 'relative' ? ' 相对位置' : ' 对话式'}
                    {entry.insertType === 'chat' && ` | 深度: ${entry.depth}`}
                  </Text>
                  <Text style={[styles.entryStatus, entry.enable ? styles.enabledText : styles.disabledText]}>
                    {entry.enable ? '已启用' : '已禁用'}
                  </Text>
                </View>
                
                {entry.content ? (
                  <Text style={styles.entryPreview} numberOfLines={1}>
                    {entry.content}
                  </Text>
                ) : (
                  <Text style={styles.entryEmptyContent}>无内容</Text>
                )}
              </TouchableOpacity>
            </SwipeableEntry>
          ))}
        </View>
      )}
    </View>
  );
};

// AuthorNoteSection Component
interface AuthorNoteSectionProps {
  content: string;
  injection_depth: number;
  onUpdateContent: (content: string) => void;
  onUpdateDepth: (depth: number) => void;
  onViewDetail: (
    title: string, 
    content: string,
    onContentChange?: (text: string) => void,
    editable?: boolean,
    entryType?: 'worldbook' | 'preset' | 'author_note',
    entryOptions?: any,
    onOptionsChange?: (options: any) => void
  ) => void;
}

export const AuthorNoteSection: React.FC<AuthorNoteSectionProps> = ({
  content,
  injection_depth,
  onUpdateContent,
  onUpdateDepth,
  onViewDetail
}) => {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>作者笔记</Text>
        <TouchableOpacity 
          style={styles.editButton}
          onPress={() => {
            onViewDetail(
              '作者笔记',
              content,
              onUpdateContent,
              true,
              'author_note',
              { injection_depth },
              (options) => {
                if (options.injection_depth !== undefined) {
                  onUpdateDepth(options.injection_depth);
                }
              }
            );
          }}
        >
          <Ionicons name="pencil" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      
      <View style={styles.authorNoteContainer}>
        <View style={styles.authorNoteHeader}>
          <Text style={styles.authorNoteLabel}>深度: {injection_depth}</Text>
        </View>
        
        {content ? (
          <Text style={styles.authorNoteContent} numberOfLines={3}>
            {content}
          </Text>
        ) : (
          <Text style={styles.authorNoteEmpty}>
            未设置作者笔记。点击编辑按钮添加。
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
    backgroundColor: '#333333',
    borderRadius: 8,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#444444',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  addButton: {
    width: 30,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButton: {
    width: 30,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  entriesList: {
    padding: 8,
  },
  entryItem: {
    backgroundColor: '#3A3A3A',
    borderRadius: 6,
    marginVertical: 6,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4A90E2',
  },
  disabledEntry: {
    opacity: 0.6,
    borderLeftColor: '#888',
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  entryTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  entryBadges: {
    flexDirection: 'row',
  },
  positionBadge: {
    backgroundColor: '#4A90E2',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  positionText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  disabledBadge: {
    backgroundColor: '#FF5722',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  disabledText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  constantBadge: {
    backgroundColor: '#4CAF50',  // Green for constant entries
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 6,
  },
  constantText: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  entryPreview: {
    color: '#CCCCCC',
    fontSize: 12,
  },
  entryEmptyContent: {
    color: '#888888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyText: {
    padding: 16,
    color: '#999999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  entryControls: {
    flexDirection: 'row',
  },
  moveControls: {
    flexDirection: 'row',
  },
  moveButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  disabledButton: {
    opacity: 0.5,
  },
  entryDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  entryDetail: {
    fontSize: 11,
    color: '#AAAAAA',
  },
  entryStatus: {
    fontSize: 11,
  },
  enabledText: {
    color: '#4CAF50',
  },
  orderBadge: {
    backgroundColor: 'rgb(255, 224, 195)',
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  orderText: {
    color: '#333',
    fontSize: 12,
    fontWeight: 'bold',
  },
  authorNoteContainer: {
    padding: 16,
  },
  authorNoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  authorNoteLabel: {
    fontSize: 12,
    color: '#AAAAAA',
  },
  authorNoteContent: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
  },
  authorNoteEmpty: {
    color: '#888888',
    fontStyle: 'italic',
  },
  swipeContainer: {
    position: 'relative',
    marginVertical: 6,
    overflow: 'hidden',
    borderRadius: 6,
  },
  swipeableContent: {
    width: '100%',
    zIndex: 1,
    backgroundColor: '#3A3A3A', // Match entryItem background
  },
  deleteBackground: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  deleteAction: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
});
