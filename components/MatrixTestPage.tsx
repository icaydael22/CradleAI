// import React, { useState, useRef } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   TouchableOpacity,
//   TextInput,
//   ScrollView,
//   ActivityIndicator,
//   Alert,
//   Modal,
// } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
// import { createClient } from 'matrix-js-sdk';
// import '@/lib/polyfills'; // 导入 polyfills

// interface TestLog {
//   id: string;
//   timestamp: string;
//   level: 'info' | 'success' | 'error' | 'warning';
//   test: string;
//   message: string;
// }

// interface TestResult {
//   test: string;
//   status: 'pending' | 'running' | 'success' | 'error';
//   message?: string;
//   data?: any;
// }

// const MatrixTestPage: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
//   const [homeserverUrl, setHomeserverUrl] = useState('https://official.cradleintro.top');
//   const [username, setUsername] = useState('');
//   const [password, setPassword] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [testLogs, setTestLogs] = useState<TestLog[]>([]);
//   const [testResults, setTestResults] = useState<TestResult[]>([]);
//   const [currentClient, setCurrentClient] = useState<any>(null);
//   const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  
//   const scrollRef = useRef<ScrollView>(null);

//   const addLog = (level: TestLog['level'], test: string, message: string) => {
//     const newLog: TestLog = {
//       id: Date.now().toString(),
//       timestamp: new Date().toLocaleTimeString(),
//       level,
//       test,
//       message,
//     };
//     setTestLogs(prev => [...prev, newLog]);
//     setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
//   };

//   const updateTestResult = (testName: string, status: TestResult['status'], message?: string, data?: any) => {
//     setTestResults(prev => {
//       const existing = prev.find(r => r.test === testName);
//       if (existing) {
//         return prev.map(r => r.test === testName ? { ...r, status, message, data } : r);
//       }
//       return [...prev, { test: testName, status, message, data }];
//     });
//   };

//   const clearLogs = () => {
//     setTestLogs([]);
//     setTestResults([]);
//   };

//   // 1. 测试服务器连接
//   const testServerConnection = async () => {
//     updateTestResult('服务器连接', 'running');
//     addLog('info', '服务器连接', '开始测试服务器连接...');
    
//     try {
//       const client = createClient({ baseUrl: homeserverUrl });
//       const versions = await client.getVersions();
      
//       updateTestResult('服务器连接', 'success', `连接成功，支持版本: ${versions.versions.join(', ')}`);
//       addLog('success', '服务器连接', `✅ 连接成功！支持的版本: ${versions.versions.join(', ')}`);
      
//       if (versions.unstable_features) {
//         addLog('info', '服务器连接', `不稳定特性数量: ${Object.keys(versions.unstable_features).length}`);
//       }
      
//       return true;
//     } catch (error: any) {
//       updateTestResult('服务器连接', 'error', error.message);
//       addLog('error', '服务器连接', `❌ 连接失败: ${error.message}`);
      
//       if (error.code === 'ENOTFOUND') {
//         addLog('warning', '服务器连接', '💡 可能的原因：域名解析失败、服务器未运行或端口问题');
//       }
      
//       return false;
//     }
//   };

//   // 2. 测试用户注册
//   const testUserRegistration = async () => {
//     if (!username || !password) {
//       addLog('error', '用户注册', '请输入用户名和密码');
//       return false;
//     }

//     updateTestResult('用户注册', 'running');
//     addLog('info', '用户注册', `开始注册用户: ${username}`);
    
//     try {
//       const client = createClient({ baseUrl: homeserverUrl });
      
//       // 检查用户名可用性
//       addLog('info', '用户注册', '检查用户名可用性...');
//       const isAvailable = await client.isUsernameAvailable(username);
      
//       if (!isAvailable) {
//         addLog('warning', '用户注册', '用户名已被占用，尝试登录...');
//         return await testUserLogin();
//       }

