import { ref, watch } from 'vue';
import { useGenerationStore } from '../stores/app/generationStore';
import { logger } from './logger';

export const isPipActive = ref(false);
let videoElement: HTMLVideoElement | null = null;
let canvasElement: HTMLCanvasElement | null = null;

/**
 * 直接在 Canvas 上绘制 AI 状态。
 * @param isGenerating - AI 是否正在生成内容。
 */
function drawPipCanvas(isGenerating: boolean) {
  if (!canvasElement) return;
  const ctx = canvasElement.getContext('2d');
  if (!ctx) return;

  const width = canvasElement.width;
  const height = canvasElement.height;

  // 1. 绘制背景
  ctx.fillStyle = isGenerating ? '#1a1a1a' : '#2a2a2a'; // --bg-primary or --bg-secondary
  ctx.fillRect(0, 0, width, height);

  // 2. 绘制图标 (使用 Emoji 以确保兼容性)
  ctx.font = '48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🧠', width * 0.25, height / 2);

  // 3. 绘制文本
  ctx.textAlign = 'left';
  
  // 绘制标题 "AI 状态"
  ctx.font = '18px "Noto Serif SC", serif';
  ctx.fillStyle = '#9ca3af'; // --text-secondary
  ctx.fillText('AI 状态', width * 0.45, height * 0.35);

  // 绘制具体状态
  ctx.font = 'bold 28px "Noto Serif SC", serif';
  ctx.fillStyle = '#e5e7eb'; // --text-primary
  const text = isGenerating ? '正在思考...' : '已就绪';
  ctx.fillText(text, width * 0.45, height * 0.65);
}

/**
 * 初始化画中画管理器。
 * @param pinia - 主应用的 Pinia 实例。
 */
export function initializePipManager(pinia: any) {
  logger('info', 'PipManager', 'Initializing (v2)...');
  if (!document.pictureInPictureEnabled || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    logger('warn', 'PipManager', 'PiP not supported or is mobile device. Initialization skipped.');
    return;
  }

  canvasElement = document.createElement('canvas');
  canvasElement.width = 320;
  canvasElement.height = 180;

  videoElement = document.createElement('video');
  videoElement.srcObject = canvasElement.captureStream();
  videoElement.muted = true;
  videoElement.playsInline = true;

  videoElement.addEventListener('enterpictureinpicture', () => {
    logger('log', 'PipManager', 'Event: enterpictureinpicture');
    isPipActive.value = true;
  });

  videoElement.addEventListener('leavepictureinpicture', () => {
    logger('log', 'PipManager', 'Event: leavepictureinpicture');
    isPipActive.value = false;
  });

  const generationStore = useGenerationStore(pinia);

  // 监听 AI 状态变化并重绘 Canvas
  watch(
    () => generationStore.isAiGenerating,
    (isGenerating) => {
      logger('log', 'PipManager', `State changed: isAiGenerating=${isGenerating}. Redrawing canvas.`);
      drawPipCanvas(isGenerating);
    },
    { immediate: true } // 立即执行一次以完成初始绘制
  );

  logger('info', 'PipManager', 'Initialization complete (v2).');
}

/**
 * 进入画中画模式。
 */
export async function enterPip() {
  logger('info', 'PipManager', 'Attempting to enter PiP mode...');
  if (!videoElement) {
    logger('error', 'PipManager', 'Video element not available for PiP.');
    return;
  }
  if (document.pictureInPictureElement) {
    logger('warn', 'PipManager', 'Already in PiP mode.');
    return;
  }
  try {
    await videoElement.play();
    await videoElement.requestPictureInPicture();
    logger('info', 'PipManager', 'Successfully entered PiP mode.');
  } catch (error) {
    logger('error', 'PipManager', 'Failed to enter PiP mode:', error);
  }
}

/**
 * 退出画中画模式。
 */
export async function exitPip() {
  logger('info', 'PipManager', 'Attempting to exit PiP mode...');
  if (document.pictureInPictureElement) {
    try {
      await document.exitPictureInPicture();
      logger('info', 'PipManager', 'Successfully exited PiP mode.');
    } catch (error) {
      logger('error', 'PipManager', 'Failed to exit PiP mode:', error);
    }
  } else {
    logger('warn', 'PipManager', 'Not in PiP mode, no action taken.');
  }
}

/**
 * 切换画中画模式。
 */
export function togglePip() {
  logger('info', 'PipManager', 'Toggle PiP button clicked.');
  if (document.pictureInPictureElement) {
    exitPip();
  } else {
    enterPip();
  }
}

/**
 * 检查画中画功能是否受支持。
 */
export function isPipSupported(): boolean {
  return document.pictureInPictureEnabled && !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
