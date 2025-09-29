### **RN-Vue-Iframe 混合协议开发文档 (V2)**

本文档旨在为在 Cradle RN 应用中集成一个由 `manifest.json` 驱动的、支持 iframe 自定义界面的混合通信协议提供完整的开发指南。该协议实现了从 React Native (RN) 到 WebView (Vue) 再到 Iframe 的三层通信。

---

### **1. 核心架构与数据流**

系统核心围绕一个从剧本包（ZIP）中读取的 `manifest.json` 文件构建。它定义了 iframe 界面、可执行的后端动作以及数据解析规则。

**数据流如下:**

1.  **初始化**:
    *   RN 端在加载剧本时，从剧本 ZIP 包中解压并解析 `manifest.json`, `variables.json`, 和 `parsed-types.json`。
    *   RN 将 `manifest.json`、`variables.json` 和 `parsed-types.json` 通过 `postMessage` 发送给 Vue WebView。
    *   Vue 端接收到数据：
        *   `variables.json` 的内容被存入一个新建的 `iframe-store`，用于 iframe 的数据初始化。
        *   `manifest.json` 被存入 `iframe-store`，用于驱动后续交互。
        *   `parsed-types.json` 用于视觉小说引擎的资源配置。
    *   Vue 根据 `manifest.json` 中的 `iframeViewUrl`，创建一个 iframe 并将 URL 设置为其 `src`。

2.  **Iframe -> RN 动作调用**:
    *   Iframe 内的 HTML/JS 通过 `window.parent.postMessage` 发送一个包含 `actionName` 和 `payload` 的消息。
    *   Vue (`App.vue`) 监听到此消息，将其包装成 `{ type: 'iframeAction', data: ... }` 的格式，通过 `ReactNativeWebView.postMessage` 发送给 RN。
    *   RN (`[scriptid].tsx`) 接收到消息，并立即将其委托给一个专门的 `IframeActionService` 进行处理。

3.  **RN 动作处理与返回**:
    *   `IframeActionService` 根据 `action` 的类型（`ai` 或 `variable`）执行相应逻辑：
        *   **`ai` 类型**: 获取 `ScriptVariableService` 实例，对 `action` 中定义的 `prompt` 进行宏替换，然后调用 AI 服务。
        *   **`variable` 类型**: 获取 `ScriptVariableService` 实例，根据 `action` 中定义的 `query` 查询变量系统数据。
    *   处理完成后，`IframeActionService` 返回结果。

4.  **RN -> Iframe 结果返回**:
    *   RN (`[scriptid].tsx`) 将 `IframeActionService` 返回的结果包装成 `{ type: 'iframeData', data: ... }` 格式，`postMessage` 给 Vue WebView。
    *   Vue (`App.vue`) 接收到结果，将其存入 `iframe-store`。
    *   Vue (`IFrameHost.vue`) 监听到 `iframe-store` 的数据变化，通过 `iframe.contentWindow.postMessage` 将最终结果发送给 iframe。
    *   Iframe 接收到结果并更新其 UI。

---

### **2. 协议定义: `manifest.json` (V2)**

这是整个系统的蓝图，定义了“一切皆可配置”。

**`manifest.json` 示例结构:**

```json
{
  "manifestVersion": "2.0",
  "iframeViewUrl": "https://example.com/path/to/your/iframe-content.html",
  "actions": [
    {
      "actionName": "GET_CHARACTER_STATUS",
      "type": "ai",
      "prompt": "根据以下信息，为角色 ${characterName} 生成状态JSON。当前好感度为 ${love_degree}。",
      "responseSchema": {
        "type": "object",
        "properties": {
          "status": { "type": "string", "description": "角色的当前状态" },
          "mood": { "type": "string", "description": "角色的当前心情" }
        }
      }
    },
    {
      "actionName": "GET_INVENTORY",
      "type": "variable",
      "query": {
        "target": "global",
        "path": "inventory.items"
      }
    }
  ]
}
```

