# ImageRegenerationModal 插件系统集成指南

本指南说明如何将插件系统集成到现有的 ImageRegenerationModal 组件中，实现图片生成逻辑的插件化。

---

## 步骤 1：引入插件相关依赖

```tsx
import { usePlugins, createImageGenerationAdapter, ImageGenerationParams } from '@/plugins';
```

---

## 步骤 2：在组件中添加插件相关状态

```tsx
const [activePluginId, setActivePluginId] = useState<string | null>(null);
const { plugins, isLoading: pluginsLoading } = usePlugins();

const imageGenerationPlugins = useMemo(() => {
  return plugins.filter(plugin =>
    plugin.status === 'installed' &&
    plugin.metadata.supportedModalities?.includes('image') &&
    plugin.metadata.capabilities?.includes('generate')
  );
}, [plugins]);

const pluginAdapter = useMemo(() => {
  if (!activePluginId) return null;
  return createImageGenerationAdapter(activePluginId)();
}, [activePluginId]);

useEffect(() => {
  const loadPreferredPlugin = async () => {
    try {
      const stored = await AsyncStorage.getItem('preferred_image_generator');
      if (stored && imageGenerationPlugins.some(p => p.metadata.id === stored)) {
        setActivePluginId(stored);
      } else if (imageGenerationPlugins.length > 0) {
        setActivePluginId(imageGenerationPlugins[0].metadata.id);
      }
    } catch (error) {
      console.error('加载首选插件失败:', error);
    }
  };
  if (imageGenerationPlugins.length > 0) {
    loadPreferredPlugin();
  }
}, [imageGenerationPlugins]);
```

---

## 步骤 3：实现插件选择器 UI

```tsx
const renderPluginSelector = () => (
  <View style={styles.pluginSelectorContainer}>
    <Text style={styles.pluginSelectorLabel}>图片生成插件:</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {imageGenerationPlugins.map(plugin => (
        <TouchableOpacity
          key={plugin.metadata.id}
          style={[
            styles.pluginOption,
            activePluginId === plugin.metadata.id && styles.selectedPluginOption
          ]}
          onPress={() => {
            setActivePluginId(plugin.metadata.id);
            AsyncStorage.setItem('preferred_image_generator', plugin.metadata.id);
          }}
        >
          <Text style={[
            styles.pluginOptionText,
            activePluginId === plugin.metadata.id && styles.selectedPluginOptionText
          ]}>
            {plugin.metadata.name}
          </Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity
        style={styles.managePluginsButton}
        onPress={() => {
          // 跳转到插件管理页面
          navigation.navigate('PluginManager');
        }}
      >
        <Ionicons name="extension-puzzle" size={16} color="#ddd" />
        <Text style={styles.managePluginsText}>管理</Text>
      </TouchableOpacity>
    </ScrollView>
  </View>
);
```

---

## 步骤 4：在生成流程中调用插件

```tsx
const submitImageGeneration = async () => {
  if ((positiveTags.length === 0 && characterTags.length === 0)) {
    Alert.alert('无法生成', '请至少添加一个正面标签或角色标签');
    return;
  }
  abortRef.current.aborted = false;
  setIsLoading(true);
  setError(null);
  setPreviewImageUrl(null);
  setProgressMessage('正在准备生成...');

  try {
    // 若选择了插件，则通过插件生成
    if (activePluginId && pluginAdapter) {
      const pluginParams = {
        width: generationSettings.width,
        height: generationSettings.height,
        positiveTags,
        negativeTags,
        characterTags,
        artistPrompt: selectedArtistPrompt,
        seed: imageProvider === 'novelai' ? novelaiSettings.seed : undefined,
        steps: imageProvider === 'novelai' ? novelaiSettings.steps : animagine4Settings.steps,
        characterPrompts: characterPrompts,
        novelaiSettings: imageProvider === 'novelai' ? novelaiSettings : undefined,
        animagine4Settings: imageProvider === 'animagine4' ? animagine4Settings : undefined
      };

      // 调用插件生成图片
      const result = await pluginAdapter.generateImage(pluginParams);

      if (result) {
        setGeneratedSeed(result.seed);
        setPreviewImageUrl(result.url);
        setGeneratedImageUrl(result.url);
        setIsLoading(false);
        setProgressMessage(null);
      } else {
        setError('插件生成图片失败');
        setIsLoading(false);
      }
    } else {
      // 未选择插件时，走原有逻辑
      if (imageProvider === 'novelai') {
        await generateWithNovelAI();
      } else {
        await generateWithAnimagine4();
      }
    }
  } catch (error) {
    console.error('[图片重生成] 生成失败:', error);
    setError(error instanceof Error ? error.message : '生成图像失败');
    setIsLoading(false);
  }
};
```

---

## 步骤 5：其它建议

- 可将插件选择器集成到设置页或生成页顶部，方便用户切换。
- 插件管理页面可通过 `<PluginManager />` 组件实现插件的安装、卸载、更新等操作。
- 插件参数与主应用参数的适配可通过适配器（adapter）模式实现，便于后续扩展。

---

## 总结

通过上述步骤，ImageRegenerationModal 组件即可支持插件化图片生成，后续可灵活扩展更多图片生成插件，甚至支持多模态（音频、视频、文本）插件。