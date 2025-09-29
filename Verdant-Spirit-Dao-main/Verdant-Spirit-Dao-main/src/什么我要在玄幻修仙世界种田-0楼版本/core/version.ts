import { processFileUpdate } from './update-script';
declare const marked: any;

// 请将这里的 URL 替换为你的 GitHub 仓库的 Raw 地址
const GITHUB_REPO_RAW_URL = 'https://raw.githubusercontent.com/HerSophia/Verdant-Spirit-Dao/main/';

// 当前版本号，需要与 version.json 保持一致
export const LOCAL_VERSION = 'v1.0.0-beta';

interface UpdateInfo {
  hasUpdate: boolean;
  remoteVersion: string;
  changelogHtml: string | null;
  filesToUpdate?: string[];
}

/**
 * 检查是否有新版本并获取更新日志
 * @returns {Promise<UpdateInfo | null>}
 */
/**
 * 仅从远程获取并解析更新日志。
 * @returns {Promise<string>} 返回HTML格式的更新日志。
 */
export async function getChangelog(): Promise<string> {
  try {
    const changelogResponse = await fetch(`${GITHUB_REPO_RAW_URL}changlog.md`);
    if (changelogResponse.ok) {
      const changelogMd = await changelogResponse.text();
      return marked.parse(changelogMd) as string;
    }
    return '<p>无法加载更新日志。</p>';
  } catch (e) {
    console.error("获取更新日志失败:", e);
    toastr.error('获取更新日志失败，请查看控制台。');
    return '<p>获取更新日志失败。</p>';
  }
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    // 从 GitHub 获取最新的 version.json
    const versionResponse = await fetch(`${GITHUB_REPO_RAW_URL}version.json`);
    if (!versionResponse.ok) {
      throw new Error(`无法获取 version.json: ${versionResponse.statusText}`);
    }
    const versionData = await versionResponse.json();
    const remoteVersion = `v${versionData.version}`;

    const hasUpdate = remoteVersion.localeCompare(LOCAL_VERSION, undefined, { numeric: true, sensitivity: 'base' }) > 0;

    const changelogHtml = await getChangelog();

    let filesToUpdate: string[] | undefined = undefined;
    if (hasUpdate) {
      filesToUpdate = versionData.files_to_update || [];
    }

    return {
      hasUpdate,
      remoteVersion,
      changelogHtml,
      filesToUpdate,
    };
  } catch (error) {
    console.error('检查更新失败:', error);
    toastr.error('检查更新失败，请查看控制台获取更多信息。');
    return null;
  }
}

/**
 * 从远程仓库获取并更新角色卡相关文件。
 * @param {string[]} filesToUpdate - 需要更新的文件路径列表。
 */
export async function updateCardFiles(filesToUpdate: string[]): Promise<void> {
    toastr.info(`开始更新 ${filesToUpdate.length} 个文件...`);
    
    for (const filePath of filesToUpdate) {
        try {
            const response = await fetch(`${GITHUB_REPO_RAW_URL}${filePath}`);
            if (!response.ok) {
                throw new Error(`下载文件失败 ${filePath}: ${response.statusText}`);
            }
            const fileContent = await response.text();
            await processFileUpdate(filePath, fileContent);
        } catch (error: any) {
            console.error(`更新文件 ${filePath} 失败:`, error);
            toastr.error(`更新文件 ${filePath} 失败: ${error.message}`);
            // 选择继续更新其他文件，而不是中断整个过程
        }
    }
}
