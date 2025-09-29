# [已归档] 模块交互规范 (MODULE_INTERACTION_SPEC.md)

> [!DANGER]
> **本文档已废弃!**
>
> 本文档描述的是项目早期的、基于 `messageBus` 的事件驱动架构。该架构已被**完全取代**。
>
> **所有新开发和模块交互，请严格遵循以下最新的权威文档：**
>
> * **架构总览**: **[`FINAL_ARCHITECTURE.md`](./FINAL_ARCHITECTURE.md)** - 描述了最终的、以 `worldStore` 为核心的响应式架构。
> * **实现细节**: **[`REACTIVE_STATE_SPEC.md`](./Core/REACTIVE_STATE_SPEC.md)** - 详细定义了 Pinia Store 的数据流和实现规范。

本文档仅作为历史参考保留。其中列出的 TODO 列表，已在我们确立最终架构的过程中，通过新的响应式模式（状态衍生和命令式Action调用）得到了完整的、更优的解决方案。

---

## 模块交互重构 TODO

### 1. 时间驱动的交互 (Time-driven Interactions)

-   [ ] **天气模块**:
    -   **目标**: `weatherStore` 监听 `timeStore` 的 `hour` 或 `day` 变化。
    -   **逻辑**: 当时间变化时，触发天气状态的重新计算。
-   [ ] **庇护所模块**:
    -   **目标**: `shelterStore` 监听 `timeStore` 的 `hour` 或 `day` 变化。
    -   **逻辑**: 计算并应用庇护所组件的耐久度衰减，并触发资源的自动产出。
-   [ ] **签到系统**:
    -   **目标**: `signInStore` 监听 `timeStore` 的 `day` 变化。
    -   **逻辑**: 当日期变更时，重置用户的每日签到状态。
-   [ ] **奇遇冷却系统**:
    -   **目标**: `adventureStore` 监听 `timeStore` 的 `day` 变化。
    -   **逻辑**: 检查并更新奇遇的冷却状态。

### 2. 天气驱动的交互 (Weather-driven Interactions)

-   [ ] **庇护所模块**:
    -   **目标**: `shelterStore` 监听 `weatherStore` 的 `currentWeather` 变化。
    -   **逻辑**: 根据当前天气（如暴雨、酷暑）对庇护所组件造成额外的耐久度影响。
-   [ ] **种植系统**:
    -   **目标**: `plantingStore` 监听 `weatherStore` 的 `currentSeason` 和 `currentSolarTerm` 变化。
    -   **逻辑**: 调整农田的产出效率，并更新当前可种植的作物列表。
-   [ ] **图鉴系统**:
    -   **目标**: `pokedexStore` 监听 `weatherStore` 的 `currentSolarTerm` 变化。
    -   **逻辑**: 某些图鉴条目可能只在特定节气下才可发现。
-   [ ] **奇遇系统**:
    -   **目标**: `adventureStore` 监听 `weatherStore` 的 `celestialEvent` 变化。
    -   **逻辑**: 当发生特殊天象（如血月、流星雨）时，触发特殊奇遇或提高奇遇发生概率。
-   [ ] **NPC 系统**:
    -   **目标**: `npcStore` 监听 `weatherStore` 的 `currentWeather` 变化。
    -   **逻辑**: 调整 NPC 的行为模式和日程安排（例如，下雨天 NPC 会待在室内）。
-   [ ] **修炼系统**:
    -   **目标**: `cultivationStore` 监听 `weatherStore` 的 `currentWeather` 变化。
    -   **逻辑**: 特定天气可能会影响修炼效率（例如，雷雨天修炼雷系功法有加成）。

### 3. 庇护所驱动的交互 (Shelter-driven Interactions)

-   [ ] **物品/背包系统**:
    -   **目标**: `itemStore` 监听 `shelterStore` 的状态。
    -   **逻辑**:
        -   当庇护所组件升级 (`shelterUpgraded`) 时，消耗背包中的对应材料。
        -   当庇护所资源点产出 (`shelterResourceProduced`) 时，在背包中增加对应资源。
-   [ ] **任务系统**:
    -   **目标**: `questStore` 监听 `shelterStore` 的状态。
    -   **逻辑**: 当庇护所组件严重受损 (`shelterDamaged`) 时，自动生成一个修复任务。
-   [ ] **传闻系统**:
    -   **目标**: `rumorStore` 监听 `shelterStore` 的状态。
    -   **逻辑**: 当庇护所遭受攻击 (`shelterAttacked`) 时，在世界中生成相关的传闻。
-   [ ] **修炼系统**:
    -   **目标**: `cultivationStore` 监听 `shelterStore` 的 `comfort` (舒适度) getter。
    -   **逻辑**: 庇护所的舒适度为修炼效率提供一个基础加成。

### 4. LLM 事件驱动的交互

-   [ ] **奇遇系统**:
    -   **目标**: `adventureStore` 能够处理由 `EventManager` 派发的、源自 LLM 的复杂奇遇事件。
    -   **逻辑**: 奇遇事件本身可能包含对其他模块状态的修改（如获得物品、遇到NPC），需要设计一个机制来将这些子事件分发到对应的 store actions。
-   [ ] **天气系统**:
    -   **目标**: `weatherStore` 能够响应 LLM 施加的特定天气影响。
-   [ ] **庇护所系统**:
    -   **目标**: `shelterStore` 能够响应 LLM 生成的庇护所建造/升级指令。

### 5. 手机系统驱动的交互 (Phone-driven Interactions)

-   [ ] **核心依赖**:
    -   **目标**: `phoneStore` 监听 `timeStore` 和 `weatherStore` 的状态变化。
    -   **逻辑**:
        -   监听 `timeStore` 的时辰变化，在手机开机时计算并消耗电量。
        -   监听 `weatherStore` 的 `celestialEvent` (特殊天象) 变化，动态更新手机的信号强度和来源。
-   [ ] **LLM 事件驱动**:
    -   **目标**: `phoneStore` 监听 `eventLogStore`。
    -   **逻辑**: 响应 `手机应用解锁` 等来自LLM的事件，更新 `已解锁应用` 列表。
-   [ ] **与物品系统的联动**:
    -   **目标**: `phoneStore` 与 `itemStore` 交互。
    -   **逻辑**: 当玩家使用 `太阳能充电器` 等物品时，`itemStore` 会消耗该物品，并调用 `phoneStore` 的 `charge` action 来为手机充电。
-   [ ] **作为其他系统的UI前端**:
    -   **目标**: 手机的各个App（作为Vue组件）将作为其他系统Store的前端视图。
    -   **逻辑**:
        -   `ClockApp` 读取 `timeStore` 的状态。
        -   `WeatherApp` 读取 `weatherStore` 的状态。
        -   `PokedexApp` 读取 `pokedexStore` 的状态，并可能通过调用 `itemStore` 的 action 来触发 `新图鉴发现` 事件。
        -   `MapApp` 读取 `mapStore` 的状态。
        -   `BBSApp` 读取 `rumorStore` 和 `questStore` 的状态来展示信息。
