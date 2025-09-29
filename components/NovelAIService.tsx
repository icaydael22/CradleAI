import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { decode as atob, encode as btoa } from 'base-64';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { getUserSettingsGlobally } from '@/utils/settings-helper';

const NOVELAI_API_SUBSCRIPTION = 'https://api.novelai.net/user/subscription';
const NOVELAI_API_GENERATE = 'https://image.novelai.net/ai/generate-image';

export interface NovelAIModels {
  [key: string]: string;
}

export const NOVELAI_MODELS: NovelAIModels = {
  'NAI Diffusion V4 Curated': 'nai-diffusion-4-curated-preview',
  'NAI Diffusion V4': 'nai-diffusion-4-full'
};

export const NOVELAI_SAMPLERS = [
  'k_euler_ancestral', 
  'k_euler', 
  'ddim', 
  'k_dpmpp_2s_ancestral', 
  'k_dpmpp_2m'
];

export const NOVELAI_NOISE_SCHEDULES = [
  'karras',
  'exponential',
  'polyexponential'
];

interface TokenCache {
  token: string;
  expiry: number;
  timestamp: number;
}

export interface CharacterPromptPosition {
  x: number;
  y: number;
}

export interface CharacterPromptData {
  prompt: string;
  positions: CharacterPromptPosition[];
}

interface NovelAIGenerateParams {
  token: string;
  prompt: string;
  characterPrompts?: CharacterPromptData[];
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  steps: number;
  scale: number;
  sampler: string;
  seed?: number;
  noiseSchedule?: string;
  useCoords?: boolean;
  useOrder?: boolean;
  endpoint?: string; // 新增：允许外部传入endpoint
}

