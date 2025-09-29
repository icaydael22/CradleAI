import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlugins } from '../hooks/usePlugins';
import { PluginRegistryItem } from '../types';

/**
 * Component for managing plugins (listing, installing, removing)
 */
const PluginManager: React.FC = () => {
  const { 
    plugins, 
    isLoading, 
    isRefreshing, 
    error, 
    refreshPlugins, 
    installPlugin, 
    uninstallPlugin 
  } = usePlugins();
  
  const [selectedPlugin, setSelectedPlugin] = useState<PluginRegistryItem | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  
  // Handle plugin installation
  const handleInstall = async (plugin: PluginRegistryItem) => {
    setActionInProgress(plugin.metadata.id);
    const success = await installPlugin(plugin.metadata.id);
    setActionInProgress(null);
    
    if (success) {
      // Update selected plugin if details modal is open
      if (selectedPlugin && selectedPlugin.metadata.id === plugin.metadata.id) {
        const updatedPlugin = plugins.find(p => p.metadata.id === plugin.metadata.id);
        if (updatedPlugin) {
          setSelectedPlugin(updatedPlugin);
        }
      }
    }
  };
  
  // Handle plugin uninstallation
  const handleUninstall = async (plugin: PluginRegistryItem) => {
    setActionInProgress(plugin.metadata.id);
    const success = await uninstallPlugin(plugin.metadata.id);
    setActionInProgress(null);
    
    if (success) {
      // Update selected plugin if details modal is open
      if (selectedPlugin && selectedPlugin.metadata.id === plugin.metadata.id) {
        const updatedPlugin = plugins.find(p => p.metadata.id === plugin.metadata.id);
        if (updatedPlugin) {
          setSelectedPlugin(updatedPlugin);
        }
      }
    }
  };
  
  // Handle plugin selection for details
  const handleSelectPlugin = (plugin: PluginRegistryItem) => {
    setSelectedPlugin(plugin);
    setDetailsVisible(true);
  };
  
  // Render plugin item
  const renderPluginItem = ({ item }: { item: PluginRegistryItem }) => {
    const isInstalled = item.status === 'installed';
    const isLoading = actionInProgress === item.metadata.id;
    
    return (
      <TouchableOpacity
        style={styles.pluginItem}
        onPress={() => handleSelectPlugin(item)}
        disabled={isLoading}
      >
        <View style={styles.pluginInfo}>
          <Text style={styles.pluginName}>{item.metadata.name}</Text>
          <Text style={styles.pluginVersion}>v{item.metadata.version}</Text>
          <Text style={styles.pluginAuthor}>by {item.metadata.author}</Text>
          
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusBadge,
              item.status === 'installed' ? styles.installedBadge : 
              item.status === 'error' ? styles.errorBadge : 
              styles.availableBadge
            ]}>
              <Text style={styles.statusText}>
                {item.status === 'installed' ? 'Installed' : 
                 item.status === 'error' ? 'Error' : 
                 item.status === 'downloading' ? 'Downloading' : 
                 'Available'}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.pluginActions}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#ff9f1c" />
          ) : (
            isInstalled ? (
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleUninstall(item)}
              >
                <Ionicons name="trash-outline" size={18} color="#ff4d4d" />
                <Text style={[styles.actionText, { color: '#ff4d4d' }]}>Remove</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleInstall(item)}
              >
                <Ionicons name="download-outline" size={18} color="#ff9f1c" />
                <Text style={styles.actionText}>Install</Text>
              </TouchableOpacity>
            )
          )}
        </View>
      </TouchableOpacity>
    );
  };
  
  // Plugin details modal
  const renderDetailsModal = () => {
    if (!selectedPlugin) return null;
    
    const { metadata, status, error: pluginError } = selectedPlugin;
    const isInstalled = status === 'installed';
    const isLoading = actionInProgress === metadata.id;
    
    return (
      <Modal
        visible={detailsVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setDetailsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsContainer}>
            <View style={styles.detailsHeader}>
              <Text style={styles.detailsTitle}>{metadata.name}</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setDetailsVisible(false)}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.detailsContent}>
              <View style={styles.detailsInfoRow}>
                <Text style={styles.detailsLabel}>Version</Text>
                <Text style={styles.detailsValue}>{metadata.version}</Text>
              </View>
              
              <View style={styles.detailsInfoRow}>
                <Text style={styles.detailsLabel}>Author</Text>
                <Text style={styles.detailsValue}>{metadata.author}</Text>
              </View>
              
              <View style={styles.detailsInfoRow}>
                <Text style={styles.detailsLabel}>Status</Text>
                <View style={[
                  styles.statusBadge,
                  status === 'installed' ? styles.installedBadge : 
                  status === 'error' ? styles.errorBadge : 
                  styles.availableBadge
                ]}>
                  <Text style={styles.statusText}>
                    {status === 'installed' ? 'Installed' : 
                     status === 'error' ? 'Error' : 
                     status === 'downloading' ? 'Downloading' : 
                     'Available'}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.detailsDescription}>{metadata.description}</Text>
              
              {pluginError && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorTitle}>Error</Text>
                  <Text style={styles.errorMessage}>{pluginError}</Text>
                </View>
              )}
              
              {metadata.tags && metadata.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  <Text style={styles.tagsLabel}>Tags:</Text>
                  <View style={styles.tagsList}>
                    {metadata.tags.map((tag, index) => (
                      <View key={`tag-${index}`} style={styles.tagBadge}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              <View style={styles.detailsInfoRow}>
                <Text style={styles.detailsLabel}>Size</Text>
                <Text style={styles.detailsValue}>{(metadata.size / 1024).toFixed(1)} KB</Text>
              </View>
              
              <View style={styles.detailsInfoRow}>
                <Text style={styles.detailsLabel}>Last Updated</Text>
                <Text style={styles.detailsValue}>
                  {new Date(metadata.lastUpdated).toLocaleDateString()}
                </Text>
              </View>
            </ScrollView>
            
            <View style={styles.detailsActions}>
              {isLoading ? (
                <View style={styles.loadingButton}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.loadingButtonText}>
                    {isInstalled ? 'Uninstalling...' : 'Installing...'}
                  </Text>
                </View>
              ) : (
                isInstalled ? (
                  <TouchableOpacity
                    style={[styles.actionButtonLarge, styles.uninstallButton]}
                    onPress={() => handleUninstall(selectedPlugin)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <Text style={styles.actionButtonLargeText}>Uninstall</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.actionButtonLarge, styles.installButton]}
                    onPress={() => handleInstall(selectedPlugin)}
                  >
                    <Ionicons name="download-outline" size={18} color="#fff" />
                    <Text style={styles.actionButtonLargeText}>Install Plugin</Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Plugin Manager</Text>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={refreshPlugins}
          disabled={isLoading || isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="refresh" size={24} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      
      {error && (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#fff" />
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      )}
      
      {isLoading && !isRefreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ff9f1c" />
          <Text style={styles.loadingText}>Loading plugins...</Text>
        </View>
      ) : (
        <FlatList
          data={plugins}
          renderItem={renderPluginItem}
          keyExtractor={item => item.metadata.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refreshPlugins}
              colors={['#ff9f1c']}
              tintColor="#ff9f1c"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="extension-puzzle" size={48} color="#555" />
              <Text style={styles.emptyText}>No plugins found</Text>
              <Text style={styles.emptySubtext}>Pull down to refresh</Text>
            </View>
          }
        />
      )}
      
      {renderDetailsModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#222',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#333',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
  },
  pluginItem: {
    flexDirection: 'row',
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pluginInfo: {
    flex: 1,
  },
  pluginName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  pluginVersion: {
    fontSize: 12,
    color: '#bbb',
  },
  pluginAuthor: {
    fontSize: 12,
    color: '#bbb',
    marginBottom: 8,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#444',
  },
  installedBadge: {
    backgroundColor: 'rgba(46, 204, 113, 0.2)',
  },
  availableBadge: {
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
  },
  errorBadge: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
  },
  pluginActions: {
    marginLeft: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 159, 28, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  actionText: {
    marginLeft: 6,
    color: '#ff9f1c',
    fontSize: 12,
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#bbb',
    fontSize: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#c0392b',
    padding: 10,
  },
  errorBannerText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#888',
    fontSize: 18,
    marginTop: 16,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsContainer: {
    backgroundColor: '#333',
    width: '90%',
    maxWidth: 500,
    borderRadius: 12,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#444',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  detailsContent: {
    padding: 16,
    maxHeight: 400,
  },
  detailsInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#bbb',
    width: 100,
  },
  detailsValue: {
    fontSize: 14,
    color: '#fff',
    flex: 1,
    textAlign: 'right',
  },
  detailsDescription: {
    fontSize: 14,
    color: '#ddd',
    marginVertical: 16,
    lineHeight: 20,
  },
  tagsContainer: {
    marginVertical: 12,
  },
  tagsLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#bbb',
    marginBottom: 8,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagBadge: {
    backgroundColor: 'rgba(255, 159, 28, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: '#ff9f1c',
    fontSize: 12,
  },
  errorContainer: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 4,
  },
  errorMessage: {
    fontSize: 13,
    color: '#ddd',
  },
  detailsActions: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  actionButtonLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  installButton: {
    backgroundColor: '#ff9f1c',
  },
  uninstallButton: {
    backgroundColor: '#e74c3c',
  },
  actionButtonLargeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  loadingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#666',
    paddingVertical: 12,
    borderRadius: 8,
  },
  loadingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
});

export default PluginManager;
