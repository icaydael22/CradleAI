export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar?: string;
  email?: string;
  roles: string[];
}

export interface DiscordAuthResult {
  success: boolean;
  token?: string;
  user?: DiscordUser;
  error?: string;
}

export interface DiscordOAuthMessage {
  type: 'DISCORD_AUTH_RESULT';
  success: boolean;
  token?: string;
  user?: DiscordUser;
  error?: string;
}