//       // 注册新用户
//       addLog('info', '用户注册', '注册新用户...');
//       const response = await client.register(
//         username,
//         password,
//         null,
//         { type: 'm.login.dummy' },
//         undefined,
//         undefined,
//         false
//       );

//       updateTestResult('用户注册', 'success', `注册成功: ${response.user_id}`, response);
//       addLog('success', '用户注册', `✅ 注册成功！用户ID: ${response.user_id}`);
      
//       // 创建客户端实例
//       const newClient = createClient({
//         baseUrl: homeserverUrl,
//         accessToken: response.access_token,
//         userId: response.user_id,
//         deviceId: response.device_id
//       });
//       setCurrentClient(newClient);
      
//       return response;
//     } catch (error: any) {
//       if (error.errcode === 'M_USER_IN_USE') {
//         addLog('warning', '用户注册', '用户名已存在，尝试登录...');
//         return await testUserLogin();
//       }
      
//       updateTestResult('用户注册', 'error', error.message);
//       addLog('error', '用户注册', `❌ 注册失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 3. 测试用户登录
//   const testUserLogin = async () => {
//     if (!username || !password) {
//       addLog('error', '用户登录', '请输入用户名和密码');
//       return false;
//     }

//     updateTestResult('用户登录', 'running');
//     addLog('info', '用户登录', `尝试登录用户: ${username}`);
    
//     try {
//       const client = createClient({ baseUrl: homeserverUrl });
//       const response = await client.loginWithPassword(username, password);
      
//       updateTestResult('用户登录', 'success', `登录成功: ${response.user_id}`, response);
//       addLog('success', '用户登录', `✅ 登录成功！用户ID: ${response.user_id}`);
      
//       // 创建客户端实例
//       const newClient = createClient({
//         baseUrl: homeserverUrl,
//         accessToken: response.access_token,
//         userId: response.user_id,
//         deviceId: response.device_id
//       });
//       setCurrentClient(newClient);
      
//       return response;
//     } catch (error: any) {
//       updateTestResult('用户登录', 'error', error.message);
//       addLog('error', '用户登录', `❌ 登录失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 4. 测试房间创建
//   const testRoomCreation = async () => {
//     if (!currentClient) {
//       addLog('error', '房间创建', '请先登录');
//       return false;
//     }

//     updateTestResult('房间创建', 'running');
//     const roomName = `测试房间_${Date.now()}`;
//     addLog('info', '房间创建', `创建房间: ${roomName}`);
    
//     try {
//       const response = await currentClient.createRoom({
//         name: roomName,
//         topic: '这是一个测试房间',
//         preset: 'public_chat',
//         visibility: 'public'
//       });

//       updateTestResult('房间创建', 'success', `房间创建成功: ${response.room_id}`, response);
//       addLog('success', '房间创建', `✅ 房间创建成功！房间ID: ${response.room_id}`);
      
//       setCurrentRoomId(response.room_id);
//       return response.room_id;
//     } catch (error: any) {
//       updateTestResult('房间创建', 'error', error.message);
//       addLog('error', '房间创建', `❌ 房间创建失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 5. 测试消息发送
//   const testMessageSending = async () => {
//     if (!currentClient) {
//       addLog('error', '消息发送', '请先登录');
//       return false;
//     }
    
//     if (!currentRoomId) {
//       addLog('error', '消息发送', '请先创建房间');
//       return false;
//     }

//     updateTestResult('消息发送', 'running');
//     const messageText = `测试消息 - ${new Date().toLocaleString()}`;
//     addLog('info', '消息发送', `发送消息: ${messageText}`);
    
//     try {
//       const response = await currentClient.sendTextMessage(currentRoomId, messageText);
      
//       updateTestResult('消息发送', 'success', `消息发送成功: ${response.event_id}`, response);
//       addLog('success', '消息发送', `✅ 消息发送成功！事件ID: ${response.event_id}`);
      
