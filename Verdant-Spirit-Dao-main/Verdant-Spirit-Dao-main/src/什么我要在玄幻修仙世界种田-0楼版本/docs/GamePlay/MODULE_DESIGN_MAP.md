# 模块设计文档：“山河绘卷” - 动态地图模块

本文档旨在为“山河绘卷”新模块设计详细、可靠的技术实现方案，使其成为游戏世界探索的核心驱动力。

## 1. 核心目标与哲学

* **核心目标**: 创建一个由LLM驱动的、能够动态生成和演变的游戏世界地图。地图不仅是玩家位置的记录，更是叙事的一部分，能够响应玩家的行为和关键剧情，展现一个“活”的世界。
* **设计哲学**:
  * **叙事驱动**: 地图的生成、解锁和变化，其根本驱动力是叙事需求，而非固定的程序规则。
  * **探索的惊喜感**: 玩家的探索行为应能带来真正的未知和惊喜，而不是简单地揭开预设的“战争迷雾”。
  * **结构化与灵活性**: 底层采用灵活且稳固的图（Graph）数据结构，上层则通过LLM的创造力来填充内容，实现二者的完美结合。

## 2. 数据结构设计 (`VARIABLES_SPEC.md`)

为了支持地图系统，我们将在 `世界` 命名空间下引入一个新的核心对象 `地图`。

```json
"世界": {
  // ... 其他已有变量 ...
  "地图": {
    "regions": {
      "forest_01": {
        "region_id": "forest_01",
        "name": "宁静森林",
        "description": "一片静谧的古老森林，阳光透过茂密的树冠洒下斑驳的光影。",
"status": "visited",
"tags": ["forest", "safe", "resource_rich"],
"properties": {
  "has_npc": true,
  "weather_influence": "calm",
  "reward_potential": 2 // 0-10 scale, for adventure path calculation
},
"risk_level": 1 // 0-10 scale, for safe/adventure path calculation
      }
    },
    "connections": [
      {
        "from_region": "forest_01",
        "to_region": "cave_01",
        "description": "一条蜿蜒的林间小路通向北方，深入山体的一个阴暗洞口。",
        "direction": "北方", // 玩家探索的方向
        "is_visible": true,
        "conditions": [], // 例如: ["需要'古老的钥匙'", "力量需达到50"]
        "travel_time": 1, // Represents the base cost/time for shortest path (e.g., in hours or abstract units)
        "risk_level": 1 // 0-10 scale, represents danger of this specific path
      }
    ],
    "currentPlayerLocation": "forest_01" // 玩家当前所在的 region_id
  }
}
```

* **`regions`**: 一个以 `region_id` 为键的对象（字典），用于存储所有区域节点。这种结构便于快速查找和更新特定区域，性能优于数组。
* **`connections`**: 一个存储所有连接边（Edge）的数组。
* **`currentPlayerLocation`**: 明确追踪玩家当前的位置，是所有地图相关事件的上下文基础。
* **动态数值**: `risk_level`, `reward_potential`, `travel_time` 等数值**完全由LLM在叙事中决定**。它们可以在区域/连接被创建时生成，也可以通过后续的 `地图已更新` 事件进行动态调整，以反映世界状态的变化（例如，一个安全的区域因为某个事件而变得危险）。

## 3. 核心流程：游戏初始化时的地图生成

1. **触发时机**: 在 `SetupModule` 完成开局设定，生成初始状态时。
2. **Prompt 设计**: `SetupModule` 将调用LLM，使用精心设计的Prompt来生成初始地图。

    ```
    你是一个世界构建大师。请为一个文字RPG游戏生成初始地图。
    世界观：[世界观核心设定]。
    玩家设定：[玩家开局设定，如种族、出生地背景]。
    请根据以上信息，生成一个包含3到5个互相关联区域的初始地图。你必须以一个JSON对象的形式返回结果，该对象包含 "regions" 和 "connections" 两个字段，严格遵循以下数据结构：
    {
      "regions": { "region_id": { "name": "...", "description": "...", "tags": [...] } },
      "connections": [ { "from_region": "...", "to_region": "...", "description": "...", "direction": "..." } ]
    }
    ```

3. **数据处理**: `SetupModule` 接收到LLM返回的JSON后，会进行验证（格式是否正确、连接是否有效），然后将其整合到 `initialState` 对象的 `世界.地图` 结构中。

## 3.5. 扩展：动态世界观生成

为了创造一个真正独一无二的开局体验，地图的生成将与一个更宏大的**动态世界观生成**过程相结合。此过程将根据玩家在开局时的选择，为世界注入独特的、待发现的元素。

1. **数据整合**: 在调用LLM前，系统将整合以下信息：
    * **玩家选择**: `modules/setup/data.ts` 中所有的开局选项（环境、心态、特长等）。
    * **核心世界观**: `项目总结和介绍.md` 中的宏观背景。