export class NovelAIService {
  static async validateToken(token: string): Promise<boolean> {
    try {
      const cleanToken = token.trim();
      
      // First check if we have a valid cached token
      const cachedTokenData = await NovelAIService.getTokenCache();
      if (cachedTokenData && cachedTokenData.token === cleanToken) {
        if (cachedTokenData.expiry > Date.now()) {
          console.log('[NovelAI] Using cached valid token');
          return true;
        }
      }

      // If no valid cached token, verify with API
      const response = await axios.get(NOVELAI_API_SUBSCRIPTION, {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      if (response.status === 200) {
        console.log('[NovelAI] Token verification successful');
        await NovelAIService.cacheToken(cleanToken);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[NovelAI] Token validation error:', error);
      return false;
    }
  }

  static async cacheToken(token: string): Promise<void> {
    try {
      const now = Date.now();
      const expiry = now + 30 * 24 * 60 * 60 * 1000; // 30 days

      const tokenData: TokenCache = {
        token: token,
        expiry: expiry,
        timestamp: now
      };

      await AsyncStorage.setItem('novelai_token_data', JSON.stringify(tokenData));
      console.log('[NovelAI] Token cached successfully, expires:', new Date(expiry).toLocaleDateString());
    } catch (error) {
      console.error('[NovelAI] Failed to cache token:', error);
    }
  }

  static async getTokenCache(): Promise<TokenCache | null> {
    try {
      const savedToken = await AsyncStorage.getItem('novelai_token_data');
      if (savedToken) {
        return JSON.parse(savedToken) as TokenCache;
      }
      return null;
    } catch (error) {
      console.error('[NovelAI] Failed to retrieve token cache:', error);
      return null;
    }
  }

  static async clearTokenCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem('novelai_token_data');
      console.log('[NovelAI] Token cache cleared');
    } catch (error) {
      console.error('[NovelAI] Failed to clear token cache:', error);
    }
  }

  static async generateImage(params: NovelAIGenerateParams): Promise<{ imageUrls: string[], seed: number }> {
    console.log('[NovelAI] Starting image generation...');

    // --- 新增：自动从settings-helper获取NovelAI API设置 ---
    const settings = getUserSettingsGlobally();
    let useCustomEndpoint = false;
    let customEndpoint = '';
    let customToken = '';
    if (settings?.chat?.novelai) {
      useCustomEndpoint = !!settings.chat.novelai.useCustomEndpoint;
      customEndpoint = settings.chat.novelai.customEndpoint || '';
      customToken = settings.chat.novelai.customToken || '';
    }

    try {
      const {
        token,
        prompt,
        characterPrompts = [],
        negativePrompt,
        model,
        width,
        height,
        steps,
        scale,
        sampler,
        seed = Math.floor(Math.random() * 2 ** 32),
        noiseSchedule = 'karras',
        useCoords = false,
        useOrder = true
      } = params;

      const cleanToken = token.trim();
      if (!cleanToken) {
        throw new Error('NovelAI token is required');
      }

      // Prepare model name for API
      const modelMap: { [key: string]: string } = NOVELAI_MODELS;
      const officialModel = modelMap[model] || model;
      
      // Check if using V4 model
      const isV4Model = officialModel.includes('nai-diffusion-4');
      
      // Prepare request data
      const requestData: any = {
        action: 'generate',
        input: prompt,
        model: officialModel,
        parameters: {
          width: width,
          height: height,
          scale: parseFloat(String(scale)),
          sampler: sampler,
          steps: parseInt(String(steps)),
          n_samples: 1,
          ucPreset: 0,
          seed: seed,
          sm: false,
          sm_dyn: false,
          add_original_image: true,
          legacy: false,
        },
      };

      // Add V4 specific parameters if using V4 model
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

        // Build character prompts for V4
        const charCaption = characterPrompts.length > 0 
          ? characterPrompts.map(char => ({
              char_caption: char.prompt,
              centers: char.positions.map(pos => ({ x: pos.x, y: pos.y }))
            }))
          : [{ char_caption: "", centers: [{ x: 0, y: 0 }] }];

        requestData.parameters.v4_prompt = {
          caption: {
            base_caption: prompt,
            char_captions: charCaption
          },
          use_coords: useCoords,
          use_order: useOrder,
        };

        requestData.parameters.v4_negative_prompt = {
          caption: {
            base_caption: negativePrompt,
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
      }

      if (!isV4Model && negativePrompt) {
        requestData.parameters.negative_prompt = negativePrompt;
      }

      console.log('[NovelAI] Sending request with data:', JSON.stringify(requestData, null, 2));
      
      // Make the API request
      let apiUrl = params.endpoint || NOVELAI_API_GENERATE;
      let apiToken = params.token;

      // 打印实际请求的url和token信息（仅前6位+长度，避免泄漏）
      console.log(`[NovelAI] Requesting endpoint: ${apiUrl}`);
      if (apiToken) {
        console.log(`[NovelAI] Using token: ${apiToken.slice(0, 6)}... (length: ${apiToken.length})`);
      }

      // 如果启用自定义端点，则覆盖url和token
      // 已由外部传入endpoint和token，无需再处理
      const response = await axios({
        method: 'post',
        url: apiUrl,
        data: requestData,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/x-zip-compressed, image/png, image/jpeg, image/webp',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Referer: 'https://novelai.net/image',
          Origin: 'https://novelai.net',
        },
        responseType: 'blob',
      });

      if (response.status === 200) {
        console.log('[NovelAI] Image generation request successful');
        const imageUrls = await NovelAIService.processImageResponse(response.data);
        return { imageUrls, seed };
      } else {
        throw new Error(`API request failed with status ${response.status}`);
      }
    } catch (error: any) {
      // --- 新增详细Axios错误打印 ---
      if (error?.response) {
        // Axios error with response
        console.error('[NovelAI] Image generation failed:', error.message, 'Status:', error.response.status, 'Data:', error.response.data);
        if (error.response.data && typeof error.response.data === 'object') {
          // 尝试打印服务器返回的详细错误信息
          const msg = error.response.data.error || error.response.data.message || JSON.stringify(error.response.data);
          throw new Error(`NovelAI API Error ${error.response.status}: ${msg}`);
        } else if (typeof error.response.data === 'string') {
          throw new Error(`NovelAI API Error ${error.response.status}: ${error.response.data}`);
        } else {
          throw new Error(`NovelAI API Error ${error.response.status}`);
        }
      } else if (error?.message) {
        console.error('[NovelAI] Image generation failed:', error.message);
        throw new Error(error.message);
      } else {
        console.error('[NovelAI] Image generation failed:', error);
        throw error;
      }
    }
  }

  private static async processImageResponse(blobData: Blob): Promise<string[]> {
    try {
      console.log('[NovelAI] Processing response data...');
      
      try {
        // Try to process as ZIP first
        const imageUrls = await NovelAIService.extractImagesFromZip(blobData);
        if (imageUrls.length > 0) {
          console.log('[NovelAI] Successfully processed as ZIP with images:', imageUrls.length);
          return imageUrls;
        }
      } catch (zipError) {
        console.warn('[NovelAI] ZIP extraction failed, trying direct image processing:', zipError);
      }
      
      // Fallback to direct image processing
      const imageUrl = await NovelAIService.processSingleImage(blobData);
      console.log('[NovelAI] Successfully processed as single image:', imageUrl);
      return [imageUrl];
    } catch (error) {
      console.error('[NovelAI] Failed to process response:', error);
      throw new Error('Failed to process image data from NovelAI');
    }
  }

  private static async processSingleImage(blobData: Blob): Promise<string> {
    console.log('[NovelAI] Processing as single image, blob size:', blobData.size);
    
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        console.log('[NovelAI] Blob read as data URL, length:', (reader.result as string).length);
        resolve(reader.result as string);
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read blob as data URL'));
      reader.readAsDataURL(blobData);
    });
    
