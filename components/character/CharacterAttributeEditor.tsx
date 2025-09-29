import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CharacterAttributeEditorProps {
  title: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: ViewStyle;
  multiline?: boolean;
  numberOfLines?: number;
  onPress?: () => void;
  alternateGreetings?: string[];
  selectedGreetingIndex?: number;
  onSelectGreeting?: (idx: number) => void;
}

const CharacterAttributeEditor: React.FC<CharacterAttributeEditorProps> = ({
  title,
  value,
  onChangeText,
  placeholder,
  style,
  multiline = true,
  numberOfLines = 4,
  onPress,
  alternateGreetings,
  selectedGreetingIndex,
  onSelectGreeting
}) => {
  const [expanded, setExpanded] = useState(false);

  const handleHeaderPress = () => {
    if (onPress) {
      onPress();
    } else {
      setExpanded(!expanded);
    }
  };

  const handleContentPress = () => {
    if (onPress) {
      onPress();
    } else {
      setExpanded(true);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity style={styles.header} onPress={handleHeaderPress}>
        <Text style={styles.title}>{title}</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#aaa"
        />
      </TouchableOpacity>
      {alternateGreetings && alternateGreetings.length > 0 && (
        <View style={styles.greetingsSelectorContainer}>
          <Text style={styles.greetingsSelectorLabel}>
            选择开场白 ({selectedGreetingIndex !== undefined ? selectedGreetingIndex + 1 : 0}/{alternateGreetings.length}):
          </Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.greetingsScrollContent}
          >
            {alternateGreetings.map((greet, idx) => (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.greetingOption,
                  selectedGreetingIndex === idx && styles.greetingOptionSelected
                ]}
                onPress={() => onSelectGreeting && onSelectGreeting(idx)}
              >
                <Text style={styles.greetingOptionNumber}>{idx + 1}</Text>
                <Text
                  style={[
                    styles.greetingOptionText,
                    selectedGreetingIndex === idx && styles.greetingOptionTextSelected
                  ]}
                  numberOfLines={2}
                >
                  {greet ? (greet.length > 30 ? greet.substring(0, 30) + '...' : greet) : '(空)'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      {onPress ? (
        <TouchableOpacity onPress={handleContentPress} activeOpacity={0.7}>
          <Text style={styles.previewText} numberOfLines={2}>
            {value || placeholder || ''}
          </Text>
        </TouchableOpacity>
      ) : (
        (expanded || !value) ? (
          <TextInput
            style={[
              styles.inputField,
              multiline && { minHeight: numberOfLines * 24 }
            ]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#666"
            multiline={multiline}
            numberOfLines={numberOfLines}
            textAlignVertical={multiline ? "top" : "center"}
          />
        ) : (
          <TouchableOpacity onPress={handleHeaderPress}>
            <Text style={styles.previewText} numberOfLines={2}>
              {value}
            </Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#333',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#444',
  },
  title: {
    fontWeight: 'bold',
    color: '#fff',
    fontSize: 16,
  },
  inputField: {
    color: '#fff',
    padding: 12,
    paddingTop: 12,
    fontSize: 16,
    backgroundColor: '#333',
    borderTopWidth: 1,
    borderTopColor: '#555',
  },
  previewText: {
    color: '#ccc',
    padding: 12,
    fontSize: 14,
  },
  greetingsSelectorContainer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  greetingsSelectorLabel: {
    color: '#aaa',
    fontSize: 13,
    marginBottom: 8,
  },
  greetingsScrollContent: {
    paddingBottom: 4,
  },
  greetingOption: {
    backgroundColor: '#444',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 8,
    minWidth: 100,
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingOptionSelected: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
    borderWidth: 1,
  },
  greetingOptionNumber: {
    color: 'black',
    fontSize: 12,
    fontWeight: 'bold',
    marginRight: 6,
    backgroundColor: 'rgba(0,0,0,0.2)',
    width: 20,
    height: 20,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 20,
  },
  greetingOptionText: {
    color: '#fff',
    fontSize: 13,
    flex: 1,
  },
  greetingOptionTextSelected: {
    color: 'black',
    fontWeight: 'bold',
  },
});

export default CharacterAttributeEditor;
