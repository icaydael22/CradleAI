import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Character } from '@/shared/types';
import { RelationshipAction, ActionType, ActionStatus } from '@/services/action-service';
import { ActionService } from '@/services/action-service';
import { RelationshipPromptService } from '@/services/relationship-prompt-service';
import { useUser } from '@/constants/UserContext';

interface Props {
  character: Character;
  allCharacters: Record<string, Character>;
  onUpdateCharacters: (updatedCharacters: Character[]) => void;
}

const RelationshipActions: React.FC<Props> = ({
  character,
  allCharacters,
  onUpdateCharacters
}) => {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pendingActions, setPendingActions] = useState<RelationshipAction[]>([]);
  const [historyActions, setHistoryActions] = useState<RelationshipAction[]>([]);
  const [selectedAction, setSelectedAction] = useState<RelationshipAction | null>(null);
  const [isResponseModalVisible, setIsResponseModalVisible] = useState(false);
  const [processingResponse, setProcessingResponse] = useState(false);
  const [generatedResponse, setGeneratedResponse] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});

  const { user } = useUser();
  
  // Check for expired actions and load initial data
  useEffect(() => {
    if (character?.id) {
      loadActions();
    }
  }, [character?.id]);
  
  const loadActions = () => {
    setLoading(true);
    
    try {
      // Expire old actions first
      const updatedCharacter = ActionService.expireOldActions(character);
      
      // If actions were expired, update the character
      if (updatedCharacter !== character) {
        onUpdateCharacters([updatedCharacter]);
      }
      
      // Get pending actions
      const pending = ActionService.getPendingActions(updatedCharacter);
      setPendingActions(pending);
      
      // Get action history (limited to 10)
      const history = ActionService.getActionHistory(updatedCharacter, 10);
      setHistoryActions(history);
      
    } catch (error) {
      console.error('关系行动加载失败:', error);
      Alert.alert('错误', '加载关系行动时发生错误');
    } finally {
      setLoading(false);
    }
  };
  
  const generateNewActions = async () => {
    setGenerating(true);
    
    try {
      // Check for potential actions
      const newActions = ActionService.checkForPotentialActions(character);
      
      // If new actions are found, update the character
      if (newActions.length > 0) {
        const updatedCharacter = {
          ...character,
          relationshipActions: [
            ...(character.relationshipActions || []),
            ...newActions
          ]
        };
        
        onUpdateCharacters([updatedCharacter]);
        
        // Reload actions
        loadActions();
        
        Alert.alert(
          '发现新行动', 
          `已生成 ${newActions.length} 个新的关系行动`
        );
      } else {
        Alert.alert('没有新行动', '暂时没有新的关系行动可以生成');
      }
    } catch (error) {
      console.error('生成关系行动失败:', error);
      Alert.alert('错误', '生成关系行动时发生错误');
    } finally {
      setGenerating(false);
    }
  };
  
  const handleActionResponse = async (action: RelationshipAction, response: 'accept' | 'reject') => {
    setSelectedAction(action);
    setIsResponseModalVisible(true);
    setProcessingResponse(true);
    
    try {
      // Use OpenRouter to generate personalized response
      const sourceCharacter = allCharacters[action.sourceCharacterId];
      const targetCharacter = allCharacters[action.targetCharacterId];
      
      if (sourceCharacter && targetCharacter) {
        // Prepare API settings
        const apiKey = user?.settings?.chat?.characterApiKey;
        const apiSettings = {
          apiProvider: user?.settings?.chat?.apiProvider || 'gemini',
          openrouter: user?.settings?.chat?.openrouter
        };
        
        // Only generate responses if we have API key and characters
        if (apiKey) {
          // Determine the scenario based on action type
          const scenario = action.type === 'gift' ? 'gift' :
                         action.type === 'invitation' ? 'invitation' :
                         action.type === 'challenge' ? 'challenge' :
                         action.type === 'support' ? 'support' :
                         action.type === 'confession' ? 'confession' : 'meeting';
                         
          // Generate response based on relationship
          const generatedContent = await RelationshipPromptService.generateInteractionResponse(
            targetCharacter, // Character responding
            sourceCharacter, // Character who initiated
            {
              scenario: scenario,
              detail: action.content
            },
            apiKey,
            apiSettings
          );
          
          setGeneratedResponse(generatedContent);
        } else {
          // If no API key, use a default response
          setGeneratedResponse(response === 'accept' ? 
            `我接受了${sourceCharacter.name}的${getActionTypeText(action.type)}。` : 
            `我拒绝了${sourceCharacter.name}的${getActionTypeText(action.type)}。`
          );
        }
      }
      
      // Process action response via action service
      const updatedCharacters = ActionService.processActionResponse(
        action,
        response,
        allCharacters
      );
      
      // Update characters
      onUpdateCharacters(Object.values(updatedCharacters));
      
      // Reload actions after a short delay
      setTimeout(() => {
        loadActions();
      }, 1000);
      
    } catch (error) {
      console.error('处理关系行动响应失败:', error);
      Alert.alert('错误', '处理关系行动响应时发生错误');
      setIsResponseModalVisible(false);
    } finally {
      setProcessingResponse(false);
    }
  };
  
  const getActionTypeText = (type: ActionType): string => {
    switch(type) {
      case 'gift': return '礼物';
      case 'invitation': return '邀请';
      case 'challenge': return '挑战';
      case 'support': return '支持';
      case 'confession': return '表白';
      default: return '行动';
    }
  };
  
  const getActionStatusText = (status: ActionStatus): string => {
    switch(status) {
      case 'pending': return '待处理';
      case 'accepted': return '已接受';
      case 'rejected': return '已拒绝';
      case 'expired': return '已过期';
      default: return '未知';
    }
  };
  
  const getActionStatusColor = (status: ActionStatus): string => {
    switch(status) {
      case 'pending': return '#FF9500';
      case 'accepted': return '#4CD964';
      case 'rejected': return '#FF3B30';
      case 'expired': return '#8E8E93';
      default: return '#CCCCCC';
    }
  };
  
  const getActionTypeIcon = (type: ActionType) => {
    switch(type) {
      case 'gift': return 'gift-outline';
      case 'invitation': return 'calendar-outline';
      case 'challenge': return 'flame-outline';
      case 'support': return 'hand-left-outline';
      case 'confession': return 'heart-outline';
      default: return 'ellipsis-horizontal-outline';
    }
  };
  
  const renderAction = ({ item }: { item: RelationshipAction }) => {
    const sourceCharacter = allCharacters[item.sourceCharacterId];
    const targetCharacter = allCharacters[item.targetCharacterId];
    const isPending = item.status === 'pending';
    
    // Skip if characters don't exist
    if (!sourceCharacter || !targetCharacter) {
      return null;
    }

    return (
      <View style={styles.actionCard}>
        <View style={styles.actionHeader}>
          <Ionicons 
            name={getActionTypeIcon(item.type)} 
            size={24} 
            color={isPending ? "#FF9ECD" : "#999"} 
          />
          <View style={styles.actionHeaderContent}>
            <Text style={styles.actionSource}>{sourceCharacter.name}</Text>
            <Text style={styles.actionTarget}>→ {targetCharacter.name}</Text>
          </View>
          <View style={[
            styles.actionStatus,
            { backgroundColor: getActionStatusColor(item.status) }
          ]}>
            <Text style={styles.actionStatusText}>
              {getActionStatusText(item.status)}
            </Text>
          </View>
        </View>
        
        <Text style={styles.actionContent}>{item.content}</Text>
        
        {item.respondedAt && (
          <Text style={styles.actionTimestamp}>
            响应时间: {new Date(item.respondedAt).toLocaleString()}
          </Text>
        )}
        
        {isPending && targetCharacter.id === character.id && (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.acceptButton]}
              onPress={() => handleActionResponse(item, 'accept')}
            >
              <Text style={styles.actionButtonText}>接受</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.rejectButton]}
              onPress={() => handleActionResponse(item, 'reject')}
            >
              <Text style={styles.actionButtonText}>拒绝</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {item.responseContent && (
          <View style={styles.responseContainer}>
            <Text style={styles.responseLabel}>响应:</Text>
            <Text style={styles.responseContent}>{item.responseContent}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>关系行动</Text>
        <TouchableOpacity 
          style={styles.generateButton}
          onPress={generateNewActions}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
              <Text style={styles.generateButtonText}>生成新行动</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      
      {/* Sections */}
      <View style={styles.sectionContainer}>
        {/* Pending actions section */}
        <Text style={styles.sectionTitle}>待处理行动 ({pendingActions.length})</Text>
        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : pendingActions.length === 0 ? (
          <Text style={styles.emptyText}>没有待处理的关系行动</Text>
        ) : (
          <FlatList
            data={pendingActions}
            renderItem={renderAction}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
      
      {/* History section */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>历史行动 ({historyActions.length})</Text>
        {loading ? (
          <ActivityIndicator style={styles.loading} />
        ) : historyActions.length === 0 ? (
          <Text style={styles.emptyText}>没有历史关系行动</Text>
        ) : (
          <FlatList
            data={historyActions}
            renderItem={renderAction}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
      
      {/* Response Modal */}
      <Modal
        visible={isResponseModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsResponseModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.responseModal}>
            <Text style={styles.responseModalTitle}>行动响应</Text>
            
            {processingResponse ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color="#FF9ECD" />
                <Text style={styles.processingText}>处理中...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.generatedResponseText}>{generatedResponse}</Text>
                
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={() => setIsResponseModalVisible(false)}
                >
                  <Text style={styles.closeButtonText}>关闭</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#222',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9ECD',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  generateButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '500',
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'white',
    marginBottom: 8,
  },
  loading: {
    marginVertical: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    marginVertical: 16,
  },
  listContent: {
    paddingBottom: 8,
  },
  actionCard: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionHeaderContent: {
    flex: 1,
    marginLeft: 12,
  },
  actionSource: {
    color: 'white',
    fontWeight: '500',
  },
  actionTarget: {
    color: '#999',
    fontSize: 12,
  },
  actionStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  actionStatusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  actionContent: {
    color: 'white',
    marginBottom: 12,
  },
  actionTimestamp: {
    color: '#999',
    fontSize: 12,
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    marginLeft: 8,
  },
  acceptButton: {
    backgroundColor: '#4CD964',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  responseContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#444',
  },
  responseLabel: {
    color: '#999',
    marginBottom: 4,
  },
  responseContent: {
    color: 'white',
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  responseModal: {
    width: '80%',
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 20,
  },
  responseModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
    textAlign: 'center',
  },
  processingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  processingText: {
    color: '#ccc',
    marginTop: 16,
  },
  generatedResponseText: {
    color: 'white',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#555',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    alignSelf: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontWeight: '500',
  },
});

export default RelationshipActions;