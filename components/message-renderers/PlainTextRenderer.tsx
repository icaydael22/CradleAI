import React from 'react';
import { Text, StyleSheet, Dimensions } from 'react-native';
import { ChatUISettings } from '@/app/pages/chat-ui-settings';

const { width } = Dimensions.get('window');

interface PlainTextRendererProps {
  text: string;
  isUser: boolean;
  uiSettings: ChatUISettings;
}

const PlainTextRenderer: React.FC<PlainTextRendererProps> = ({
  text,
  isUser,
  uiSettings,
}) => {
  const getTextStyle = () => ({
    fontSize: Math.min(Math.max(14, width * 0.04), 16) * uiSettings.textSizeMultiplier,
    color: isUser 
      ? (uiSettings.regularUserTextColor || '#333333')
      : (uiSettings.regularBotTextColor || '#ffffff'),
    lineHeight: Math.min(Math.max(14, width * 0.04), 16) * uiSettings.textSizeMultiplier * 1.5,
  });

  return (
    <Text style={[styles.text, getTextStyle()]}>
      {text}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    flexWrap: 'wrap',
  },
});

export default PlainTextRenderer;
