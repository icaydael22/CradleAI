<template>
  <div class="top-bar">
    <!-- 菜单按钮 -->
    <button @click="openMenu" class="control-btn" title="菜单"><i class="fas fa-bars"></i></button>

    <!-- 右上角全局控制器 -->
    <div class="global-controls">
      <button @click="openPokedexManager" class="control-btn" title="图鉴管理"><i class="fas fa-book-open"></i></button>
      <button @click="toggleFullscreen" class="control-btn" :title="isFullscreen ? '退出全屏' : '进入全屏'">
        <i :class="['fas', isFullscreen ? 'fa-compress' : 'fa-expand']"></i>
      </button>
      <!--
      <button v-if="isPipSupported" @click="togglePip" class="control-btn" :title="isPipActive ? '关闭画中画' : '开启画中画'">
        <i class="fas fa-window-restore"></i>
      </button>
      -->
      <div class="theme-switcher-dropdown">
        <button @click="toggleThemeDropdown" class="control-btn" title="切换主题"><i class="fas fa-palette"></i></button>
        <div v-if="isThemeDropdownVisible" class="dropdown-content">
          <button @click="setTheme('night')" class="theme-btn"><i class="fas fa-moon mr-2"></i> 夜晚</button>
          <button @click="setTheme('day')" class="theme-btn"><i class="fas fa-sun mr-2"></i> 白天</button>
          <button @click="setTheme('jade')" class="theme-btn"><i class="fas fa-leaf mr-2"></i> 翠玉</button>
          <button @click="setTheme('classic')" class="theme-btn"><i class="fas fa-scroll mr-2"></i> 古典</button>
        </div>
      </div>
      <button @click="openVersionInfo" class="control-btn" title="版本信息"><i class="fas fa-code-branch"></i></button>
      <button @click="openDebugSettings" class="control-btn" title="调试设置"><i class="fas fa-bug"></i></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { usePokedexStore } from '../stores/systems/pokedexStore';
import { useMenuStore } from '../stores/ui/menuStore';
import { useDebugStore } from '../stores/ui/debugStore';
import { useVersionStore } from '../stores/app/versionStore';
import { useThemeStore } from '../stores/ui/themeStore';
import { isPipSupported as checkPipSupport, togglePip, isPipActive } from '../core/pip';

const pokedexStore = usePokedexStore();
const menuStore = useMenuStore();
const debugStore = useDebugStore();
const versionStore = useVersionStore();
const themeStore = useThemeStore();

const isThemeDropdownVisible = ref(false);
const isFullscreen = ref(false);
const isPipSupported = ref(checkPipSupport());

const checkFullscreenStatus = () => {
  // 我们需要检查父文档的全屏元素状态
  isFullscreen.value = !!window.parent.document.fullscreenElement;
};

// 在父窗口上监听全屏状态变化
onMounted(() => {
  window.parent.document.addEventListener('fullscreenchange', checkFullscreenStatus);
  checkFullscreenStatus(); // 初始状态检查
});

onUnmounted(() => {
  window.parent.document.removeEventListener('fullscreenchange', checkFullscreenStatus);
});

const openPokedexManager = () => {
  pokedexStore.openManagerModal();
};

const openMenu = () => {
  menuStore.showMenu();
};

const openDebugSettings = () => {
  debugStore.openModal();
};

const openVersionInfo = () => {
  versionStore.openModal();
};

const toggleFullscreen = () => {
  const parentDoc = window.parent.document;
  // 我们的脚本在 iframe 中运行, window.frameElement 就是该 iframe 元素。
  // 我们要全屏化的是容纳此 iframe 的父容器。
  const container = window.frameElement?.parentElement;

  if (!container) {
    console.error('无法找到 iframe 容器。');
    return;
  }

  if (!parentDoc.fullscreenElement) {
    // 请求将 iframe 的容器全屏化
    container.requestFullscreen().catch(err => {
      console.error(`进入全屏失败: ${err.message} (${err.name})`);
    });
  } else {
    // 退出全屏
    parentDoc.exitFullscreen();
  }
};

const toggleThemeDropdown = () => {
  isThemeDropdownVisible.value = !isThemeDropdownVisible.value;
};

const setTheme = (theme: 'night' | 'day' | 'jade' | 'classic') => {
  themeStore.setTheme(theme);
  isThemeDropdownVisible.value = false;
};
</script>

<style scoped>
.top-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1001;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background-color: var(--bg-secondary);
  border-bottom: 2px solid var(--accent-color);
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
}
</style>
