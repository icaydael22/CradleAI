import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, View, Text, TouchableOpacity, SafeAreaView, useWindowDimensions, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { NodeST, RequestLogData } from '@/NodeST/nodest';

// 主题色与 global-settings 保持一致
const theme = {
  colors: {
    background: '#18181c',
    cardBackground: '#23232a',
    primary: '#f7c325',
    text: '#fff',
    textSecondary: '#aaa',
    danger: '#e74c3c',
    success: '#27ae60',
    black: '#18181c',
  }
};

export default function LogScreen() {
  const [requestLog, setRequestLog] = useState<RequestLogData | null>(null);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();

  // NodeST 实例 - 在实际应用中，这可能是从全局状态或context中获取
  const nodeST = React.useMemo(() => new NodeST(), []);

  // 获取最新日志
  const fetchLatestLog = React.useCallback(() => {
    try {
      const latestLog = nodeST.getLatestApiRequestLog();
      setRequestLog(latestLog);
    } catch (error) {
      console.error('Error fetching log:', error);
    }
  }, [nodeST]);

  // 屏幕获得焦点或组件挂载时刷新
  useEffect(() => {
    if (isFocused) {
      fetchLatestLog();
    }
  }, [isFocused, fetchLatestLog]);

  // 每5秒自动刷新一次
  useEffect(() => {
    if (isFocused) {
      const interval = setInterval(fetchLatestLog, 5000);
      return () => clearInterval(interval);
    }
  }, [isFocused, fetchLatestLog]);

  // 格式化请求对象
  const formatRequest = (request: any): string => {
    try {
      if (Array.isArray(request)) {
        return request.map((msg, i) => {
          const role = msg.role || 'unknown';
          const content = msg.parts ?
            msg.parts.map((part: any, j: number) =>
              `    Part ${j + 1}: ${typeof part.text === 'string' ? part.text.substring(0, 100) + '...' : 'N/A'}`
            ).join('\n') :
            msg.content ? `    Content: ${msg.content.substring(0, 100)}...` : 'No content';

          return `Message ${i + 1} [${role}]:\n${content}`;
        }).join('\n\n');
      } else {
        return JSON.stringify(request, null, 2);
      }
    } catch (e) {
      return `Error formatting request: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  // 响应内容格式化（如为对象则格式化为字符串）
  const formatResponse = (response: any): string => {
    if (typeof response === 'string') return response;
    if (response == null) return '';
    try {
      return JSON.stringify(response, null, 2);
    } catch {
      return String(response);
    }
  };

  // 响应状态判断
  const getResponseStatus = (requestLog: RequestLogData | null) => {
    if (!requestLog) return { ok: false, msg: '无响应', code: undefined, text: undefined, error: undefined };
    // 优先用结构化字段
    if (typeof requestLog.statusCode !== 'undefined' || requestLog.statusText || requestLog.errorMessage) {
      const ok = !requestLog.statusCode || (requestLog.statusCode >= 200 && requestLog.statusCode < 400);
      let msg = '';
      if (ok) {
        msg = requestLog.statusText || '响应成功';
      } else {
        msg = requestLog.errorMessage || requestLog.statusText || '响应失败';
      }
      return {
        ok,
        msg,
        code: requestLog.statusCode,
        text: requestLog.statusText,
        error: requestLog.errorMessage,
      };
    }
    // fallback: 旧逻辑
    if (!requestLog.response) return { ok: false, msg: '无响应', code: undefined, text: undefined, error: undefined };
    if (typeof requestLog.response === 'object' && requestLog.response !== null && 'error' in requestLog.response) {
      const response = requestLog.response as { error?: { message?: string } };
      return { ok: false, msg: response.error?.message || '响应失败', code: undefined, text: undefined, error: undefined };
    }
    return { ok: true, msg: '响应成功', code: undefined, text: undefined, error: undefined };
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="auto" />
      {/* 顶部标签栏整体下移，避开状态栏 */}
      <View style={[styles.header]}>
        <Text style={styles.headerTitle}>API 日志</Text>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'request' && styles.tabActive]}
          onPress={() => setActiveTab('request')}
        >
          <Text style={[styles.tabText, activeTab === 'request' && styles.tabTextActive]}>请求体</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'response' && styles.tabActive]}
          onPress={() => setActiveTab('response')}
        >
          <Text style={[styles.tabText, activeTab === 'response' && styles.tabTextActive]}>响应</Text>
        </TouchableOpacity>
      </View>
      {/* 内容区 */}
      <View style={styles.flex1}>
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
        >
          {requestLog ? (
            activeTab === 'request' ? (
              <View style={styles.card}>
                <ScrollView style={styles.codeBlock} contentContainerStyle={{ flexGrow: 1 }} >
                  <Text style={styles.codeText}>
                    {formatRequest(requestLog.request)}
                  </Text>
                </ScrollView>
              </View>
            ) : (
              <View style={[styles.card, { flex: 1 }]}>
                {/* 响应状态区域 */}
                <View style={styles.statusRow}>
                  {(() => {
                    const status = getResponseStatus(requestLog);
                    return (
                      <>
                        <View style={[
                          styles.statusBadge,
                          { backgroundColor: status.ok ? theme.colors.success : theme.colors.danger }
                        ]}>
                          <Text style={styles.statusText}>{status.ok ? '成功' : '失败'}</Text>
                        </View>
                        <Text style={styles.statusMsg}>
                          {status.code ? `[${status.code}] ` : ''}
                          {status.msg}
                        </Text>
                      </>
                    );
                  })()}
                </View>
                {/* 响应内容区域 */}
                <ScrollView style={[styles.codeBlock, { flex: 1 }]} contentContainerStyle={{ flexGrow: 1 }}>
                  <Text style={styles.codeText}>
                    {requestLog.response ? formatResponse(requestLog.response) : '等待响应...'}
                  </Text>
                </ScrollView>
              </View>
            )
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>无可用日志数据</Text>
              <Text style={styles.noDataSubtext}>请发送一条消息</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    height: 56,
    backgroundColor: theme.colors.black,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.primary,
  },
  tabText: {
    color: '#888',
    fontSize: 16,
  },
  tabTextActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  flex1: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    padding: 16,
  },
  card: {
    backgroundColor: theme.colors.cardBackground,
    borderRadius: 10,
    padding: 0,
    flex: 1,
    minHeight: 200,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    overflow: 'hidden',
  },
  codeBlock: {
    backgroundColor: '#23232a',
    padding: 16,
    flex: 1,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 20,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    backgroundColor: theme.colors.cardBackground,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginRight: 10,
  },
  statusText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusMsg: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    flex: 1,
    flexWrap: 'wrap',
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  noDataText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#888',
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 8,
  },
});
