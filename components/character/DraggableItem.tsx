import React, { useRef } from 'react';
import { 
  View, 
  StyleSheet, 
  Animated, 
  TouchableOpacity
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface DraggableItemProps {
  id: string;
  onMove: (id: string, direction: 'up' | 'down') => void;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * A draggable item component that allows reordering through drag gestures or buttons
 * For future implementation with a more advanced reordering system
 */
export const DraggableItem: React.FC<DraggableItemProps> = ({ 
  id, 
  onMove, 
  children,
  disabled = false
}) => {
  const pan = useRef(new Animated.ValueXY()).current;
  const itemHeight = useRef(0);
  const isDragging = useRef(false);
  const startY = useRef(0);
  
  // Simple implementation using up/down buttons
  // In the future, this can be expanded to full drag-and-drop reordering
  return (
    <View style={styles.container}>
      <View style={styles.handleContainer}>
        <TouchableOpacity 
          onPress={() => onMove(id, 'up')} 
          style={styles.orderButton}
          disabled={disabled}
        >
          <MaterialCommunityIcons 
            name="chevron-up" 
            size={22} 
            color={disabled ? theme.colors.textSecondary : theme.colors.text} 
          />
        </TouchableOpacity>
        <MaterialCommunityIcons 
          name="drag-vertical" 
          size={22} 
          color={disabled ? theme.colors.textSecondary : theme.colors.text}
          style={styles.dragHandle}
        />
        <TouchableOpacity 
          onPress={() => onMove(id, 'down')} 
          style={styles.orderButton}
          disabled={disabled}
        >
          <MaterialCommunityIcons 
            name="chevron-down" 
            size={22} 
            color={disabled ? theme.colors.textSecondary : theme.colors.text} 
          />
        </TouchableOpacity>
      </View>
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    width: '100%',
  },
  handleContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  orderButton: {
    padding: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragHandle: {
    marginVertical: 4,
  },
});

export default DraggableItem;
