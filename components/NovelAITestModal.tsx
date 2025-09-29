import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  Image,
  Alert,
  Linking,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { NovelAIService, NOVELAI_MODELS, NOVELAI_SAMPLERS, NOVELAI_NOISE_SCHEDULES } from './NovelAIService';

// Default endpoints
const DEFAULT_NOVELAI_API_SUBSCRIPTION = 'https://api.novelai.net/user/subscription';
const DEFAULT_NOVELAI_API_GENERATE = 'https://image.novelai.net/ai/generate-image';

// 自定义端点默认值
const DEFAULT_CUSTOM_ENDPOINT = '';
const DEFAULT_CUSTOM_TOKEN = '';

interface NovelAITestModalProps {
  visible: boolean;
  onClose: () => void;
  onImageGenerated: (imageUrl: string, taskId?: string) => void;
}

interface GenerationResult {
  success: boolean;
  message: string;
  imageUrl?: string;
  image_urls?: string[];
}

interface TokenCache {
  token: string;
  expiry: number;
  timestamp: number;
}

const NovelAITestModal: React.FC<NovelAITestModalProps> = ({
  visible,
  onClose,
  onImageGenerated,
}) => {
  const [token, setToken] = useState('');
  const [useCustomEndpoint, setUseCustomEndpoint] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState(DEFAULT_CUSTOM_ENDPOINT);
  const [customToken, setCustomToken] = useState(DEFAULT_CUSTOM_TOKEN);

  const [model, setModel] = useState('nai-diffusion-3');
  const [sampler, setSampler] = useState('k_euler_ancestral');
  const [steps, setSteps] = useState('28');
  const [scale, setScale] = useState('11');
  const [prompt, setPrompt] = useState('一只可爱的猫咪，高清照片');
  const [negativePrompt, setNegativePrompt] = useState('模糊，低质量，变形');

  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [resolution, setResolution] = useState<'portrait' | 'landscape' | 'square'>('portrait');

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult>();
  const [logs, setLogs] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string | null>(null);

  const [showV4Settings, setShowV4Settings] = useState(false);
  const [characterPrompt, setCharacterPrompt] = useState('');
  const [noiseSchedule, setNoiseSchedule] = useState('karras');

  const [tokenStatus, setTokenStatus] = useState<{
    isValid: boolean;
    message?: string;
  } | null>(null);

  const [tokenCache, setTokenCache] = useState<TokenCache | null>(null);
  const [savedImagePaths, setSavedImagePaths] = useState<string[]>([]);
  const [testConnectionResult, setTestConnectionResult] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    if (model.includes('nai-diffusion-4')) {
      setShowV4Settings(true);
    } else {
      setShowV4Settings(false);
    }
  }, [model]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await AsyncStorage.getItem('novelai_test_settings');
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          setToken(settings.token || '');
          setUseCustomEndpoint(settings.useCustomEndpoint || false);
          setCustomEndpoint(settings.customEndpoint || DEFAULT_CUSTOM_ENDPOINT);
          setCustomToken(settings.customToken || DEFAULT_CUSTOM_TOKEN);
          setModel(settings.model || 'nai-diffusion-3');
          setSampler(settings.sampler || 'k_euler_ancestral');
          setSteps(settings.steps || '28');
          setScale(settings.scale || '11');
          setResolution(settings.resolution || 'portrait');
        }

        const savedToken = await AsyncStorage.getItem('novelai_token_data');
        if (savedToken) {
          try {
            const tokenData = JSON.parse(savedToken) as TokenCache;
            setTokenCache(tokenData);

            if (tokenData.token === token.trim() && tokenData.expiry > Date.now()) {
              const daysRemaining = (tokenData.expiry - Date.now()) / (24 * 3600 * 1000);
              setTokenStatus({
                isValid: true,
                message: `Token有效，剩余约 ${daysRemaining.toFixed(1)} 天`,
              });
            }

            addLog('已加载Token缓存');
          } catch (e) {
            console.error('解析token缓存失败:', e);
          }
        }
      } catch (error) {
        console.error('加载设置失败:', error);
      }
    };

    if (visible) {
      loadSettings();
      setLogs([]);
      setResult(undefined);
      setTaskId(null);
      setTestConnectionResult(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !token.trim() || useCustomEndpoint) return;

    if (tokenCache && tokenCache.token === token.trim()) {
      const now = Date.now();
      if (tokenCache.expiry > now) {
        const daysRemaining = (tokenCache.expiry - now) / (24 * 3600 * 1000);
        setTokenStatus({
          isValid: true,
          message: `Token有效，剩余约 ${daysRemaining.toFixed(1)} 天`,
        });
      } else {
        setTokenStatus({
          isValid: false,
          message: `Token已过期，需要重新验证`,
        });
      }
    } else {
      setTokenStatus(null);
    }
  }, [visible, token, tokenCache, useCustomEndpoint]);

  const saveSettings = async () => {
    try {
      const settings = {
        token,
        useCustomEndpoint,
        customEndpoint,
        customToken,
        model,
        sampler,
        steps,
        scale,
        resolution,
      };
      await AsyncStorage.setItem('novelai_test_settings', JSON.stringify(settings));
      addLog('设置已保存');
      Alert.alert('成功', '设置已保存');
    } catch (error) {
      console.error('保存设置失败:', error);
      addLog('保存设置失败: ' + (error instanceof Error ? error.message : String(error)));
      Alert.alert('错误', '保存设置失败: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const cacheToken = async (verifiedToken: string) => {
    try {
      const now = Date.now();
      const expiry = now + 30 * 24 * 60 * 60 * 1000;

      const tokenData: TokenCache = {
        token: verifiedToken,
        expiry: expiry,
        timestamp: now,
      };

      setTokenCache(tokenData);
      await AsyncStorage.setItem('novelai_token_data', JSON.stringify(tokenData));

      const expiryDate = new Date(expiry).toLocaleDateString();
      addLog(`令牌已缓存，有效期至: ${expiryDate}`);

      setTokenStatus({
        isValid: true,
        message: `Token有效，剩余约 30 天`,
      });

      return verifiedToken;
    } catch (error) {
      console.error('缓存令牌失败:', error);
      addLog(`缓存令牌失败: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const testConnection = async () => {
    setTestConnectionResult(null);
    setIsLoading(true);
    addLog(`开始测试自定义端点连接...`);
    
    try {
      if (!customEndpoint.trim()) {
        throw new Error('请输入自定义端点URL');
      }
      
      if (!customToken.trim()) {
        throw new Error('请输入自定义端点Token');
      }
      
      addLog(`测试连接到: ${customEndpoint}`);
      
      // 对于自定义端点，尝试发送一个GET请求而不是OPTIONS请求
      // 许多API不支持OPTIONS请求，但支持GET请求
      const response = await axios({
        method: 'get',
        url: customEndpoint,
        headers: {
          'Authorization': `Bearer ${customToken}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
        timeout: 10000,
      });
      
      addLog(`连接成功! 状态码: ${response.status}`);
      setTestConnectionResult({
        success: true,
        message: `连接成功! 自定义端点可访问。`
      });
    } catch (error) {
      console.error('连接测试失败:', error);
      let errorMessage = '连接测试失败';
      
      if (axios.isAxiosError(error)) {
        if (error.response) {
          errorMessage = `连接失败 (${error.response.status}): ${error.response.data?.message || error.message}`;
        } else if (error.request) {
          errorMessage = `无法连接到服务器: ${error.message}`;
          if (error.code === 'ECONNABORTED') {
            errorMessage = '连接超时。请检查端点URL是否正确，或者网络连接是否稳定。';
          }
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      addLog(`连接测试失败: ${errorMessage}`);
      setTestConnectionResult({
        success: false,
        message: `连接测试失败: ${errorMessage}`
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyToken = async (inputToken: string): Promise<string> => {
    try {
      if (tokenCache && tokenCache.token === inputToken) {
        const now = Date.now();
        if (tokenCache.expiry > now) {
          const daysRemaining = (tokenCache.expiry - now) / (24 * 3600 * 1000);
          addLog(`使用缓存的令牌，剩余有效期约 ${daysRemaining.toFixed(1)} 天`);
          return inputToken;
        } else {
          addLog(`缓存的令牌已过期，将重新验证`);
        }
      }

      const cleanToken = inputToken.trim();
      addLog(`验证令牌中...`);

      const response = await axios.get(DEFAULT_NOVELAI_API_SUBSCRIPTION, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      if (response.status === 200) {
        addLog(`令牌验证成功！`);
        await cacheToken(cleanToken);
        return cleanToken;
      } else {
        throw new Error('令牌验证失败');
      }
    } catch (error) {
      console.error('验证令牌失败:', error);
      let errorMessage = '令牌验证失败';

      if (axios.isAxiosError(error)) {
        if (error.response) {
          errorMessage = `令牌验证失败 (${error.response.status}): ${error.response.data?.message || error.message}`;
        } else if (error.request) {
          errorMessage = `无法连接到服务器: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      addLog(`令牌验证失败: ${errorMessage}`);
      throw new Error(errorMessage);
    }
  };

  const resolutionToDimensions = (resolution: string): { width: number; height: number } => {
    if (resolution === 'portrait') {
      return { width: 832, height: 1216 };
    } else if (resolution === 'landscape') {
      return { width: 1216, height: 832 };
    } else if (resolution === 'square') {
      return { width: 1024, height: 1024 };
    } else {
      return { width: 832, height: 1216 };
    }
  };

  const saveBase64ImageToPNG = async (base64Data: string, filename: string): Promise<string> => {
    try {
      let base64Content = base64Data;
      if (base64Content.startsWith('data:')) {
        base64Content = base64Content.split(',')[1];
      }

      const imageFilename = filename || `novelai_${Date.now()}.png`;
      const imagePath = `${FileSystem.documentDirectory}images/${imageFilename}`;
      const dirPath = `${FileSystem.documentDirectory}images`;
      const dirInfo = await FileSystem.getInfoAsync(dirPath);

      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
        addLog(`创建图像目录: ${dirPath}`);
      }

      await FileSystem.writeAsStringAsync(imagePath, base64Content, {
        encoding: FileSystem.EncodingType.Base64,
      });

      addLog(`图像已保存到: ${imagePath}`);

      const manipResult = await ImageManipulator.manipulateAsync(
        imagePath,
        [],
        { compress: 0.9, format: ImageManipulator.SaveFormat.PNG }
      );

      addLog(`图像已优化: ${manipResult.uri}`);

      return manipResult.uri;
    } catch (error) {
      addLog(`保存图像失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  };

  const extractImagesFromZip = async (blobData: Blob): Promise<string[]> => {
    try {
      addLog('开始处理ZIP响应数据...');

      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const fileReader = new FileReader();
        fileReader.onload = () => {
          if (fileReader.result instanceof ArrayBuffer) {
            resolve(fileReader.result);
          } else {
            reject(new Error('Failed to convert blob to ArrayBuffer'));
          }
        };
        fileReader.onerror = () => reject(fileReader.error || new Error('Unknown FileReader error'));
        fileReader.readAsArrayBuffer(blobData);
      });

      addLog(`成功转换为ArrayBuffer，大小: ${Math.round(arrayBuffer.byteLength / 1024)} KB`);

      try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(arrayBuffer);

        addLog(`ZIP文件加载成功，开始提取图像文件...`);

        const imageFiles: string[] = [];
        const filePromises: Promise<void>[] = [];

        const fileCount = Object.keys(zipContent.files).length;
        addLog(`ZIP包含 ${fileCount} 个文件`);

        if (fileCount === 0) {
          addLog('ZIP文件为空，尝试将内容直接作为图像处理');
          return await handleDirectImageData(blobData);
        }

        Object.keys(zipContent.files).forEach((filename) => {
          if (!zipContent.files[filename].dir) {
            addLog(`发现文件: ${filename}`);

            if (/\.(png|jpg|jpeg|webp)$/i.test(filename) || !filename.includes('.')) {
              const filePromise = zipContent.files[filename]
                .async('base64')
                .then(async (base64Data) => {
                  const extension = filename.includes('.')
                    ? filename.split('.').pop()?.toLowerCase() || 'png'
                    : 'png';

                  const mimeType = extension === 'jpg' || extension === 'jpeg'
                    ? 'image/jpeg'
                    : extension === 'webp'
                      ? 'image/webp'
                      : 'image/png';

                  const dataUrl = `data:${mimeType};base64,${base64Data}`;
                  imageFiles.push(dataUrl);

                  try {
                    const savedPath = await saveBase64ImageToPNG(
                      base64Data,
                      `novelai_${Date.now()}_${imageFiles.length}.${extension}`
                    );
                    addLog(`已保存图像文件: ${savedPath}`);
                    setSavedImagePaths(prev => [...prev, savedPath]);
                  } catch (saveError) {
                    addLog(`保存图像到文件系统失败: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
                  }

                  addLog(`成功提取图像: ${filename}, 数据长度: ${Math.round(base64Data.length / 1024)} KB`);
                })
                .catch((err) => {
                  addLog(`提取图像 ${filename} 失败: ${err}`);
                });

              filePromises.push(filePromise);
            } else {
              addLog(`跳过非图像文件: ${filename}`);
            }
          }
        });

        if (filePromises.length === 0) {
          addLog('ZIP中没有找到图像文件，尝试将内容直接作为图像处理');
          return await handleDirectImageData(blobData);
        } else {
          await Promise.all(filePromises);
        }

        addLog(`成功提取 ${imageFiles.length} 张图像`);
        return imageFiles;
      } catch (zipError) {
        addLog(`JSZip处理失败: ${zipError}, 尝试直接作为图像处理...`);
        return await handleDirectImageData(blobData);
      }
    } catch (error) {
      addLog(`解压失败: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`无法从ZIP中提取图像: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDirectImageData = async (blobData: Blob): Promise<string[]> => {
    try {
      addLog('尝试将内容直接作为图像处理...');

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob as data URL'));
        reader.readAsDataURL(blobData);
      });

      if (!dataUrl) {
        throw new Error('无法将数据转换为图像');
      }

      let base64Content: string;
      if (dataUrl.includes('base64,')) {
        base64Content = dataUrl.split('base64,')[1];
        const mimeType = dataUrl.split(';')[0].split(':')[1];
        addLog(`检测到MIME类型: ${mimeType}`);
      } else {
        addLog('无法从数据URL中提取base64内容，尝试直接使用');
        base64Content = dataUrl;
      }

      try {
        const filename = `novelai_direct_${Date.now()}.png`;
        const savedPath = await saveBase64ImageToPNG(base64Content, filename);
        addLog(`已保存直接处理的图像: ${savedPath}`);
        setSavedImagePaths(prev => [...prev, savedPath]);
      } catch (saveError) {
        addLog(`保存直接处理的图像失败: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
      }

      addLog('成功将响应处理为单个图像');
      return [dataUrl];
    } catch (error) {
      addLog(`直接处理图像失败: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(`无法处理图像数据: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const generateImage = async () => {
    setIsLoading(true);
    setResult(undefined);
    setLogs([]);
    setSavedImagePaths([]);
    addLog('开始生成图像...');
    addLog(`模型: ${model}, 采样器: ${sampler}, 步数: ${steps}`);

    try {
      const newTaskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      setTaskId(newTaskId);

      let accessToken: string;
      let generateEndpoint: string;

      if (useCustomEndpoint) {
        // 使用自定义端点
        if (!customEndpoint.trim()) {
          throw new Error('自定义端点URL不能为空');
        }
        
        if (!customToken.trim()) {
          throw new Error('自定义端点Token不能为空');
        }
        
        accessToken = customToken.trim();
        
        // 确保端点是完整URL - 这里不再需要添加额外的路径
        // 因为customEndpoint应该已经是完整的API端点
        generateEndpoint = customEndpoint.trim();
        
        addLog(`使用自定义端点: ${generateEndpoint}`);
        addLog(`使用自定义Token: ${accessToken.substring(0, 8)}...`);
      } else {
        // 使用官方端点，需要验证token
        const cleanToken = token.trim();
        if (!cleanToken || cleanToken.length < 10) {
          throw new Error('官方Token为空或长度不足，请检查输入');
        }

        accessToken = await verifyToken(cleanToken);
        generateEndpoint = DEFAULT_NOVELAI_API_GENERATE;
        
        if (!accessToken) {
          throw new Error('无法获取有效的访问令牌');
        }
      }

      const modelMap: { [key: string]: string } = NOVELAI_MODELS;
      const officialModel = modelMap[model] || model;
      const isV4Model = officialModel.includes('nai-diffusion-4');
      const dimensions = resolutionToDimensions(resolution);
      
      addLog(`使用图像生成端点: ${generateEndpoint}`);

      // 构建请求数据
      const requestData: any = {
        action: 'generate',
        input: prompt,
        model: officialModel,
        parameters: {
          width: dimensions.width,
          height: dimensions.height,
          scale: parseFloat(scale),
          sampler: sampler,
          steps: parseInt(steps),
          n_samples: 1,
          ucPreset: 0,
          seed: Math.floor(Math.random() * 2 ** 32),
          sm: false,
          sm_dyn: false,
          add_original_image: true,
          legacy: false,
        },
      };

      if (isV4Model) {
        requestData.parameters.params_version = 3;
        requestData.parameters.qualityToggle = true;
        requestData.parameters.prefer_brownian = true;
        requestData.parameters.autoSmea = false;
        requestData.parameters.dynamic_thresholding = false;
        requestData.parameters.controlnet_strength = 1;
        requestData.parameters.legacy_v3_extend = false;
        requestData.parameters.deliberate_euler_ancestral_bug = false;
        requestData.parameters.noise_schedule = noiseSchedule;

        const charPrompt = characterPrompt;

        requestData.parameters.v4_prompt = {
          caption: {
            base_caption: prompt,
            char_captions: [
              {
                char_caption: charPrompt,
                centers: [
                  {
                    x: 0,
                    y: 0,
                  },
                ],
              },
            ],
          },
          use_coords: false,
          use_order: true,
        };

        requestData.parameters.v4_negative_prompt = {
          caption: {
            base_caption:
              negativePrompt ||
              'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks, white blank page, blank page',
            char_captions: [
              {
                char_caption: '',
                centers: [
                  {
                    x: 0,
                    y: 0,
                  },
                ],
              },
            ],
          },
        };

        if (charPrompt) {
          requestData.parameters.characterPrompts = [
            {
              prompt: charPrompt,
              uc: '',
              center: {
                x: 0,
                y: 0,
              },
            },
          ];
        }
      }

      if (!isV4Model && negativePrompt) {
        requestData.parameters.negative_prompt = negativePrompt;
      }

      addLog(`已构建请求数据，开始发送请求...`);
      addLog(`请求数据摘要: 模型=${officialModel}, 分辨率=${dimensions.width}x${dimensions.height}`);

      // 打印请求详情以便调试
      if (useCustomEndpoint) {
        addLog(`详细请求信息 - URL: ${generateEndpoint}`);
        addLog(`详细请求信息 - Headers: Authorization Bearer, Content-Type: application/json`);
        addLog(`详细请求信息 - 数据长度: ${JSON.stringify(requestData).length}`);
      }

      const response = await axios({
        method: 'post',
        url: generateEndpoint,
        data: requestData,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/x-zip-compressed, image/png, image/jpeg, image/webp',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Referer: 'https://novelai.net/image',
          Origin: 'https://novelai.net',
        },
        responseType: 'blob',
      });

      if (response.status === 200) {
        const contentType = response.headers['content-type'] || '';
        const contentLength = response.headers['content-length'] || 'unknown';
        addLog(`响应成功，Content-Type: ${contentType}, Content-Length: ${contentLength}, 数据大小: ${Math.round(response.data.size / 1024)} KB`);

        try {
          const responseBlob = response.data;
          addLog(`获取到响应Blob，大小: ${Math.round(responseBlob.size / 1024)} KB, 类型: ${responseBlob.type}`);

          try {
            const imageDataUrls = await extractImagesFromZip(responseBlob);

            if (imageDataUrls.length > 0) {
              addLog(`成功提取 ${imageDataUrls.length} 张图像`);

              setResult({
                success: true,
                message: `成功生成了 ${imageDataUrls.length} 张图像!`,
                imageUrl: imageDataUrls[0],
                image_urls: imageDataUrls,
              });

              const imageToReturn = savedImagePaths.length > 0 ? savedImagePaths[0] : imageDataUrls[0];
              onImageGenerated(imageToReturn, newTaskId);
            } else {
              throw new Error('未能提取任何图像');
            }
          } catch (error) {
            throw new Error(`处理响应失败: ${error instanceof Error ? error.message : String(error)}`);
          }
        } catch (processingError) {
          addLog(`处理响应数据时出错: ${processingError instanceof Error ? processingError.message : String(processingError)}`);
          throw processingError;
        }
      } else {
        throw new Error(`请求失败，状态码: ${response.status}`);
      }
    } catch (error) {
      console.error('生成图像过程中发生错误:', error);
      let errorMessage = '未知错误';

      if (axios.isAxiosError(error)) {
        if (error.response) {
          try {
            const errorData = error.response.data;
            errorMessage = `服务器错误 (${error.response.status})`;
            
            // 尝试读取响应体中的详细错误信息
            if (errorData) {
              if (typeof errorData === 'string') {
                errorMessage = errorData;
              } else if (errorData instanceof Blob) {
                // 如果响应是Blob，尝试读取为文本
                try {
                  const text = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () => resolve(`无法读取错误信息 Blob (${errorData.size} bytes)`);
                    reader.readAsText(errorData);
                  });
                  errorMessage = `服务器错误 (${error.response.status}): ${text}`;
                } catch (e) {
                  errorMessage = `服务器错误 (${error.response.status}): 无法解析错误信息`;
                }
              } else if (typeof errorData === 'object') {
                errorMessage = errorData.message || JSON.stringify(errorData);
              }
            }
            
            // 添加更详细的信息用于调试
            if (useCustomEndpoint) {
              addLog(`请求失败: ${error.response.status} ${error.response.statusText}`);
              
              // 打印响应头
              if (error.response.headers) {
                const headers = JSON.stringify(error.response.headers);
                addLog(`响应头: ${headers}`);
              }
            }
          } catch (e) {
            errorMessage = `服务器错误 (${error.response.status}): ${error.message}`;
          }
        } else if (error.request) {
          errorMessage = `无法连接到服务器: ${error.message}`;
          
          // 添加更多网络诊断信息
          if (useCustomEndpoint) {
            addLog(`网络错误: 请求已发送但未收到响应`);
            if (error.code) {
              addLog(`错误代码: ${error.code}`);
            }
          }
        } else {
          errorMessage = `请求配置错误: ${error.message}`;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      addLog('生成图像过程中发生错误: ' + errorMessage);
      setResult({
        success: false,
        message: '生成图像过程中发生错误: ' + errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const openImageInNewWindow = (imageUrl: string) => {
    if (Platform.OS === 'web') {
      try {
        window.open(imageUrl, '_blank');
      } catch (error) {
        addLog(`无法在新窗口中打开图像: ${error}`);
        Alert.alert('错误', '无法在新窗口中打开图像');
      }
    } else {
      Linking.canOpenURL(imageUrl)
        .then((supported) => {
          if (supported) {
            Linking.openURL(imageUrl);
          } else {
            addLog(`设备无法打开此URL: ${imageUrl}`);
            Alert.alert('错误', '设备无法打开此图像链接');
          }
        })
        .catch((error) => {
          addLog(`打开URL时出错: ${error}`);
          Alert.alert('错误', '打开图像链接时出错');
        });
    }
  };

  const renderImages = () => {
    if (!result?.success) return null;

    const hasMultipleImages =
      savedImagePaths.length > 1 ||
      (savedImagePaths.length === 0 && result.image_urls && result.image_urls.length > 1);
    const imagesToRender = savedImagePaths.length > 0 ? savedImagePaths : result.image_urls || [];

    if (hasMultipleImages) {
      return (
        <ScrollView horizontal style={styles.imageScrollView}>
          {imagesToRender.map((url, index) => (
            <View key={index} style={styles.imageContainer}>
              <Image source={{ uri: url }} style={styles.resultImage} resizeMode="contain" />
              <Text style={styles.imageIndexText}>图像 {index + 1}</Text>
            </View>
          ))}
        </ScrollView>
      );
    }

    const imageUrl = savedImagePaths[0] || result.imageUrl;
    if (!imageUrl) return null;

    const isDataUrl = imageUrl.startsWith('data:');
    const isLargeDataUrl = isDataUrl && imageUrl.length > 100000;

    if (isLargeDataUrl) {
      return (
        <View style={styles.imageContainer}>
          <Text style={styles.warningText}>* 图像较大，直接显示可能影响性能 *</Text>
          <TouchableOpacity
            style={styles.viewImageButton}
            onPress={() => openImageInNewWindow(imageUrl)}
          >
            <Text style={styles.viewImageButtonText}>查看完整图像</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return <Image source={{ uri: imageUrl }} style={styles.resultImage} resizeMode="contain" />;
  };

  const renderTokenStatus = () => {
    if (!tokenStatus || useCustomEndpoint) return null;

    return (
      <View style={styles.tokenStatusContainer}>
        {tokenStatus.isValid ? (
          <View style={styles.tokenStatusContent}>
            <Text style={styles.tokenStatusText}>
              令牌状态: <Text style={styles.tokenValid}>有效</Text>
            </Text>
            {tokenStatus.message && (
              <Text style={styles.tokenDetailText}>{tokenStatus.message}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.tokenStatusText}>
            令牌状态: <Text style={styles.tokenInvalid}>无效</Text>
            {tokenStatus.message && ` - ${tokenStatus.message}`}
          </Text>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>NovelAI 图像生成测试</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>关闭</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>端点设置</Text>

          <View style={styles.toggleContainer}>
            <Text style={styles.toggleLabel}>使用自定义端点</Text>
            <Switch
              value={useCustomEndpoint}
              onValueChange={setUseCustomEndpoint}
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={useCustomEndpoint ? '#3498db' : '#f4f3f4'}
            />
          </View>

          {useCustomEndpoint ? (
            <>
              <Text style={styles.label}>自定义端点 URL</Text>
              <TextInput
                style={styles.input}
                value={customEndpoint}
                onChangeText={setCustomEndpoint}
                placeholder={DEFAULT_CUSTOM_ENDPOINT}
              />

              <Text style={styles.label}>自定义端点 Token</Text>
              <TextInput
                style={styles.input}
                value={customToken}
                onChangeText={setCustomToken}
                placeholder={DEFAULT_CUSTOM_TOKEN}
                secureTextEntry
              />

              <TouchableOpacity
                style={styles.testConnectionButton}
                onPress={testConnection}
                disabled={isLoading}
              >
                <Text style={styles.testConnectionText}>测试连接</Text>
              </TouchableOpacity>

              {testConnectionResult && (
                <View style={[
                  styles.testResultContainer,
                  testConnectionResult.success ? styles.testSuccessContainer : styles.testFailureContainer
                ]}>
                  <Text style={styles.testResultText}>
                    {testConnectionResult.success ? '✓ ' : '✗ '}
                    {testConnectionResult.message}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <>
              <Text style={styles.label}>NovelAI 官方 Token</Text>
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="输入你的NovelAI Token"
                secureTextEntry
              />
              {renderTokenStatus()}
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>生成设置</Text>

          <Text style={styles.label}>模型</Text>
          <View style={styles.pickerContainer}>
            {Object.entries(NOVELAI_MODELS).map(([name, id]) => (
              <TouchableOpacity
                key={id}
                style={[
                  styles.optionButton,
                  model === id && styles.selectedOption,
                ]}
                onPress={() => setModel(id)}
              >
                <Text style={[
                  styles.optionText,
                  model === id && styles.selectedOptionText
                ]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>采样器</Text>
          <View style={styles.pickerContainer}>
            {NOVELAI_SAMPLERS.map((samplerOption) => (
              <TouchableOpacity
                key={samplerOption}
                style={[
                  styles.optionButton,
                  sampler === samplerOption && styles.selectedOption,
                ]}
                onPress={() => setSampler(samplerOption)}
              >
                <Text style={[
                  styles.optionText,
                  sampler === samplerOption && styles.selectedOptionText
                ]}>{samplerOption}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>步数</Text>
          <TextInput
            style={styles.input}
            value={steps}
            onChangeText={setSteps}
            placeholder="生成步数"
            keyboardType="numeric"
          />

          <Text style={styles.label}>提示词相关性 (CFG Scale)</Text>
          <TextInput
            style={styles.input}
            value={scale}
            onChangeText={setScale}
            placeholder="Scale"
            keyboardType="numeric"
          />

          <Text style={styles.label}>分辨率</Text>
          <View style={styles.pickerContainer}>
            {(['portrait', 'landscape', 'square'] as const).map((res) => (
              <TouchableOpacity
                key={res}
                style={[
                  styles.optionButton,
                  resolution === res && styles.selectedOption,
                ]}
                onPress={() => setResolution(res)}
              >
                <Text style={[
                  styles.optionText,
                  resolution === res && styles.selectedOptionText
                ]}>{
                  res === 'portrait' ? '纵向 (832×1216)' :
                  res === 'landscape' ? '横向 (1216×832)' :
                  '方形 (1024×1024)'
                }</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={styles.advancedButton}
            onPress={() => setShowAdvancedSettings(!showAdvancedSettings)}
          >
            <Text style={styles.advancedButtonText}>
              {showAdvancedSettings ? '隐藏高级设置' : '显示高级设置'}
            </Text>
          </TouchableOpacity>

          {showV4Settings && (
            <View style={styles.v4SettingsContainer}>
              <Text style={styles.v4SettingsTitle}>V4 模型特有设置</Text>

              <Text style={styles.label}>角色提示词</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={characterPrompt}
                onChangeText={setCharacterPrompt}
                placeholder="描述角色特征，如：girl, long hair, blue eyes"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.label}>噪声调度</Text>
              <View style={styles.pickerContainer}>
                {NOVELAI_NOISE_SCHEDULES.map((scheduleOption) => (
                  <TouchableOpacity
                    key={scheduleOption}
                    style={[
                      styles.optionButton,
                      noiseSchedule === scheduleOption && styles.selectedOption,
                    ]}
                    onPress={() => setNoiseSchedule(scheduleOption)}
                  >
                    <Text style={[
                      styles.optionText,
                      noiseSchedule === scheduleOption && styles.selectedOptionText
                    ]}>{scheduleOption}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.label}>提示词</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="描述您想要生成的图像"
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>负面提示词</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={negativePrompt}
            onChangeText={setNegativePrompt}
            placeholder="描述您不想在图像中出现的内容"
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.saveButton]}
            onPress={saveSettings}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>保存设置</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.generateButton, isLoading && styles.disabledButton]}
            onPress={generateImage}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? '生成中...' : '生成图像'}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3498db" />
            <Text style={styles.loadingText}>正在处理，请稍候...</Text>
            {taskId && <Text style={styles.taskIdText}>任务ID: {taskId}</Text>}
          </View>
        )}

        {result && (
          <View
            style={[
              styles.resultContainer,
              result.success ? styles.successResult : styles.errorResult,
            ]}
          >
            <Text style={styles.resultText}>{result.message}</Text>
            {result.success && renderImages()}
          </View>
        )}

        <View style={styles.logsContainer}>
          <Text style={styles.logsTitle}>执行日志:</Text>
          <ScrollView style={styles.logs}>
            {logs.map((log, index) => (
              <Text key={index} style={styles.logEntry}>
                {log}
              </Text>
            ))}
          </ScrollView>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
    backgroundColor: '#ddd',
    borderRadius: 5,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#333',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  optionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  selectedOption: {
    backgroundColor: '#3498db',
    borderColor: '#2980b9',
  },
  optionText: {
    color: '#555',
    fontSize: 14,
  },
  selectedOptionText: {
    color: '#fff',
  },
  advancedButton: {
    alignSelf: 'center',
    marginVertical: 10,
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  advancedButtonText: {
    color: '#555',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 5,
    elevation: 2,
  },
  saveButton: {
    backgroundColor: '#27ae60',
  },
  generateButton: {
    backgroundColor: '#3498db',
  },
  disabledButton: {
    backgroundColor: '#95a5a6',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
  resultContainer: {
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  successResult: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
  },
  errorResult: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    borderWidth: 1,
  },
  resultText: {
    marginBottom: 10,
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultImage: {
    width: 300,
    height: 300,
    borderRadius: 5,
  },
  logsContainer: {
    backgroundColor: '#333',
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
  },
  logsTitle: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 5,
    fontWeight: 'bold',
  },
  logs: {
    height: 200,
  },
  logEntry: {
    color: '#adff2f',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  bottomSpacer: {
    height: 50,
  },
  taskIdText: {
    color: '#666',
    fontSize: 12,
    marginTop: 5,
  },
  imageScrollView: {
    flexGrow: 0,
    marginVertical: 10,
  },
  imageContainer: {
    marginRight: 10,
    alignItems: 'center',
  },
  imageIndexText: {
    marginTop: 5,
    color: '#666',
    fontSize: 12,
  },
  warningText: {
    color: '#e67e22',
    marginBottom: 10,
    fontSize: 14,
  },
  viewImageButton: {
    backgroundColor: '#3498db',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
  },
  viewImageButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  v4SettingsContainer: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    marginVertical: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#6c5ce7',
  },
  v4SettingsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6c5ce7',
    marginBottom: 12,
  },
  tokenStatusContainer: {
    marginVertical: 10,
    padding: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#3498db',
  },
  tokenStatusContent: {
    flexDirection: 'column',
  },
  tokenStatusText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  tokenDetailText: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  tokenValid: {
    color: '#27ae60',
    fontWeight: 'bold',
  },
  tokenInvalid: {
    color: '#e74c3c',
    fontWeight: 'bold',
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10,
    paddingVertical: 5,
  },
  toggleLabel: {
    fontSize: 16,
    color: '#555',
  },
  testConnectionButton: {
    backgroundColor: '#3498db',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 10,
  },
  testConnectionText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  testResultContainer: {
    padding: 10,
    borderRadius: 8,
    marginTop: 5,
    marginBottom: 15,
  },
  testSuccessContainer: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
  },
  testFailureContainer: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    borderWidth: 1,
  },
  testResultText: {
    fontSize: 14,
  }
});

export default NovelAITestModal;

