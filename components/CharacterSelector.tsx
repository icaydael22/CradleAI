import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Character } from '@/shared/types';

interface CharacterSelectorProps {
  characters: Character[];
  selectedCharacterId: string | null;
  onSelectCharacter: (id: string) => void;
  loading?: boolean;
  showRelationshipStatus?: boolean;
}

const CharacterSelector: React.FC<CharacterSelectorProps> = ({
  characters,
  selectedCharacterId,
  onSelectCharacter,
  loading = false,
  showRelationshipStatus = true,
}) => {
  // Filter characters with relationship system enabled if showing status
  const eligibleCharacters = showRelationshipStatus
    ? characters.filter(c => c.relationshipEnabled)
    : characters;

  // Render a character avatar item
  const renderCharacterItem = ({ item }: { item: Character }) => {
    const isSelected = selectedCharacterId === item.id;
    const hasUnread = showRelationshipStatus && 
                      item.messageBox?.some(msg => !msg.read);

    return (
      <TouchableOpacity
        style={[
          styles.characterItem,
          isSelected && styles.selectedCharacter,
        ]}
        onPress={() => onSelectCharacter(item.id)}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={
              item.avatar
                ? { uri: item.avatar }
                : require('@/assets/images/default-avatar.png')
            }
            style={styles.avatar}
          />
          
          {/* Unread indicator */}
          {hasUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.messageBox?.filter(msg => !msg.read).length}
              </Text>
            </View>
          )}
          
        </View>
        
        <Text 
          style={[
            styles.characterName,
            isSelected && styles.selectedCharacterName
          ]} 
          numberOfLines={1}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#FF9ECD" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      ) : eligibleCharacters.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {showRelationshipStatus 
              ? '没有启用关系系统的角色' 
              : '没有可用的角色'}
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.charactersList}
        >
          {eligibleCharacters.map((character) => (
            <TouchableOpacity
              key={character.id}
              style={[
                styles.characterItem,
                selectedCharacterId === character.id && styles.selectedCharacter
              ]}
              onPress={() => onSelectCharacter(character.id)}
            >
              <Image
                source={
                  character.avatar
                    ? { uri: character.avatar }
                    : require('@/assets/images/default-avatar.png')
                }
                style={styles.avatar}
              />
              <Text style={styles.characterName} numberOfLines={1}>{character.name}</Text>
              
              {showRelationshipStatus && character.relationshipEnabled && (
                <View style={styles.relationshipBadge}>
                  <Text style={styles.relationshipText}>R</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 100,
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#aaa',
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  emptyText: {
    color: '#aaa',
    textAlign: 'center',
  },
  charactersList: {
    padding: 8,
  },
  characterItem: {
    width: 70,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  selectedCharacter: {
    backgroundColor: 'rgba(255, 158, 205, 0.2)',
    borderRadius: 8,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginBottom: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  reviewBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FFAA44',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  characterName: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 70,
  },
  selectedCharacterName: {
    color: '#FF9ECD',
    fontWeight: 'bold',
  },
  relationshipBadge: {
    position: 'absolute',
    top: 0,
    right: 5,
    backgroundColor: '#FF9ECD',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relationshipText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  }
});

export default CharacterSelector;
