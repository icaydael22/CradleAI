import React from 'react';
import { View, StyleSheet, ScrollView, Text, SafeAreaView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';

const TTS_ENHANCER_GUIDE = `
# 语音增强功能 (TTS Enhancer) 指南

语音增强功能使用AI模型自动添加语气、情感和韵律标记，使语音输出更加自然、生动和富有表现力。

## 工作原理

语音增强功能通过以下步骤改进语音体验：

1. 当用户点击语音按钮时，系统会先检查语音增强功能是否启用
2. 如果启用，系统会将原始文本发送给选定的AI模型进行处理
3. AI模型会分析文本内容，添加适当的语气标记和生成情感指导
4. 处理后的文本和指导语一起发送到语音生成服务
5. 语音生成服务使用这些增强信息创建更自然、更有表现力的语音

## 语气标记类型

语音增强支持以下语气标记：

- **\`<laughter></laughter>\`**: 包裹一段文本，表示这段文本中包含笑声
  - 示例：\`<laughter>这真是太有趣了</laughter>\`
  
- **\`<strong></strong>\`**: 包裹需要强调的词语
  - 示例：\`我<strong>非常</strong>喜欢这个想法\`
  
- **\`[breath]\`**: 插入在适当位置，表示换气声，通常在句子末尾
  - 示例：\`我刚刚跑完步[breath]，感觉好累啊\`

## 情感指导

除了语气标记，系统还会生成情感指导，可能包括：

- **情感描述词**：如"神秘"、"好奇"、"优雅"、"嘲讽"等
- **模仿指导**：如"模仿机器人风格"、"模仿小猪佩奇的语气"等
- **身份描述**：如"一个天真烂漫的小孩，总是充满幻想和无尽的好奇心"

## 可用模型

在设置中，您可以选择不同的AI模型来生成语音增强：

- **Claude Instant**：快速响应，高质量结果
- **GPT-3.5 Turbo**：全能型模型
- **Llama 3 8B**：本地支持的开源选项
- **Mistral 7B**：开源支持的高性能模型

## 最佳实践

- **中等长度文本效果最佳**：几句到一段文字的长度最适合增强处理
- **观察模式间差异**：不同的AI模型会生成不同风格的增强，可以尝试找到最适合特定角色的模型
- **启用消息通知**：启用消息通知可以在语音生成完成时收到提醒

## 注意事项

- 启用语音增强会略微增加语音生成时间
- 增强语音按钮会显示金色标记，表示启用了增强功能
- 如果语音增强处理失败，系统会自动回退到使用原始文本生成语音
`;

export default function TTSEnhancerGuidePage() {
  const router = useRouter();
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>语音增强功能指南</Text>
      </View>
      
      <ScrollView style={styles.scrollView}>
        <View style={styles.contentContainer}>
          <Markdown
            style={{
              body: { color: '#fff', fontSize: 16, lineHeight: 24 },
              heading1: { color: 'rgb(255, 224, 195)', fontSize: 24, fontWeight: 'bold', marginBottom: 16, marginTop: 24 },
              heading2: { color: 'rgb(255, 224, 195)', fontSize: 20, fontWeight: 'bold', marginBottom: 12, marginTop: 24 },
              heading3: { color: 'rgb(255, 224, 195)', fontSize: 18, fontWeight: 'bold', marginBottom: 10, marginTop: 20 },
              paragraph: { marginBottom: 16 },
              list_item: { marginBottom: 8 },
              bullet_list: { marginBottom: 16 },
              ordered_list: { marginBottom: 16 },
              code_inline: { backgroundColor: 'rgba(255, 224, 195, 0.1)', color: 'rgb(255, 224, 195)', padding: 4, borderRadius: 4 },
              code_block: { backgroundColor: 'rgba(0, 0, 0, 0.3)', padding: 12, borderRadius: 8, marginVertical: 12 },
              blockquote: { borderLeftColor: 'rgb(255, 224, 195)', borderLeftWidth: 4, paddingLeft: 12, opacity: 0.8 },
              hr: { backgroundColor: 'rgba(255, 255, 255, 0.2)', height: 1, marginVertical: 16 }
            }}
          >
            {TTS_ENHANCER_GUIDE}
          </Markdown>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'rgb(255, 224, 195)',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
});
