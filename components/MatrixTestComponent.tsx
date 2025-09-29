// import '@/lib/polyfills'; 
// import React, { useState } from 'react';
// import {
//   View,
//   Text,
//   StyleSheet,
//   TouchableOpacity,
//   TextInput,
//   Alert,
//   ScrollView,
//   ActivityIndicator
// } from 'react-native';
// import { createClient, MatrixClient, Preset, Visibility, EventType, MsgType } from 'matrix-js-sdk';

// interface TestResult {
//   test: string;
//   success: boolean;
//   message: string;
// }

// const MatrixTestComponent: React.FC = () => {
//   const [homeserverUrl, setHomeserverUrl] = useState('https://official.cradleintro.top');
//   const [username, setUsername] = useState('');
//   const [password, setPassword] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [testResults, setTestResults] = useState<TestResult[]>([]);
//   const [client, setClient] = useState<MatrixClient | null>(null);

//   const addTestResult = (test: string, success: boolean, message: string) => {
//     setTestResults(prev => [...prev, { test, success, message }]);
//   };

//   const clearResults = () => {
//     setTestResults([]);
//   };

//   // 测试服务器连接
//   const testServerConnection = async () => {
//     try {
//       const testClient = createClient({ baseUrl: homeserverUrl });
//       const versions = await testClient.getVersions();
//       addTestResult('服务器连接', true, `连接成功，支持的版本: ${versions.versions.join(', ')}`);
//       return true;
//     } catch (error: any) {
//       addTestResult('服务器连接', false, `连接失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 测试用户注册
//   const testUserRegistration = async () => {
//     if (!username || !password) {
//       addTestResult('用户注册', false, '请输入用户名和密码');
//       return false;
//     }

//     try {
//       const testClient = createClient({ baseUrl: homeserverUrl });
      
//       // 检查用户名是否可用
//       const isAvailable = await testClient.isUsernameAvailable(username);
//       if (!isAvailable) {
//         addTestResult('用户注册', false, '用户名已被占用');
//         return false;
//       }

//       // 注册用户
//       const response = await testClient.register(
//         username,
//         password,
//         null,
//         { type: 'm.login.dummy' },
//         undefined,
//         undefined,
//         false
//       );

//       addTestResult('用户注册', true, `注册成功: ${response.user_id}`);
      
//       // 保存客户端实例
//       const newClient = createClient({
//         baseUrl: homeserverUrl,
//         accessToken: response.access_token,
//         userId: response.user_id,
//         deviceId: response.device_id
//       });
//       setClient(newClient);
      
//       return true;
//     } catch (error: any) {
//       if (error.errcode === 'M_USER_IN_USE') {
//         addTestResult('用户注册', false, '用户名已存在，尝试登录...');
//         return await testUserLogin();
//       }
//       addTestResult('用户注册', false, `注册失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 测试用户登录
//   const testUserLogin = async () => {
//     if (!username || !password) {
//       addTestResult('用户登录', false, '请输入用户名和密码');
//       return false;
//     }

//     try {
//       const testClient = createClient({ baseUrl: homeserverUrl });
//       const response = await testClient.loginWithPassword(username, password);
      
//       addTestResult('用户登录', true, `登录成功: ${response.user_id}`);
      
//       // 保存客户端实例
//       const newClient = createClient({
//         baseUrl: homeserverUrl,
//         accessToken: response.access_token,
//         userId: response.user_id,
//         deviceId: response.device_id
//       });
//       setClient(newClient);
      
//       return true;
//     } catch (error: any) {
//       addTestResult('用户登录', false, `登录失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 测试房间创建
//   const testRoomCreation = async () => {
//     if (!client) {
//       addTestResult('房间创建', false, '请先登录');
//       return false;
//     }

//     try {
//       const roomName = `测试房间_${Date.now()}`;
//       const response = await client.createRoom({
//         name: roomName,
//         topic: '这是一个测试房间',
//         preset: Preset.PublicChat,
//         visibility: Visibility.Public
//       });

//       addTestResult('房间创建', true, `房间创建成功: ${response.room_id}`);
//       return response.room_id;
//     } catch (error: any) {
//       addTestResult('房间创建', false, `房间创建失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 测试消息发送
//   const testMessageSending = async () => {
//     const roomId = await testRoomCreation();
//     if (!roomId || !client) return false;

//     try {
//       const messageText = `测试消息 - ${new Date().toLocaleString()}`;

//       const response = await client.sendTextMessage(roomId, messageText);
//       addTestResult('消息发送', true, `消息发送成功: ${response.event_id}`);
//       return true;
//     } catch (error: any) {
//       addTestResult('消息发送', false, `消息发送失败: ${error.message}`);
//       return false;
//     }
//   };

//   // 运行完整测试
//   const runFullTest = async () => {
//     setLoading(true);
//     clearResults();

//     console.log('开始 Matrix 集成测试...');

