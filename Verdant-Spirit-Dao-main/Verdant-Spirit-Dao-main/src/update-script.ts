import toastr from 'toastr';
import _ from 'lodash';

// 根据用户说明，我们假定这些与酒馆助手交互的函数是全局可用的
declare function updateTavernRegexesWith(updater: (regexes: any[]) => any[]): Promise<any[]>;
declare function replaceWorldbook(name: string, entries: any[]): Promise<void>;

/**
 * 定义世界书文件的数据结构类型
 */
interface WorldbookFile {
    entries: {
        [key: string]: any;
    };
}

/**
 * 处理从远程（如GitHub）获取的文件更新。
 * 根据文件路径判断文件类型，并调用相应的更新函数。
 *
 * @param filePath 文件的来源路径 (例如, 'src/folder/regex-name.json')。
 * @param fileContent 文件的字符串内容。
 */
export async function processFileUpdate(filePath: string, fileContent: string): Promise<void> {
    try {
        // 根据文件名判断是正则文件还是世界书文件
        if (filePath.includes('regex-')) {
            await updateRegex(filePath, fileContent);
        } else if (filePath.endsWith('什么？我要在玄幻修仙世界种田？.json')) {
            await updateWorldbook(filePath, fileContent);
        } else {
            console.warn(`跳过不支持的自动更新文件类型: ${filePath}`);
        }
    } catch (error: any) {
        console.error(`处理文件更新失败 ${filePath}:`, error);
        toastr.error(`处理文件更新失败: ${filePath}. 错误: ${error.message}`);
    }
}

/**
 * 更新酒馆的正则表达式脚本。
 * 使用 `updateTavernRegexesWith` 函数来确保安全和正确的更新。
 *
 * @param filePath 正则表达式JSON文件的路径。
 * @param fileContent 正则表达式JSON文件的内容。
 */
async function updateRegex(filePath: string, fileContent: string): Promise<void> {
    console.log(`尝试从 ${filePath} 更新正则表达式`);
    const newRegexData = JSON.parse(fileContent);

    if (!newRegexData.scriptName) {
        throw new Error(`正则表达式文件 ${filePath} 缺少 'scriptName' 字段。`);
    }

    await updateTavernRegexesWith((existingRegexes) => {
        const entryIndex = existingRegexes.findIndex(
            (regex) => regex.script_name === newRegexData.scriptName
        );

        if (entryIndex !== -1) {
            // 如果找到了同名正则，则更新它
            // 注意：我们需要将新数据中的字段映射到酒馆正则的字段
            existingRegexes[entryIndex] = {
                ...existingRegexes[entryIndex], // 保留原有ID等信息
                find_regex: newRegexData.findRegex,
                replace_string: newRegexData.replaceString,
                enabled: !newRegexData.disabled, // JSON中的disabled与酒馆中的enabled相反
                // 其他字段可以根据需要从 newRegexData 中添加
            };
            console.log(`找到并更新了正则表达式: ${newRegexData.scriptName}`);
        } else {
            // 如果没有找到，则添加为新的正则表达式
            // 注意：这里需要构建一个完整的 TavernRegex 对象
            const newTavernRegex = {
                id: _.uniqueId('tavern-regex-'), // 创建一个唯一的ID
                script_name: newRegexData.scriptName,
                enabled: !newRegexData.disabled,
                run_on_edit: newRegexData.runOnEdit || false,
                scope: "character", // 默认为角色正则
                find_regex: newRegexData.findRegex,
                replace_string: newRegexData.replaceString,
                source: {
                    user_input: true,
                    ai_output: true,
                    slash_command: true,
                    world_info: true,
                },
                destination: {
                    display: true,
                    prompt: true,
                },
                min_depth: newRegexData.minDepth || null,
                max_depth: newRegexData.maxDepth || null,
            };
            existingRegexes.push(newTavernRegex);
            console.log(`添加了新的正则表达式: ${newRegexData.scriptName}`);
        }
        return existingRegexes;
    });
    
    toastr.success(`正则表达式 '${newRegexData.scriptName}' 已更新。`);
    console.log(`成功更新正则表达式: ${newRegexData.scriptName}`);
}

/**
 * 从JSON文件更新世界书。
 * 使用酒馆助手提供的 `replaceWorldbook` 函数。
 *
 * @param filePath 世界书JSON文件的路径。
 * @param fileContent 世界书JSON文件的内容。
 */
async function updateWorldbook(filePath: string, fileContent:string): Promise<void> {
    console.log(`尝试从 ${filePath} 更新世界书`);
    // 从文件路径中提取世界书的名称
    const bookName = filePath.split(/[\\/]/).pop()?.replace('.json', '');

    if (!bookName) {
        throw new Error(`无法从路径中确定世界书名称: ${filePath}`);
    }

    const worldbookFile: WorldbookFile = JSON.parse(fileContent);

    if (!worldbookFile.entries || typeof worldbookFile.entries !== 'object') {
        throw new Error(`无效的世界书格式 ${filePath}. 缺少或无效的 'entries' 属性。`);
    }

    // 将 entries 对象转换为数组，以适配酒馆助手函数的要求
    const entriesArray = Object.values(worldbookFile.entries);

    await replaceWorldbook(bookName, entriesArray);

    toastr.success(`世界书 '${bookName}' 已更新。`);
    console.log(`成功更新世界书: ${bookName}`);
}
