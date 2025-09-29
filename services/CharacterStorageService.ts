import * as FileSystem from 'expo-file-system';
import { Character, CradleCharacter } from '@/shared/types';
import { enqueueWrite, safeWriteJson, safeReadJson, ensureDirectory, fileExists } from '@/utils/fileSafeWrite';
import ImageManager from '@/utils/ImageManager';

// Character index entry (lightweight metadata for fast loading)
export interface CharacterIndexEntry {
  id: string;
  name: string;
  avatar: string | null;
  conversationId: string;
  createdAt: number;
  updatedAt: number;
  isSystem?: boolean;
  isArchived?: boolean;
  inCradleSystem?: boolean;
  cradleStatus?: 'growing' | 'mature' | 'ready';
  // Add other frequently accessed lightweight fields
}

export interface CharacterIndex {
  version: string;
  lastUpdated: number;
  characters: CharacterIndexEntry[];
}

export interface MigrationState {
  completed: boolean;
  version: string;
  migratedAt?: number;
  backupPath?: string;
}

/**
 * Service for managing per-character storage with index
 * Structure:
 * - characters/index.json (lightweight index for fast loading)
 * - characters/<id>/meta.json (full character data)
 * - characters/<id>/images/ (character images)
 */
export class CharacterStorageService {
  private static instance: CharacterStorageService;
  
  private readonly baseDir: string;
  private readonly indexPath: string;
  private readonly charactersDir: string;
  private readonly oldCharactersPath: string;
  private readonly migrationStatePath: string;
  
  private cachedIndex: CharacterIndex | null = null;
  
  constructor() {
    this.baseDir = FileSystem.documentDirectory!;
    this.charactersDir = this.baseDir + 'characters/';
    this.indexPath = this.charactersDir + 'index.json';
    this.oldCharactersPath = this.baseDir + 'characters.json';
    this.migrationStatePath = this.baseDir + 'migration_state.json';
  }
  
  static getInstance(): CharacterStorageService {
    if (!CharacterStorageService.instance) {
      CharacterStorageService.instance = new CharacterStorageService();
    }
    return CharacterStorageService.instance;
  }
  
  /**
   * Initialize storage and run migration if needed
   */
  async initialize(): Promise<void> {
    console.log('[CharacterStorage] Initializing storage service...');
    
    // Ensure directories exist
    await ensureDirectory(this.charactersDir);
    
    // Check if migration is needed
    const migrationState = await this.getMigrationState();
    const oldFileExists = await fileExists(this.oldCharactersPath);
    const indexExists = await fileExists(this.indexPath);
    
    if (!migrationState.completed && oldFileExists) {
      console.log('[CharacterStorage] Migration needed from old format');
      await this.migrateFromOldFormat();
    } else if (!indexExists) {
      // Create empty index if none exists
      await this.createEmptyIndex();
    }
    
    // Load index into cache
    await this.loadIndex();
  }
  
  /**
   * Get current migration state
   */
  private async getMigrationState(): Promise<MigrationState> {
    return await safeReadJson(this.migrationStatePath, {
      completed: false,
      version: '1.0.0'
    });
  }
  
  /**
   * Mark migration as completed
   */
  private async setMigrationCompleted(backupPath?: string): Promise<void> {
    const state: MigrationState = {
      completed: true,
      version: '1.0.0',
      migratedAt: Date.now(),
      backupPath
    };
    
    await enqueueWrite(() => safeWriteJson(this.migrationStatePath, state));
  }
  
  /**
   * Create empty index file
   */
  private async createEmptyIndex(): Promise<void> {
    const emptyIndex: CharacterIndex = {
      version: '1.0.0',
      lastUpdated: Date.now(),
      characters: []
    };
    
    await enqueueWrite(() => safeWriteJson(this.indexPath, emptyIndex));
    this.cachedIndex = emptyIndex;
  }
  
  /**
   * Load index from file
   */
  private async loadIndex(): Promise<CharacterIndex> {
    if (!this.cachedIndex) {
      this.cachedIndex = await safeReadJson(this.indexPath, {
        version: '1.0.0',
        lastUpdated: Date.now(),
        characters: []
      });
    }
    return this.cachedIndex;
  }
  
