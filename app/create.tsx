import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import CreateChar from '@/app/pages/create_char';
import CradleCreateForm from '@/components/CradleCreateForm';

export default function CreatePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');

  const handleGoBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>创建角色</Text>
        
        {/* Toggle button for Manual/Auto mode */}
        <TouchableOpacity 
          style={styles.modeToggle} 
          onPress={() => setMode(mode === 'manual' ? 'auto' : 'manual')}
        >
          <View style={[
            styles.toggleTrack, 
            mode === 'auto' && styles.toggleTrackActive
          ]}>
            <View style={[
              styles.toggleThumb,
              mode === 'auto' && styles.toggleThumbActive
            ]}>
              <Ionicons 
                name={mode === 'manual' ? "create-outline" : "color-wand-outline"} 
                size={16} 
                color={mode === 'manual' ? "#000" : "#000"} 
              />
            </View>
          </View>
          <Text style={styles.toggleText}>
            {mode === 'manual' ? '手动' : '自动'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.content}>
        {mode === 'manual' ? (
          // Manual mode - Regular character creation
          <CreateChar />
        ) : (
          // Auto mode - Cradle character creation
          <CradleCreateForm 
            embedded={true} 
            onClose={() => router.back()} 
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#282828',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    marginLeft: 16,
  },
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleTrack: {
    width: 46,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
    backgroundColor: '#FFD700',
  },
  toggleText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
});
