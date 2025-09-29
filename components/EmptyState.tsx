import React from 'react';
import { View } from 'react-native';
import EmptyStateView from '@/components/EmptyStateView';

// 保留兼容性的接口
interface EmptyStateProps {
  message: string;
  title?: string;
  icon?: string;
  action?: () => void;
  actionText?: string;
}

// 保留原来的组件名，但内部使用新的 EmptyStateView 组件
const EmptyState: React.FC<EmptyStateProps> = ({ 
  message, 
  title, 
  icon = 'alert-circle-outline',
  action,
  actionText
}) => {
  return (
    <View style={{ flex: 1 }}>
      <EmptyStateView
        title={title}
        message={message}
        icon={icon}
        buttonText={actionText}
        onButtonPress={action}
      />
    </View>
  );
};

export default EmptyState;