**字段详解:**

*   `manifestVersion` (string): 清晰的版本号。
*   `iframeViewUrl` (string): **[变更]** Iframe 内容的**外部链接 URL**。取代了原先的 Base64 HTML，便于开发和部署。
*   `actions` (array): 动作清单。
    *   `actionName` (string): 动作的唯一标识符，由 iframe 发起时使用。
    *   `type` (string): **[核心变更]** 动作类型，决定了 RN 端的处理方式。
        *   `'ai'`: 表示此动作需要调用 AI 服务。
        *   `'variable'`: 表示此动作需要查询剧本的变量系统。
    *   `prompt` (string, **仅当 type='ai' 时需要**): 调用 AI 时使用的提示词。**支持宏替换**，例如 `${characterName}` 会被替换为剧本变量系统中的 `characterName` 的值。
    *   `responseSchema` (object, **仅当 type='ai' 时建议**): 一个 JSON Schema，用于描述期望 AI 返回的 JSON 结构。RN 端可以此为依据构建更精确的 prompt。
    *   `query` (object, **仅当 type='variable' 时需要**): 定义如何查询变量系统。
        *   `target` (string): `'global'` 或角色 ID，指定查询范围。
        *   `path` (string): 使用点号分隔的路径，用于查询嵌套的变量或表格数据，例如 `inventory.items` 或 `quests.main_quest.status`。

---

### **3. 开发实施指南**

#### **3.1. 共享层 (Shared Layer)**

1.  **文件**: [`CradleIntro/shared/types/script-types.ts`](CradleIntro/shared/types/script-types.ts)
2.  **变更**:
    *   根据新的 `manifest.json` 结构，重写类型定义。
    *   扩展通信消息类型。

    ```typescript
    // 在文件末尾或合适位置添加/修改

    // Action 定义
    export type IframeAction = AIAction | VariableAction;

    export interface AIAction {
      actionName: string;
      type: 'ai';
      prompt: string;
      responseSchema?: any;
    }

    export interface VariableAction {
      actionName: string;
      type: 'variable';
      query: {
        target: 'global' | string; // 'global' or characterId
        path: string;
      };
    }

    // Manifest 定义
    export interface Manifest {
      manifestVersion: string;
      iframeViewUrl: string;
      actions: IframeAction[];
    }

    // 修改 Script 接口
    export interface Script {
      // ... other fields
      manifest?: Manifest; // 存储从ZIP包解析的 manifest
    }

    // 修改 RNToWebViewMessage 接口
    export interface RNToWebViewMessage {
      type: 
        | 'updateScriptData' 
        | 'setLoading' 
        | 'initializeIframe' // 初始化 Iframe
        | 'iframeData'       // 向 Iframe 发送数据结果
        | 'error'
        // ... 其他现有类型
        ;
      data: {
        // ... other fields
        manifest?: Manifest;          // 传递 manifest
        initialVariables?: any;       // 传递 variables.json
        iframeViewUrl?: string;       // 传递 iframe 的 URL
        action?: string;              // 对应的 actionName
        payload?: any;                // 返回的数据
      };
    }

    // 修改 WebViewToRNMessage 接口
    export interface WebViewToRNMessage {
      type: 
        | 'ready' 
        | 'iframeAction' // Iframe 发起的动作
        // ... 其他现有类型
        ;
      data: {
        // ... other fields
        actionName?: string; // 动作名称
        payload?: any;     // 动作附带的数据
      };
    }
    ```

#### **3.2. React Native 端**

##### **A. 新增: IframeActionService**

这是处理 iframe 动作的核心，实现了逻辑与视图的分离。

