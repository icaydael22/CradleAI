import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, FlatList, Image } from 'react-native';
import { Character } from '@/shared/types';
import { MaterialIcons } from '@expo/vector-icons';

interface ForwardDialogProps {
  isVisible: boolean;
  onClose: () => void;
  messages: any[];
  characters: Character[];
  onSelectCharacter: (character: Character) => void;
}

const ForwardDialog: React.FC<ForwardDialogProps> = ({
  isVisible,
  onClose,
  messages,
  characters,
  onSelectCharacter
}) => {
  const renderCharacterItem = ({ item }: { item: Character }) => (
    <TouchableOpacity 
      style={styles.characterItem} 
      onPress={() => {
        onSelectCharacter(item);
        onClose();
      }}
    >
      <View style={styles.avatarContainer}>
        {item.avatar && (
          <Image 
            source={typeof item.avatar === 'string' ? { uri: item.avatar } : item.avatar} 
            style={styles.avatar}
          />
        )}
      </View>
      <Text style={styles.characterName}>{item.name}</Text>
      <MaterialIcons name="chevron-right" size={24} color="#999" />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>
              转发给({messages.length > 1 ? `${messages.length}条消息` : '1条消息'})
            </Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          <FlatList
            data={characters}
            renderItem={renderCharacterItem}
            keyExtractor={item => item.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
  characterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  characterName: {
    flex: 1,
    fontSize: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#eee',
  },
});

export default ForwardDialog;
