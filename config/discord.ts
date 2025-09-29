export const DISCORD_CONFIG = {
  CLIENT_ID: process.env.EXPO_PUBLIC_DISCORD_CLIENT_ID || '您的Discord应用CLIENT_ID',
  REDIRECT_URI: process.env.EXPO_PUBLIC_DISCORD_REDIRECT_URI || 'https://your-auth-service.com/auth/discord/callback',
  AUTH_SERVICE_BASE_URL: process.env.EXPO_PUBLIC_AUTH_SERVICE_URL || 'https://your-auth-service.com',
  SCOPES: ['identify', 'guilds'],
  
  // Discord OAuth2 URLs
  OAUTH2_BASE_URL: 'https://discord.com/api/oauth2/authorize',
  
  // Deep link scheme (matches app.json scheme)
  DEEP_LINK_SCHEME: 'cradleapp://auth',
};

export const buildDiscordAuthUrl = (): string => {
  const params = new URLSearchParams({
    client_id: DISCORD_CONFIG.CLIENT_ID,
    redirect_uri: DISCORD_CONFIG.REDIRECT_URI,
    response_type: 'code',
    scope: DISCORD_CONFIG.SCOPES.join(' '),
    prompt: 'none', // 静默授权，如果用户已授权过
    state: Math.random().toString(36).substring(7), // 防CSRF
  });

  return `${DISCORD_CONFIG.OAUTH2_BASE_URL}?${params.toString()}`;
};
