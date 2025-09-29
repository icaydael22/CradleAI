import * as FileSystem from 'expo-file-system';

/**
 * PCM音频数据转WAV格式
 * @param pcmData - PCM音频数据的ArrayBuffer或Uint8Array
 * @param sampleRate - 采样率 (默认24000Hz，基于Gemini TTS的规格)
 * @param numChannels - 声道数 (默认1，单声道)
 * @param bitsPerSample - 位深度 (默认16位)
 * @returns WAV格式的ArrayBuffer
 */
export function pcmToWav(
  pcmData: ArrayBuffer | Uint8Array,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): ArrayBuffer {
  const pcmArray = pcmData instanceof ArrayBuffer ? new Uint8Array(pcmData) : pcmData;
  const pcmLength = pcmArray.length;
  
  // WAV文件头大小：44字节
  const wavHeaderSize = 44;
  const wavBuffer = new ArrayBuffer(wavHeaderSize + pcmLength);
  const view = new DataView(wavBuffer);
  
  let offset = 0;
  
  // RIFF标识符
  view.setUint32(offset, 0x52494646, false); // "RIFF"
  offset += 4;
  
  // 文件大小 - 8字节
  view.setUint32(offset, wavHeaderSize + pcmLength - 8, true);
  offset += 4;
  
  // WAVE标识符
  view.setUint32(offset, 0x57415645, false); // "WAVE"
  offset += 4;
  
  // fmt子块标识符
  view.setUint32(offset, 0x666d7420, false); // "fmt "
  offset += 4;
  
  // fmt子块大小
  view.setUint32(offset, 16, true);
  offset += 4;
  
  // 音频格式 (PCM = 1)
  view.setUint16(offset, 1, true);
  offset += 2;
  
  // 声道数
  view.setUint16(offset, numChannels, true);
  offset += 2;
  
  // 采样率
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  
  // 字节率 (采样率 * 声道数 * 位深度/8)
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  
  // 块对齐 (声道数 * 位深度/8)
  const blockAlign = numChannels * bitsPerSample / 8;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  
  // 位深度
  view.setUint16(offset, bitsPerSample, true);
  offset += 2;
  
  // data子块标识符
  view.setUint32(offset, 0x64617461, false); // "data"
  offset += 4;
  
  // data子块大小
  view.setUint32(offset, pcmLength, true);
  offset += 4;
  
  // 复制PCM数据到WAV缓冲区
  const wavArray = new Uint8Array(wavBuffer);
  wavArray.set(pcmArray, offset);
  
  return wavBuffer;
}

/**
 * 将Base64编码的PCM数据转换为WAV文件并保存
 * @param base64PcmData - Base64编码的PCM数据
 * @param outputPath - 输出WAV文件路径
 * @param sampleRate - 采样率 (默认24000Hz)
 * @param numChannels - 声道数 (默认1)
 * @param bitsPerSample - 位深度 (默认16位)
 * @returns 保存的WAV文件路径
 */
export async function convertBase64PcmToWavFile(
  base64PcmData: string,
  outputPath?: string,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16
): Promise<string> {
  try {
    console.log('[AudioUtils] Starting PCM to WAV conversion...');
    console.log('[AudioUtils] Input data size:', base64PcmData.length);
    
    // 解码Base64数据
    const binaryString = atob(base64PcmData);
    const pcmArray = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      pcmArray[i] = binaryString.charCodeAt(i);
    }
    
    console.log('[AudioUtils] Decoded PCM data size:', pcmArray.length);
    
    // 转换为WAV格式
    const wavBuffer = pcmToWav(pcmArray, sampleRate, numChannels, bitsPerSample);
    console.log('[AudioUtils] WAV buffer size:', wavBuffer.byteLength);
    
    // 生成输出路径
    const wavPath = outputPath || `${FileSystem.cacheDirectory}tts_wav_${Date.now()}.wav`;
    
    // 将WAV数据转换为Base64 - 一次性处理避免分块问题
    const wavArray = new Uint8Array(wavBuffer);
    
    // 使用更高效且安全的方式转换
    let wavBinaryString = '';
    const batchSize = 8192; // 处理批次大小
    
    for (let i = 0; i < wavArray.length; i += batchSize) {
      const batch = wavArray.slice(i, i + batchSize);
      // 使用Array.from转换批次
      const batchString = Array.from(batch, byte => String.fromCharCode(byte)).join('');
      wavBinaryString += batchString;
    }
    
    // 一次性编码整个二进制字符串为Base64
    const wavBase64 = btoa(wavBinaryString);
    
    console.log('[AudioUtils] WAV Base64 size:', wavBase64.length);
    
    // 保存WAV文件
    await FileSystem.writeAsStringAsync(wavPath, wavBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    
    console.log('[AudioUtils] Successfully converted PCM to WAV:', wavPath);
    return wavPath;
  } catch (error) {
    console.error('[AudioUtils] Error converting PCM to WAV:', error);
    throw error;
  }
}

/**
 * 验证WAV文件的有效性
 * @param filePath - WAV文件路径
 * @returns 是否为有效的WAV文件
 */
export async function validateWavFile(filePath: string): Promise<boolean> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if (!fileInfo.exists) {
      return false;
    }
    
    // 读取文件头部分
    const base64Data = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
      length: 44, // WAV头部大小
    });
    
    const binaryString = atob(base64Data);
    const header = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      header[i] = binaryString.charCodeAt(i);
    }
    
    // 检查RIFF和WAVE标识符
    const riffSignature = String.fromCharCode(...header.slice(0, 4));
    const waveSignature = String.fromCharCode(...header.slice(8, 12));
    
    return riffSignature === 'RIFF' && waveSignature === 'WAVE';
  } catch (error) {
    console.error('[AudioUtils] Error validating WAV file:', error);
    return false;
  }
}