  /**
   * Save index to file
   */
  private async saveIndex(index: CharacterIndex): Promise<void> {
    index.lastUpdated = Date.now();
    await enqueueWrite(() => safeWriteJson(this.indexPath, index));
    this.cachedIndex = index;
  }
  
  /**
   * Get path for character's meta file
   */
  private getCharacterPath(characterId: string): string {
    return `${this.charactersDir}${characterId}/meta.json`;
  }
  
  /**
   * Get path for character's directory
   */
  private getCharacterDir(characterId: string): string {
    return `${this.charactersDir}${characterId}/`;
  }
  
  /**
   * Migrate from old characters.json format
   */
  private async migrateFromOldFormat(): Promise<void> {
    console.log('[CharacterStorage] Starting migration from old format...');
    
    try {
      // Create backup of old file
      const timestamp = Date.now();
      const backupPath = `${this.baseDir}characters_backup_${timestamp}.json`;
      
      const oldData = await safeReadJson<Character[]>(this.oldCharactersPath, []);
      
      if (oldData.length > 0) {
        // Create backup
        await enqueueWrite(() => safeWriteJson(backupPath, oldData));
        console.log(`[CharacterStorage] Created backup at: ${backupPath}`);
        
        // Migrate each character
        const indexEntries: CharacterIndexEntry[] = [];
        
        for (const character of oldData) {
          try {
            await this.saveCharacterData(character);
            
            // Create index entry
            const indexEntry: CharacterIndexEntry = {
              id: character.id,
              name: character.name,
              avatar: character.avatar,
              conversationId: character.conversationId || '',
              createdAt: character.createdAt,
              updatedAt: character.updatedAt,
              isSystem: character.isSystem,
              isArchived: character.isArchived,
              inCradleSystem: character.inCradleSystem,
              cradleStatus: (character as CradleCharacter).cradleStatus
            };
            
            indexEntries.push(indexEntry);
            console.log(`[CharacterStorage] Migrated character: ${character.name} (${character.id})`);
          } catch (error) {
            console.error(`[CharacterStorage] Failed to migrate character ${character.id}:`, error);
          }
        }
        
        // Create new index
        const newIndex: CharacterIndex = {
          version: '1.0.0',
          lastUpdated: Date.now(),
          characters: indexEntries
        };
        
        await this.saveIndex(newIndex);
        
        // Mark migration as completed
        await this.setMigrationCompleted(backupPath);
        
        console.log(`[CharacterStorage] Migration completed. Migrated ${indexEntries.length} characters.`);
      } else {
        // No characters to migrate, just mark as completed
        await this.createEmptyIndex();
        await this.setMigrationCompleted();
        console.log('[CharacterStorage] No characters to migrate, created empty index.');
      }
      
    } catch (error) {
      console.error('[CharacterStorage] Migration failed:', error);
      throw error;
    }
  }
  
  /**
   * Save character data to individual file
   */
  private async saveCharacterData(character: Character): Promise<void> {
    const characterDir = this.getCharacterDir(character.id);
    const characterPath = this.getCharacterPath(character.id);
    
    // Ensure character directory exists
    await ensureDirectory(characterDir);
    
    // Process and save media files separately
    const processedCharacter = await this.processCharacterMedia(character);
    
    // Remove large binary data that should be stored separately
    const slimCharacter = this.slimCharacterForStorage(processedCharacter);
    
    // Save character data
    await enqueueWrite(() => safeWriteJson(characterPath, slimCharacter));
  }
  
