<template>
  <div class="modal-overlay" :class="{ hidden: !store.isVisible }" @click.self="closeMenu">
    <div class="modal-content">
      <button class="modal-close-btn" @click="closeMenu">&times;</button>
      <h3 class="modal-title">菜单</h3>
      <div class="modal-body">
        <div class="grid grid-cols-1 gap-4">
          <button class="btn-primary w-full" @click="goToMainMenu"><i class="fas fa-home mr-2"></i>主菜单</button>
          <button class="btn-secondary w-full" @click="triggerFileInput"><i class="fas fa-upload mr-2"></i>加载存档</button>
          <button class="btn-secondary w-full" @click="saveGame"><i class="fas fa-download mr-2"></i>下载存档</button>
        </div>
        <input ref="fileInput" type="file" accept=".json" class="hidden" @change="handleFileSelect" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { overwriteAllChatVariables } from '../../core/variables';
import { useMenuStore } from '../../stores/ui/menuStore';

const store = useMenuStore();
const fileInput = ref<HTMLInputElement | null>(null);

function closeMenu() {
  store.hideMenu();
}

function goToMainMenu() {
  // 触发一个自定义事件，让 index.ts 来处理屏幕切换
  window.dispatchEvent(new CustomEvent('request-main-menu'));
  closeMenu();
}

function triggerFileInput() {
  fileInput.value?.click();
}

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);

      if (typeof data === 'object' && data !== null) {
        await overwriteAllChatVariables(data);
        alert('存档加载成功！页面将重新加载以应用更改。');
        window.location.reload();
      } else {
        throw new Error('存档文件格式不正确，不是一个有效的JSON对象。');
      }
    } catch (error: any) {
      console.error('加载存档失败:', error);
      alert(`加载存档失败: ${error.message}`);
    }
  };
  reader.readAsText(file);

  // Reset the input value to allow loading the same file again
  if (target) {
    target.value = '';
  }
}

function saveGame() {
  const saveData = getVariables({ type: 'chat' });

  const json = JSON.stringify(saveData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `玄幻修仙世界种田-存档-${timestamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>