//     // 1. 测试服务器连接
//     const serverOk = await testServerConnection();
//     if (!serverOk) {
//       setLoading(false);
//       return;
//     }

//     // 2. 测试用户注册/登录
//     const authOk = await testUserRegistration();
//     if (!authOk) {
//       setLoading(false);
//       return;
//     }

//     // 3. 测试房间创建和消息发送
//     await testMessageSending();

//     setLoading(false);
//     Alert.alert('测试完成', '请查看测试结果');
//   };

//   return (
//     <ScrollView style={styles.container}>
//       <Text style={styles.title}>Matrix SDK 集成测试</Text>
      
//       <View style={styles.inputContainer}>
//         <Text style={styles.label}>服务器地址:</Text>
//         <TextInput
//           style={styles.input}
//           value={homeserverUrl}
//           onChangeText={setHomeserverUrl}
//           placeholder="https://official.cradleintro.top"
//           placeholderTextColor="#999"
//         />
//       </View>

//       <View style={styles.inputContainer}>
//         <Text style={styles.label}>用户名:</Text>
//         <TextInput
//           style={styles.input}
//           value={username}
//           onChangeText={setUsername}
//           placeholder="输入用户名"
//           placeholderTextColor="#999"
//           autoCapitalize="none"
//         />
//       </View>

//       <View style={styles.inputContainer}>
//         <Text style={styles.label}>密码:</Text>
//         <TextInput
//           style={styles.input}
//           value={password}
//           onChangeText={setPassword}
//           placeholder="输入密码"
//           placeholderTextColor="#999"
//           secureTextEntry
//         />
//       </View>

//       <View style={styles.buttonContainer}>
//         <TouchableOpacity
//           style={[styles.button, styles.primaryButton]}
//           onPress={runFullTest}
//           disabled={loading}
//         >
//           {loading ? (
//             <ActivityIndicator color="#fff" />
//           ) : (
//             <Text style={styles.buttonText}>运行完整测试</Text>
//           )}
//         </TouchableOpacity>

//         <TouchableOpacity
//           style={[styles.button, styles.secondaryButton]}
//           onPress={testServerConnection}
//           disabled={loading}
//         >
//           <Text style={styles.buttonText}>测试服务器连接</Text>
//         </TouchableOpacity>

//         <TouchableOpacity
//           style={[styles.button, styles.secondaryButton]}
//           onPress={clearResults}
//         >
//           <Text style={styles.buttonText}>清除结果</Text>
//         </TouchableOpacity>
//       </View>

//       {testResults.length > 0 && (
//         <View style={styles.resultsContainer}>
//           <Text style={styles.resultsTitle}>测试结果:</Text>
//           {testResults.map((result, index) => (
//             <View
//               key={index}
//               style={[
//                 styles.resultItem,
//                 result.success ? styles.successResult : styles.errorResult
//               ]}
//             >
//               <Text style={styles.resultTest}>{result.test}</Text>
//               <Text style={styles.resultMessage}>{result.message}</Text>
//             </View>
//           ))}
//         </View>
//       )}
//     </ScrollView>
//   );
// };

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     padding: 20,
//     backgroundColor: '#1e1f22',
//   },
//   title: {
//     fontSize: 24,
//     fontWeight: 'bold',
//     color: '#ffffff',
//     marginBottom: 30,
//     textAlign: 'center',
//   },
//   inputContainer: {
//     marginBottom: 20,
//   },
//   label: {
//     color: '#ffffff',
//     fontSize: 16,
//     marginBottom: 8,
//   },
//   input: {
//     backgroundColor: '#2b2d31',
//     borderRadius: 8,
//     padding: 12,
//     color: '#ffffff',
//     fontSize: 16,
//   },
//   buttonContainer: {
//     marginVertical: 20,
//   },
//   button: {
//     padding: 15,
//     borderRadius: 8,
//     alignItems: 'center',
//     marginBottom: 10,
//   },
//   primaryButton: {
//     backgroundColor: '#5865f2',
//   },
//   secondaryButton: {
//     backgroundColor: '#4f545c',
//   },
//   buttonText: {
//     color: '#ffffff',
//     fontSize: 16,
//     fontWeight: 'bold',
//   },
//   resultsContainer: {
//     marginTop: 20,
//   },
//   resultsTitle: {
//     color: '#ffffff',
//     fontSize: 18,
//     fontWeight: 'bold',
//     marginBottom: 15,
//   },
//   resultItem: {
//     padding: 12,
//     borderRadius: 8,
//     marginBottom: 10,
//   },
//   successResult: {
//     backgroundColor: '#3ba55c',
//   },
//   errorResult: {
//     backgroundColor: '#ed4245',
//   },
//   resultTest: {
//     color: '#ffffff',
//     fontSize: 16,
//     fontWeight: 'bold',
//     marginBottom: 4,
//   },
//   resultMessage: {
//     color: '#ffffff',
//     fontSize: 14,
//   },
// });

// export default MatrixTestComponent; 