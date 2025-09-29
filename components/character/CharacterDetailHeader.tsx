import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  TextInput,
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface CharacterDetailHeaderProps {
  name: string;
  backgroundImage: string | null;
  onBackgroundPress: () => void;
  onBackPress: () => void;
  onFullscreenPress?: () => void;
  onNameChange?: (name: string) => void;
  isNameEditable?: boolean;
}

const { width } = Dimensions.get('window');

const CharacterDetailHeader: React.FC<CharacterDetailHeaderProps> = ({
  name,
  backgroundImage,
  onBackgroundPress,
  onNameChange,
  onBackPress,
  onFullscreenPress,
  isNameEditable = false
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const inputRef = useRef<TextInput>(null);

  const handleEditName = () => {
    setTempName(name);
    setIsEditingName(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  const handleSaveName = () => {
    if (tempName.trim().length === 0) {
      // Don't allow empty names
      setTempName(name);
    } else if (onNameChange && tempName !== name) {
      onNameChange(tempName.trim());
    }
    setIsEditingName(false);
    Keyboard.dismiss();
  };

  const handleCancelEdit = () => {
    setTempName(name);
    setIsEditingName(false);
    Keyboard.dismiss();
  };

  return (
    <View style={styles.headerContainer}>
      <TouchableOpacity 
        style={styles.backgroundContainer} 
        onPress={onBackgroundPress}
        activeOpacity={0.9}
      >
        <ImageBackground
          source={
            backgroundImage
              ? { uri: backgroundImage }
              : require('@/assets/images/default-background.jpg')
          }
          style={styles.backgroundImage}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.7)']}
            style={styles.gradient}
          >

            {isNameEditable ? (
              <View style={styles.nameContainer}>
                {isEditingName ? (
                  <View style={styles.nameEditContainer}>
                    <TextInput
                      ref={inputRef}
                      style={styles.nameInput}
                      value={tempName}
                      onChangeText={setTempName}
                      placeholder="角色名称"
                      placeholderTextColor="rgba(255, 255, 255, 0.5)"
                      autoFocus
                      selectTextOnFocus
                      returnKeyType="done"
                      onSubmitEditing={handleSaveName}
                      maxLength={30}
                    />
                    <View style={styles.editActions}>
                      <TouchableOpacity 
                        style={styles.editActionButton} 
                        onPress={handleCancelEdit}
                      >
                        <Ionicons name="close" size={20} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.editActionButton}
                        onPress={handleSaveName}
                      >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.nameWithEdit}
                    onPress={handleEditName}
                  >
                    <Text style={styles.characterName}>{name}</Text>
                    <Ionicons name="pencil" size={18} color="rgba(255, 255, 255, 0.8)" style={styles.editIcon} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <Text style={styles.characterName}>{name}</Text>
            )}
          </LinearGradient>
        </ImageBackground>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    width: '100%',
    height: 180,
  },
  backgroundContainer: {
    flex: 1,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 16,
  },
  characterName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nameContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  nameWithEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  editIcon: {
    marginLeft: 8,
  },
  nameEditContainer: {
    width: '80%',
    alignItems: 'center',
  },
  nameInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    width: '100%',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  editActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  editActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  }
});

export default CharacterDetailHeader;
