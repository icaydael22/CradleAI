import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Relationship } from '../shared/types/relationship-types';

interface RelationshipTimelineProps {
  relationship: Relationship;
}

const RelationshipTimeline: React.FC<RelationshipTimelineProps> = ({ relationship }) => {
  // For now, we don't have historical data, so we'll just show the current state
  // In the future, we could add a relationship history array to track changes
  
  const getRelationshipColor = (strength: number) => {
    if (strength < -50) return '#FF4949';      // Strong negative - red
    if (strength < 0) return '#FFA149';        // Negative - orange
    if (strength < 50) return '#49B6FF';       // Positive - blue
    return '#49FF83';                          // Strong positive - green
  };
  
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Relationship Timeline</Text>
      
      <View style={styles.timelineItem}>
        <View style={[
          styles.strengthIndicator, 
          { backgroundColor: getRelationshipColor(relationship.strength) }
        ]} />
        <View style={styles.timelineContent}>
          <Text style={styles.timelineDate}>
            {formatDate(relationship.lastUpdated)}
          </Text>
          <Text style={styles.timelineType}>
            Type: {relationship.type}
          </Text>
          <Text style={styles.timelineStrength}>
            Strength: {relationship.strength}
          </Text>
          <Text style={styles.timelineDescription}>
            {relationship.description || 'No description available'}
          </Text>
        </View>
      </View>
      
      {relationship.interactions > 1 && (
        <Text style={styles.interactionCount}>
          Total interactions: {relationship.interactions}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginVertical: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    marginVertical: 8,
  },
  strengthIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineDate: {
    fontSize: 14,
    color: '#666',
  },
  timelineType: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  timelineStrength: {
    fontSize: 14,
    marginTop: 2,
  },
  timelineDescription: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
  },
  interactionCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
  },
});

export default RelationshipTimeline;