2. **综合性Prompt**: 一个综合性的Prompt将被构建，要求LLM不仅生成初始地图，还要生成一系列“待发现”的叙事元素。

    ```
    ...（地图生成Prompt部分）...
    此外，请根据玩家的选择和世界观，生成以下“待发现”的元素，用于丰富世界。这些内容将作为背景资料供你参考，不会立即展示给玩家。请将它们放入一个 "worldview_details" JSON对象中：
    {
      "rumors": [ { "content": "...", "type": "hook", ... } ], // 1-2条与玩家选择相关的长期传闻 (参考 MODULE_DESIGN_RUMOR.md)
      "pokedex_entries": [ { "名称": "...", "类别": "妖兽", ... } ], // 1-2个独特的、与环境相关的图鉴条目 (参考 MODULE_DESIGN_POKEDEX_SPEC.md)
      "adventure_hooks": [ { "描述": "...", "触发条件": "..." } ] // 1条与玩家心态或特长相关的奇遇线索 (参考 MODULE_DESIGN_ADVENTURE.md)
    }
    ```

3. **数据存储与应用**:
    * LLM返回的地图数据将被写入 `世界.地图`。
    * 返回的 `worldview_details` 对象将被写入一个新的、仅供LLM参考的变量 `世界.世界观.开局相关` 中。
    * **动态扩充**: `世界.世界观` 变量被设计为可由LLM在后续游戏中动态扩充，记录世界的演变。
    * 这些预设的传闻、图鉴、奇遇线索不会立即对玩家可见，而是作为叙事素材，由LLM在合适的时机（如玩家探索、与NPC对话）有机地引入游戏中，从而触发相应的事件（如 `新图鉴发现`）。

## 4. 核心流程：响应式的地图动态更新

为遵循项目 v3.0 的最终架构规范 ([`FINAL_ARCHITECTURE.md`](../FINAL_ARCHITECTURE.md))，地图模块的动态更新遵循标准的事件驱动和状态派生模式。

### 4.1 `worldStore` 与 `mapStore` 的职责划分

*   **`worldStore`**: **地图状态的唯一管理者**。
    *   **职责**: 负责维护 `世界.地图` 这一持久化状态的权威性。
    *   **实现**: 通过 `registerEventHandler` 注册所有地图相关事件（如 `新区域发现`, `地图已更新`, `路径更新`）的处理器。这些处理器是唯一有权修改 `world.value.地图` 的代码。

*   **`mapStore`**: **数据门面与UI协调者**。
    *   **职责**: 作为一个无状态的门面，为UI层和路径规划等业务逻辑提供响应式的、计算好的地图数据。
    *   **实现**:
        *   不包含任何本地 `ref` 状态。
        *   通过 `computed` 属性直接从 `worldStore.world.地图` 派生出 `regions`, `connections`, `currentPlayerLocation` 等数据。
        *   UI组件（如 `MapPanel.vue`）只与 `mapStore` 交互。

### 4.2 LLM事件驱动的数据流

#### 4.2.1 事件一：“新区域发现”（解锁新区域）

* **触发逻辑**:
    1. 玩家在区域A，输入指令“向东走”。
    2. `actions.ts` 检查 `mapStore` 的状态，发现当前区域没有向东的已知 `connection`。
    3. 系统调用LLM，生成包含 `新区域发现` 事件的回复。
* **Prompt 设计 (保持不变)**:

    ```
    你是一个游戏叙事引擎。玩家当前尝试从一个已知区域向未知领域探索。
    【当前位置信息】
    区域ID: {{region_id}}
    区域名称: {{name}}
    区域描述: {{description}}
    区域标签: {{tags}}
    【玩家意图】
    探索方向: {{direction}}
    【历史事件摘要】
    {{recent_events_summary}}
    
    请生成一个“初遇场景”事件。以JSON格式返回，严格遵循以下事件结构。你必须为新区域和连接赋予合理的风险、收益和旅行时间数值：
    {
      "type": "新区域发现",
      "payload": {
        "new_region": {
          "region_id": "...", 
          "name": "...", 
          "description": "...", 
          "tags": [...],
          "risk_level": 1, // 0-10的整数
          "properties": { "reward_potential": 2 } // 0-10的整数
        },
        "connection": {
          "from_region": "{{当前区域ID}}",
          "to_region": "{{新区域ID}}",
          "description": "...",
          "direction": "{{探索方向}}",
          "is_visible": true,
          "conditions": [],
          "travel_time": 1, // 整数
          "risk_level": 1 // 0-10的整数
        }
      }
    }
    ```

