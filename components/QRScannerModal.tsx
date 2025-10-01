import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanSuccess: (url: string) => void;
}

const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onScanSuccess,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (visible) {
      if (!permission) {
        requestPermission();
      } else if (!permission.granted) {
        Alert.alert(
          '需要相机权限',
          '请在设置中允许应用访问相机以扫描二维码',
          [{ text: '确定', onPress: onClose }]
        );
      }
      setScanned(false);
      setIsProcessing(false);
    }
  }, [visible, permission]);

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scanned || isProcessing) return;

    setScanned(true);
    setIsProcessing(true);

    const data = result.data;
    console.log('[QRScanner] 扫描到二维码:', data);

    try {
      const url = new URL(data);
      
      if (!data.includes('/download/')) {
        Alert.alert(
          '无效的二维码',
          '这不是一个有效的剧本下载链接',
          [
            {
              text: '重新扫描',
              onPress: () => {
                setScanned(false);
                setIsProcessing(false);
              },
            },
            { text: '取消', onPress: onClose },
          ]
        );
        return;
      }

      console.log('[QRScanner] 验证通过，开始导入:', data);
      onScanSuccess(data);
      onClose();
    } catch (error) {
      console.error('[QRScanner] URL解析失败:', error);
      Alert.alert(
        '无效的二维码',
        '扫描到的二维码不是有效的URL',
        [
          {
            text: '重新扫描',
            onPress: () => {
              setScanned(false);
              setIsProcessing(false);
            },
          },
          { text: '取消', onPress: onClose },
        ]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!visible) {
    return null;
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>请求相机权限中...</Text>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="videocam-off" size={64} color="#fff" />
          <Text style={styles.errorText}>无法访问相机</Text>
          <Text style={styles.errorSubText}>请在设置中允许应用访问相机</Text>
          <TouchableOpacity 
            style={styles.requestButton}
            onPress={requestPermission}
          >
            <Text style={styles.requestButtonText}>请求权限</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      
      <View style={styles.overlay}>
        <View style={styles.topOverlay} />
        <View style={styles.middleRow}>
          <View style={styles.sideOverlay} />
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
          <View style={styles.sideOverlay} />
        </View>
        <View style={styles.bottomOverlay}>
          <Text style={styles.instructionText}>
            {scanned ? '处理中...' : '将二维码放入框内'}
          </Text>
        </View>
      </View>

      <View style={styles.topBar}>
        <Text style={styles.title}>扫描二维码导入剧本</Text>
      </View>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onClose}
          disabled={isProcessing}
        >
          <Ionicons name="close-circle" size={24} color="#fff" />
          <Text style={styles.cancelButtonText}>取消</Text>
        </TouchableOpacity>

        {scanned && (
          <TouchableOpacity
            style={styles.rescanButton}
            onPress={() => {
              setScanned(false);
              setIsProcessing(false);
            }}
            disabled={isProcessing}
          >
            <Ionicons name="refresh" size={24} color="#fff" />
            <Text style={styles.rescanButtonText}>重新扫描</Text>
          </TouchableOpacity>
        )}
      </View>

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <View style={styles.processingContainer}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.processingText}>处理中...</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const SCAN_AREA_SIZE = Math.min(width, height) * 0.7;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: '#000',
    zIndex: 10000, // 确保在所有模态框之上
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#fff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  errorSubText: {
    marginTop: 8,
    fontSize: 14,
    color: '#ccc',
    textAlign: 'center',
  },
  requestButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topOverlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleRow: {
    flexDirection: 'row',
    width: '100%',
  },
  sideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  bottomOverlay: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 24,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#fff',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructionText: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    paddingTop: 20,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#fff',
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  rescanButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#fff',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    padding: 32,
    borderRadius: 12,
    alignItems: 'center',
  },
  processingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#fff',
  },
});

export default QRScannerModal;
