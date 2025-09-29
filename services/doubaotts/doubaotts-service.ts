import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
import pako from 'pako'; // 需安装 pako 依赖：npm install pako
import {
  TTSRequest,
  TTSResponse,
  TTSOptions,
  TTSError,
  TTS_ERROR_CODES,
  TTSAudioConfig,
  TTSRequestConfig
} from './doubaotts-types';

// 导出TTSOptions类型
export type { TTSOptions } from './doubaotts-types';

export class DoubaoTTSService {
  private readonly wsUrl = 'wss://openspeech.bytedance.com/api/v1/tts/ws_binary';
  private readonly httpUrl = 'https://openspeech.bytedance.com/api/v1/tts';
  
  constructor(private options: TTSOptions) {
    if (!options.appid || !options.token) {
      throw new Error('appid and token are required');
    }
  }

  /**
   * HTTP方式语音合成 - 返回完整音频
   */
  async synthesizeByHTTP(text: string, audioConfig?: Partial<TTSAudioConfig>): Promise<Buffer> {
    const reqid = uuidv4();
    
    const request: TTSRequest = {
      app: {
        appid: this.options.appid,
        token: this.options.token,
        cluster: 'volcano_tts'
      },
      user: {
        uid: this.options.uid || 'default_user'
      },
      audio: {
        voice_type: this.options.voice_type || 'zh_male_M392_conversation_wvae_bigtts',
        encoding: this.options.encoding || 'mp3',
        speed_ratio: this.options.speed_ratio || 1.0,
        ...audioConfig
      },
      request: {
        reqid,
        text,
        operation: 'query'
      }
    };

    try {
      const response = await axios.post<TTSResponse>(this.httpUrl, request, {
        headers: {
          'Authorization': `Bearer;${this.options.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      const logId = response.headers['x-tt-logid'];
      if (logId) {
        console.log(`TTS Request Log ID: ${logId}`);
      }

      if (response.data.code !== TTS_ERROR_CODES.SUCCESS) {
        const error: TTSError = new Error(response.data.message) as TTSError;
        error.code = response.data.code;
        error.reqid = reqid;
        throw error;
      }

      if (!response.data.data) {
        throw new Error('No audio data received');
      }

      return Buffer.from(response.data.data, 'base64');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`HTTP request failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * WebSocket方式语音合成 - 流式返回音频
   */
  async synthesizeByWebSocket(
    text: string, 
    audioConfig?: Partial<TTSAudioConfig>,
    onAudioChunk?: (chunk: Buffer, sequence: number) => void
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const reqid = uuidv4();
      const audioChunks: Buffer[] = [];

      const ws = new WebSocket(this.wsUrl);

      ws.onopen = () => {
        const request: TTSRequest = {
          app: {
            appid: this.options.appid,
            token: this.options.token,
            cluster: 'volcano_tts'
          },
          user: {
            uid: this.options.uid || 'default_user'
          },
          audio: {
            voice_type: this.options.voice_type || 'zh_male_M392_conversation_wvae_bigtts',
            encoding: this.options.encoding || 'mp3',
            speed_ratio: this.options.speed_ratio || 1.0,
            ...audioConfig
          },
          request: {
            reqid,
            text,
            operation: 'submit'
          }
        };

        try {
          const binaryData = this.buildBinaryRequest(request);
          ws.send(binaryData);
        } catch (error) {
          reject(error);
        }
      };

      ws.onmessage = (event: any) => {
        let data: Buffer;
        if (event.data instanceof ArrayBuffer) {
          data = Buffer.from(event.data);
        } else if (typeof event.data === 'string') {
          data = Buffer.from(event.data, 'utf-8');
        } else {
          data = Buffer.from(event.data);
        }
        try {
          // 解析音频包
          // 参考官方demo parse_response
          // header: 4字节, payload size: 4字节, payload: 剩余
          if (data.length < 8) {
            reject(new Error('Invalid binary response: too short'));
            return;
          }
          const header = data.slice(0, 4);
          const payloadSize = data.readUInt32BE(4);
          const payload = data.slice(8);

          // message_type: header[1] >> 4
          const messageType = header[1] >> 4;
          // message_type_specific_flags: header[1] & 0x0f
          const messageTypeSpecificFlags = header[1] & 0x0f;

          if (messageType === 0xb) { // audio-only server response
            if (messageTypeSpecificFlags === 0) {
              // no sequence number as ACK
              // do nothing
              return;
            } else {
              // sequence number: payload前4字节
              const sequenceNumber = payload.readInt32BE(0);
              // payload size: payload[4:8]
              const chunkSize = payload.readUInt32BE(4);
              // audio data: payload[8:]
              const audioData = payload.slice(8, 8 + chunkSize);
              audioChunks.push(audioData);
              onAudioChunk?.(audioData, sequenceNumber);
              if (sequenceNumber < 0) {
                ws.close();
                resolve(Buffer.concat(audioChunks));
              }
            }
          } else if (messageType === 0xf) {
            // error message
            const code = payload.readUInt32BE(0);
            const msgSize = payload.readUInt32BE(4);
            let errorMsg = payload.slice(8, 8 + msgSize);
            // 是否gzip压缩
            if ((header[2] & 0x0f) === 1) {
              errorMsg = Buffer.from(pako.ungzip(errorMsg));
            }
            const msg = errorMsg.toString('utf-8');
            reject(new Error(`TTS服务错误: ${code} ${msg}`));
          }
          // 其它类型可忽略
        } catch (error) {
          reject(error);
        }
      };

      ws.onerror = (error: any) => {
        reject(new Error(`WebSocket error: ${error.message || error}`));
      };

      ws.onclose = (event: any) => {
        if (audioChunks.length === 0) {
          reject(new Error('Connection closed without receiving audio data'));
        }
      };

      setTimeout(() => {
        if (ws.readyState === 1) {
          ws.close();
          reject(new Error('WebSocket request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * 构建WebSocket二进制请求（修正版，参考官方Python demo）
   */
  private buildBinaryRequest(request: TTSRequest): Buffer {
    // 1. JSON序列化
    const jsonData = JSON.stringify(request);
    // 2. gzip压缩
    const gzipped = Buffer.from(pako.gzip(jsonData));
    // 3. 构建header（4字节，见Python demo）
    // version: 1, header size: 1, message type: 1, flags: 0, serialization: 1, compression: 1, reserved: 0
    // b0001 0001 0001 0000 0001 0001 0000 0000
    // 即: 0x11, 0x10, 0x11, 0x00
    const header = Buffer.from([0x11, 0x10, 0x11, 0x00]);
    // 4. payload size（4字节，大端）
    const payloadSize = Buffer.alloc(4);
    payloadSize.writeUInt32BE(gzipped.length, 0);
    // 5. 拼接
    return Buffer.concat([header, payloadSize, gzipped]);
  }

  /**
   * 解析WebSocket二进制响应
   */
  private parseBinaryResponse(data: Buffer): {
    isAudio: boolean;
    audioData?: Buffer;
    sequence: number;
    error?: { code: number; message: string };
  } {
    if (data.length < 4) {
      throw new Error('Invalid binary response: too short');
    }

    const messageType = data.readUInt8(2) & 0x0F;
    const sequence = data.readUInt8(3);

    if (messageType === 0x0B) {
      const audioData = data.slice(4);
      return {
        isAudio: true,
        audioData,
        sequence: sequence >= 128 ? sequence - 256 : sequence // Convert to signed
      };
    }

    try {
      const jsonData = data.slice(4).toString('utf-8');
      const response: TTSResponse = JSON.parse(jsonData);

      if (response.code !== TTS_ERROR_CODES.SUCCESS) {
        return {
          isAudio: false,
          sequence: 0,
          error: { code: response.code, message: response.message }
        };
      }
    } catch (e) {
      // 忽略JSON解析错误
    }

    return {
      isAudio: false,
      sequence: 0
    };
  }

  /**
   * 便捷方法：快速语音合成（HTTP方式）
   */
  async quickSynthesize(
    text: string,
    audioConfig?: Partial<TTSAudioConfig>
  ): Promise<Buffer> {
    return this.synthesizeByHTTP(text, audioConfig);
  }

  /**
   * 便捷方法：流式语音合成（WebSocket方式）
   */
  async streamSynthesize(
    text: string,
    onChunk?: (chunk: Buffer, sequence: number) => void,
    audioConfig?: Partial<TTSAudioConfig>
  ): Promise<Buffer> {
    return this.synthesizeByWebSocket(text, audioConfig, onChunk);
  }
}

// 导出单例工厂函数
export function createTTSService(options: TTSOptions): DoubaoTTSService {
  return new DoubaoTTSService(options);
}
