import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { ScriptService } from '@/services/script-service';

interface ArchiveItem {
  id: string;
  label: string;
  createdAt: number;
}

interface Props {
  visible: boolean;
  scriptId: string;
  onClose: () => void;
  onCreateArchive: (viewStateRequested: boolean) => Promise<void>; // 调用页面逻辑触发保存（需要先请求WebView状态）
  onRestoreArchive: (archiveId: string) => Promise<void>;
}

const ScriptArchiveSidebar: React.FC<Props> = ({ visible, scriptId, onClose, onCreateArchive, onRestoreArchive }) => {
  const scriptService = ScriptService.getInstance();
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const loadArchives = useCallback(async () => {
    if (!scriptId) return;
    try {
      setLoading(true);
      const list = await scriptService.listArchives(scriptId);
      // 只显示元信息
      const mapped = list.sort((a: any, b: any) => b.createdAt - a.createdAt).map((a: any) => ({ id: a.id, label: a.label, createdAt: a.createdAt }));
      setArchives(mapped);
    } catch (e) {
      console.warn('[ScriptArchiveSidebar] 加载存档失败:', e);
    } finally {
      setLoading(false);
    }
  }, [scriptId, scriptService]);

  useEffect(() => {
    if (visible) loadArchives();
  }, [visible, loadArchives]);

  const handleCreate = async () => {
    await onCreateArchive(true);
    await loadArchives();
  };

  const handleRestore = async (id: string) => {
    try {
      setRestoring(id);
      await onRestoreArchive(id);
      onClose();
    } catch (e) {
      Alert.alert('错误', '读档失败');
    } finally {
      setRestoring(null);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('删除存档', '确认删除该存档？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: async () => {
        try {
          await scriptService.deleteArchive(scriptId, id);
          await loadArchives();
        } catch (e) {
          Alert.alert('错误', '删除失败');
        }
      }}
    ]);
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.panel}>
        <View style={styles.header}>
          <Text style={styles.title}>存档/读档</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}><Text style={styles.closeText}>×</Text></TouchableOpacity>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate}>
            <Text style={styles.primaryBtnText}>+ 新建存档</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={archives}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 60 }}
            renderItem={({ item }) => (
              <View style={styles.archiveItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.archiveLabel} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.archiveTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>
                <View style={styles.itemButtons}>
                  <TouchableOpacity style={styles.smallBtn} onPress={() => handleRestore(item.id)} disabled={!!restoring}>
                    <Text style={styles.smallBtnText}>{restoring === item.id ? '读取中' : '读取'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.smallBtn, styles.deleteBtn]} onPress={() => handleDelete(item.id)}>
                    <Text style={[styles.smallBtnText, { color: '#ff6b6b' }]}>删除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.empty}>暂无存档</Text>}
          />
        )}
        <View style={styles.footer}>
          <Text style={styles.footerHint}>存档内容包含：历史、变量状态、渲染状态</Text>
        </View>
      </View>
    </View>
  );
};

const PANEL_WIDTH = 300;

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  panel: {
    width: PANEL_WIDTH,
    backgroundColor: '#222',
    paddingTop: 50,
    paddingHorizontal: 14,
    paddingBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowOffset: { width: -2, height: 0 },
    shadowRadius: 6,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '600', flex: 1 },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: { color: '#999', fontSize: 24, lineHeight: 24 },
  actions: { marginTop: 16, marginBottom: 8 },
  primaryBtn: { backgroundColor: '#7b2fff', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  archiveItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomColor: '#333', borderBottomWidth: 1 },
  archiveLabel: { color: '#fff', fontSize: 14 },
  archiveTime: { color: '#777', fontSize: 11, marginTop: 2 },
  itemButtons: { flexDirection: 'row', marginLeft: 8 },
  smallBtn: { backgroundColor: '#444', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, marginLeft: 6 },
  smallBtnText: { color: '#fff', fontSize: 12 },
  deleteBtn: { backgroundColor: '#332' },
  empty: { color: '#666', textAlign: 'center', marginTop: 40 },
  footer: { paddingVertical: 10 },
  footerHint: { color: '#555', fontSize: 11, textAlign: 'center' }
});

export default ScriptArchiveSidebar;