    if (!dataUrl) {
      throw new Error('Failed to convert data to image');
    }
    
    let base64Content: string;
    let mimeType = 'image/png'; // Default mime type
    let fileExt = 'png';
    
    if (dataUrl.includes('base64,')) {
      const parts = dataUrl.split('base64,');
      base64Content = parts[1];
      
      // Extract mime type from data URL
      if (parts[0].includes(':') && parts[0].includes(';')) {
        mimeType = parts[0].split(':')[1].split(';')[0];
        console.log('[NovelAI] Detected mime type:', mimeType);
        
        // Determine file extension from mime type
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
          fileExt = 'jpg';
        } else if (mimeType === 'image/webp') {
          fileExt = 'webp';
        } else if (mimeType === 'image/png') {
          fileExt = 'png';
        } else {
          // For unknown mime types, force PNG
          mimeType = 'image/png';
          fileExt = 'png';
          console.log('[NovelAI] Unknown mime type, forcing image/png');
        }
      }
    } else {
      console.log('[NovelAI] No base64 marker found in data URL');
      base64Content = dataUrl;
    }
    
    try {
      const savedPath = await NovelAIService.saveBase64ImageToPNG(
        base64Content, 
        `novelai_direct_${Date.now()}.${fileExt}`
      );
      console.log('[NovelAI] Direct image saved to:', savedPath);
      
      // Add a flag to indicate this is a local file from NovelAI
      return savedPath + '#localNovelAI';
    } catch (saveError) {
      console.error('[NovelAI] Failed to save direct image:', saveError);
      return dataUrl; // Fall back to data URL if file saving fails
    }
  }

  private static async extractImagesFromZip(blobData: Blob): Promise<string[]> {
    try {
      console.log('[NovelAI] Attempting to extract images from ZIP...');

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
      
      console.log('[NovelAI] Blob converted to ArrayBuffer, size:', arrayBuffer.byteLength);
      
      const zip = new JSZip();
      const content = await zip.loadAsync(arrayBuffer);
      
      console.log('[NovelAI] ZIP loaded, files found:', Object.keys(content.files).length);
      
      const filePromises: Promise<string>[] = [];
      const urls: string[] = [];
      
      Object.keys(content.files).forEach(filename => {
        if (!content.files[filename].dir && 
            (/\.(png|jpg|jpeg|webp)$/i.test(filename) || !filename.includes('.'))) {
          console.log('[NovelAI] Processing ZIP file:', filename);
          
          const promise = content.files[filename].async('base64')
            .then(async (base64Data) => {
              const ext = filename.includes('.')
                ? filename.split('.').pop()?.toLowerCase() || 'png'
                : 'png';
                
              const mimeType = ext === 'jpg' || ext === 'jpeg'
                ? 'image/jpeg'
                : ext === 'webp'
                  ? 'image/webp'
                  : 'image/png';
                  
              const dataUrl = `data:${mimeType};base64,${base64Data}`;
              urls.push(dataUrl);
              
              try {
                const savedPath = await NovelAIService.saveBase64ImageToPNG(
                  base64Data, 
                  `novelai_${Date.now()}_${urls.length}.${ext}`
                );
                console.log('[NovelAI] Image from ZIP saved to:', savedPath);
                
                return savedPath + '#localNovelAI';
              } catch (saveError) {
                console.error('[NovelAI] Failed to save image from ZIP:', saveError);
                return dataUrl;
              }
            });
            
          filePromises.push(promise);
        }
      });
      
      if (filePromises.length === 0) {
        console.warn('[NovelAI] No image files found in ZIP response');
        throw new Error('No image files found in ZIP response');
      }
      
      const savedPaths = await Promise.all(filePromises);
      console.log('[NovelAI] All ZIP images processed, paths:', savedPaths);
      return savedPaths;
    } catch (error) {
      console.error('[NovelAI] ZIP extraction failed:', error);
      throw error;
    }
  }

  private static async saveBase64ImageToPNG(base64Data: string, filename: string): Promise<string> {
    try {
      console.log('[NovelAI] Saving base64 image, data length:', base64Data.length);
      const imageFilename = filename || `novelai_${Date.now()}.png`;
      const dirPath = `${FileSystem.documentDirectory}images`;
      
      const dirInfo = await FileSystem.getInfoAsync(dirPath);
      if (!dirInfo.exists) {
        console.log('[NovelAI] Creating directory:', dirPath);
        await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
      }

      const safeFilename = imageFilename.replace(/\s+/g, '_');
      
      let finalFilename = safeFilename;
      const fileExt = finalFilename.split('.').pop()?.toLowerCase();
      
      if (fileExt && !['png', 'jpg', 'jpeg', 'webp'].includes(fileExt)) {
        finalFilename = finalFilename.replace(`.${fileExt}`, '.png');
        console.log('[NovelAI] Changing non-standard extension to PNG:', finalFilename);
      }
      
      const fileUri = `${dirPath}/${finalFilename}`;
      
      console.log('[NovelAI] Writing image to:', fileUri);
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (!fileInfo.exists || fileInfo.size === 0) {
        throw new Error(`File was not written correctly: ${fileUri}`);
      }
      console.log('[NovelAI] File written successfully, size:', fileInfo.size);

      try {
        console.log('[NovelAI] Optimizing image with ImageManipulator');
        const manipResult = await ImageManipulator.manipulateAsync(
          fileUri,
          [],
          { compress: 0.9, format: ImageManipulator.SaveFormat.PNG }
        );

        const manipFileInfo = await FileSystem.getInfoAsync(manipResult.uri);
        if (!manipFileInfo.exists || manipFileInfo.size === 0) {
          console.warn('[NovelAI] Manipulated file invalid, falling back to original');
          return fileUri;
        }

        console.log('[NovelAI] Image optimized successfully:', manipResult.uri);
        return manipResult.uri;
      } catch (manipError) {
        console.warn('[NovelAI] Image manipulation failed, using original file:', manipError);
        return fileUri;
      }
    } catch (error) {
      console.error('[NovelAI] Failed to save image:', error);
      throw error;
    }
  }
}

export default NovelAIService;
