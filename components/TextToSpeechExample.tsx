import React, { useState } from 'react';
import { View, Text, TextInput, Button, ActivityIndicator, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { MinimaxTTS } from '../services';
import ENV from '../config/env';

const TextToSpeechExample = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);

  const handleTextToSpeech = async () => {
    if (!text.trim()) return;
    
    setLoading(true);
    try {
      const ttsService = new MinimaxTTS(ENV.REPLICATE_API_TOKEN);
      const result = await ttsService.textToSpeech({
        text: text,
        emotion: 'neutral',
      });
      
      setAudioPath(result.audioPath);
      setLoading(false);
    } catch (error) {
      console.error('TTS Error:', error);
      setLoading(false);
    }
  };

  const playAudio = async () => {
    if (!audioPath) return;
    
    try {
      // Unload previous sound if exists
      if (sound) {
        await sound.unloadAsync();
      }
      
      // Load and play the audio
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioPath },
        { shouldPlay: true }
      );
      
      setSound(newSound);
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Text-to-Speech</Text>
      
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Enter text to convert to speech"
        multiline
      />
      
      <Button 
        title="Convert to Speech" 
        onPress={handleTextToSpeech}
        disabled={loading || !text.trim()}
      />
      
      {loading && <ActivityIndicator style={styles.loader} size="large" />}
      
      {audioPath && !loading && (
        <Button title="Play Audio" onPress={playAudio} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 10,
    marginBottom: 20,
    minHeight: 100,
  },
  loader: {
    marginTop: 20,
  },
});

export default TextToSpeechExample;
