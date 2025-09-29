# Fuse.js 集成开发者文档

本文档旨在为项目中 Fuse.js 的集成提供配置指导和最佳实践。Fuse.js 是一个功能强大的轻量级模糊搜索库。

## 核心概念

Fuse.js 通过对一个 JSON 数组进行搜索，返回一个根据“分数”排序的结果列表。分数越低，表示匹配度越高。

## 配置选项详解

以下是根据官方文档整理的核心配置选项，以及针对本项目的建议用法。

### 基础选项 (Basic Options)

---

#### `keys`

- **类型**: `Array`
- **默认值**: `[]`
- **说明**: 指定要在对象数组中搜索的键。这是最重要的配置项。支持嵌套路径 (e.g., `author.firstName`) 和权重搜索 (e.g., `{ name: 'title', weight: 0.7 }`)。
- **项目应用**: 在搜索图鉴、角色、物品等数据时，需要明确指定搜索范围，例如 `['name', 'description']`。可以为 `name` 设置更高的权重，使其在搜索结果中优先显示。

#### `includeScore`

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 是否在搜索结果中包含匹配得分。分数为 `0` 表示完全匹配，`1` 表示完全不匹配。
- **项目应用**: 建议开启 (`true`)。这对于调试搜索质量或实现更复杂的排序逻辑非常有用。

#### `includeMatches`

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 是否在结果中包含匹配的具体信息，如字符的起始和结束索引。
- **项目应用**: 如果需要在前端界面上高亮显示匹配的文本，则必须开启此项 (`true`)。

#### `isCaseSensitive`

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 是否区分大小写。
- **项目应用**: 建议保持默认值 `false`，以提供更友好的用户搜索体验。

#### `shouldSort`

- **类型**: `boolean`
- **默认值**: `true`
- **说明**: 是否根据匹配得分对结果进行排序。
- **项目应用**: 建议保持默认值 `true`，确保最相关的结果排在最前面。

#### `minMatchCharLength`

- **类型**: `number`
- **默认值**: `1`
- **说明**: 匹配的最小字符长度。小于此长度的匹配将被忽略。
- **项目应用**: 可以适当调高至 `2`，以避免单个字符（如“的”、“了”）产生大量无意义的匹配。

#### `findAllMatches`

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 是否查找所有匹配项，即使已经找到了一个完美的匹配。
- **项目应用**: 在需要高亮所有匹配关键词的场景下，应设为 `true`。

### 模糊匹配选项 (Fuzzy Matching Options)

---

#### `threshold`

- **类型**: `number`
- **默认值**: `0.6`
- **说明**: 匹配算法的阈值。`0.0` 要求完全匹配，`1.0` 则会匹配任何内容。值越低，搜索越严格。
- **项目应用**: 这是一个需要根据实际数据和用户反馈进行微调的关键参数。初始可以设置为 `0.4` 或 `0.5`，在保证召回率的同时提高准确性。例如，搜索“功法”时，不应匹配到“攻击方法”。

#### `ignoreLocation`

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 是否忽略匹配位置。`true` 表示模式可以出现在文本中的任何位置。
- **项目应用**: 强烈建议设为 `true`。在我们的应用场景中，用户关心的通常是关键词是否存在，而不是它在哪个位置。

#### `distance`

- **类型**: `number`
- **默认值**: `100`
- **说明**: 当 `ignoreLocation` 为 `false` 时，此参数定义了匹配项与 `location` 的最大距离。
- **项目应用**: 由于我们推荐将 `ignoreLocation` 设为 `true`，此参数通常可以忽略。

#### `location`

- **类型**: `number`
- **默认值**: `0`
- **说明**: 当 `ignoreLocation` 为 `false` 时，此参数定义了期望找到模式的大致位置。
- **项目应用**: 由于我们推荐将 `ignoreLocation` 设为 `true`，此参数通常可以忽略。

### 高级选项 (Advanced Options)

---

#### `useExtendedSearch`

- **类型**: `boolean`
- **默认值**: `false`
- **说明**: 启用扩展搜索，允许使用 `'` (精确匹配), `!` (反向匹配), `^` (前缀匹配), `$` (后缀匹配) 等操作符。
- **项目应用**: 对于高级用户或需要精确控制搜索逻辑的场景，可以考虑开启。例如，允许用户通过输入 `='锻体术'` 来精确查找名为“锻体术”的功法。

