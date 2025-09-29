<template>
  <div class="prompt-viewer">
    <div class="flex items-center gap-2 mb-2">
      <button @click="refreshPrompt" class="btn-primary btn-sm">
        <i class="fas fa-sync-alt mr-1"></i> 刷新提示词
      </button>
    </div>
    <div v-if="promptData" class="font-mono text-xs p-2 bg-secondary/30 rounded border border-dim whitespace-pre-wrap">
      <div class="text-right text-xs text-secondary mb-2 font-bold">总Token估算: ~{{ promptData.totalTokens }}</div>
      <details class="prompt-section mb-2 border border-dim rounded" open>
        <summary class="prompt-summary p-2 bg-secondary/30 cursor-pointer font-semibold flex justify-between">
          <span>系统指令 (SystemInstructions)</span>
          <span class="text-accent">~{{ promptData.instructionsTokens }} tokens</span>
        </summary>
        <div class="prompt-content p-2 border-t border-dim">
          <pre><code>{{ promptData.systemInstructions }}</code></pre>
        </div>
      </details>
      <details class="prompt-section mb-2 border border-dim rounded" open>
        <summary class="prompt-summary p-2 bg-secondary/30 cursor-pointer font-semibold flex justify-between">
          <span>世界状态摘要 (事件)</span>
          <span class="text-accent">~{{ promptData.summaryTokens }} tokens</span>
        </summary>
        <div class="prompt-content p-2 border-t border-dim" v-html="promptData.summaryContent"></div>
      </details>
      <details class="prompt-section border border-dim rounded" open>
        <summary class="prompt-summary p-2 bg-secondary/30 cursor-pointer font-semibold flex justify-between">
          <span>核心变量 (Variables)</span>
          <span class="text-accent">~{{ promptData.variablesTokens }} tokens</span>
        </summary>
        <div class="prompt-content p-2 border-t border-dim">
          <pre><code>{{ promptData.variablesContent }}</code></pre>
        </div>
      </details>
    </div>
    <div v-else class="text-secondary text-center p-4">
      点击“刷新提示词”以查看发送给LLM的最新系统提示词。
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import _ from 'lodash';

const promptData = ref<any>(null);

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function refreshPrompt() {
  const promptManager = (window as any).promptManager;
  if (!promptManager) {
    console.error("PromptManager not found on window object.");
    return;
  }

  const lastPrompt = promptManager.getLastGeneratedSystemPrompt();
  if (!lastPrompt) {
    promptData.value = null;
    return;
  }

  const systemInstructionsMatch = lastPrompt.match(/<SystemInstructions>([\s\S]*?)<\/SystemInstructions>/);
  const variablesMatch = lastPrompt.match(/<Variables>([\s\S]*?)<\/Variables>/);

  if (!systemInstructionsMatch || !variablesMatch) {
    promptData.value = {
      totalTokens: estimateTokens(lastPrompt),
      systemInstructions: lastPrompt,
      summaryContent: '<p class="text-secondary italic">无法解析提示词结构。</p>',
      variablesContent: '',
      instructionsTokens: 0,
      summaryTokens: 0,
      variablesTokens: 0,
    };
    return;
  }

  const systemInstructions = systemInstructionsMatch[1].trim();
  let variablesContent = variablesMatch[1].trim();
  
  const summaryRegex = /'世界状态摘要':\s*(\[[\s\S]*?\]),?\s*\n?/;
  const summaryMatch = variablesContent.match(summaryRegex);
  let summaryContent = '<p class="text-secondary italic">无事件摘要。</p>';
  let summaryTextForToken = '';
  
  if (summaryMatch) {
    try {
      const summaryArray = JSON.parse(summaryMatch[1]);
      summaryTextForToken = summaryArray.join('\n');
      if (summaryArray.length > 0) {
        summaryContent = `<ul class="list-disc list-inside text-primary">${summaryArray.map((item: string) => `<li>${_.escape(item)}</li>`).join('')}</ul>`;
      }
      variablesContent = variablesContent.replace(summaryRegex, '');
    } catch (e) {
      summaryContent = `<p class="text-red-500">摘要JSON解析失败:</p><pre><code>${_.escape(summaryMatch[1])}</code></pre>`;
    }
  }

  promptData.value = {
    totalTokens: estimateTokens(lastPrompt),
    instructionsTokens: estimateTokens(systemInstructions),
    summaryTokens: estimateTokens(summaryTextForToken),
    variablesTokens: estimateTokens(variablesContent),
    systemInstructions,
    summaryContent,
    variablesContent,
  };
}
</script>

<style scoped>
.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
}
pre {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
