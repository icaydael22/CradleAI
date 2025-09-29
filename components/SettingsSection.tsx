import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export interface SettingItemProps {
  title: string;
  icon?: string; // Ionicons name
  iconColor?: string;
  onPress?: () => void;
  rightComponent?: React.ReactNode;
  showChevron?: boolean;
  destructive?: boolean;
}

interface SettingsSectionProps {
  title?: string;
  items: SettingItemProps[];
  style?: ViewStyle;
  titleStyle?: TextStyle;
  withGap?: boolean; // Adds a small gap between items
}

const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  items,
  style,
  titleStyle,
  withGap = false,
}) => {
  return (
    <View style={[styles.container, style]}>
      {title && <Text style={[styles.sectionTitle, titleStyle]}>{title}</Text>}
      
      <View style={[styles.itemsContainer, withGap && styles.withGap]}>
        {items.map((item, index) => (
          <TouchableOpacity
            key={item.title + index}
            style={[
              styles.item,
              index !== items.length - 1 && !withGap && styles.borderBottom,
              item.destructive && styles.destructiveItem,
            ]}
            onPress={item.onPress}
            activeOpacity={item.onPress ? 0.6 : 1}
            disabled={!item.onPress}
          >
            {item.icon && (
              <View style={[
                styles.iconContainer,
                item.destructive && styles.destructiveIconContainer
              ]}>
                <Ionicons 
                  name={item.icon as any}
                  size={22}
                  color={item.destructive ? theme.colors.danger : (item.iconColor || theme.colors.primary)}
                />
              </View>
            )}
            
            <Text style={[
              styles.itemTitle,
              item.destructive && styles.destructiveText
            ]}>
              {item.title}
            </Text>
            
            {item.rightComponent ? (
              item.rightComponent
            ) : (
              item.showChevron && (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={item.destructive ? theme.colors.danger : theme.colors.textSecondary}
                />
              )
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  itemsContainer: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
  },
  withGap: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    gap: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.md // Fix: Remove theme reference
  },
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 224, 195, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  itemTitle: {
    flex: 1,
    fontSize: theme.fontSizes.md,
    color: theme.colors.text,
  },
  destructiveItem: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
  },
  destructiveIconContainer: {
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
  },
  destructiveText: {
    color: theme.colors.danger,
  },
});

export default SettingsSection;
