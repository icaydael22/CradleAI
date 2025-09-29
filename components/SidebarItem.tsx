// components/ui/SidebarItem.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SidebarItemProps } from '@/constants/types'; // 导入类型定义

const SidebarItem: React.FC<{
  conversation: SidebarItemProps;
  isSelected: boolean;
  onSelect: (id: string) => void;
}> = ({ conversation, isSelected, onSelect }) => {
  return (
    <TouchableOpacity onPress={() => onSelect(conversation.id)}>
      <View style={[styles.container, isSelected && styles.selected]}>
        <Text style={styles.title}>{conversation.title}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 10,
    borderBottomWidth: 11,
    borderBottomColor: '#ccc',
  },
  selected: {
    backgroundColor: '#ddd',
  },
  title: {
    fontSize: 16,
  },
});

export default SidebarItem;