  /**
   * Process character media files (avatar, background) and save them as separate files
   * Returns character with file paths instead of data URLs
   */
  private async processCharacterMedia(character: Character): Promise<Character> {
    const processed = { ...character };
    
    try {
      // Process avatar if it's a data URL
      if (processed.avatar && typeof processed.avatar === 'string' && processed.avatar.startsWith('data:')) {
        console.log(`[CharacterStorage] Processing avatar data URL for character ${character.id}`);
        const avatarPath = await ImageManager.saveCharacterAvatar(character.id, processed.avatar);
        processed.avatar = avatarPath;
        console.log(`[CharacterStorage] Saved avatar to: ${avatarPath}`);
      }
      
      // Process background image if it's a data URL
      const backgroundImage = (processed as any).backgroundImage;
      if (backgroundImage && typeof backgroundImage === 'string' && backgroundImage.startsWith('data:')) {
        console.log(`[CharacterStorage] Processing background data URL for character ${character.id}`);
        const backgroundPath = await ImageManager.saveCharacterBackground(character.id, backgroundImage);
        (processed as any).backgroundImage = backgroundPath;
        console.log(`[CharacterStorage] Saved background to: ${backgroundPath}`);
      }
    } catch (error) {
      console.error(`[CharacterStorage] Failed to process media for character ${character.id}:`, error);
      // If media processing fails, continue with original character data
      // The slimCharacterForStorage will handle removing data URLs as fallback
    }
    
    return processed;
  }
  
  /**
   * Remove large binary data from character object before storage
   */
  private slimCharacterForStorage(character: Character): Character {
    const slimmed = { ...character };
    
    // Remove large base64 data from image history
    if (slimmed.imageHistory && Array.isArray(slimmed.imageHistory)) {
      slimmed.imageHistory = slimmed.imageHistory.map(img => {
        const slimImg = { ...img };
        // Keep metadata but remove large binary data
        delete slimImg.data; // Remove base64 data
        delete slimImg.localAsset; // Remove local asset paths if they're large
        return slimImg;
      });
    }
    
    // Remove other potentially large fields
    if (slimmed.messages && Array.isArray(slimmed.messages) && slimmed.messages.length > 10) {
      // Keep only recent messages in character metadata
      slimmed.messages = slimmed.messages.slice(-10);
    }
    
    // Prevent storing large base64/data URLs in avatar or backgroundImage fields
    // (script imports currently set character.avatar/backgroundImage to data URLs)
    const isDataUrl = (v: any) => typeof v === 'string' && v.startsWith('data:');
    try {
      if (isDataUrl(slimmed.avatar)) {
        slimmed.avatar = null; // drop inline base64 avatars to keep meta.json small
      }
    } catch (e) {
      // ignore
    }

    try {
      if (isDataUrl((slimmed as any).backgroundImage)) {
        (slimmed as any).backgroundImage = null;
      }
    } catch (e) {
      // ignore
    }

    return slimmed;
  }
  
  /**
   * Get all characters (index entries only for performance)
   */
  async getAllCharacterEntries(): Promise<CharacterIndexEntry[]> {
    const index = await this.loadIndex();
    return index.characters;
  }
  
  /**
   * Get full character data
   */
  async getCharacter(characterId: string): Promise<Character | null> {
    try {
      const characterPath = this.getCharacterPath(characterId);
      const character = await safeReadJson<Character | null>(characterPath, null);
      return character;
    } catch (error) {
      console.error(`[CharacterStorage] Failed to load character ${characterId}:`, error);
      return null;
    }
  }
  
  /**
   * Get multiple characters
   */
  async getCharacters(characterIds: string[]): Promise<Character[]> {
    const characters: Character[] = [];
    
    for (const id of characterIds) {
      const character = await this.getCharacter(id);
      if (character) {
        characters.push(character);
      }
    }
    
    return characters;
  }
  
  /**
   * Get all characters (full data)
   */
  async getAllCharacters(): Promise<Character[]> {
    const index = await this.loadIndex();
    const characterIds = index.characters.map(entry => entry.id);
    return await this.getCharacters(characterIds);
  }
  
