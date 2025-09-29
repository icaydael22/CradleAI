// import React, { useEffect, useState } from 'react';
// import { View, Text, StyleSheet } from 'react-native';

// interface MatrixDebugInfo {
//   polyfillsLoaded: boolean;
//   matrixSDKAvailable: boolean;
//   globalBufferAvailable: boolean;
//   globalProcessAvailable: boolean;
//   environmentCompatible: boolean;
//   error?: string;
// }

// export const MatrixDebugger: React.FC = () => {
//   const [debugInfo, setDebugInfo] = useState<MatrixDebugInfo>({
//     polyfillsLoaded: false,
//     matrixSDKAvailable: false,
//     globalBufferAvailable: false,
//     globalProcessAvailable: false,
//     environmentCompatible: false,
//   });

//   useEffect(() => {
//     const checkMatrixSDKStatus = async () => {
//       try {
//         const info: MatrixDebugInfo = {
//           polyfillsLoaded: true,
//           globalBufferAvailable: typeof (global as any).Buffer !== 'undefined',
//           globalProcessAvailable: typeof (global as any).process !== 'undefined',
//           matrixSDKAvailable: false,
//           environmentCompatible: false,
//         };

//         // 检查Matrix SDK是否可用
//         try {
//           const matrixSDK = await import('matrix-js-sdk');
//           info.matrixSDKAvailable = typeof matrixSDK.createClient === 'function';
//         } catch (error) {
//           info.error = `Matrix SDK import failed: ${error}`;
//         }

//         // 检查环境兼容性
//         const requiredGlobals = ['Buffer', 'process', 'btoa', 'atob'];
//         info.environmentCompatible = requiredGlobals.every(
//           global => typeof (globalThis as any)[global] !== 'undefined'
//         );

//         setDebugInfo(info);
//       } catch (error) {
//         setDebugInfo(prev => ({
//           ...prev,
//           error: `Debug check failed: ${error}`,
//         }));
//       }
//     };

//     checkMatrixSDKStatus();
//   }, []);

//   // 仅在开发环境下显示
//   if (__DEV__) {
//     return (
//       <View style={styles.container}>
//         <Text style={styles.title}>Matrix SDK Debug Info</Text>
//         <Text style={[styles.status, debugInfo.polyfillsLoaded ? styles.success : styles.error]}>
//           Polyfills: {debugInfo.polyfillsLoaded ? '✓' : '✗'}
//         </Text>
//         <Text style={[styles.status, debugInfo.globalBufferAvailable ? styles.success : styles.error]}>
//           Global Buffer: {debugInfo.globalBufferAvailable ? '✓' : '✗'}
//         </Text>
//         <Text style={[styles.status, debugInfo.globalProcessAvailable ? styles.success : styles.error]}>
//           Global Process: {debugInfo.globalProcessAvailable ? '✓' : '✗'}
//         </Text>
//         <Text style={[styles.status, debugInfo.matrixSDKAvailable ? styles.success : styles.error]}>
//           Matrix SDK: {debugInfo.matrixSDKAvailable ? '✓' : '✗'}
//         </Text>
//         <Text style={[styles.status, debugInfo.environmentCompatible ? styles.success : styles.error]}>
//           Environment: {debugInfo.environmentCompatible ? '✓' : '✗'}
//         </Text>
//         {debugInfo.error && (
//           <Text style={styles.errorText}>{debugInfo.error}</Text>
//         )}
//       </View>
//     );
//   }

//   return null;
// };

// const styles = StyleSheet.create({
//   container: {
//     position: 'absolute',
//     top: 50,
//     right: 10,
//     backgroundColor: 'rgba(0, 0, 0, 0.8)',
//     padding: 10,
//     borderRadius: 5,
//     zIndex: 9999,
//   },
//   title: {
//     color: 'white',
//     fontSize: 12,
//     fontWeight: 'bold',
//     marginBottom: 5,
//   },
//   status: {
//     color: 'white',
//     fontSize: 10,
//     marginVertical: 1,
//   },
//   success: {
//     color: 'green',
//   },
//   error: {
//     color: 'red',
//   },
//   errorText: {
//     color: 'red',
//     fontSize: 8,
//     marginTop: 5,
//     flexWrap: 'wrap',
//     maxWidth: 200,
//   },
// }); 