1.  **新增文件**: `CradleIntro/services/IframeActionService.ts`
2.  **内容**:

    ```typescript
    import { ScriptService } from './script-service';
    import { ScriptVariableService } from './variables/ScriptVariableService';
    import { Manifest, AIAction, VariableAction } from '@/shared/types/script-types';

    export class IframeActionService {
      private static instance: IframeActionService;
      private scriptService = ScriptService.getInstance();

      public static getInstance(): IframeActionService {
        if (!IframeActionService.instance) {
          IframeActionService.instance = new IframeActionService();
        }
        return IframeActionService.instance;
      }

      /**
       * 处理来自 Iframe 的动作请求
       * @param scriptId 当前剧本 ID
       * @param actionName 动作名称
       * @param payload Iframe 传递的负载数据
       * @returns 处理结果
       */
      public async handleAction(scriptId: string, actionName: string, payload: any): Promise<any> {
        const script = await this.scriptService.getScript(scriptId);
        if (!script?.manifest) {
          throw new Error(`Script or manifest not found for scriptId: ${scriptId}`);
        }

        const action = script.manifest.actions.find(a => a.actionName === actionName);
        if (!action) {
          throw new Error(`Action "${actionName}" not defined in manifest.`);
        }

        switch (action.type) {
          case 'ai':
            return this.handleAIAction(scriptId, action, payload);
          case 'variable':
            return this.handleVariableAction(scriptId, action, payload);
          default:
            throw new Error(`Unknown action type: ${(action as any).type}`);
        }
      }

      /**
       * 处理 AI 类型的动作
       */
      private async handleAIAction(scriptId: string, action: AIAction, payload: any): Promise<any> {
        console.log(`[IframeActionService] Handling AI action: ${action.actionName}`);
        
        // 1. 获取剧本变量管理器实例
        const variableManager = await ScriptVariableService.getInstance(scriptId);

        // 2. 将 payload 注入为临时变量，以便在 prompt 中使用
        // 例如，如果 payload 是 { characterName: '司澈' }
        // 那么 prompt 中的 ${characterName} 就可以被替换
        if (payload && typeof payload === 'object') {
          for (const key in payload) {
            // 注册为临时变量
            await variableManager.registerVar(key, 'string', payload[key]);
          }
        }

        // 3. 对 prompt 进行宏替换
        const finalPrompt = await variableManager.replaceGlobalMacros(action.prompt);
        console.log(`[IframeActionService] Final prompt after macro replacement: ${finalPrompt}`);

        // 4. 调用 AI 服务 (此处为伪代码，需替换为真实实现)
        // const aiResponse = await YourAIService.generateJson(finalPrompt, action.responseSchema);
        // return aiResponse;

        // 模拟 AI 返回
        return { success: true, prompt: finalPrompt, message: "AI call simulation successful." };
      }

      /**
       * 处理变量查询类型的动作
       */
      private async handleVariableAction(scriptId: string, action: VariableAction, payload: any): Promise<any> {
        console.log(`[IframeActionService] Handling variable action: ${action.actionName}`);
        
        const { target, path } = action.query;
        const variableManager = await ScriptVariableService.getInstance(scriptId);

        const system = target === 'global' 
          ? await variableManager.getGlobalVariables()
          : await variableManager.getCharacterVariables(target);

        if (!system) {
          throw new Error(`Variable system for target "${target}" not found.`);
        }

        // 使用点号路径从变量系统中查找数据
        const pathParts = path.split('.');
        let result: any = system;
        for (const part of pathParts) {
          if (result && typeof result === 'object' && part in result) {
            result = result[part];
          } else {
            // 如果路径中途断了，返回 null
            return null;
          }
        }
        
        return result;
      }
    }
    ```

##### **B. 修改 `script-service.ts`**

