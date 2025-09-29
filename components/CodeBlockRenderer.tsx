import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CodeBlockRendererProps {
  code: string;
  language?: string;
  darkMode?: boolean;
}

const CodeBlockRenderer: React.FC<CodeBlockRendererProps> = ({
  code,
  language = 'text',
  darkMode = true,
}) => {
  const [isCopied, setIsCopied] = useState(false);
  const [formattedCode, setFormattedCode] = useState(code);

  // Process code on mount to handle special cases
  useEffect(() => {
    // Remove extra whitespace at beginning/end
    let processed = code.trim();
    
    // Handle HTML content inside code blocks
    if (language === 'html' || language === 'xml') {
      // Escape < and > characters to prevent rendering as actual HTML
      processed = processed.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    setFormattedCode(processed);
  }, [code, language]);

  // Function to copy code to clipboard
  const copyToClipboard = () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(code);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000); // Reset copied state after 2 seconds
      } else {
        console.log('Clipboard API not available');
      }
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Get display name for language
  const getLanguageDisplayName = () => {
    const languageMap: Record<string, string> = {
      'js': 'JavaScript',
      'ts': 'TypeScript',
      'jsx': 'React JSX',
      'tsx': 'React TSX',
      'py': 'Python',
      'rb': 'Ruby',
      'java': 'Java',
      'cpp': 'C++',
      'cs': 'C#',
      'php': 'PHP',
      'go': 'Go',
      'rust': 'Rust',
      'swift': 'Swift',
      'kotlin': 'Kotlin',
      'md': 'Markdown',
      'json': 'JSON',
      'yml': 'YAML',
      'sql': 'SQL',
      'html': 'HTML',
      'css': 'CSS',
      'scss': 'SCSS',
      'bash': 'Bash',
      'sh': 'Shell',
      'dockerfile': 'Dockerfile',
    };

    return languageMap[language.toLowerCase()] || language;
  };

  const backgroundColor = darkMode ? '#2d2d2d' : '#f5f5f5';
  const textColor = darkMode ? '#f8f8f2' : '#333333';

  return (
    <View style={[styles.codeBlockContainer, { backgroundColor }]}>
      <View style={styles.codeHeader}>
        <Text style={[styles.languageLabel, { color: textColor }]}>
          {getLanguageDisplayName()}
        </Text>
        <TouchableOpacity onPress={copyToClipboard} style={styles.copyButton}>
          {isCopied ? (
            <>
              <Ionicons name="checkmark" size={16} color="#4caf50" />
              <Text style={styles.copiedText}>Copied!</Text>
            </>
          ) : (
            <Ionicons name="copy-outline" size={16} color={textColor} />
          )}
        </TouchableOpacity>
      </View>
      <ScrollView 
        horizontal={true}
        style={styles.codeScrollView}
        showsHorizontalScrollIndicator={true}
      >
        <View style={styles.codeContent}>
          <Text style={[styles.codeText, { color: textColor }]}>
            {formattedCode}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  codeBlockContainer: {
    marginVertical: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  languageLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  copiedText: {
    fontSize: 12,
    color: '#4caf50',
    marginLeft: 4,
  },
  codeScrollView: {
    maxWidth: '100%',
  },
  codeContent: {
    padding: 12,
    minWidth: '100%',
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20, // Improved line height for readability
  },
});

export default CodeBlockRenderer;
