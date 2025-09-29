import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Image,
  ImageSourcePropType,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface AnimatedCardProps {
  title: string;
  subtitle?: string;
  icon?: string; // Ionicons name
  image?: ImageSourcePropType;
  onPress: () => void;
  style?: ViewStyle;
  titleStyle?: TextStyle;
  gradientColors?: readonly [string, string];
  testID?: string;
}

const AnimatedCard: React.FC<AnimatedCardProps> = ({
  title,
  subtitle,
  icon,
  image,
  onPress,
  style,
  titleStyle,
  gradientColors = ['rgba(255, 224, 195, 0.9)', 'rgba(255, 190, 159, 0.8)'] as const,
  testID,
}) => {
  // Animation values
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const elevationAnim = useRef(new Animated.Value(2)).current;
  
  // Handle press animations
  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.96,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
      Animated.timing(elevationAnim, {
        toValue: 4,
        duration: 100,
        useNativeDriver: false,
      }),
    ]).start();
  };
  
  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(elevationAnim, {
        toValue: 2,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  };
  
  // Dynamic elevation style
  const elevationStyle = {
    elevation: elevationAnim,
    shadowOpacity: elevationAnim.interpolate({
      inputRange: [2, 4],
      outputRange: [0.15, 0.25],
    }),
    shadowRadius: elevationAnim.interpolate({
      inputRange: [2, 4],
      outputRange: [2, 4],
    }),
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ scale: scaleAnim }],
        },
        elevationStyle,
        style,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.touchable}
        testID={testID}
      >
        {image ? (
          <Image source={image} style={styles.backgroundImage} />
        ) : (
          <LinearGradient colors={gradientColors} style={styles.gradient} />
        )}
        
        <View style={styles.content}>
          {icon && (
            <View style={styles.iconContainer}>
              <Ionicons name={icon as any} size={28} color="#fff" />
            </View>
          )}
          
          <View style={styles.textContainer}>
            <Text style={[styles.title, titleStyle]} numberOfLines={2}>{title}</Text>
            {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    margin: 8,
    backgroundColor: theme.colors.backgroundSecondary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
  },
  touchable: {
    flex: 1,
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.8,
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSizes.lg,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitle: {
    fontSize: theme.fontSizes.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});

export default AnimatedCard;
