<template>
  <div class="fixed inset-0 bg-bg-primary bg-opacity-90 backdrop-blur-sm flex flex-col items-center justify-center z-[9999] theme-transition">
    <div class="animation-container">
      <!-- 轨迹 -->
      <div class="path"></div>
      
      <!-- 太阳容器 -->
      <div class="celestial-object-container" id="sun-container">
        <i class="bi bi-sun text-yellow-400 text-4xl"></i>
      </div>

      <!-- 月亮容器 -->
      <div class="celestial-object-container" id="moon-container">
        <i class="bi bi-moon-stars text-blue-200 text-4xl"></i>
      </div>
    </div>
    <div class="mt-8 text-center text-lg">
      <p class="transition-opacity duration-500 text-text-secondary" :key="currentMessage">{{ currentMessage }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

// 加载时显示的随机信息
const messages = [
  '正在衍化天地，请稍候...',
  '正在推演五行，请稍候...',
  '正在凝聚灵气，请稍候...',
  '正在播撒生命的种子...',
  '小提示：灵田的等级越高，作物的生长速度越快。',
  '小提示：注意观察天气变化，它可能会影响你的收成。',
  '小提示：与岛上的生灵互动，或许会有意想不到的发现。',
  '正在构建初始地图...',
  '正在生成世界细节...',
];

const currentMessage = ref(messages[0]);
let intervalId: number;

// 组件挂载时，开始定时切换信息
onMounted(() => {
  intervalId = window.setInterval(() => {
    const randomIndex = Math.floor(Math.random() * messages.length);
    currentMessage.value = messages[randomIndex];
  }, 2500); // 每2.5秒切换一次
});

// 组件卸载时，清除定时器
onUnmounted(() => {
  clearInterval(intervalId);
});
</script>

<style scoped>
.animation-container {
  width: 256px; /* 64 * 4 */
  height: 192px; /* 48 * 4 */
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.path {
  width: 256px; /* 64 * 4 */
  height: 128px; /* 32 * 4 */
  border-top: 2px dashed var(--border-color);
  border-radius: 128px 128px 0 0;
  position: absolute;
  bottom: 32px; /* Move path up to align with rotation center */
}

.celestial-object-container {
  position: absolute;
  width: 48px; /* 12 * 4 */
  height: 48px; /* 12 * 4 */
  display: flex;
  align-items: center;
  justify-content: center;
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  animation-duration: 16s; /* 总周期16秒 */
  /* 将旋转中心设置在轨迹圆心 */
  left: calc(50% - 24px); /* (container_width - self_width) / 2 */
  /* 调整bottom和transform-origin使图标沿轨迹运动 */
  bottom: 136px;
  transform-origin: 50% 152px;
}

#sun-container {
  animation-name: sun-path, sun-fade;
}

#moon-container {
  animation-name: moon-path, moon-fade;
}

/* 路径动画 - 从左到右 */
@keyframes sun-path {
  0% { transform: rotate(-90deg); }
  50% { transform: rotate(90deg); }
  100% { transform: rotate(90deg); }
}

@keyframes moon-path {
  0% { transform: rotate(-90deg); }
  50% { transform: rotate(-90deg); }
  100% { transform: rotate(90deg); }
}

/* 淡入淡出动画 */
@keyframes sun-fade {
  0% { opacity: 0; }
  5% { opacity: 1; }
  45% { opacity: 1; }
  50% { opacity: 0; }
  100% { opacity: 0; }
}

@keyframes moon-fade {
  0% { opacity: 0; }
  50% { opacity: 0; }
  /* 在月亮路径动画开始后立即显示，解决不同步问题 */
  50.1% { opacity: 1; }
  95% { opacity: 1; }
  100% { opacity: 0; }
}
</style>
