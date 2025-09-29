<template>
  <details class="history-entry">
    <summary class="history-summary">
      <span class="font-semibold">第 {{ turn.turnIndex + 1 }} 回合</span>
      <div class="flex items-center gap-2 ml-4">
        <span v-if="turn.role === 'user'" class="history-role-badge user-badge">玩家</span>
        <span v-else class="history-role-badge assistant-badge">AI</span>
      </div>
      <span class="text-secondary text-xs ml-auto">{{ formattedTimestamp }}</span>
      <i class="fas fa-chevron-down summary-arrow"></i>
    </summary>
    <div class="p-4">
      <div v-if="isEditing">
        <!-- Edit Mode -->
        <div class="history-edit-container space-y-4">
          <div>
            <label class="block text-sm font-medium text-secondary mb-1">故事内容</label>
            <textarea v-model="editableStory"
              class="story-editor w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono"
              rows="8"></textarea>
          </div>
          <div v-if="turn.role === 'assistant'">
            <label class="block text-sm font-medium text-secondary mb-1">状态 (JSON)</label>
            <textarea v-model="editableStatus"
              class="status-editor w-full bg-secondary rounded border border-dim p-2 text-primary focus:ring-2 focus:ring-accent focus:outline-none theme-transition font-mono"
              rows="5"></textarea>
          </div>
          <div class="flex justify-end space-x-2">
            <button @click="saveChanges" class="btn-primary btn-sm"><i class="fas fa-save mr-1"></i> 保存</button>
            <button @click="cancelEdit" class="btn-secondary btn-sm"><i class="fas fa-times mr-1"></i> 取消</button>
          </div>
        </div>
      </div>
      <div v-else>
        <!-- Display Mode -->
        <div v-if="turn.role === 'user'" v-html="renderMarkdown(activePage.content)"></div>
        <div v-else-if="turn.role === 'assistant'">
          <div class="flex items-center justify-center mb-2 swipe-controls-history">
            <button @click="prevSwipe" :disabled="activeSwipeIndex === 0" class="btn-icon"><i
                class="fas fa-chevron-left"></i></button>
            <span class="swipe-counter-history font-mono text-sm mx-4">{{ activeSwipeIndex + 1 }} / {{ pages.length
              }}</span>
            <button @click="nextSwipe" :disabled="activeSwipeIndex === pages.length - 1" class="btn-icon"><i
                class="fas fa-chevron-right"></i></button>
          </div>
          <div class="flex border-b border-dim mb-2">
            <button @click="activeSubTab = 'story'"
              :class="['main-tab-btn', { 'active': activeSubTab === 'story' }]">故事</button>
            <button @click="activeSubTab = 'status'"
              :class="['main-tab-btn', { 'active': activeSubTab === 'status' }]">状态</button>
          </div>
          <div v-show="activeSubTab === 'story'" class="main-tab-content history-content-display"
            v-html="renderMarkdown(parsedContent.story)"></div>
          <div v-show="activeSubTab === 'status'" class="main-tab-content history-content-display">
            <pre class="whitespace-pre-wrap text-xs font-mono">{{ parsedContent.status }}</pre>
          </div>
        </div>
        <div class="history-controls mt-3 pt-3 border-t border-dashed border-dim">
          <div class="flex justify-end">
            <button @click="startEdit" class="btn-secondary btn-sm"><i class="fas fa-edit mr-1"></i> 编辑</button>
            <button @click="store.createBranchFromTurn(turn.turnIndex)" class="btn-accent btn-sm ml-2"><i
                class="fas fa-code-branch mr-1"></i> 从此创建分支</button>
            <button v-if="turn.role === 'assistant'" @click="store.deleteTurn(turn.turnIndex)"
              class="btn-danger btn-sm ml-2"><i class="fas fa-trash-alt mr-1"></i> 删除回合</button>
          </div>
        </div>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { marked } from 'marked';
import { computed, ref, watch } from 'vue';
import { useHistoryStore, type DisplayTurn } from '../../stores/ui/historyStore';

declare const toastr: any;

const props = defineProps<{
  turn: DisplayTurn;
}>();

const store = useHistoryStore();

const isEditing = ref(false);
const editableStory = ref('');
const editableStatus = ref('');
const activeSwipeIndex = ref(props.turn.activePageIndex);
const activeSubTab = ref<'story' | 'status'>('story');

const pages = computed(() => Object.values(props.turn.pages));
const activePage = computed(() => pages.value[activeSwipeIndex.value]);

const formattedTimestamp = computed(() => new Date(activePage.value?.timestamp || Date.now()).toLocaleString());

const parsedContent = computed(() => {
  if (!activePage.value) return { story: '', status: '' };
  const content = activePage.value.content;
  const statusBarRegex = /<statusbar>([\s\S]*?)<\/statusbar>/;
  const match = content.match(statusBarRegex);
  if (match && match[1]) {
    const status = match[1].trim();
    const story = content.replace(statusBarRegex, '').trim();
    return { story, status };
  }
  return { story: content.trim(), status: '无' };
});

watch(() => props.turn.activePageIndex, (newIndex) => {
  activeSwipeIndex.value = newIndex;
});

function renderMarkdown(content: string) {
  return marked.parse(content);
}

function prevSwipe() {
  if (activeSwipeIndex.value > 0) {
    activeSwipeIndex.value--;
  }
}

function nextSwipe() {
  if (activeSwipeIndex.value < pages.value.length - 1) {
    activeSwipeIndex.value++;
  }
}

function startEdit() {
  const content = activePage.value.content;
  const { story, status } = parseContent(content);
  editableStory.value = story;
  editableStatus.value = status;
  isEditing.value = true;
}

function cancelEdit() {
  isEditing.value = false;
}

function combineContent(story: string, status: string): string {
  const trimmedStory = story.trim();
  const trimmedStatus = status.trim();
  if (trimmedStatus && trimmedStatus !== '无') {
    return `${trimmedStory}\n\n<statusbar>\n${trimmedStatus}\n</statusbar>`;
  }
  return trimmedStory;
}

function parseContent(content: string): { story: string; status: string } {
  const statusBarRegex = /<statusbar>([\s\S]*?)<\/statusbar>/;
  const match = content.match(statusBarRegex);
  if (match && match[1]) {
    const status = match[1].trim();
    const story = content.replace(statusBarRegex, '').trim();
    return { story, status };
  }
  return { story: content.trim(), status: '' };
}

async function saveChanges() {
  const newContent = combineContent(editableStory.value, editableStatus.value);
  await store.updateMessageContent(activePage.value.id, newContent);
  isEditing.value = false;
}

</script>

<style scoped>
.history-role-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  font-weight: 600;
}

.user-badge {
  background-color: #3b82f6;
  /* blue-500 */
  color: white;
}

.assistant-badge {
  background-color: #10b981;
  /* emerald-500 */
  color: white;
}

.btn-icon {
  background: none;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.btn-icon:hover:not(:disabled) {
  background-color: var(--accent-color);
  color: var(--bg-card);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
