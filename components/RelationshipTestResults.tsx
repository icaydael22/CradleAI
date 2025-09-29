import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Platform,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { theme } from '@/constants/theme';
import { Relationship } from '@/shared/types/relationship-types';
import { RelationshipAction } from '@/shared/types/relationship-types';

// Define the type for test results
export interface RelationshipTestResult {
  postAuthor: {
    id: string;
    name: string;
  };
  postContent: string;
  participants: Array<{
    id: string;
    name: string;
    action: string;
  }>;
  relationshipUpdates: Array<{
    targetId: string;
    targetName: string;
    before: Relationship | null;
    after: Relationship | null;
  }>;
  triggeredActions: RelationshipAction[];
  messages: string[];
}

interface RelationshipTestResultsProps {
  visible: boolean;
  onClose: () => void;
  results: RelationshipTestResult | null;
}

const { width } = Dimensions.get('window');

const RelationshipTestResults: React.FC<RelationshipTestResultsProps> = ({
  visible,
  onClose,
  results
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'logs'>('summary');
  
  if (!results) return null;
  
  // Get summary statistics
  const totalParticipants = results.participants.length;
  const changedRelationships = results.relationshipUpdates.filter(
    update => JSON.stringify(update.before) !== JSON.stringify(update.after)
  ).length;
  const triggeredActions = results.triggeredActions.length;
  
  const renderSummaryTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <Ionicons name="person-circle" size={24} color={theme.colors.primary} />
          <Text style={styles.postAuthor}>{results.postAuthor.name}</Text>
        </View>
        <Text style={styles.postContent}>{results.postContent}</Text>
      </View>
      
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{totalParticipants}</Text>
          <Text style={styles.statLabel}>互动角色</Text>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{changedRelationships}</Text>
          <Text style={styles.statLabel}>关系变化</Text>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{triggeredActions}</Text>
          <Text style={styles.statLabel}>触发行动</Text>
        </View>
      </View>
      
      <Text style={styles.sectionTitle}>参与角色行动</Text>
      {results.participants.map((participant, index) => (
        <View key={index} style={styles.participantItem}>
          <Text style={styles.participantName}>{participant.name}</Text>
          <Text style={styles.participantAction}>{participant.action}</Text>
        </View>
      ))}
      
      {triggeredActions > 0 && (
        <>
          <Text style={styles.sectionTitle}>触发的行动</Text>
          {results.triggeredActions.map((action, index) => (
            <View key={index} style={styles.actionItem}>
              <View style={styles.actionTypeTag}>
                <Text style={styles.actionTypeText}>{action.type}</Text>
              </View>
              <Text style={styles.actionText}>
                {action.sourceCharacterId} → {action.targetCharacterId}
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
  
  const renderDetailsTab = () => (
    <ScrollView style={styles.tabContent}>
      <Text style={styles.sectionTitle}>关系变化详情</Text>
      {results.relationshipUpdates.map((update, index) => {
        // Calculate strength change if both before and after exist
        const strengthChange = 
          update.before && update.after
            ? update.after.strength - update.before.strength
            : 0;
        
        // Determine if relationship type changed
        const typeChanged = 
          update.before && update.after && 
          update.before.type !== update.after.type;
        
        // Determine if this is a new relationship
        const isNew = !update.before && update.after;
        
        return (
          <View key={index} style={styles.updateItem}>
            <View style={styles.updateHeader}>
              <Text style={styles.updateTitle}>
                {results.postAuthor.name} → {update.targetName}
              </Text>
              {isNew && (
                <View style={styles.newTag}>
                  <Text style={styles.newTagText}>新关系</Text>
                </View>
              )}
            </View>
            
            {isNew ? (
              <Text style={styles.newRelationshipText}>
                新建立了类型为 
                <Text style={styles.highlightText}> {update.after?.type} </Text>
                的关系，强度为
                <Text style={styles.highlightText}> {update.after?.strength} </Text>
              </Text>
            ) : (
              <>
                {strengthChange !== 0 && (
                  <View style={styles.strengthChange}>
                    <Text style={styles.strengthChangeLabel}>关系强度:</Text>
                    <Text style={styles.strengthChangeValue}>
                      {update.before?.strength || 0}
                      <Text style={[
                        styles.changeIndicator,
                        strengthChange > 0 ? styles.positiveChange : styles.negativeChange
                      ]}>
                        {' '}{strengthChange > 0 ? '+' : ''}{strengthChange}
                      </Text>
                      → {update.after?.strength || 0}
                    </Text>
                  </View>
                )}
                
                {typeChanged && (
                  <View style={styles.typeChange}>
                    <Text style={styles.typeChangeLabel}>关系类型:</Text>
                    <Text style={styles.typeChangeValue}>
                      {update.before?.type} → 
                      <Text style={styles.highlightText}> {update.after?.type}</Text>
                    </Text>
                  </View>
                )}
                
                {!strengthChange && !typeChanged && (
                  <Text style={styles.noChangeText}>无变化</Text>
                )}
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
  
  const renderLogsTab = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.logsContainer}>
        {results.messages.length > 0 ? (
          results.messages.map((message, index) => (
            <Text key={index} style={styles.logItem}>
              • {message}
            </Text>
          ))
        ) : (
          <Text style={styles.noLogsText}>
            没有详细日志。要查看详细日志，请在测试选项中启用"显示详细日志"选项。
          </Text>
        )}
      </View>
    </ScrollView>
  );
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <BlurView intensity={60} tint="dark" style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>关系测试结果</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'summary' && styles.activeTab
              ]}
              onPress={() => setActiveTab('summary')}
            >
              <Text style={[
                styles.tabText,
                activeTab === 'summary' && styles.activeTabText
              ]}>
                摘要
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'details' && styles.activeTab
              ]}
              onPress={() => setActiveTab('details')}
            >
              <Text style={[
                styles.tabText,
                activeTab === 'details' && styles.activeTabText
              ]}>
                详细变化
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === 'logs' && styles.activeTab
              ]}
              onPress={() => setActiveTab('logs')}
            >
              <Text style={[
                styles.tabText,
                activeTab === 'logs' && styles.activeTabText
              ]}>
                日志
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.contentContainer}>
            {activeTab === 'summary' && renderSummaryTab()}
            {activeTab === 'details' && renderDetailsTab()}
            {activeTab === 'logs' && renderLogsTab()}
          </View>
          
          <TouchableOpacity 
            style={styles.doneButton}
            onPress={onClose}
          >
            <Text style={styles.doneButtonText}>关闭</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </BlurView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 30 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  closeButton: {
    padding: 8,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    color: '#ccc',
    fontSize: 15,
  },
  activeTabText: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  postCard: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  postAuthor: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  postContent: {
    fontSize: 15,
    color: '#eee',
    lineHeight: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: '#ccc',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    height: '80%',
    alignSelf: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    marginTop: 8,
  },
  participantItem: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  participantName: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
  },
  participantAction: {
    fontSize: 14,
    color: '#ccc',
    maxWidth: width * 0.6,
    textAlign: 'right',
  },
  actionItem: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 224, 195, 0.2)',
  },
  actionTypeTag: {
    backgroundColor: 'rgba(255, 224, 195, 0.2)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  actionTypeText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
  actionText: {
    fontSize: 14,
    color: '#fff',
  },
  updateItem: {
    backgroundColor: 'rgba(50, 50, 50, 0.8)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  updateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  updateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  newTag: {
    backgroundColor: 'rgba(80, 200, 120, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  newTagText: {
    color: '#50C878',
    fontSize: 12,
    fontWeight: '500',
  },
  strengthChange: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  strengthChangeLabel: {
    width: 70,
    fontSize: 14,
    color: '#ccc',
  },
  strengthChangeValue: {
    fontSize: 14,
    color: '#fff',
  },
  typeChange: {
    flexDirection: 'row',
  },
  typeChangeLabel: {
    width: 70,
    fontSize: 14,
    color: '#ccc',
  },
  typeChangeValue: {
    fontSize: 14,
    color: '#fff',
  },
  changeIndicator: {
    fontWeight: 'bold',
  },
  positiveChange: {
    color: '#50C878',
  },
  negativeChange: {
    color: '#FF4444',
  },
  highlightText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  noChangeText: {
    color: '#999',
    fontStyle: 'italic',
  },
  newRelationshipText: {
    color: '#fff',
    fontSize: 14,
  },
  logsContainer: {
    backgroundColor: 'rgba(40, 40, 40, 0.8)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  logItem: {
    color: '#ddd',
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  noLogsText: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  doneButton: {
    backgroundColor: theme.colors.primary,
    margin: 16,
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#222',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default RelationshipTestResults;
