import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { decode as atob, encode as btoa } from 'base-64';
import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { getUserSettingsGlobally } from '@/utils/settings-helper';
import { decode as msgpackDecode } from '@msgpack/msgpack';

// NovelAI endpoints (updated to match latest refcode specs)
const NOVELAI_API_USERDATA = 'https://api.novelai.net/user/data';
const NOVELAI_API_GENERATE = 'https://image.novelai.net/ai/generate-image';
const NOVELAI_API_GENERATE_STREAM = 'https://image.novelai.net/ai/generate-image-stream';

export interface NovelAIModels {
  [key: string]: string;
}

export const NOVELAI_MODELS: NovelAIModels = {
  'NAI Diffusion V4 Curated': 'nai-diffusion-4-curated-preview',
  'NAI Diffusion V4': 'nai-diffusion-4-full',
  // Added newest models per refcode constants
  'NAI Diffusion V4.5': 'nai-diffusion-4-5-full',
  'NAI Diffusion V4.5 Curated': 'nai-diffusion-4-5-curated'
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
      // Updated endpoint per latest API docs: /user/data
      const response = await axios.get(NOVELAI_API_USERDATA, {
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
      
      // Check if using V4/V4.5 model (streaming endpoint)
      const isV4Series =
        officialModel.includes('nai-diffusion-4') ||
        officialModel.includes('nai-diffusion-4-5');
      
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

      // Add V4 specific parameters if using V4/V4.5 model
      if (isV4Series) {
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

      if (!isV4Series && negativePrompt) {
        requestData.parameters.negative_prompt = negativePrompt;
      }

      console.log('[NovelAI] Sending request with data:', JSON.stringify(requestData, null, 2));
      
      // Make the API request
      // Use stream endpoint for V4/V4.5 series; otherwise, ZIP endpoint
      let apiUrl = params.endpoint || (isV4Series ? NOVELAI_API_GENERATE_STREAM : NOVELAI_API_GENERATE);
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
          Accept: 'application/x-zip-compressed, application/octet-stream, application/msgpack, image/png, image/jpeg, image/webp',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          Referer: 'https://novelai.net/image',
          Origin: 'https://novelai.net',
          'x-correlation-id': NovelAIService.generateCorrelationId(),
          'x-initiated-at': new Date().toISOString(),
        },
        responseType: 'arraybuffer',
      });

      if (response.status === 200) {
        console.log('[NovelAI] Image generation request successful');
        const imageUrls = await NovelAIService.processBinaryResponse(new Uint8Array(response.data));
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

  private static async processBinaryResponse(binary: Uint8Array): Promise<string[]> {
    try {
      console.log('[NovelAI] Processing binary response... size:', binary.byteLength);

      // 1) Try msgpack stream (V4/V4.5)
      try {
        const events = NovelAIService.parseStreamEvents(binary);
        const finals = events.filter(e => e.event_type === 'final');
        if (finals.length > 0) {
          const urls: string[] = [];
          for (const ev of finals) {
            const url = await NovelAIService.saveEventImage(ev);
            urls.push(url);
          }
          if (urls.length > 0) return urls;
        }
      } catch (e) {
        console.warn('[NovelAI] Msgpack/SSE parse failed, try ZIP/single:', e);
      }

      // 2) Try ZIP (V3)
      try {
        const urls = await NovelAIService.extractImagesFromZipBuffer(binary);
        if (urls.length > 0) return urls;
      } catch (e) {
        console.warn('[NovelAI] ZIP extraction failed, try single image:', e);
      }

      // 3) Fallback to single image
      const singleUrl = await NovelAIService.processSingleImageBuffer(binary);
      return [singleUrl];
    } catch (error) {
      console.error('[NovelAI] Failed to process response:', error);
      throw new Error('Failed to process image data from NovelAI');
    }
  }

  private static async processSingleImageBuffer(binary: Uint8Array): Promise<string> {
    console.log('[NovelAI] Processing as single image (buffer)');

    // Detect MIME by magic numbers
    let ext = 'png';
    if (binary.length >= 2 && binary[0] === 0xff && binary[1] === 0xd8) ext = 'jpg';
    if (
      binary.length >= 4 &&
      binary[0] === 0x89 &&
      binary[1] === 0x50 &&
      binary[2] === 0x4e &&
      binary[3] === 0x47
    ) {
      ext = 'png';
    }

    const base64Content = NovelAIService.uint8ToBase64(binary);
    try {
      const savedPath = await NovelAIService.saveBase64ImageToPNG(
        base64Content,
        `novelai_direct_${Date.now()}.${ext}`
      );
      console.log('[NovelAI] Direct image saved to:', savedPath);
      return savedPath + '#localNovelAI';
    } catch (e) {
      console.error('[NovelAI] Failed to save direct image:', e);
      // Fallback: data URL
      const mime = ext === 'jpg' ? 'image/jpeg' : 'image/png';
      return `data:${mime};base64,${base64Content}`;
    }
  }

  private static async extractImagesFromZipBuffer(binary: Uint8Array): Promise<string[]> {
    try {
      console.log('[NovelAI] Attempting to extract images from ZIP (buffer)...');
      // Quick signature check for ZIP (PK\x03\x04)
      if (!(binary[0] === 0x50 && binary[1] === 0x4b)) {
        throw new Error('Not a ZIP');
      }

      const zip = await JSZip.loadAsync(binary);
      const results: string[] = [];
      const names = Object.keys(zip.files);

      for (const filename of names) {
        const entry = zip.files[filename];
        if (!entry.dir && (/\.(png|jpg|jpeg|webp)$/i.test(filename) || !filename.includes('.'))) {
          const base64 = await entry.async('base64');
          const ext = filename.includes('.') ? (filename.split('.').pop() || 'png').toLowerCase() : 'png';
          try {
            const savedPath = await NovelAIService.saveBase64ImageToPNG(
              base64,
              `novelai_${Date.now()}_${results.length + 1}.${ext}`
            );
            results.push(savedPath + '#localNovelAI');
          } catch (e) {
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : (ext === 'webp' ? 'image/webp' : 'image/png');
            results.push(`data:${mime};base64,${base64}`);
          }
        }
      }

      if (results.length === 0) throw new Error('ZIP contained no images');
      console.log('[NovelAI] ZIP images extracted:', results.length);
      return results;
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

  // ---- Helpers for stream parsing (msgpack / SSE) ----
  private static generateCorrelationId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  private static uint8ToBase64(u8: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < u8.length; i += chunkSize) {
      const chunk = u8.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk) as any);
    }
    return btoa(binary);
  }

  private static parseStreamEvents(binary: Uint8Array): Array<{ event_type: string; image?: Uint8Array | string | number[]; step_ix?: number; gen_id?: string; sigma?: number; }> {
    // Detect SSE text
    try {
      const headText = new TextDecoder().decode(binary.slice(0, 100));
      if (headText.includes('event:') || headText.includes('data:')) {
        return NovelAIService.parseSSE(binary);
      }
    } catch {}

    // Assume msgpack with 4-byte length prefix chunks
    const events: any[] = [];
    let offset = 0;
    while (offset + 4 <= binary.length) {
      const view = new DataView(binary.buffer, binary.byteOffset + offset, 4);
      const messageLength = view.getUint32(0, false);
      const start = offset + 4;
      const end = start + messageLength;
      if (end > binary.length) break;
      const messageData = binary.slice(start, end);
      try {
        let obj: any;
        try {
          obj = msgpackDecode(messageData);
        } catch {
          const jsonStr = new TextDecoder().decode(messageData);
          obj = JSON.parse(jsonStr);
        }
        if (obj && typeof obj === 'object' && obj.event_type) {
          events.push(obj);
        }
      } catch {
        // skip
      }
      offset = end;
    }
    return events;
  }

  private static parseSSE(binary: Uint8Array): any[] {
    const text = new TextDecoder().decode(binary);
    const lines = text.split('\n');
    const events: any[] = [];
    let current: any = {};
    for (const lineRaw of lines) {
      const line = lineRaw.trim();
      if (line === '') {
        if (current.data) {
          try {
            const data = JSON.parse(current.data);
            if (data && data.event_type) events.push(data);
          } catch {}
        }
        current = {};
        continue;
      }
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        if (key === 'data') current.data = (current.data || '') + val; else current[key] = val;
      }
    }
    // last event
    if (current.data) {
      try {
        const data = JSON.parse(current.data);
        if (data && data.event_type) events.push(data);
      } catch {}
    }
    return events;
  }

  private static async saveEventImage(event: any): Promise<string> {
    let imageBytes: Uint8Array | null = null;
    const img = event.image;
    if (img instanceof Uint8Array) {
      imageBytes = img;
    } else if (typeof img === 'string') {
      // base64 string
      try {
        const binaryString = atob(img);
        const arr = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) arr[i] = binaryString.charCodeAt(i);
        imageBytes = arr;
      } catch {}
    } else if (Array.isArray(img)) {
      imageBytes = new Uint8Array(img);
    }

    if (!imageBytes) throw new Error('No image data in event');

    // Determine extension
    let ext = 'png';
    if (imageBytes.length >= 2 && imageBytes[0] === 0xff && imageBytes[1] === 0xd8) ext = 'jpg';
    if (
      imageBytes.length >= 4 &&
      imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47
    ) ext = 'png';

    const base64 = NovelAIService.uint8ToBase64(imageBytes);
    const filename = `novelai_stream_${Date.now()}.${ext}`;
    const savedPath = await NovelAIService.saveBase64ImageToPNG(base64, filename);
    return savedPath + '#localNovelAI';
  }
}

export default NovelAIService;
