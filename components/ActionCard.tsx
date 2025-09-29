import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Character } from '@/shared/types';
import { RelationshipAction, ActionType } from '@/shared/types/relationship-types';

interface ActionCardProps {
  action: RelationshipAction;
  sourceCharacter?: Character;
  targetCharacter?: Character;
  onRespond: (response: 'accept' | 'reject') => void;
  currentCharacterId?: string; // Add this to check if the current character is the target
}

const ActionCard: React.FC<ActionCardProps> = ({ 
  action, 
  sourceCharacter, 
  targetCharacter, 
  onRespond,
  currentCharacterId
}) => {
  const isPending = action.status === 'pending';
  const isTargetCharacter = currentCharacterId === action.targetCharacterId;
  const statusColors = {
    pending: '#FF9ECD',
    accepted: '#4CAF50',
    rejected: '#F44336',
    expired: '#9E9E9E'
  };
  
  // Map action types to icons and display names - match RelationshipActions
  const getActionInfo = (type: ActionType) => {
    switch (type) {
      case 'gift':
        return {
          icon: 'gift',
          label: '礼物',
          description: '想要送你一件礼物'
        };
      case 'invitation':
        return {
          icon: 'calendar-alt',
          label: '邀请',
          description: '邀请你参加活动'
        };
      case 'challenge':
        return {
          icon: 'fire-alt',
          label: '挑战',
          description: '向你发起挑战'
        };
      case 'support':
        return {
          icon: 'hand-holding-heart',
          label: '支持',
          description: '想向你表达支持'
        };
      case 'confession':
        return {
          icon: 'heart',
          label: '表白',
          description: '想向你表达心意'
        };
      default:
        return {
          icon: 'star',
          label: '互动',
          description: '想与你互动'
        };
    }
  };
  
  const actionInfo = getActionInfo(action.type);
  
  // Calculate remaining time for pending actions - same logic as RelationshipActions
  const getTimeRemaining = () => {
    if (action.status !== 'pending') return '';
    
    const now = Date.now();
    const remaining = action.expiresAt - now;
    
    if (remaining <= 0) return '即将过期';
    
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return `${days}天${hours}小时后过期`;
    } else if (hours > 0) {
      return `${hours}小时后过期`;
    } else {
      return '即将过期';
    }
  };
  
  return (
    <View style={styles.actionCard}>
      <View style={styles.actionHeader}>
        <View style={styles.actionCharacters}>
          {sourceCharacter?.avatar ? (
            <Image source={{ uri: sourceCharacter.avatar }} style={styles.actionAvatar} />
          ) : (
            <View style={[styles.actionAvatar, styles.actionAvatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {sourceCharacter?.name?.[0] || '?'}
              </Text>
            </View>
          )}
          
          <View style={styles.actionArrow}>
            <FontAwesome5 name="long-arrow-alt-right" size={16} color="#fff" />
          </View>
          
          {targetCharacter?.avatar ? (
            <Image source={{ uri: targetCharacter.avatar }} style={styles.actionAvatar} />
          ) : (
            <View style={[styles.actionAvatar, styles.actionAvatarPlaceholder]}>
              <Text style={styles.avatarInitial}>
                {targetCharacter?.name?.[0] || '?'}
              </Text>
            </View>
          )}
        </View>
        
        <View style={[
          styles.actionStatus,
          { backgroundColor: statusColors[action.status] }
        ]}>
          <Text style={styles.actionStatusText}>
            {action.status === 'pending' ? '待处理' : 
             action.status === 'accepted' ? '已接受' :
             action.status === 'rejected' ? '已拒绝' : '已过期'}
          </Text>
        </View>
      </View>
      
      <View style={styles.actionTypeContainer}>
        <View style={styles.actionTypeIcon}>
          <FontAwesome5 name={actionInfo.icon} size={16} color="#FF9ECD" />
        </View>
        <Text style={styles.actionType}>{actionInfo.label}</Text>
        
        {isPending && (
          <Text style={styles.expiryTime}>{getTimeRemaining()}</Text>
        )}
      </View>
      
      <Text style={styles.actionContent}>{action.content}</Text>
      
      <Text style={styles.actionTime}>
        {format(new Date(action.createdAt), 'yyyy-MM-dd HH:mm')}
      </Text>
      
      {action.responseContent && (
        <View style={styles.responseContainer}>
          <Text style={styles.responseLabel}>回应：</Text>
          <Text style={styles.responseContent}>{action.responseContent}</Text>
          {action.respondedAt && (
            <Text style={styles.responseTime}>
              {format(new Date(action.respondedAt), 'yyyy-MM-dd HH:mm')}
            </Text>
          )}
        </View>
      )}
      
      {/* Only show action buttons if this is pending AND the current character is the target */}
      {isPending && isTargetCharacter && (
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => onRespond('accept')}
          >
            <FontAwesome5 name="check" size={14} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.actionButtonText}>接受</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.rejectButton]}
            onPress={() => onRespond('reject')}
          >
            <FontAwesome5 name="times" size={14} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.actionButtonText}>拒绝</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  actionCard: {
    backgroundColor: 'rgba(51, 51, 51, 0.95)',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
    elevation: 3,
  },
  actionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  actionCharacters: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  actionAvatarPlaceholder: {
    backgroundColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionArrow: {
    marginHorizontal: 8,
  },
  actionStatus: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  actionStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  actionTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionTypeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 156, 205, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  actionType: {
    color: '#FF9ECD',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  expiryTime: {
    color: '#999',
    fontSize: 12,
  },
  actionContent: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  actionTime: {
    color: '#999',
    fontSize: 12,
  },
  responseContainer: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  responseLabel: {
    color: '#999',
    fontSize: 14,
    marginBottom: 4,
  },
  responseContent: {
    color: '#fff',
    fontSize: 14,
  },
  responseTime: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonIcon: {
    marginRight: 6,
  },
  acceptButton: {
    backgroundColor: '#4CAF50', // Green
  },
  rejectButton: {
    backgroundColor: '#F44336', // Red
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
});

export default ActionCard;