//       return true;
//     } catch (error: any) {
//       updateTestResult('消息发送', 'error', error.message);
//       addLog('error', '消息发送', `❌ 消息发送失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 6. 测试获取房间列表
//   const testGetRooms = async () => {
//     if (!currentClient) {
//       addLog('error', '获取房间', '请先登录');
//       return false;
//     }

//     updateTestResult('获取房间', 'running');
//     addLog('info', '获取房间', '获取公开房间列表...');
    
//     try {
//       const response = await currentClient.publicRooms({ limit: 10 });
      
//       updateTestResult('获取房间', 'success', `找到 ${response.chunk.length} 个公开房间`, response);
//       addLog('success', '获取房间', `✅ 获取成功！找到 ${response.chunk.length} 个公开房间`);
      
//       response.chunk.forEach((room: any, index: number) => {
//         addLog('info', '获取房间', `${index + 1}. ${room.name || room.canonical_alias || room.room_id} (${room.num_joined_members} 成员)`);
//       });
      
//       return true;
//     } catch (error: any) {
//       updateTestResult('获取房间', 'error', error.message);
//       addLog('error', '获取房间', `❌ 获取失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 运行完整测试
//   const runFullTest = async () => {
//     setLoading(true);
//     clearLogs();
    
//     addLog('info', '完整测试', '🚀 开始 Matrix SDK 完整测试...');
    
//     // 生成随机用户名避免冲突
//     if (!username) {
//       const randomUsername = `testuser_${Date.now()}`;
//       setUsername(randomUsername);
//       addLog('info', '完整测试', `使用随机用户名: ${randomUsername}`);
//     }
    
//     if (!password) {
//       setPassword('test123456');
//       addLog('info', '完整测试', '使用默认密码: test123456');
//     }

//     try {
//       // 1. 测试服务器连接
//       const connected = await testServerConnection();
//       if (!connected) {
//         setLoading(false);
//         return;
//       }

//       // 2. 测试用户认证
//       const authResult = await testUserRegistration();
//       if (!authResult) {
//         setLoading(false);
//         return;
//       }

//       // 3. 测试房间创建
//       const roomId = await testRoomCreation();
//       if (!roomId) {
//         setLoading(false);
//         return;
//       }

//       // 4. 测试消息发送
//       await testMessageSending();

//       // 5. 测试获取房间列表
//       await testGetRooms();

//       addLog('success', '完整测试', '🎉 所有测试完成！');
//       Alert.alert('测试完成', '所有测试都已完成，请查看详细日志');
      
//     } catch (error: any) {
//       addLog('error', '完整测试', `测试过程中出现错误: ${error.message}`);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const getStatusIcon = (status: TestResult['status']) => {
//     switch (status) {
//       case 'running': return <ActivityIndicator size="small" color="#5865f2" />;
//       case 'success': return <Ionicons name="checkmark-circle" size={20} color="#23a559" />;
//       case 'error': return <Ionicons name="close-circle" size={20} color="#ed4245" />;
//       default: return <Ionicons name="ellipse-outline" size={20} color="#949ba4" />;
//     }
//   };

//   const getLogColor = (level: TestLog['level']) => {
//     switch (level) {
//       case 'success': return '#23a559';
//       case 'error': return '#ed4245';
//       case 'warning': return '#faa61a';
//       default: return '#ffffff';
//     }
//   };

//   return (
//     <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
//       <View style={styles.container}>
//         {/* Header */}
//         <View style={styles.header}>
//           <TouchableOpacity onPress={onClose} style={styles.closeButton}>
//             <Ionicons name="close" size={24} color="#ffffff" />
//           </TouchableOpacity>
//           <Text style={styles.title}>Matrix SDK 测试</Text>
//           <TouchableOpacity onPress={clearLogs} style={styles.clearButton}>
//             <Ionicons name="refresh" size={24} color="#949ba4" />
//           </TouchableOpacity>
//         </View>

//         <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
//           {/* 配置区域 */}
//           <View style={styles.configSection}>
//             <Text style={styles.sectionTitle}>服务器配置</Text>
            