1.  **文件**: [`CradleIntro/services/script-service.ts`](CradleIntro/services/script-service.ts)
2.  **变更**:
    *   在 `importUnifiedConfigFromArchive` 方法中，确保 `manifest.json` 被正确读取并附加到 `script` 对象上。

    ```typescript
    // 在 importUnifiedConfigFromArchiveInternal 方法中
    // ...
    // 解压压缩包后
    const zipContent = await zip.loadAsync(zipData, { base64: true });

    // 查找并解析 manifest.json
    let manifest: Manifest | undefined;
    const manifestFile = zipContent.file('manifest.json');
    if (manifestFile) {
      try {
        const manifestContent = await manifestFile.async('string');
        manifest = JSON.parse(manifestContent);
      } catch (e) {
        console.error("Failed to parse manifest.json", e);
      }
    }

    // ...

    // 构建最终配置对象时，加入 manifest
    const finalConfig = {
      // ...
      manifest: manifest, // 添加 manifest
      // ...
    };

    // ...

    // 在 saveUnifiedScriptConfig 方法中
    // ...
    // 保存 script 对象时，确保 manifest 也被保存
    if (configFile.manifest) {
      script.manifest = configFile.manifest;
    }
    // ...
    await this.saveScript(script);
    ```

##### **C. 修改 `[scriptid].tsx`**

1.  **文件**: [`CradleIntro/app/pages/script/[scriptid].tsx`](CradleIntro/app/pages/script/[scriptid].tsx)
2.  **变更**:
    *   导入 `IframeActionService`。
    *   在 `handleWebViewMessage` 中，将 `iframeAction` 的处理委托给 `IframeActionService`。

    ```typescript
    // ... imports
    import { IframeActionService } from '@/services/IframeActionService';

    // ...
    const handleWebViewMessage = useCallback(async (event: any) => {
      // ...
      const iframeActionService = IframeActionService.getInstance();
      // ...
      switch (message.type as any) {
        // ...
        case 'iframeAction':
          if (message.data?.actionName && script?.id) {
            try {
              sendLoadingStateToWebView(true); // 开始加载
              const result = await iframeActionService.handleAction(
                script.id,
                message.data.actionName,
                message.data.payload
              );
              
              // 将结果发回给 WebView
              sendMessageToWebView({
                type: 'iframeData',
                data: {
                  action: message.data.actionName,
                  payload: result
                }
              });
            } catch (e) {
              console.error("Error handling iframe action:", e);
              sendMessageToWebView({ type: 'error', data: { message: e.message } });
            } finally {
              sendLoadingStateToWebView(false); // 结束加载
            }
          }
          break;
        // ...
      }
    }, [/* ... dependencies */]);
    ```

#### **3.3. Vue (WebView) 端**

##### **A. 创建 `iframe-store.ts`**

  **变更**:
    *   添加 `initialVariables` 状态，用于存储从 `variables.json` 来的数据。

    ```typescript
    import { defineStore } from 'pinia';
    import { Manifest } from '@/types'; // 假设类型已同步

    export const useIframeStore = defineStore('iframe', {
      state: () => ({
        isIframeVisible: false,
        iframeViewUrl: '', // 存储 URL
        manifest: null as Manifest | null,
        initialVariables: null as any, // 存储 variables.json
        lastReceivedData: null as any,
      }),
      actions: {
        showIframe() { this.isIframeVisible = true; },
        hideIframe() { this.isIframeVisible = false; },
        initialize(url: string, manifest: Manifest, variables: any) {
          this.iframeViewUrl = url;
          this.manifest = manifest;
          this.initialVariables = variables;
        },
        setData(data: any) {
          this.lastReceivedData = data;
        },
      },
    });
    ```