* **响应式处理流程**:
    1. LLM返回包含 `新区域发现` 事件的JSON。
    2. `stateUpdater.ts` 将此事件送入 `eventLogStore`。
    3. `worldStore` 的事件循环处理 `eventLogStore` 中的事件，找到 `新区域发现` 事件并调用其注册的处理器。
    4. 处理器直接修改 `world.value.地图` 对象，添加新的区域和连接。
    5. 由于 `mapStore` 的 `computed` 属性依赖于 `worldStore.world.地图`，其状态会自动更新。
    6. UI组件（如 `MapPanel.vue`）由于绑定了 `mapStore` 的状态，会自动重新渲染，显示最新的地图。

#### 4.2.2 事件二：“地图已更新”（两阶段流程）

为了遵循“LLM不记忆复杂状态，只按需请求”的核心原则，地图更新采用一个两阶段的“请求-响应”流程。

* **核心思想**: LLM不直接生成更新事件，因为它可能没有最新的区域信息。取而代之的是，LLM先发出一个“更新意图”的指令，系统在下一次交互中提供所需信息，LLM再基于这些最新信息生成精确的更新事件。

* **阶段一：LLM发出更新意图**
    1. **触发逻辑**: 叙事发展到一个需要改变某个区域状态的节点（例如，玩家净化了一片被污染的森林）。
    2. **发出指令**: LLM生成一个`"请求区域信息"`指令事件，明确指出它想要更新哪个区域。
    3. **事件规范**:

        ```json
        {
          "type": "指令",
          "payload": {
            "指令": "请求区域信息",
            "区域": "region_id_or_name", // 目标区域的ID或名称
            "描述": "由于玩家的净化行动，我计划更新[区域名称]的状态，需要该区域的最新数据以生成准确的更新事件。"
          }
        }
        ```

    4. **系统响应**: 系统捕获此指令，并在下一次请求的Prompt中，注入关于目标区域及其所有连接的完整、最新信息。

* **阶段二：LLM生成精确更新事件**
    1. **接收上下文**: LLM在新的Prompt中收到了它所请求的区域的详细数据。
    2. **生成事件**: 基于这些最新数据和当前叙事，LLM现在可以安全地生成一个`"地图已更新"`事件，其中包含精确的`changes`。
    3. **Prompt 设计**:

        ```
        你是一个游戏叙事引擎。刚刚发生了重大事件：[事件描述]。
        你之前请求了关于[区域名称]的最新信息，以下是该区域的数据：
        【区域上下文】
        {{region_details_json}}
        
        请基于此事件和最新信息，生成一个“地图更新”事件，描述该事件对该区域造成的影响。
        ```

    4. **响应式处理流程**:
        * `stateUpdater.ts` 将LLM生成的`"地图已更新"`事件送入`eventLogStore`。
        * `worldStore` 的事件循环处理此事件，调用其处理器，安全地将 `changes` 应用到 `world.value.地图` 中对应的区域上。
        * `mapStore` 和UI会自动响应更新。

### 4.3 上下文优化：按需路径信息注入

为了极致地优化上下文并赋予LLM更强的叙事能力，我们将“请求地图上下文”的机制升级为更精细的**“请求路径信息”**机制。LLM不再需要请求整个地图，而是可以请求从当前位置到特定目的地的多种路径选项。

* **核心理念**: LLM在叙事中产生一个明确的“旅行”意图时，可以向系统请求具体的路径方案，而不是模糊的地图信息。这使得叙事可以围绕“选择哪条路”展开，增加了互动性和策略性。
* **触发机制**: 当LLM需要玩家做出路径选择时，它会生成一个带有目的地的指令事件。
* **事件规范**:

    ```json
    {
      "type": "指令",
      "payload": {
        "指令": "请求路径信息",
        "目的地": "region_id_or_name", // 目标区域的ID或名称
        "描述": "玩家计划前往[目的地]，我需要系统提供可选的路径以供其选择。"
      }
    }
    ```

* **系统响应 (前端/后台)**:
    1. 系统捕获到 `"请求路径信息"` 指令。
    2. **路径计算**: 系统后台会运行路径规划算法（如Dijkstra或A*），根据地图数据中的权重（`travel_time`, `risk_level`, `reward_potential`）计算出从 `currentPlayerLocation` 到 `目的地` 的三种路径：
        * **最短路径**: 仅考虑 `travel_time` 权重，找出总耗时最少的路径。
        * **稳妥路径**: 优先考虑 `risk_level` 最低的连接和区域，找出总风险最低的路径。
        * **冒险路径**: 综合考虑高 `reward_potential` 和高 `risk_level`，找出一条可能充满危险但回报丰厚的路径。
    3. **上下文注入**: 在构建下一次请求时，`promptManager` 会将计算出的这三条路径，连同最基础的区域名称列表，格式化后注入到Prompt中。如果找不到目的地，系统会告知LLM该目的地不存在，并可选择性地提供完整地图信息（如果LLM发出了通用的“请求地图上下文”指令）。
