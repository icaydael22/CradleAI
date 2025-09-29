import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import axios from 'axios';

interface QueueStatusProps {
  apiServer: string;
  isVisible: boolean;
  onClose: () => void;
  currentTaskId?: string | null;
}

interface ServerQueueStats {
  active_tasks: number;
  last_updated: string;
  queue_status: {
    total_pending: number;
    queue_positions: {[key: string]: number};
    last_updated: number;
  };
}

const QueueStatusPanel: React.FC<QueueStatusProps> = ({
  apiServer,
  isVisible,
  onClose,
  currentTaskId
}) => {
  const [queueStats, setQueueStats] = useState<ServerQueueStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // 定期获取队列状态
  useEffect(() => {
    if (!isVisible) return;
    
    const fetchQueueStatus = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await axios.get(`${apiServer}/queue_status`);
        setQueueStats(response.data);
      } catch (err) {
        setError('获取队列状态失败');
        console.error('获取队列状态出错:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    // 立即获取一次
    fetchQueueStatus();
    
    // 每10秒更新一次
    const intervalId = setInterval(fetchQueueStatus, 10000);
    
    return () => {
      clearInterval(intervalId);
    };
  }, [isVisible, apiServer]);
  
  // 计算当前任务的队列位置
  const getCurrentTaskPosition = () => {
    if (!currentTaskId || !queueStats?.queue_status?.queue_positions) return null;
    return queueStats.queue_status.queue_positions[currentTaskId] || null;
  };
  
  if (!isVisible) return null;
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>服务器队列状态</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>关闭</Text>
        </TouchableOpacity>
      </View>
      
      {isLoading && !queueStats ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#3498db" />
          <Text style={styles.loadingText}>加载队列信息...</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : queueStats ? (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>
            活跃任务数: <Text style={styles.highlightText}>{queueStats.active_tasks}</Text>
          </Text>
          <Text style={styles.statsText}>
            等待中任务: <Text style={styles.highlightText}>{queueStats.queue_status.total_pending}</Text>
          </Text>
          
          {getCurrentTaskPosition() && (
            <View style={styles.currentTaskInfo}>
              <Text style={styles.currentTaskText}>
                您的任务位置: <Text style={styles.highlightText}>{getCurrentTaskPosition()}</Text>
              </Text>
              <View style={styles.progressBarContainer}>
                <View style={[
                  styles.progressBar, 
                  { width: `${Math.max(5, 100 - (getCurrentTaskPosition()! / queueStats.queue_status.total_pending * 100))}%` }
                ]} />
              </View>
            </View>
          )}
          
          <Text style={styles.lastUpdatedText}>
            最后更新: {queueStats.last_updated}
          </Text>
        </View>
      ) : (
        <Text style={styles.noDataText}>无队列数据</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    margin: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    color: '#3498db',
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#666',
    marginTop: 10,
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    padding: 20,
  },
  statsContainer: {
    padding: 10,
  },
  statsText: {
    fontSize: 15,
    color: '#555',
    marginBottom: 8,
  },
  highlightText: {
    fontWeight: 'bold',
    color: '#3498db',
  },
  currentTaskInfo: {
    marginTop: 10,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  currentTaskText: {
    fontSize: 15,
    color: '#555',
    marginBottom: 10,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#eaeaea',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#3498db',
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#999',
    marginTop: 15,
    textAlign: 'right',
  },
  noDataText: {
    color: '#999',
    textAlign: 'center',
    padding: 20,
  },
});

export default QueueStatusPanel;
