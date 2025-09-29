# 项目设计文档总览

本文档是《什么？我要在玄幻修仙世界种田？》0楼版本所有设计规范的索引，旨在为开发者提供一个清晰的导航，快速了解项目架构的各个方面。

---

## 架构核心 (Architectural Core)

> [!SUCCESS]
> **所有开发者应从这里开始。**

* **[FINAL_ARCHITECTURE.md](./FINAL_ARCHITECTURE.md)**
  * **概述**: **(首要必读)** 描述了项目最终的、以 `worldStore` 为核心的响应式架构。通过架构图和核心共识，定义了所有模块的数据流和交互模式。**这是理解整个项目的基石。**

---

## 核心规范与数据流 (Core Specifications & Data Flow)

这些文档定义了项目的技术基石，包括数据如何存储、如何流动以及应用的核心生命周期。

* **[REACTIVE_STATE_SPEC.md](./Core/REACTIVE_STATE_SPEC.md)**
  * **概述**: **(必读)** 定义了以 Pinia 为核心的**响应式状态管理规范**。详细阐述了 `worldStore` 如何作为核心状态容器，以及其他 Store 如何通过响应式衍生来处理业务逻辑。

* **[CHAT_FLOW_SPEC.md](./Core/CHAT_FLOW_SPEC.md)**
  * **概述**: **(必读)** 描述了从用户输入到UI更新的完整交互生命周期。详细解释了应用初始化、状态恢复和事件溯源原则。

* **[VARIABLES_SPEC.md](./old/VARIABLES_SPEC.md)**
  * **概述**: 定义了游戏状态的唯一事实来源——聊天变量的完整结构。是理解所有数据模型的前提。

* **[HISTORY_SPEC.md](./HISTORY_SPEC.md)**
  * **概述**: 描述了重构后的聊天历史管理系统，其核心是 `分支 -> 楼层 -> 消息页` 的三层数据模型。

---

## 核心玩法模块设计 (Gameplay Module Design)

这部分文档深入探讨了构成游戏玩法的各个具体模块的设计细节。

* **[MODULE_DESIGN_CHARACTER.md](./GamePlay/MODULE_DESIGN_CHARACTER.md)**
  * **概述**: 详细阐述了“角色”模块在新架构下的完整技术实现，是理解“核心状态 -> 门面 -> UI”分层模式的最佳范例。

* **[MODULE_DESIGN_SHELTER.md](./GamePlay/MODULE_DESIGN_SHELTER.md)**
  * **概述**: 详细设计了“庇护所”动态基地建设系统。

* **[MODULE_DESIGN_WEATHER.md](./GamePlay/MODULE_DESIGN_WEATHER.md)**
  * **概述**: 设计了“天时”系统，一个动态环境模块。

* **[TIME_SPEC.md](./Core/TIME_SPEC.md)**
  * **概述**: 规范了游戏内的时间管理。

* **[MODULE_DESIGN_ADVENTURE.md](./GamePlay/MODULE_DESIGN_ADVENTURE.md)**
  * **概述**: 设计了“奇遇”模块，一个由叙事驱动的事件系统。

* **[MODULE_DESIGN_MAP.md](./GamePlay/MODULE_DESIGN_MAP.md)**
  * **概述**: 设计了“山河绘卷”动态地图模块。

* **[MODULE_DESIGN_QUEST.md](./GamePlay/MODULE_DESIGN_QUEST.md)**
  * **概述**: 设计了一个由叙事驱动的任务系统。

* **[POKEDEX_SPEC.md](./GamePlay/MODULE_DESIGN_POKEDEX_SPEC.md)**
  * **概述**: 定义了图鉴系统，采用“双重事实来源”设计。

* **[ITEM_VALUE_SPEC.md](./Core/ITEM_VALUE_SPEC.md)**
  * **概述**: 设计了一套多维的物品价值体系。

---

## LLM与AI交互 (LLM & AI Interaction)

这部分文档关注于如何更智能、更高效地与大型语言模型（LLM）进行交互。

* **[PROMPT_SYSTEM_SPEC.md](./Core/PROMPT_SYSTEM_SPEC.md)**
  * **概述**: 阐述了新的动态提示词系统如何通过 `promptStore` 响应式地从其他 Pinia stores 获取状态，并将其实时注入到系统提示词中。

* **[SMART_CONTEXT_SPEC.md](./Plugin/SMART_CONTEXT_SPEC.md)**
  * **概述**: 提出了一个“智能上下文系统”的设计，用于提升LLM在长程对话中的连贯性。

* **[SECONDARY_LLM_API_SPEC.md](./Plugin/SECONDARY_LLM_API_SPEC.md)**
  * **概述**: 设计了一个标准化的接口，允许游戏调用次级LLM以处理非核心叙事任务。

---

## 未来规划与辅助模块 (Future Plans & Auxiliary Modules)

* **[FUTURE_PLANS.md](./FUTURE_PLANS.md)**
  * **概述**: 描绘了未来的功能拓展路线图，包括炼丹/炼器、探索副本和传送系统等。

* **[MODULE_DESIGN_DIARY.md](./GamePlay/MODULE_DESIGN_DIARY.md)**
  * **概述**: 提出了“岁月留痕”模块的设计，一个自动生成日记的系统。

* **[MODULE_DESIGN_RUMOR.md](./GamePlay/MODULE_DESIGN_RUMOR.md)**
  * **概述**: 设计了“山野传闻”模块，一个后台周期性生成背景事件的系统。

---

## 开发与调试 (Development & Debugging)

* **[DEVELOPER_CHEATSHEET.md](./developer/DEVELOPER_CHEATSHEET.md)**
  * **概述**: **(核心速查)** 一份针对开发者的核心API速查文档。

* **[DEBUGGING_SPEC.md](./Core/DEBUGGING_SPEC.md)**
  * **概述**: 规范了调试系统的设计。
