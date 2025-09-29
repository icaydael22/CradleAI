import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  FlatList,
  ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';

interface DraggableListProps<T> {
  data: T[];
  renderItem: (item: T, index: number, isDragging: boolean) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  onReorder: (fromIndex: number, toIndex: number) => void;
  itemHeight: number;
  contentContainerStyle?: ViewStyle;
  style?: ViewStyle;
  enableHapticFeedback?: boolean;
  scrollEnabled?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

function DraggableList<T>({
  data,
  renderItem,
  keyExtractor,
  onReorder,
  itemHeight,
  contentContainerStyle,
  style,
  enableHapticFeedback = true,
  scrollEnabled = true,
}: DraggableListProps<T>) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<FlatList>(null);

  // Shared values for dragging
  const draggingItemIndex = useSharedValue<number | null>(null);
  const positions = useSharedValue(
    Object.assign({}, ...data.map((_, index) => ({ [index]: index })))
  );
  const scrollY = useSharedValue(0);
  const translationY = useSharedValue(0);

  // Keep track of positions when data changes
  useAnimatedReaction(
    () => data.length,
    (length) => {
      positions.value = Object.assign(
        {},
        ...Array.from({ length }, (_, index) => ({ [index]: index }))
      );
    }
  );

  // Gesture handler for dragging
  const gestureHandler = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    { startY: number }
  >({
    onStart: (event, context) => {
      if (draggingItemIndex.value === null) return;
      context.startY = positions.value[draggingItemIndex.value] * itemHeight;
    },
    onActive: (event, context) => {
      if (draggingItemIndex.value === null) return;
      const currentPosition = context.startY + event.translationY;
      translationY.value = event.translationY;

      const currentIndex = Math.round(currentPosition / itemHeight);
      const clampedIndex = clamp(currentIndex, 0, data.length - 1);

      if (clampedIndex !== draggingItemIndex.value) {
        // Update positions when dragging over another item
        const newPositions = { ...positions.value };
        
        for (let i = 0; i < data.length; i++) {
          if (i === draggingItemIndex.value) continue;
          
          if (
            clampedIndex > draggingItemIndex.value &&
            i > draggingItemIndex.value &&
            i <= clampedIndex
          ) {
            // Moving down, shift items up
            newPositions[i] = i - 1;
          } else if (
            clampedIndex < draggingItemIndex.value &&
            i < draggingItemIndex.value &&
            i >= clampedIndex
          ) {
            // Moving up, shift items down
            newPositions[i] = i + 1;
          } else {
            // Item remains in place
            newPositions[i] = i;
          }
        }
        
        // Update position of dragged item
        newPositions[draggingItemIndex.value] = clampedIndex;
        positions.value = newPositions;
        
        if (enableHapticFeedback) {
          // Add haptic feedback here if needed
        }
      }
    },
    onEnd: () => {
      if (draggingItemIndex.value === null) return;
      
      // Find new index of dragged item
      const newIndex = positions.value[draggingItemIndex.value];
      
      if (newIndex !== draggingItemIndex.value) {
        // Call reorder callback with the new order
        runOnJS(onReorder)(draggingItemIndex.value, newIndex);
        runOnJS(setActiveIndex)(null);
      }
      
      // Reset animation values
      translationY.value = 0;
      draggingItemIndex.value = null;
    },
  });

  const handleItemLayout = (index: number) => (event: LayoutChangeEvent) => {
    // Optional: You can use this to adjust item heights if they're not uniform
  };

  const handleStartDrag = (index: number) => {
    draggingItemIndex.value = index;
    setActiveIndex(index);
  };

  const renderAnimatedItem = ({ item, index }: { item: T; index: number }) => {
    const animatedStyle = useAnimatedStyle(() => {
      if (draggingItemIndex.value === null) {
        // No dragging, animate to grid position
        return {
          zIndex: 0,
          opacity: withTiming(1),
          transform: [
            {
              translateY: withSpring(positions.value[index] * itemHeight, {
                damping: 20,
                stiffness: 200,
              }),
            },
            { scale: withTiming(1) },
          ],
        };
      }

      if (index === draggingItemIndex.value) {
        // This is the item being dragged
        return {
          zIndex: 1,
          opacity: withTiming(0.95),
          transform: [
            {
              translateY: 
                positions.value[index] * itemHeight + translationY.value,
            },
            { scale: withTiming(1.05) },
          ],
        };
      }

      // Other items, they get animated to their positions
      return {
        zIndex: 0,
        opacity: withTiming(0.75),
        transform: [
          {
            translateY: withSpring(positions.value[index] * itemHeight, {
              damping: 20,
              stiffness: 200,
            }),
          },
          { scale: withTiming(1) },
        ],
      };
    });

    return (
      <PanGestureHandler
        onGestureEvent={gestureHandler}
        onHandlerStateChange={() => {}}
      >
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              height: itemHeight,
            },
            animatedStyle,
          ]}
          onLayout={handleItemLayout(index)}
        >
          {renderItem(item, index, activeIndex === index)}
        </Animated.View>
      </PanGestureHandler>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <FlatList
        ref={listRef}
        data={data}
        renderItem={({ item }) => null} // Items are rendered separately with absolute positioning
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          { height: data.length * itemHeight },
          contentContainerStyle,
        ]}
        scrollEnabled={scrollEnabled && draggingItemIndex.value === null}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          scrollY.value = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      />
      {data.map((item, index) => (
        <View
          key={keyExtractor(item, index)}
          style={{ position: 'absolute', width: '100%' }}
          pointerEvents="box-none"
        >
          {renderAnimatedItem({ item, index })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default DraggableList;