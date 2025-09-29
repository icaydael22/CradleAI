# 介绍
[简体中文](README.md)   

[DeepWiki](https://deepwiki.com/AliceSyndrome285/CradleAI/5.2-memory-ui-and-table-memory-plugin)

## 界面预览

<table style="border-collapse: collapse; width: 100%;">
  <tr>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/app-screenshot.png" alt="APP截图 1" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/app-screenshot2.png" alt="APP截图 2" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/app-screenshot3.png" alt="APP截图 3" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/app-screenshot4.png" alt="APP截图 4" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/app-screenshot5.png" alt="APP截图 5" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/app-screenshot6.png" alt="APP截图 6" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
  </tr>
</table>

## 联系与反馈

*   **QQ 群:** (答疑、bug 反馈、意见反馈)
  
二群：570343684
一群：1017292082

## 更新日志：1.0.6

避免键盘弹出收回时的UI抖动闪烁

修复插图类角色卡闪退和Gemini官渠空回复问题。

支持从压缩包导入正则

注意含html的消息都统一放在了视觉小说模式，在常规模式看不到消息是正常的

## Cradle 1.0.6：视觉小说
oii~Cradle现在支持真 视觉小说了，配有编辑器，即使不懂代码也可以做自己的乙游/GAL（文件系统有破坏性更新，注意先备份卡和聊天记录）

Demo：

<table style="border-collapse: collapse; width: 100%;">
  <tr>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/微信图片_20250925203149_233_126.jpg" alt="视觉小说 1" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/微信图片_20250925203150_234_126.jpg" alt="视觉小说 2" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
    <td style="text-align: center; padding: 5px;">
      <img src="https://cradleintro.top/微信图片_20250925203153_236_126.jpg" alt="视觉小说 3" style="max-width: 150px; border: 1px solid #ddd;">
      <br>
    </td>
  </tr>
</table>


## 注意事项

视觉小说功能使用的图床需要使用魔法，否则立绘/背景会加载失败。
加载一次后会缓存。

## 功能食用方法：

1.  在Cradle-VN-Editor可以自己设置立绘，背景，变量，世界书（如果自己懒得设置素材可以滴滴我，用我的demo尝鲜。感觉还没做完善，就不拿出来献丑了hhhh）
2.  导出项目的zip文件
3.  将zip文件导入Cradle
4.  在主页会自动创建视觉小说的对话窗口

## 关于视觉小说编辑器

需要node环境（装过SillyTavern可以忽略）
注意命名：立绘和背景注意标准命名：用角色-状态；时段-背景来做文件名！例如张三-站立；夜晚-客厅

## 上下文压缩

视觉小说功能可以开启自动总结，避免上下文过长掉格式和各种其他问题。

## 体验管理器

众所周知AI在输出长文上面有各种逻辑混乱和记忆丢失问题；另外AI互动游戏有一个大毛病，就是怎么平衡用户自由度和作者的剧情设计，所以我做了和剧情输出AI共享上下文的体验管理器你可以取消它，因为它会在剧情输出后紧接着再调一次API，生成速度会很慢，你也可以设置它每x轮自动启动。

它的作用是根据当前的上下文，变量状态，和你设定的剧情大纲（如果有）来适时插入作者注释纠偏，

使用方法：在编辑器的提示词中加入`${guidanceCurrentScript}`宏，开启体验管理器就行了

## 跑图其实不复杂，

1.  跑图：可以用midjourney跑图，豆包也可以；如果对画风Lora，姿势有要求，或者就是想还原某个同人角色，建议直接上Alice佬的comfyui工作流，不过我的demo是用mj跑的
2.  重点：做立绘的差分直接用nano banana就行。建议给它两张图，一张是你想要的立绘的构图，一张是你跑出来的图，然后多跑几次，直到你对立绘比较满意（背景图同理），让它生成白底立绘。
3.  美图秀秀抠成透明底（我还会顺便调下脸型身体比例，因为nano banana出的图有时候人物比例很怪）

关于模型：只推荐gemini 2.5 pro，2.5 flash有严重丢格式/重复问题

## 目前已知的问题：

总结之后背景会消失，自主行动切换一次场景恢复。
可能出现重复渲染一轮对话的情况。

## 主要功能

### 1. 角色管理

*   支持手动、自动创建和导入 SillyTavern 角色卡，世界书和预设（PNG/JSON 格式）。
*   角色可自定义头像、背景、动态立绘视频。
*   管理模式下可批量删除、导出角色数据，支持角色图库和图片生成。

### 2. AI Roleplay 聊天

*   独立实现了与 SillyTavern 功能等效的世界书、预设和角色信息系统：
    *   **世界书条目管理**：自动注入相关世界设定条目到对话，根据对话关键词智能匹配。
    *   **预设条目处理**：自定义位置，深度，角色的预设条目。
    *   **角色信息融合**：无缝整合角色卡、世界书和预设。
*   记忆管理系统：
    *   长对话自动总结。
    *   智能记忆检索。
*   支持保存点系统，可随时恢复任意历史对话状态。
*   高级交互功能：
    *   **作者注释**：支持自定义作者注释和插入深度设置。
    *   **语音交互**：通过 TTS 功能让角色说话，带语音增强效果。
    *   **多媒体消息**：在对话中发送和接收图片，支持图像分析和上下文理解。
    *   **图片管理**：内置图片缓存系统，方便保存和管理所有对话图片。
    *   **视觉小说模式**：提供类似视觉小说的沉浸式对话界面。
*   高级消息格式化：
    *   富文本支持：处理常见的 HTML 标签和特殊标签，开发者可自定义需要渲染的标签。
    *   自定义标签：支持思考标签、状态块、记忆标签等特殊格式：
    *   图片嵌入：支持内联图片显示和全屏查看。
*   可视化辅助功能：
    *   完整对话历史查看。
    *   自动滚动和手动位置保存。

### 3. 朋友圈（Circle）

*   角色和用户可发布动态、图片，支持点赞、评论、转发。
*   朋友圈互动支持 AI 自动生成角色评论、点赞及内心想法展示。
*   支持用户自定义动态发布与图片选择。
*   多模态支持：
    *   图片分析：AI 可以理解并回应带有图片的帖子内容。
    *   智能回复：基于图像内容生成相关评论和反馈。
*   定时发布系统：
    *   角色可设置多个时间点自动发布朋友圈。
    *   基于当前时间生成适合的动态内容。
    *   发布后可通过通知提醒用户。
*   关系系统集成：
    *   角色互动会动态影响角色间关系。
    *   帖子评论和点赞可提升角色间好感度。
    *   支持通过朋友圈互动更新角色关系类型（如朋友、熟人、对手等）。
*   对话流连接：
    *   朋友圈互动会自动同步到角色的聊天历史。
    *   用户在朋友圈的互动可无缝延续到私聊对话。
*   互动频率控制：
    *   可自定义角色朋友圈活跃度（低、中、高）。
    *   智能管理角色互动频率，避免过度回复。
*   可持久化存储所有朋友圈内容，支持帖子管理和删除功能。

### 4. 群聊系统

*   支持创建/加入群聊，与多个角色/用户共同对话。
*   群聊支持自定义背景、成员管理、消息同步。

### 5. 记忆与知识管理

*   集成向量记忆系统，自动存储和检索对话相关事实。
*   支持表格插件扩展角色知识。
*   记忆面板可查看和管理角色记忆内容。
*   双系统记忆增强：
    *   **结构化表格记忆**：基于模板创建自定义表格，存储角色关系、喜好、事件等结构化信息。
    *   **向量存储记忆**：自动提取对话要点，存储为向量记忆以供后续对话检索。
*   表格记忆管理功能：
    *   多种预设模板：角色关系、事件记录、喜好清单等专用模板。
    *   自定义编辑：可添加、删除、修改表格行列数据。
    *   与对话深度整合：对话信息自动更新相关表格。
*   向量记忆管理功能：
    *   检索优化：智能匹配当前对话最相关的历史记忆。
    *   记忆编辑：增加、修改、删除具体记忆条目。
    *   记忆导出/导入：支持备份和恢复角色记忆数据。
*   记忆优先级控制：自定义记忆处理频率，调节对话中记忆更新和检索的频次。

### 6. TTS 增强(施工中)

*   支持文本转语音（TTS）功能，可增强语音互动体验。
*   TTS 增强器可自定义语音参数。
*   当前版本需开发者自行配置 TTS 服务端点（后续更新将支持前端自主配置 TTS 端点）。
*   支持多种语音控制功能：
    *   语音播放/暂停控制。
    *   增强模式音质提升。
    *   多角色不同语音模板。
    *   自动缓存已生成语音，减少重复请求。

### 7. 图片生成与管理

*   支持 NovelAI 图片生成，自动根据对话上下文生成角色场景背景。
*   角色图库侧边栏可管理、收藏、设置图片为头像/背景。
*   高级标签系统：
    *   支持智能分类的标签选择器，包含上百种分类标签。
    *   支持标签加权与降权。
    *   固定标签功能，可锁定重要特征标签。
    *   角色标签从预设库中选择，确保精确的角色识别。
    *   艺术家风格参考，可选择不同艺术家样式。
    *   自定义提示词输入，支持复杂描述。
    *   "Roll" 功能可随机生成标签组合获得灵感。
*   高级生成设置：
    *   多种图像尺寸预设：肖像、横向、方形、大型。
    *   可自定义步数、采样器、噪声调度等专业参数。
    *   支持 Seed 值管理，可使用相同 Seed 重现图像。
*   多角色场景控制（NovelAI）：
    *   位置控制系统，可精确定位多个角色在图像中的位置。
    *   支持为场景中的每个角色设置独立提示词。
    *   多角色互动姿势和表情控制。
*   生成结果处理：
    *   一键设置为角色头像或背景图。
    *   自动保存到角色图库。
    *   可查看和复制生成参数，方便再次使用相同配置。

### 8. 其他功能

*   支持 API 设置、模型预算、存储管理、社区入口等扩展功能。
*   支持多种主题与界面自定义。

## 部署方法
### 可以使用 Github Action 进行APK构建
```
使用`main.yml`文件作为Github Action的工作流文件，进行构建即可，包含x86，x86_64，arm64的apk
```
### 可以使用 EAS Build 进行APK构建

1.  **Android 平台打包**
    在项目根目录下执行以下命令，通过 EAS 构建 Android 安装包（APK 或 AAB）：
    ```bash
    eas build --platform android
    ```
    构建完成后，可在 Expo 控制台下载生成的安装包进行分发或安装。

2.  **iOS 平台打包**
    亦可通过如下命令为 iOS 平台生成 IPA 包：
    ```bash
    eas build --platform ios
    ```
    但目前尚未在苹果设备真机环境下充分测试，建议谨慎用于生产环境。

> **注意**：请确保已正确配置 Expo 账户、EAS CLI 及相关平台证书。详细配置与分发流程请参考 [Expo 官方文档](https://docs.expo.dev/build/introduction/)。

## 许可证

本项目基于 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可开源，需遵守以下规则：

*   **署名** — 您必须给出适当的署名，提供指向本协议的链接，并指明是否（对原作）作了修改。您可以以任何合理方式进行，但不得以任何方式暗示许可方认可您或您的使用。
*   **非商业性使用** — 您不得将本作品用于商业目的，包括但不限于任何形式的商业倒卖、SaaS、API 付费接口、二次销售、打包出售、收费分发或其他直接或间接盈利行为。

## 声明

*   本项目是一个非商业的开源前端工具，任何人可自行上传代码在 EXPO 平台打包和安装，或进行原生的 apk 构建。
*   现在和将来都不会提供任何角色卡上传或分享的功能或平台，如角色卡作者声明了不可以在 SillyTavern 之外的软件上导入角色卡，请勿在项目中导入角色卡。
*   禁止任何形式的商业倒卖、SaaS、API 付费接口、二次销售、打包出售、收费分发或其他直接或间接盈利行为。
*   禁止将本项目打包上传任何应用商店。

## 引用项目

1.  表格记忆：`https://github.com/muyoou/st-memory-enhancement`，在此感谢作者的代码分享，请大家多多支持原作者。
2.  mem0：`https://github.com/mem0ai/mem0` 基于 [Apache-2.0 license](https://www.apache.org/licenses/LICENSE-2.0) 许可。
3.  OpenAI-adapter：感谢 hajimi 作者提供测试渠道，项目地址：`https://github.com/wyeeeee/hajimi`。