##### **B. 创建 `IFrameHost.vue`**

 **变更**:
    *   使用 `iframeViewUrl` 作为 `iframe` 的 `src`。
    *   在 `iframe` 加载完成后，将 `initialVariables` 发送给它。

    ```vue
    <template>
      <div v-if="store.isIframeVisible" class="iframe-host-container">
        <iframe ref="iframeRef" :src="store.iframeViewUrl" sandbox="allow-scripts allow-same-origin"></iframe>
        <button @click="store.hideIframe()">关闭</button>
      </div>
    </template>

    <script setup>
    import { ref, watch, onMounted } from 'vue';
    import { useIframeStore } from '@/stores/iframe-store';

    const store = useIframeStore();
    const iframeRef = ref(null);

    onMounted(() => {
      const iframe = iframeRef.value;
      if (!iframe) return;

      // 监听 iframe 加载完成事件
      iframe.onload = () => {
        // iframe 加载完成后，发送初始变量数据
        if (iframe.contentWindow && store.initialVariables) {
          iframe.contentWindow.postMessage({
            type: 'INITIAL_DATA',
            payload: store.initialVariables
          }, '*');
        }
      };

      // 监听从 iframe 发来的 action 消息
      window.addEventListener('message', (event) => {
        if (event.source === iframe.contentWindow) {
          // 检查是否是定义的 action
          if (event.data && event.data.actionName && store.manifest?.actions.some(a => a.actionName === event.data.actionName)) {
            // 转发给 App.vue，再由 App.vue 发送给 RN
            window.parent.postMessage({
              type: 'iframeAction', // 使用 RN 能识别的类型
              data: event.data
            }, '*');
          }
        }
      });
    });

    // 监听从 RN 返回的数据，并转发给 iframe
    watch(() => store.lastReceivedData, (newData) => {
      if (iframeRef.value?.contentWindow && newData) {
        iframeRef.value.contentWindow.postMessage({
          type: 'ACTION_RESULT',
          action: newData.action,
          payload: newData.payload
        }, '*');
      }
    });
    </script>

    <style scoped>
    /* ... 样式保持不变 ... */
    </style>
    ```

##### **C. 更新 `App.vue`**

  **变更**:
    *   在 `handleWebViewMessage` 中处理 `initializeIframe` 消息，将 `manifest`, `variables`, 和 `url` 存入 `iframe-store`。

    ```typescript
    // ... imports
    import { useIframeStore } from '@/stores/iframe-store';
    import IFrameHost from '@/components/IFrameHost.vue';

    // ... setup
    const iframeStore = useIframeStore();

    // ... in handleWebViewMessage switch
    case 'initializeIframe':
      console.log('[App] 初始化 Iframe:', message.data);
      if (message.data.manifest && message.data.iframeViewUrl) {
        iframeStore.initialize(
          message.data.iframeViewUrl,
          message.data.manifest,
          message.data.initialVariables // RN 端需要传递这个
        );
      }
      break;
    case 'iframeData':
      console.log('[App] 收到 Iframe 数据:', message.data);
      iframeStore.setData(message.data);
      break;
    case 'iframeAction': // 从 IFrameHost 转发来的消息
      console.log('[App] 转发 Iframe Action 给 RN:', message.data);
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
      break;
    ```
### **4. 验收标准**

1.完成上述端到端的所有功能需求，且端到端的全流程有清晰可追溯的中文日志。

2.在vue-vn-engine项目中，创建测试用例，模拟从RN端初始化新的配置，包括manifest.json，html外链使用我提供的https://files.catbox.moe/akmnsd.html

3.我将在开始游戏后在视觉小说主界面，检查是否有iframe的入口在右上角

4.我进入这个入口，应该能看到https://files.catbox.moe/akmnsd.html的代码渲染出来。这些代码尚未绑定action，我现在的预期是看到正确的显示

### **5. 用户交互流程 (用户视角)**

1.  用户正在享受视觉小说的剧情，屏幕上显示着精美的背景、角色立绘和对话。
2.  用户注意到界面右上角的图标。
3.  用户点击该图标。
4.  屏幕平滑地切换到一个全新的界面（全屏的 iframe），这个界面可能是角色状态面板、物品合成台或是小游戏。视觉小说界面被完全覆盖。
8.  用户点击iframe的关闭按钮。
9.  iframe 界面平滑地消失，用户无缝回到了之前正在阅读的视觉小说剧情界面，一切都和他离开时一样。
```