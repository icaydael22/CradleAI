import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

interface CharacterAttributeProps {
  label: string;
  value: string;
  onSave?: (newValue: string) => void;
  editable?: boolean;
  multiline?: boolean;
  placeholder?: string;
  icon?: string; // Ionicons name
  iconColor?: string;
}

const CharacterAttribute: React.FC<CharacterAttributeProps> = ({
  label,
  value,
  onSave,
  editable = false,
  multiline = false,
  placeholder = '',
  icon,
  iconColor = theme.colors.primary,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const fadeAnim = useState(new Animated.Value(0))[0];
  
  const startEditing = () => {
    if (!editable) return;
    
    setEditValue(value);
    setIsEditing(true);
    
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  };
  
  const cancelEditing = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start(() => {
      setIsEditing(false);
    });
  };
  
  const handleSave = () => {
    if (onSave) {
      onSave(editValue);
    }
    
    cancelEditing();
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        {icon && (
          <Ionicons 
            name={icon as any} 
            size={16} 
            color={iconColor}
            style={styles.labelIcon} 
          />
        )}
        <Text style={styles.label}>{label}</Text>
      </View>
      
      {isEditing ? (
        <Animated.View style={[
          styles.editContainer,
          { opacity: fadeAnim }
        ]}>
          <TextInput
            style={[
              styles.input,
              multiline && styles.multilineInput
            ]}
            value={editValue}
            onChangeText={setEditValue}
            placeholder={placeholder}
            placeholderTextColor="#666"
            multiline={multiline}
            numberOfLines={multiline ? 3 : 1}
            autoFocus
          />
          
          <View style={styles.editButtons}>
            <TouchableOpacity 
              style={[styles.editButton, styles.cancelButton]}
              onPress={cancelEditing}
            >
              <Ionicons name="close" size={20} color="#999" />
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.editButton, styles.saveButton]}
              onPress={handleSave}
            >
              <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      ) : (
        <TouchableOpacity 
          style={styles.valueContainer} 
          onPress={editable ? startEditing : undefined}
          activeOpacity={editable ? 0.7 : 1}
        >
          <Text style={[
            styles.value, 
            !value && styles.placeholderValue,
            multiline && styles.multilineValue
          ]}>
            {value || placeholder}
          </Text>
          
          {editable && (
            <Ionicons 
              name="create-outline" 
              size={16} 
              color="#888" 
              style={styles.editIcon} 
            />
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelIcon: {
    marginRight: 6,
  },
  label: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(60, 60, 60, 0.5)',
    borderRadius: 8,
    minHeight: 40,
  },
  value: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    lineHeight: 20,
  },
  multilineValue: {
    minHeight: 60,
  },
  placeholderValue: {
    color: '#666',
    fontStyle: 'italic',
  },
  editIcon: {
    marginLeft: 8,
    marginTop: 2,
  },
  editContainer: {
    backgroundColor: 'rgba(60, 60, 60, 0.5)',
    borderRadius: 8,
    padding: 8,
  },
  input: {
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 4,
    minHeight: 40,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  saveButton: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
  },
});

export default CharacterAttribute;
