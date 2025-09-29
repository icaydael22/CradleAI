import { useApiProfileStore } from '../stores/app/apiProfileStore';
import { useConfirmStore } from '../stores/ui/confirmStore';
import { useSettingsStore } from '../stores/ui/settingsStore';
import { logger } from './logger';

/**
 * Checks if any valid secondary LLM profile is configured.
 * A profile is considered valid if it has both an API key and a model name.
 * If no valid profiles are found, it prompts the user to configure one.
 */
export async function checkSecondaryLlmConfig() {
  const apiProfileStore = useApiProfileStore();
  const confirmStore = useConfirmStore();
  const settingsStore = useSettingsStore();

  logger('info', 'UI-Checks', 'Checking for any valid secondary LLM API profiles...');
  const hasAnyValidProfile = apiProfileStore.profiles.some(p => p.apiKey && p.model);

  if (!hasAnyValidProfile) {
    logger('warn', 'UI-Checks', 'No valid API profiles found. Prompting user to configure.');
    const userConfirmed = await confirmStore.show(
      '未配置次级LLM',
      '您尚未配置任何有效的次级LLM，建议立即前往设置以启用全部功能。'
    );

    if (userConfirmed) {
      logger('info', 'UI-Checks', 'User confirmed. Opening settings modal to "secondaryLlm" tab.');
      settingsStore.openModal('secondaryLlm');
    } else {
      logger('info', 'UI-Checks', 'User cancelled secondary LLM configuration.');
    }
  } else {
    logger('info', 'UI-Checks', 'Valid secondary LLM API profile found. Check passed.');
  }
}
