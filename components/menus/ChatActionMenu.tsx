import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ChatActionMenuProps {
  visible: boolean;
  onClose: () => void;
  onResetConversation: () => void;
  onOpenImageOptions: () => void;
  onOpenImageGenModal: () => void;
  onCustomAutoGenerateImage: () => void;
  onManageImageCache: () => void;
  onBraveSearchToggle: () => void;
  onTtsEnhancerToggle: () => void;
  onEditAuthorNote: () => void;
  onShowFullHistory: () => void;
  braveSearchEnabled?: boolean;
  isTtsEnhancerEnabled?: boolean;
}

export const ChatActionMenu: React.FC<ChatActionMenuProps> = ({
  visible,
  onClose,
  onResetConversation,
  onOpenImageOptions,
  onOpenImageGenModal,
  onCustomAutoGenerateImage,
  onManageImageCache,
  onBraveSearchToggle,
  onTtsEnhancerToggle,
  onEditAuthorNote,
  onShowFullHistory,
  braveSearchEnabled = false,
  isTtsEnhancerEnabled = false,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.actionMenuOverlay}>
      {/* Outer touchable area - closes menu when tapped outside */}
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.actionMenuBackground} />
      </TouchableWithoutFeedback>
      
      {/* Position the menu directly above the input */}
      <View style={[styles.actionMenuContainer, { minWidth: 180, maxWidth: 260 }]}>
        <ScrollView style={styles.actionMenuScroll}>
          <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onResetConversation}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="refresh" size={18} color="#d9534f" />
              <Text style={styles.actionMenuItemText}>重置对话</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onOpenImageOptions}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="images" size={18} color="#3498db" />
              <Text style={styles.sendimgText}>发送图片</Text>
            </View>
          </TouchableOpacity>

          {/* <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onOpenImageGenModal}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="brush" size={18} color="#9b59b6" />
              <Text style={styles.actionMenuItemText}>生成图片</Text>
            </View>
          </TouchableOpacity> */}
          
          {/* <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onCustomAutoGenerateImage}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="create" size={18} color="#2ecc71" />
              <Text style={styles.actionMenuItemText}>自定义生成场景图</Text>
            </View>
          </TouchableOpacity> */}
          
          <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onManageImageCache}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="trash-bin" size={18} color="#e74c3c" />
              <Text style={styles.actionMenuItemText}>图片缓存</Text>
            </View>
          </TouchableOpacity>
          
          {/* <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onBraveSearchToggle}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="search" size={18} color="#3498db" />
              <Text style={styles.actionMenuItemText}>
                {braveSearchEnabled ? "搜索: 已开启" : "搜索: 已关闭"}
              </Text>
              {braveSearchEnabled && <View style={styles.activeIndicator} />}
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onTtsEnhancerToggle}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="mic" size={18} color="#9b59b6" />
              <Text style={styles.actionMenuItemText}>
                {isTtsEnhancerEnabled ? "语音增强: 已开启" : "语音增强: 已关闭"}
              </Text>
              {isTtsEnhancerEnabled && <View style={styles.activeIndicator} />}
            </View>
          </TouchableOpacity>   */}

          <TouchableOpacity 
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onEditAuthorNote}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="document-text-outline" size={18} color="#f39c12" />
              <Text style={styles.actionMenuItemText}>作者注释</Text>
            </View>
          </TouchableOpacity>  

          <TouchableOpacity
            style={styles.actionMenuItem}
            activeOpacity={0.7}
            onPress={onShowFullHistory}
          >
            <View style={styles.actionMenuItemInner}>
              <Ionicons name="list" size={18} color="#27ae60" />
              <Text style={styles.actionMenuItemText}>聊天记录</Text>
            </View>
          </TouchableOpacity>        
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  actionMenuOverlay: {
    position: 'absolute',
    bottom: '100%', // Position right above the container
    left: 0,
    right: 0,
    zIndex: 100,
  },
  actionMenuBackground: {
    position: 'absolute',
    top: -1000, // Extend far up to capture taps anywhere above
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  actionMenuContainer: {
    backgroundColor: 'rgba(40, 40, 40, 0.95)',
    borderRadius: 12,
    marginHorizontal: 10,
    marginBottom: 4, // Reduced gap between menu and input
    paddingBottom: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    maxHeight: 250, // Made slightly smaller to save space
    minWidth: 180,
    maxWidth: 260,
  },
  actionMenuScroll: {
    paddingHorizontal: 8,
  },
  actionMenuItem: {
    paddingVertical: 8, // Reduced padding to make menu more compact
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionMenuItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionMenuItemText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '400',
    marginLeft: 12,
    flex: 1,
  },
  sendimgText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '400',
    marginLeft: 12,
    flex: 1,
  },
  activeIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CD964',
    marginRight: 4,
  },
});

export default ChatActionMenu;