//             <View style={styles.inputContainer}>
//               <Text style={styles.label}>服务器地址:</Text>
//               <TextInput
//                 style={styles.input}
//                 value={homeserverUrl}
//                 onChangeText={setHomeserverUrl}
//                 placeholder="https://official.cradleintro.top"
//                 placeholderTextColor="#949ba4"
//               />
//             </View>

//             <View style={styles.inputContainer}>
//               <Text style={styles.label}>用户名:</Text>
//               <TextInput
//                 style={styles.input}
//                 value={username}
//                 onChangeText={setUsername}
//                 placeholder="输入用户名（留空自动生成）"
//                 placeholderTextColor="#949ba4"
//                 autoCapitalize="none"
//               />
//             </View>

//             <View style={styles.inputContainer}>
//               <Text style={styles.label}>密码:</Text>
//               <TextInput
//                 style={styles.input}
//                 value={password}
//                 onChangeText={setPassword}
//                 placeholder="输入密码（留空使用默认）"
//                 placeholderTextColor="#949ba4"
//                 secureTextEntry
//               />
//             </View>
//           </View>

//           {/* 测试按钮区域 */}
//           <View style={styles.testSection}>
//             <Text style={styles.sectionTitle}>测试功能</Text>
            
//             <TouchableOpacity
//               style={[styles.testButton, styles.primaryButton]}
//               onPress={runFullTest}
//               disabled={loading}
//             >
//               {loading ? (
//                 <ActivityIndicator color="#ffffff" />
//               ) : (
//                 <>
//                   <Ionicons name="play" size={20} color="#ffffff" />
//                   <Text style={styles.testButtonText}>运行完整测试</Text>
//                 </>
//               )}
//             </TouchableOpacity>

//             <View style={styles.individualTests}>
//               <TouchableOpacity
//                 style={styles.individualTestButton}
//                 onPress={testServerConnection}
//                 disabled={loading}
//               >
//                 <Text style={styles.individualTestText}>测试服务器连接</Text>
//               </TouchableOpacity>

//               <TouchableOpacity
//                 style={styles.individualTestButton}
//                 onPress={testUserRegistration}
//                 disabled={loading}
//               >
//                 <Text style={styles.individualTestText}>测试用户注册</Text>
//               </TouchableOpacity>

//               <TouchableOpacity
//                 style={styles.individualTestButton}
//                 onPress={testRoomCreation}
//                 disabled={loading}
//               >
//                 <Text style={styles.individualTestText}>测试房间创建</Text>
//               </TouchableOpacity>

//               <TouchableOpacity
//                 style={styles.individualTestButton}
//                 onPress={testMessageSending}
//                 disabled={loading}
//               >
//                 <Text style={styles.individualTestText}>测试消息发送</Text>
//               </TouchableOpacity>

//               <TouchableOpacity
//                 style={styles.individualTestButton}
//                 onPress={testGetRooms}
//                 disabled={loading}
//               >
//                 <Text style={styles.individualTestText}>测试获取房间</Text>
//               </TouchableOpacity>
//             </View>
//           </View>

//           {/* 测试结果 */}
//           {testResults.length > 0 && (
//             <View style={styles.resultsSection}>
//               <Text style={styles.sectionTitle}>测试结果</Text>
//               {testResults.map((result, index) => (
//                 <View key={index} style={styles.resultItem}>
//                   <View style={styles.resultHeader}>
//                     {getStatusIcon(result.status)}
//                     <Text style={styles.resultTest}>{result.test}</Text>
//                   </View>
//                   {result.message && (
//                     <Text style={styles.resultMessage}>{result.message}</Text>
//                   )}
//                 </View>
//               ))}
//             </View>
//           )}