  /**
   * Add new character
   */
  async addCharacter(character: Character): Promise<void> {
    console.log(`[CharacterStorage] Adding character: ${character.name} (${character.id})`);
    
    // Check if character already exists
    const index = await this.loadIndex();
    const exists = index.characters.some(entry => entry.id === character.id);
    
    if (exists) {
      throw new Error(`Character with ID ${character.id} already exists`);
    }
    
    // Save character data
    await this.saveCharacterData(character);
    
    // Update index
    const indexEntry: CharacterIndexEntry = {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      conversationId: character.conversationId || '',
      createdAt: character.createdAt,
      updatedAt: character.updatedAt,
      isSystem: character.isSystem,
      isArchived: character.isArchived,
      inCradleSystem: character.inCradleSystem,
      cradleStatus: (character as CradleCharacter).cradleStatus
    };
    
    const updatedIndex = {
      ...index,
      characters: [...index.characters, indexEntry]
    };
    
    await this.saveIndex(updatedIndex);
    
    console.log(`[CharacterStorage] Successfully added character: ${character.name}`);
  }
  
  /**
   * Update existing character
   */
  async updateCharacter(character: Character): Promise<void> {
    console.log(`[CharacterStorage] Updating character: ${character.name} (${character.id})`);
    
    // Save character data
    await this.saveCharacterData(character);
    
    // Update index entry
    const index = await this.loadIndex();
    const updatedCharacters = index.characters.map(entry => {
      if (entry.id === character.id) {
        return {
          ...entry,
          name: character.name,
          avatar: character.avatar,
          conversationId: character.conversationId || entry.conversationId,
          updatedAt: character.updatedAt,
          isSystem: character.isSystem,
          isArchived: character.isArchived,
          inCradleSystem: character.inCradleSystem,
          cradleStatus: (character as CradleCharacter).cradleStatus
        };
      }
      return entry;
    });
    
    const updatedIndex = {
      ...index,
      characters: updatedCharacters
    };
    
    await this.saveIndex(updatedIndex);
    
    console.log(`[CharacterStorage] Successfully updated character: ${character.name}`);
  }
  
  /**
   * Delete characters
   */
  async deleteCharacters(characterIds: string[]): Promise<void> {
    console.log(`[CharacterStorage] Deleting characters: ${characterIds.join(', ')}`);
    
    // Delete character directories
    for (const id of characterIds) {
      try {
        const characterDir = this.getCharacterDir(id);
        await FileSystem.deleteAsync(characterDir, { idempotent: true });
        console.log(`[CharacterStorage] Deleted directory for character: ${id}`);
      } catch (error) {
        console.error(`[CharacterStorage] Failed to delete directory for character ${id}:`, error);
      }
    }
    
    // Update index
    const index = await this.loadIndex();
    const updatedCharacters = index.characters.filter(entry => !characterIds.includes(entry.id));
    
    const updatedIndex = {
      ...index,
      characters: updatedCharacters
    };
    
    await this.saveIndex(updatedIndex);
    
    console.log(`[CharacterStorage] Successfully deleted ${characterIds.length} characters from index`);
  }
  
  /**
   * Update specific field for character (useful for partial updates)
   */
  async updateCharacterField(characterId: string, field: keyof Character, value: any): Promise<void> {
    const character = await this.getCharacter(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }
    
    const updatedCharacter = {
      ...character,
      [field]: value,
      updatedAt: Date.now()
    };
    
    await this.updateCharacter(updatedCharacter);
  }
  
  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{
    totalCharacters: number;
    indexSize: number;
    totalStorageSize: number;
    averageCharacterSize: number;
  }> {
    const index = await this.loadIndex();
    
    // Get index file size
    const indexInfo = await FileSystem.getInfoAsync(this.indexPath);
    const indexSize = indexInfo.exists ? indexInfo.size || 0 : 0;
    
    // Get total storage size (approximate)
    let totalStorageSize = indexSize;
    let characterSizes: number[] = [];
    
    for (const entry of index.characters) {
      try {
        const characterPath = this.getCharacterPath(entry.id);
        const info = await FileSystem.getInfoAsync(characterPath);
        if (info.exists) {
          const size = info.size || 0;
          characterSizes.push(size);
          totalStorageSize += size;
        }
      } catch (error) {
        // Ignore errors for individual files
      }
    }
    
    const averageCharacterSize = characterSizes.length > 0 
      ? characterSizes.reduce((a, b) => a + b, 0) / characterSizes.length 
      : 0;
    
    return {
      totalCharacters: index.characters.length,
      indexSize,
      totalStorageSize,
      averageCharacterSize
    };
  }
}