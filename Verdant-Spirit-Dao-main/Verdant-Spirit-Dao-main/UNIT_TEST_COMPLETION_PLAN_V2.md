# 单元测试补充计划 V2

本文档在完成初步的单元测试补充后，对整个项目进行了更深入的审查，旨在发现并补充更深层次的边缘情况和健壮性测试。

## `achievementStore`

### 事件处理器健壮性测试

- [x] **`handleNewAchievement`**:
  - [x] 测试当 `event.payload` 是一个数组时的处理情况。
  - [x] 测试当 `event.payload` 中缺少 `点数` 字段时，点数是否默认为 0。
- [x] **`handleRewardUpdate`**:
  - [x] 测试当 `event.payload` 不是一个数组时，是否能正确处理并记录警告。
- [x] **`handleRewardRedemption`**:
  - [x] 测试当 `奖励列表` 不存在时，是否能正确处理。
  - [x] 测试当奖励的 `库存` 减到 0 后，是否还能继续兑换。
  - [x] 测试当 `event.payload` 中缺少 `消耗点数` 字段时，消耗是否默认为 0。

### 初始化流程测试

- [x] 测试当 `world.成就` 初始为 `undefined` 时，各个事件处理器是否能正确创建初始的 `成就` 对象。

## `barterStore`

### `getItemValue` 健壮性测试

- [x] 测试当 `pokedexManager` 在 `window` 对象上未定义时，返回值是否为 0。
- [x] 测试当物品在图鉴中找不到，且物品本身没有 `价值` 属性时，返回值是否为 0。
- [x] 测试当物品的 `价值` 字段是一个不规范的字符串或对象时，是否能健壮地处理并返回 0。

### 计算属性边缘情况测试

- [x] 测试当选中物品的 `数量` 属性缺失或为 0 时，`myOfferValue` 和 `traderRequestValue` 的计算是否正确。

### Actions 边缘情况测试

- [x] **`executeTrade`**: 测试当 `mySelectedItems` 或 `traderSelectedItems` 为空时，生成的 `actionString` 是否正确。

### Getters 健壮性测试

- [x] 测试当 `characterStore.mainCharacter` 或其 `物品` 列表为 `undefined` 时，`myItems` 是否返回空数组。

## `mapStore`

### Getters 健壮性测试

- [x] **`currentRegion`**: 测试当 `currentPlayerLocation` 是一个无效的 `region_id` 时，是否返回 `undefined`。
- [x] **`visibleExits`**:
  - [x] 测试当 `connections` 数组中存在 `is_visible: false` 的连接时，这些连接是否被正确过滤。
  - [x] 测试当 `connections` 数组为空时，`visibleExits` 是否为空数组。

## `pokedexStore`

> **注意**: 此 store 的测试覆盖率极低，需要大规模补充。

### Actions 核心逻辑测试

- [x] **`refreshAllData`**:
  - [x] 测试当 `pokedexManager` 不存在时是否会报错并提前返回。
  - [x] 测试当 `getVariables` 抛出 `DataCloneError` 时是否能优雅地处理。
  - [x] 测试 `newDiscoveries` 的计算逻辑是否正确。
- [x] **`approveDiscoveries` / `approvePendingItem`**:
  - [x] 测试是否正确调用了 `pokedexManager.createPokedexEntry`。
  - [x] 测试成功后是否调用了 `refreshAllData`。
- [x] **`deleteEntry`**:
  - [x] 测试是否能根据类型正确调用 `pokedexManager.deleteAchievement` 或 `pokedexManager.deletePokedexEntry`。
- [x] **`injectEntries`**:
  - [x] 测试是否能正确地将条目合并到当前消息的变量中，并处理重复条目。
- [x] **`createOrUpdateEntry`**:
  - [x] 测试是否能根据 `originalName` 的存在与否，正确调用 `create` 或 `update` 相关的方法。

### 副作用 (Watcher) 测试

- [x] **`watch(eventLogStore.allEvents)`**:
  - [x] 测试当事件列表重置时，`lastProcessedEventIndex` 是否被重置。
  - [x] 测试是否能正确触发 `handlePokedexCompletion`。
  - [x] 测试是否能正确处理 `图鉴条目更新` 事件。

### 自动补全 (`scanAndCompleteMissingPokedex`) 测试