* **优势**: 这种模式将上下文的粒度降到了最低，极大地节约了Token，同时将简单的“探索”变成了富有策略性的“路线规划”，深化了游戏玩法。

### 4.4 路径规划算法

* **推荐算法**: 采用**Dijkstra算法**的变体。Dijkstra算法是计算单源最短路径的经典算法，其优势在于可以通过改变边的“权重”定义，来适应我们不同的路径规划需求。
* **权重定义**:
  * **最短路径**: `weight = connection.travel_time`
  * **稳妥路径**: `weight = connection.risk_level + destination_region.risk_level` (权重可以是路径和目标区域风险的总和)
  * **冒险路径**: `weight = (connection.risk_level + destination_region.risk_level) / (destination_region.reward_potential + 1)` (一个简单的示例，旨在寻找风险回报率高的路径，避免除以零)
* **实现**: 路径计算逻辑应封装在 `mapStore` 或一个专门的 `utils/pathfinder.ts` 模块中，以供 `promptManager` 调用。算法的时间复杂度对于我们游戏地图的规模来说完全可以接受。

## 5. UI渲染与交互

* **系统面板集成**: 在 `core/systems.ts` 中创建一个新的 `renderMapSystem` 函数。
* **可视化方案**:
  * **文本列表**: 清晰地列出当前位置、描述，以及所有可见的出口：“你可以前往：东方 - 森林，西方 - 小径”。
  * **ASCII地图 (可选)**: 生成一个简单的 `3x3` 或 `5x5` 的ASCII字符画，用 `[P]` 表示玩家，用 `[?]` 表示未探索区域，用 `[F]` (Forest), `[C]` (Cave) 等表示已知区域。
* **地图日志**: 创建一个模态框（Modal），用于显示玩家已探索过的所有区域（`status` 为 `visited` 或 `unvisited`）及其连接，提供探索成就感。

## 6. 与其他模块的联动

* **任务系统 (`Quest`)**: 任务的目标可以是“探索`region_id`”或“在`region_id`寻找`item`”。
* **传闻系统 (`Rumor`)**: 传闻可以暗示隐藏的连接或未被发现的区域。例如：“听说黑森林深处，有一条通往古代遗迹的密道。”
* **天气系统 (`Weather`)**: 特定天气可能解锁或关闭某些连接（如“暴雨导致河流无法通行”）。

## 7. 实施步骤 (v2.0 响应式架构)

1. **创建本文档**: 在 `docs/GamePlay/` 目录下创建 `MODULE_DESIGN_MAP.md`。（此步骤已完成）
2. **更新 `VARIABLES_SPEC.md`**: 添加 `世界.地图` 结构。（此步骤已完成）
3. **创建 `stores/systems/mapStore.ts`**:
    * 定义 `mapStore` 的 state，包含 `regions`, `connections`, `currentPlayerLocation`。
    * 实现一个 `watch` 监听 `useEventLogStore().allEvents`。
    * 在 watcher 中，实现处理 `新区域发现` 和 `地图已更新` 事件的核心逻辑。
    * 创建一个 `persistMapData` action，用于将 store 的状态写回 `世界.地图` 酒馆变量。
    * 创建一个 `initializeMap` action，用于从酒馆变量加载初始地图数据。
4. **修改 `core/actions.ts`**: 增加在玩家探索未知方向时，调用LLM生成 `新区域发现` 事件的逻辑。
5. **修改 `modules/setup/index.ts`**: 在生成初始状态时，加入调用LLM生成初始地图的逻辑，并将结果直接写入 `initialState` 的 `世界.地图` 字段。
6. **创建 `components/system/MapPanel.vue`**:
    * 创建一个新的Vue组件用于显示地图信息。
    * 组件内使用 `useMapStore()` 获取地图状态。
    * 将 `mapStore` 的 state 和 getters 绑定到模板上，实现UI的响应式渲染。
7. **集成UI**: 在系统面板的主组件中引入并显示 `MapPanel.vue`。
8. **实现路径规划器**: 创建 `utils/pathfinder.ts` 模块，实现Dijkstra算法的变体，能够根据不同的权重计算路径。
9. **增强 `promptManager`**:
    * 实现对 `"请求路径信息"` 指令的响应逻辑。
    * 在需要时调用路径规划器，并将结果格式化后注入到Prompt中。
10. **更新 `prompts-data.ts`**: 正式添加 `"请求路径信息"` 指令事件的规范和示例。
11. **更新 `MODULE_INTERACTION_SPEC.md`**: 加入 `mapStore` 及其与其他模块（如 `questStore`, `timeStore`）的交互关系，遵循“状态衍生”原则（例如，任务模块可以直接 `watch` `mapStore.currentPlayerLocation`）。
