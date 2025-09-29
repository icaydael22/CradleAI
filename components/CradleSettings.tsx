import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Switch,
  ScrollView,
  SafeAreaView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CradleSettingsProps {
  isVisible: boolean;
  embedded?: boolean;
  onClose: () => void;
  isCradleEnabled: boolean;
  onCradleToggle: (enabled: boolean) => void;
  onUpdateSettings: (settings: any) => void;
}

export default function CradleSettings({
  isVisible,
  embedded = false,
  onClose,
  isCradleEnabled,
  onCradleToggle,
  onUpdateSettings
}: CradleSettingsProps) {
  const [localEnabled, setLocalEnabled] = useState(isCradleEnabled);
  const [isDirty, setIsDirty] = useState(false);

  // Handle toggle
  const handleToggle = (value: boolean) => {
    setLocalEnabled(value);
    setIsDirty(true);
  };

  // Handle save
  const handleSave = () => {
    onCradleToggle(localEnabled);
    onClose();
  };

  // Reset values when modal opens or component mounts in embedded mode
  React.useEffect(() => {
    if (isVisible || embedded) {
      setLocalEnabled(isCradleEnabled);
      setIsDirty(false);
    }
  }, [isVisible, embedded, isCradleEnabled]);

  const content = (
    <>
      <ScrollView style={styles.content}>
        {/* Enable/Disable Toggle */}
        <View style={styles.settingItem}>
          <View style={styles.settingDescription}>
            <Text style={styles.settingTitle}>启用摇篮系统</Text>
            <Text style={styles.settingSubtitle}>
              启用后，摇篮系统将激活
            </Text>
          </View>
          <Switch
            value={localEnabled}
            onValueChange={handleToggle}
            trackColor={{ false: '#555', true: '#4A90E2' }}
            thumbColor={localEnabled ? '#fff' : '#f4f3f4'}
          />
        </View>

        {/* Information Section */}
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>关于摇篮系统</Text>
          <Text style={styles.infoText}>
            摇篮系统提供了一种管理和与AI角色互动的方式。在这里您可以与创建的角色进行对话，生成图片，并通过对话修改角色设定。
          </Text>
          
          <View style={styles.infoListItem}>
            <Ionicons name="chatbubble-outline" size={18} color="#4A90E2" style={styles.infoIcon} />
            <Text style={styles.infoListText}>
              与所有角色自由对话
            </Text>
          </View>
          
          <View style={styles.infoListItem}>
            <Ionicons name="image-outline" size={18} color="#4A90E2" style={styles.infoIcon} />
            <Text style={styles.infoListText}>
              生成更多角色图片和头像
            </Text>
          </View>
          
          <View style={styles.infoListItem}>
            <Ionicons name="create-outline" size={18} color="#4A90E2" style={styles.infoIcon} />
            <Text style={styles.infoListText}>
              通过对话方式修改角色设定
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {!embedded && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onClose}
          >
            <Text style={styles.cancelButtonText}>取消</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.saveButton, !isDirty && styles.disabledButton]}
          onPress={handleSave}
          disabled={!isDirty}
        >
          <Text style={styles.saveButtonText}>保存</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  // If embedded mode is enabled, render directly without a modal
  if (embedded) {
    return (
      <View style={styles.embeddedContainer}>
        <Text style={styles.embeddedTitle}>摇篮系统设置</Text>
        {content}
      </View>
    );
  }

  // Modal view
  return (
    <Modal
      transparent={true}
      visible={isVisible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>摇篮系统设置</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {content}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 20,
  },
  modal: {
    backgroundColor: '#282828',
    borderRadius: 12,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  settingDescription: {
    flex: 1,
    marginRight: 10,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#aaa',
  },
  infoSection: {
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    marginTop: 10,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  infoText: {
    color: '#ccc',
    lineHeight: 20,
    marginBottom: 16,
  },
  infoListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoIcon: {
    marginRight: 8,
  },
  infoListText: {
    color: '#ccc',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#444',
    padding: 16,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#aaa',
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#4A90E2',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#555',
    opacity: 0.7,
  },
  embeddedContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#282828',
  },
  embeddedTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
  },
});
