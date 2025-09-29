# unified-tts 使用文档

`unified-tts` 提供统一的 TTS（文本转语音）调用接口，支持三种 provider：`cosyvoice`、`doubao`、`minimax`。外部组件只需通过统一的 API 传递参数，即可完成 TTS 合成，无需关心底层实现差异。

## 1. 快速开始

```typescript
import {
  synthesizeText,
  synthesizeWithCosyVoice,
  synthesizeWithDoubao,
  synthesizeWithMinimax,
  getAvailableProviders,
  isProviderAvailable,
  UnifiedTTSRequest,
  UnifiedTTSResponse,
} from './index';

// 自动选择可用 provider
const result: UnifiedTTSResponse = await synthesizeText('你好，世界！');

// 指定 provider
const result2: UnifiedTTSResponse = await synthesizeText('Hello world', {
  preferredProvider: 'cosyvoice',
  voiceId: 'neutral',
  providerSpecific: {
    source_audio: 'https://example.com/voice_sample.wav',
    source_transcript: 'This is a sample voice.',
  },
});

// 使用 provider 专用便捷方法
const cosyResult = await synthesizeWithCosyVoice('你好', undefined, undefined, {
  source_audio: 'https://example.com/voice.wav',
  source_transcript: 'Hello world'
});
const doubaoResult = await synthesizeWithDoubao('你好', 'zh_male_M392_conversation_wvae_bigtts', 'happy');
const minimaxResult = await synthesizeWithMinimax('hello', 'Deep_Voice_Man', 'neutral');
```

## 2. Provider 特性对比

### CosyVoice (Replicate) ⭐ 新版本
- **优势**: 基于 Replicate 平台，无需服务器部署，音质优秀，支持音色克隆
- **配置**: 使用与 Minimax 共享的 Replicate API Token
- **特性**: 支持音色克隆，可通过 source_audio 和 source_transcript 实现个性化音色
- **模型**: 使用 CosyVoice 2.0 模型 (`chenxwh/cosyvoice2-0.5b`)

### Doubao
- **优势**: 稳定的商用服务，支持多种音色和情感
- **配置**: 需要 appid 和 token
- **特性**: 丰富的音色库，情感表达能力强

### Minimax (Replicate)
- **优势**: 基于 Replicate 平台，与 CosyVoice 使用相同账号
- **配置**: 需要 Replicate API Token
- **特性**: 多语言支持，自然语调

## 3. 统一参数说明

### UnifiedTTSRequest

| 字段             | 类型     | 说明                       |
|------------------|----------|----------------------------|
| text             | string   | 要合成的文本               |
| provider         | string   | 'cosyvoice'/'doubao'/'minimax' |
| voiceId          | string?  | 通用 voiceId/voice_type    |
| emotion          | string?  | 情感参数                   |
| speed            | number?  | 语速                       |
| providerSpecific | object?  | provider 专属参数          |

#### providerSpecific 说明

- **cosyvoice**: `source_audio`, `source_transcript`, `voice_style`
- **doubao**: `enableEmotion`, `emotionScale`, `loudnessRatio`, `encoding`
- **minimax**: `languageBoost`, `englishNormalization`

### UnifiedTTSResponse

| 字段      | 类型     | 说明                   |
|-----------|----------|------------------------|
| success   | boolean  | 是否成功               |
| provider  | string   | 实际调用的 provider    |
| data      | object?  | 结果数据，见下         |
| error     | string?  | 错误信息               |
| metadata  | object?  | 附加元数据             |

#### data 说明

- `audioPath`: **本地音频文件路径**（所有 provider 均统一返回此字段，适用于本地播放器/上传等场景）
- `taskId`: 任务ID（如有）
- `duration`: 时长（如有）

> ⚠️ 统一接口已将所有 provider 的音频结果保存为本地文件，并通过 `audioPath` 字段返回。无需关心底层 provider 返回的是 URL、Buffer 还是本地路径，均可直接使用 `audioPath`。

## 4. 新的 CosyVoice 实现 (基于 Replicate)

CosyVoice 现在完全基于 Replicate 平台实现，提供以下优势：

- **无需服务器**: 直接调用 Replicate API，无需部署服务器
- **高质量音色**: 使用最新的 CosyVoice 2.0 模型
- **音色克隆**: 支持通过参考音频进行音色克隆
- **统一账号**: 与 Minimax 使用相同的 Replicate 账号和 API Token

```typescript
// 使用音色克隆功能
const result = await synthesizeWithCosyVoice('你好世界', undefined, undefined, {
  source_audio: 'https://example.com/reference_voice.wav',
  source_transcript: 'This is the reference transcript for voice cloning'
});

// 使用预设音色风格
const result2 = await synthesizeWithCosyVoice('Hello world', 'happy');
```

### CosyVoice 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| tts_text | string | 要合成的文本 |
| source_audio | string? | 参考音频URL（用于音色克隆） |
| source_transcript | string? | 参考音频的文本内容 |
| voice_style | string? | 音色风格：neutral/happy/sad/angry/surprised/disgusted/fearful |

## 5. 配置说明

在设置中，CosyVoice 和 Minimax 共享 Replicate API Token：

```typescript
// settings-helper 自动处理配置
const ttsSettings = await getTTSSettingsAsync();
// CosyVoice 和 Minimax 都使用 ttsSettings.replicateApiToken
// 模型自动选择：CosyVoice 使用 chenxwh/cosyvoice2-0.5b，Minimax 使用 minimax/speech-02-turbo
```

### 配置步骤

1. 在 Replicate 平台注册账号并获取 API Token
2. 在应用设置中配置 Minimax API Token（实际上是 Replicate Token）
3. CosyVoice 会自动使用相同的 Token 进行初始化

---

如需更多高级用法，请参考 `types.ts` 和各 provider 的实现细节。