## 推荐配置模板

```javascript
const options = {
  // 在 'name' 和 'description' 字段中搜索
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'description', weight: 0.3 }
  ],
  includeScore: true,
  includeMatches: true,
  minMatchCharLength: 2,
  shouldSort: true,
  ignoreLocation: true,
  threshold: 0.4,
  useExtendedSearch: false,
};
```

这份配置旨在提供一个平衡了准确性和用户体验的起点。在具体实施时，应根据模块的特定需求进行调整。

## API 方法

除了初始化时的配置，Fuse.js 实例还提供了一系列方法来动态地进行搜索和数据管理。

### `search(pattern, options)`

- **说明**: 核心搜索方法。`pattern` 可以是字符串、扩展查询或逻辑查询。`options` 中可以传入 `limit` 来限制返回结果的数量。
- **项目应用**: 这是执行搜索时最常用的方法。例如: `fuse.search('炼丹')` 或 `fuse.search('炼丹', { limit: 10 })`。

### `setCollection(documents)`

- **说明**: 完全替换 Fuse 实例中的数据集。
- **项目应用**: 当需要刷新整个数据集时（例如，从服务器重新获取了完整的图鉴列表），可以使用此方法。`fuse.setCollection(newPokedexData)`。

### `add(document)`

- **说明**:向数据集中添加一个新文档。
- **项目应用**: 当用户在游戏中获得一个新物品或解锁一个新条目时，可以使用此方法动态更新索引，而无需重建整个索引。`fuse.add(newItem)`。

### `remove(predicate)`

- **说明**: 根据条件函数移除数据集中的文档。
- **项目应用**: 用于移除符合特定条件的条目。例如，移除所有“已失效”的卷轴：`fuse.remove(doc => doc.status === '已失效')`。

### `getIndex()`

- **说明**: 获取 Fuse.js 生成的索引对象。
- **项目应用**: 主要用于调试或高级用法，例如了解索引的大小 `fuse.getIndex().size()`。在常规开发中较少使用。

## 索引 (Indexing)

对于大型数据集，每次初始化 Fuse 实例时都重新计算索引可能会消耗较多时间，影响性能。Fuse.js 提供了预生成和序列化索引的机制来解决这个问题。

### `Fuse.createIndex(keys, documents)`

- **说明**: 一个静态方法，用于预先根据指定的 `keys` 和数据集 `documents` 创建索引。
- **项目应用**: 如果我们的图鉴、世界设定等数据量变得非常庞大且不经常变动，可以在应用构建阶段或首次加载时调用此方法生成索引。

### `Fuse.parseIndex(indexJson)`

- **说明**: 一个静态方法，用于从一个序列化的 JSON 对象中解析出索引。
- **项目应用**: 配合 `Fuse.createIndex` 使用。我们可以将生成的索引通过 `index.toJSON()` 转换为 JSON 字符串并保存为文件。在应用启动时，直接加载这个 JSON 文件并用 `Fuse.parseIndex` 解析，然后将解析后的索引传入 Fuse 的构造函数中。这样可以极大地加快初始化速度。

**示例流程**:

1. **构建时**:

    ```javascript
    const pokedexData = [...] // 大量图鉴数据
    const keys = ['name', 'description']
    const fuseIndex = Fuse.createIndex(keys, pokedexData)
    
    // 将索引保存为 JSON 文件 (伪代码)
    saveAsJsonFile('pokedex-fuse-index.json', fuseIndex.toJSON())
    ```

2. **运行时**:

    ```javascript
    const pokedexData = [...] // 同样的图鉴数据
    const indexJson = await loadJsonFile('pokedex-fuse-index.json') // 加载索引文件
    const fuseIndex = Fuse.parseIndex(indexJson)
    
    // 使用预生成的索引初始化 Fuse
    const fuse = new Fuse(pokedexData, options, fuseIndex)
    ```

- **注意**: 如果在初始化 `new Fuse()` 时不提供索引，Fuse.js 会自动在内部创建索引。对于中小型数据集，自动创建通常已经足够。

## 得分理论 (Scoring Theory)

为了更好地调整搜索参数并理解搜索结果的排序，了解 Fuse.js 的得分计算原理至关重要。最终的相关性得分由三个主要因素决定：

### 1. 模糊匹配得分 (Fuzziness Score)