//           {/* 测试日志 */}
//           {testLogs.length > 0 && (
//             <View style={styles.logsSection}>
//               <Text style={styles.sectionTitle}>测试日志</Text>
//               <ScrollView 
//                 ref={scrollRef}
//                 style={styles.logContainer}
//                 showsVerticalScrollIndicator={false}
//               >
//                 {testLogs.map((log) => (
//                   <View key={log.id} style={styles.logItem}>
//                     <Text style={styles.logTimestamp}>{log.timestamp}</Text>
//                     <Text style={styles.logTest}>[{log.test}]</Text>
//                     <Text style={[styles.logMessage, { color: getLogColor(log.level) }]}>
//                       {log.message}
//                     </Text>
//                   </View>
//                 ))}
//               </ScrollView>
//             </View>
//           )}
//         </ScrollView>
//       </View>
//     </Modal>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: '#1e1f22',
//   },
//   header: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'space-between',
//     padding: 16,
//     paddingTop: 50,
//     backgroundColor: '#2b2d31',
//     borderBottomWidth: 1,
//     borderBottomColor: '#3c3f45',
//   },
//   closeButton: {
//     padding: 8,
//   },
//   title: {
//     color: '#ffffff',
//     fontSize: 18,
//     fontWeight: 'bold',
//   },
//   clearButton: {
//     padding: 8,
//   },
//   content: {
//     flex: 1,
//     padding: 16,
//   },
//   configSection: {
//     marginBottom: 24,
//   },
//   sectionTitle: {
//     color: '#ffffff',
//     fontSize: 18,
//     fontWeight: 'bold',
//     marginBottom: 16,
//   },
//   inputContainer: {
//     marginBottom: 16,
//   },
//   label: {
//     color: '#ffffff',
//     fontSize: 14,
//     marginBottom: 8,
//   },
//   input: {
//     backgroundColor: '#40444b',
//     borderRadius: 8,
//     padding: 12,
//     color: '#ffffff',
//     fontSize: 16,
//   },
//   testSection: {
//     marginBottom: 24,
//   },
//   testButton: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     padding: 16,
//     borderRadius: 8,
//     marginBottom: 16,
//   },
//   primaryButton: {
//     backgroundColor: '#5865f2',
//   },
//   testButtonText: {
//     color: '#ffffff',
//     fontSize: 16,
//     fontWeight: 'bold',
//     marginLeft: 8,
//   },
//   individualTests: {
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//     gap: 8,
//   },
//   individualTestButton: {
//     backgroundColor: '#40444b',
//     padding: 12,
//     borderRadius: 6,
//     minWidth: '48%',
//     alignItems: 'center',
//   },
//   individualTestText: {
//     color: '#ffffff',
//     fontSize: 14,
//   },
//   resultsSection: {
//     marginBottom: 24,
//   },
//   resultItem: {
//     backgroundColor: '#40444b',
//     padding: 12,
//     borderRadius: 8,
//     marginBottom: 8,
//   },
//   resultHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 4,
//   },
//   resultTest: {
//     color: '#ffffff',
//     fontSize: 16,
//     fontWeight: 'bold',
//     marginLeft: 8,
//   },
//   resultMessage: {
//     color: '#949ba4',
//     fontSize: 14,
//     marginLeft: 28,
//   },
//   logsSection: {
//     marginBottom: 24,
//   },
//   logContainer: {
//     backgroundColor: '#2b2d31',
//     borderRadius: 8,
//     padding: 12,
//     maxHeight: 300,
//   },
//   logItem: {
//     flexDirection: 'row',
//     marginBottom: 8,
//     flexWrap: 'wrap',
//   },
//   logTimestamp: {
//     color: '#949ba4',
//     fontSize: 12,
//     minWidth: 70,
//   },
//   logTest: {
//     color: '#5865f2',
//     fontSize: 12,
//     fontWeight: 'bold',
//     minWidth: 80,
//     marginLeft: 8,
//   },
//   logMessage: {
//     fontSize: 12,
//     flex: 1,
//     marginLeft: 8,
//   },
// });

// export default MatrixTestPage; 