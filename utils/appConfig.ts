// 全局应用配置读取工具：在打包后的 APK 中直接从 app.json 的 extra 读取
// 目的：避免依赖 process.env（在生产包中不可用）

// 允许直接导入根目录下的 app.json
// 注意：该导入在 Metro/打包阶段被内联，运行时稳定可用
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import appJson from '@/app.json';

type DiscordExtra = {
  DISCORD_CLIENT_ID?: string;
  DISCORD_REDIRECT_URI?: string;
  AUTH_SERVICE_URL?: string;
};

interface ExtraConfig {
  discord?: DiscordExtra;
  [key: string]: any;
}

export function getExtra(): ExtraConfig {
  const extra = (appJson?.expo?.extra || {}) as ExtraConfig;
  return extra;
}

export function getDiscordConfig(): Required<DiscordExtra> | null {
  const extra = getExtra();
  const discord = (extra.discord || {}) as DiscordExtra;
  const clientId = discord.DISCORD_CLIENT_ID || '';
  const redirect = discord.DISCORD_REDIRECT_URI || '';
  const authUrl = discord.AUTH_SERVICE_URL || '';

  if (!clientId || !redirect || !authUrl) {
    return null;
  }
  return {
    DISCORD_CLIENT_ID: clientId,
    DISCORD_REDIRECT_URI: redirect,
    AUTH_SERVICE_URL: authUrl,
  };
}

export function isDiscordConfigured(): boolean {
  return getDiscordConfig() !== null;
}


