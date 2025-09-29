import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  Dimensions 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MemoryFact {
  id: string;
  memory: string;
  score?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: any;
}

interface MemoryOverviewPanelProps {
  facts: MemoryFact[];
  onClose: () => void;
}

const formatTimestamp = (timestamp?: string) => {
  if (!timestamp) return 'Unknown time';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString();
  } catch (e) {
    return timestamp;
  }
};

const MemoryOverviewPanel: React.FC<MemoryOverviewPanelProps> = ({ facts, onClose }) => {
  const [expandedFactId, setExpandedFactId] = useState<string | null>(null);
  
  const toggleFactExpansion = (id: string) => {
    setExpandedFactId(expandedFactId === id ? null : id);
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Memory Facts</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {facts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cloud-outline" size={48} color="#aaa" /> {/* Changed from 'brain-outline' */}
          <Text style={styles.emptyText}>No memory facts found for this conversation</Text>
        </View>
      ) : (
        <ScrollView style={styles.factsList}>
          {facts.map(fact => (
            <TouchableOpacity 
              key={fact.id} 
              style={[
                styles.factItem,
                expandedFactId === fact.id && styles.factItemExpanded
              ]}
              onPress={() => toggleFactExpansion(fact.id)}
            >
              <View style={styles.factHeader}>
                <Ionicons 
                  name="cloud-done" // Changed from 'brain'
                  size={16} 
                  color="#2ecc71" 
                  style={styles.factIcon} 
                />
                <Text style={styles.factText} numberOfLines={expandedFactId === fact.id ? undefined : 2}>
                  {fact.memory}
                </Text>
              </View>
              
              {expandedFactId === fact.id && (
                <View style={styles.factDetails}>
                  <View style={styles.factMetadata}>
                    <Text style={styles.factDetailLabel}>Created:</Text>
                    <Text style={styles.factDetailValue}>{formatTimestamp(fact.createdAt)}</Text>
                  </View>
                  
                  {fact.updatedAt && (
                    <View style={styles.factMetadata}>
                      <Text style={styles.factDetailLabel}>Updated:</Text>
                      <Text style={styles.factDetailValue}>{formatTimestamp(fact.updatedAt)}</Text>
                    </View>
                  )}
                  
                  {fact.score !== undefined && (
                    <View style={styles.factMetadata}>
                      <Text style={styles.factDetailLabel}>Relevance:</Text>
                      <Text style={styles.factDetailValue}>{(fact.score * 100).toFixed(1)}%</Text>
                    </View>
                  )}
                  
                  {fact.metadata && fact.metadata.aiResponse && (
                    <View style={styles.factMetadata}>
                      <Text style={styles.factDetailLabel}>AI Response:</Text>
                      <Text style={styles.factDetailValue}>{fact.metadata.aiResponse}</Text>
                    </View>
                  )}
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
    position: 'absolute',
    bottom: 100,
    left: 10,
    right: 10,
    maxHeight: Math.min(Dimensions.get('window').height * 0.4, 300),
    backgroundColor: 'rgba(42, 42, 42, 0.95)',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 2,
  },
  factsList: {
    flex: 1,
  },
  factItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  factItemExpanded: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  factHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  factIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  factText: {
    color: '#fff',
    flex: 1,
    fontSize: 14,
  },
  factDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  factMetadata: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  factDetailLabel: {
    color: '#aaa',
    fontSize: 12,
    width: 70,
  },
  factDetailValue: {
    color: '#ddd',
    fontSize: 12,
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#aaa',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default MemoryOverviewPanel;