- [x] 测试当自动补全关闭时是否直接返回。
- [x] 测试是否能正确找出缺失的物品。
- [x] 测试是否正确调用了 `generateWithSecondaryApi`。
- [x] 测试是否能正确解析 LLM 的响应并创建 `新图鉴发现` 事件。

## `relationsStore`

### Getters 健壮性测试

- [x] 测试当 `characterStore.characters` 为空对象时，`relations` 是否返回空数组。
- [x] 测试当 `characterStore.characters` 包含非对象或 `null` 的值时，这些值是否被正确过滤。

## `rumorStore`

### `checkForRumorGeneration` 错误处理测试

- [x] 测试当 `generateAndParseJson` 抛出错误时，函数是否能捕获异常并记录错误。
- [x] 测试当 `generateAndParseJson` 返回一个空数组时，`worldStore` 的方法是否不被调用。
- [x] 测试当 `worldview` 类型的传闻中 `content` 字段不是一个有效的 JSON 字符串时，是否能捕获错误。
- [x] 测试当 `worldview` 类型的传闻解析出的 JSON 对象缺少 `path` 或 `value` 字段时，是否能正确处理。

### 上下文收集健壮性测试

- [x] 测试当 `characterStore.mainCharacter` 不存在时，`characterContext` 是否能被正确构建。
- [x] 测试当 `worldStore.world.地图` 不存在时，`worldContext` 是否能被正确构建。

## `shelterStore`

### `_handleShelterEvent` 全面测试

- [x] **`庇护所建造`/`升级`**:
  - [x] 测试当 payload 格式不正确或 `组件ID`/`等级` 无效时，是否能正确处理并报错。
  - [x] 测试成功时是否正确更新了组件的 `规模`、`状态` 和 `耐久度`。
- [x] **`庇护所修复`**:
  - [x] 测试修复后耐久度是否正确增加，且不超过 100%。
- [x] **`庇护所受损`**:
  - [x] 测试受损后耐久度是否正确减少，且不低于 0%。
  - [x] 测试 `recentlyDamagedComponent` 是否被正确设置。
- [x] **`庇护所攻击`**:
  - [x] 测试伤害是否被正确地平分给了所有可受损的组件。
- [x] **通用**: 测试当 `worldState.庇护所` 不存在时，所有事件是否都能被安全地跳过。

### `calculateCompositeAttributes` 辅助函数测试

- [x] 测试是否能根据 `SHELTER_COMPONENTS_DATA` 正确计算总防御力。
- [x] 测试是否能正确生成 `功能` 列表。
- [x] 测试是否能根据耐久度百分比正确更新组件的 `状态`。

## `signInStore`

### `handleSignInEvent` 健壮性测试

- [x] 测试当 `event.payload.date` 是一个无效日期字符串时，函数是否能优雅地处理。
- [x] 测试当 `worldState.当前日期` 不存在时，函数是否能正确处理。
- [x] 测试当 `签到记录` 中已包含当天记录时，再次签到是否不会重复增加 `连续签到天数`。

### `watch(timeStore.day)` 逻辑测试

- [x] 测试当 `newDay > oldDay + 1` 时，`连续签到天数` 是否被正确重置为 0。
- [x] 测试 `今日已签到` 是否被正确重置为 `false`。

## `timeStore`

- [x] **创建测试文件**: `src/什么我要在玄幻修仙世界种田-0楼版本/测试/stores/systems/timeStore.test.ts`。
- [x] **Getters**:
  - [x] 测试当 `worldStore.time` 存在时，是否能正确派生出所有时间相关的计算属性。
  - [x] 测试当 `worldStore.time` 为 `undefined` 时，是否能返回正确的默认值。
- [x] **Actions (`updateTime`)**:
  - [x] 测试是否能正确调用 `worldStore.updateWorldState`。
  - [x] 测试当 `state.value` 为 `undefined` 时，`updateTime` 是否不执行任何操作。

## `weatherStore`

### `updateWeatherOnTimeChange` 健壮性测试

- [x] 测试多种天气影响（如“祈雨”和“灵气浓郁”）同时存在时，天气概率是否被正确地叠加计算。
- [x] 测试当“双月临空”出现时，天气是否被强制设置为“晴朗”。

### `_handleWeatherEvent` 健壮性测试

- [x] 测试当 `payload` 格式不正确时（如 `强度` 不是数字），是否能正确处理并报错。