- **核心算法**: 基于 Bitap 算法计算。
- **影响因素**:
  - `threshold`: 匹配的严格程度。
  - `location`: 期望匹配项出现的位置。
  - `distance`: 匹配项与期望位置的最大距离。
- **关键结论**: 默认情况下，搜索范围受限于文本的开头部分。如果希望在文本的任何位置进行匹配，**必须将 `ignoreLocation` 设置为 `true`**，这也是我们推荐的配置。

### 2. 键权重 (Key Weight)

- **说明**: 在 `keys` 配置项中，可以为不同的键设置不同的 `weight`。
- **作用**: 权重越高的键，其匹配结果的相关性得分也越高。例如，将 `name` 的权重设为 `0.7`，`description` 的权重设为 `0.3`，会使名称中的匹配项比描述中的匹配项排名更靠前。

### 3. 字段长度范数 (Field-length Norm)

- **说明**: 文本字段的长度会影响得分。
- **作用**: 搜索词在较短的字段中匹配（如“标题”）被认为比在较长的字段中匹配（如“正文”）更具相关性。
- **调整**: 可以通过设置 `ignoreFieldNorm: true` 来完全忽略字段长度的影响，或通过 `fieldNormWeight` 来调整其影响程度。

## 项目实战综合示例

下面是一个结合了本项目背景的完整示例，用于演示如何搜索“功法秘籍”。

```javascript
// 1. 准备数据集 (例如：功法列表)
const techniques = [
  {
    name: '青元剑诀',
    rank: '天阶',
    description: '修炼此法可凝聚庚金剑气，威力无穷，对金属性灵根修士有奇效。',
    tags: ['攻击', '金属性', '剑修']
  },
  {
    name: '万木春生功',
    rank: '地阶',
    description: '生生不息的木属性功法，擅长治疗与恢复，亦可操控植物进行防御。',
    tags: ['治疗', '木属性', '防御']
  },
  {
    name: '离火燎原',
    rank: '地阶',
    description: '极为霸道的火属性攻击功法，修炼至大成可焚山煮海。',
    tags: ['攻击', '火属性']
  },
  {
    name: '玄冰诀',
    rank: '玄阶',
    description: '基础的水属性法诀，能凝聚寒冰护盾进行防御。',
    tags: ['防御', '水属性']
  }
];

// 2. 配置 Fuse.js 选项
const options = {
  // 搜索 name, description, 和 tags 字段
  keys: [
    { name: 'name', weight: 0.6 },        // 名称权重最高
    { name: 'description', weight: 0.3 }, // 描述次之
    { name: 'tags', weight: 0.1 }         // 标签权重最低
  ],
  includeScore: true,      // 返回得分
  includeMatches: true,    // 返回匹配详情，用于高亮
  minMatchCharLength: 2,   // 至少匹配两个字符
  ignoreLocation: true,    // 在文本任何位置匹配
  threshold: 0.4,          // 匹配阈值
};

// 3. 初始化 Fuse 实例
const fuse = new Fuse(techniques, options);

// 4. 执行搜索
const searchTerm = '攻击';
const results = fuse.search(searchTerm);

// 5. 查看结果
console.log(results);

/*
可能的输出结果 (结构示意):
[
  {
    "item": {
      "name": "离火燎原",
      "rank": "地阶",
      "description": "极为霸道的火属性攻击功法，修炼至大成可焚山煮海。",
      "tags": ["攻击", "火属性"]
    },
    "refIndex": 2,
    "score": 0.001, // 得分极低，匹配度高
    "matches": [
      {
        "indices": [[10, 11]], // "攻击" 在 description 中的位置
        "value": "极为霸道的火属性攻击功法，修炼至大成可焚山煮海。",
        "key": "description"
      },
      {
        "indices": [[0, 1]], // "攻击" 在 tags 数组中的位置
        "value": "攻击",
        "key": "tags"
      }
    ]
  },
  {
    "item": {
      "name": "青元剑诀",
      // ...
    },
    "refIndex": 0,
    "score": 0.002,
    "matches": [
      // ...
    ]
  }
]
*/
```

这个例子展示了如何利用权重（`weight`）让功法名称的匹配优先于描述和标签，并通过 `includeMatches` 获取用于高亮显示匹配项所需的信息，是一个非常典型的应用场景。
