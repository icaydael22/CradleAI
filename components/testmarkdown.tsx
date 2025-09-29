import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform } from 'react-native';

const markdownCases = [
  {
    label: '标题',
    value: `# 一级标题 (H1)\n## 二级标题 (H2)\n### 三级标题 (H3)\n`,
  },
  {
    label: '段落与换行',
    value: `这是一个段落。\n\n这是另一个段落。  \n在上一行行尾有两个空格，强制换行。`,
  },
  {
    label: '强调',
    value: `**加粗**\n*斜体*\n~~删除线~~`,
  },
  {
    label: '无序/有序/嵌套列表',
    value: `* 项目1\n* 项目2\n  * 子项1\n  * 子项2\n1. 第一项\n2. 第二项\n   1. 子项1\n   2. 子项2`,
  },
  {
    label: '链接与图片',
    value: `[访问 Google](https://www.google.com "Google 的主页")\n\n![Markdown Logo](https://markdown-here.com/img/icon256.png "Markdown Logo")`,
  },
  {
    label: '引用',
    value: `> 这是一个引用块。\n> > 这是嵌套在引用中的引用。`,
  },
  {
    label: '代码块',
    value: '```python\ndef hello_world():\n    print("Hello, world!")\n```',
  },
  {
    label: '表格',
    value: `| 列1 | 列2 | 列3 |\n|---|---|---|\n| 数据1 | 数据2 | 数据3 |\n| 数据4 | 数据5 | 数据6 |`,
  },
  {
    label: '任务列表',
    value: `- [ ] 待完成的任务\n- [x] 已完成的任务`,
  },
  {
    label: '全部语法',
    value: `# 一级标题\n\n**加粗** *斜体* ~~删除线~~\n\n1. 有序项\n2. 有序项\n   - 嵌套无序\n\n> 引用\n\n\`\`\`js\nconsole.log("代码块");\n\`\`\`\n\n[链接](https://www.example.com)\n\n| 表头1 | 表头2 |\n|---|---|\n| 单元格1 | 单元格2 |\n\n- [ ] 任务1\n- [x] 任务2\n\n![图片](https://markdown-here.com/img/icon256.png)`,
  },
  {
    label: '全部语法（连贯文本）',
    value: `
# Markdown 语法综合测试

这是一个包含 **加粗**、*斜体*、~~删除线~~ 的段落。

1. 有序列表项一
2. 有序列表项二
   - 嵌套无序项 *斜体* **加粗**
   - [Google](https://www.google.com)

> 这是一个引用块，包含 \`行内代码\` 和图片：
>
> ![Logo](https://markdown-here.com/img/icon256.png "Logo")

---

| 表头1 | 表头2 | 表头3 |
|:---|:---:|---:|
| 左对齐 | 居中 | 右对齐 |
| **粗体** | *斜体* | ~~删除线~~ |

- [ ] 任务未完成
- [x] 任务已完成

\`\`\`js
// 代码块示例
function test() {
  console.log("Hello, Markdown!");
}
\`\`\`
`,
  },
];

interface TestMarkdownProps {
  onSendMessage: (text: string, sender: 'user' | 'bot', isLoading?: boolean, metadata?: Record<string, any>) => void;
}

const TestMarkdown: React.FC<TestMarkdownProps> = ({ onSendMessage }) => {
  const [selected, setSelected] = useState<number | null>(null);

  const handleSend = () => {
    if (selected === null) {
      Alert.alert('请选择一个 Markdown 测试用例');
      return;
    }
    const text = markdownCases[selected].value;
    onSendMessage(text, 'bot');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Markdown 测试工具</Text>
      <ScrollView style={styles.list}>
        {markdownCases.map((item, idx) => (
          <TouchableOpacity
            key={item.label}
            style={[
              styles.caseButton,
              selected === idx && styles.caseButtonSelected,
            ]}
            onPress={() => setSelected(idx)}
          >
            <Text style={styles.caseLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.sendButton} onPress={handleSend}>
        <Text style={styles.sendButtonText}>发送到对话窗口 (bot)</Text>
      </TouchableOpacity>
      {selected !== null && (
        <ScrollView style={styles.preview}>
          <Text style={styles.previewTitle}>预览内容：</Text>
          <Text style={styles.previewText}>{markdownCases[selected].value}</Text>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#222',
    padding: 16,
    borderRadius: 12,
    margin: 20,
    elevation: 8,
    maxHeight: 480,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginBottom: 12,
    textAlign: 'center',
  },
  list: {
    maxHeight: 160,
    marginBottom: 10,
  },
  caseButton: {
    padding: 10,
    backgroundColor: '#333',
    borderRadius: 8,
    marginBottom: 6,
  },
  caseButtonSelected: {
    backgroundColor: '#3498db',
  },
  caseLabel: {
    color: '#fff',
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: '#27ae60',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 8,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  preview: {
    backgroundColor: '#181818',
    borderRadius: 8,
    marginTop: 10,
    padding: 10,
    maxHeight: 120,
  },
  previewTitle: {
    color: '#bbb',
    fontSize: 13,
    marginBottom: 4,
  },
  previewText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

export default TestMarkdown;
