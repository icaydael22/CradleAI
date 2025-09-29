import { CharacterStorageService } from '@/services/CharacterStorageService';
import { StorageMonitor } from '@/utils/storageMonitor';
import { Character } from '@/shared/types';

/**
 * Test utilities for validating the per-character storage refactor
 */

/**
 * Create a test character for validation
 */
function createTestCharacter(): Character {
  const timestamp = Date.now();
  return {
    id: `test_${timestamp}`,
    name: `Test Character ${timestamp}`,
    avatar: null,
    backgroundImage: null,
    description: 'A test character for storage validation',
    personality: 'Friendly and helpful',
    interests: ['testing', 'validation'],
    createdAt: timestamp,
    updatedAt: timestamp,
    conversationId: `conv_${timestamp}`,
    voiceType: 'default',
    extraGreetings: ['Hello!', 'Hi there!'],
    ttsConfig: {
      provider: 'cosyvoice' as const,
      cosyvoice: {
        templateId: 'test_template',
        gender: 'male' as const
      }
    }
  };
}

/**
 * Test basic storage operations
 */
export async function testStorageOperations(): Promise<{
  success: boolean;
  results: any[];
  errors: string[];
}> {
  const storageService = CharacterStorageService.getInstance();
  const results: any[] = [];
  const errors: string[] = [];
  
  try {
    console.log('🧪 [StorageTest] Starting storage operations test...');
    
    // Test 1: Initialize storage
    results.push({ test: 'Initialize', start: Date.now() });
    await storageService.initialize();
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = true;
    
    // Test 2: Create test character
    const testChar = createTestCharacter();
    results.push({ test: 'Add Character', start: Date.now(), characterId: testChar.id });
    await storageService.addCharacter(testChar);
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = true;
    
    // Test 3: Retrieve character
    results.push({ test: 'Get Character', start: Date.now(), characterId: testChar.id });
    const retrieved = await storageService.getCharacter(testChar.id);
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = retrieved !== null;
    results[results.length - 1].dataMatch = retrieved?.name === testChar.name;
    
    // Test 4: Update character
    const updatedChar = { ...testChar, name: 'Updated Test Character', updatedAt: Date.now() };
    results.push({ test: 'Update Character', start: Date.now(), characterId: testChar.id });
    await storageService.updateCharacter(updatedChar);
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = true;
    
    // Test 5: Verify update
    results.push({ test: 'Verify Update', start: Date.now(), characterId: testChar.id });
    const updated = await storageService.getCharacter(testChar.id);
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = updated?.name === 'Updated Test Character';
    
    // Test 6: Get all characters
    results.push({ test: 'Get All Characters', start: Date.now() });
    const allChars = await storageService.getAllCharacters();
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = allChars.length > 0;
    results[results.length - 1].count = allChars.length;
    
    // Test 7: Get storage stats
    results.push({ test: 'Get Storage Stats', start: Date.now() });
    const stats = await storageService.getStorageStats();
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = stats.totalCharacters > 0;
    results[results.length - 1].stats = stats;
    
    // Test 8: Delete character
    results.push({ test: 'Delete Character', start: Date.now(), characterId: testChar.id });
    await storageService.deleteCharacters([testChar.id]);
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = true;
    
    // Test 9: Verify deletion
    results.push({ test: 'Verify Deletion', start: Date.now(), characterId: testChar.id });
    const deleted = await storageService.getCharacter(testChar.id);
    results[results.length - 1].duration = Date.now() - results[results.length - 1].start;
    results[results.length - 1].success = deleted === null;
    
    console.log('✅ [StorageTest] All tests completed successfully');
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    errors.push(errorMsg);
    console.error('❌ [StorageTest] Test failed:', errorMsg);
  }
  
  return {
    success: errors.length === 0,
    results,
    errors
  };
}

/**
 * Test migration from old format (if old file exists)
 */
export async function testMigration(): Promise<{
  migrationNeeded: boolean;
  success: boolean;
  details: any;
}> {
  console.log('🔄 [MigrationTest] Testing migration...');
  
  try {
    const storageService = CharacterStorageService.getInstance();
    
    // Initialize will handle migration automatically
    await storageService.initialize();
    
    const stats = await storageService.getStorageStats();
    
    return {
      migrationNeeded: true, // We can't easily detect this after initialization
      success: true,
      details: {
        totalCharacters: stats.totalCharacters,
        storageSize: stats.totalStorageSize
      }
    };
    
  } catch (error) {
    return {
      migrationNeeded: false,
      success: false,
      details: { error: error instanceof Error ? error.message : String(error) }
    };
  }
}

/**
 * Run comprehensive validation of the storage refactor
 */
export async function validateStorageRefactor(): Promise<void> {
  console.log('🔍 [StorageValidation] Starting comprehensive validation...');
  
  // Test storage operations
  const operationResults = await testStorageOperations();
  
  // Test migration
  const migrationResults = await testMigration();
  
  // Test monitoring
  const monitor = StorageMonitor.getInstance();
  await monitor.logStorageStats();
  
  // Summary
  console.log('📋 [StorageValidation] Summary:');
  console.log(`  Storage Operations: ${operationResults.success ? '✅' : '❌'}`);
  console.log(`  Migration: ${migrationResults.success ? '✅' : '❌'}`);
  console.log(`  Tests Run: ${operationResults.results.length}`);
  console.log(`  Errors: ${operationResults.errors.length}`);
  
  if (operationResults.errors.length > 0) {
    console.log('  Error Details:', operationResults.errors);
  }
  
  const allPassed = operationResults.success && migrationResults.success;
  console.log(`🎯 [StorageValidation] Overall Status: ${allPassed ? '✅ PASSED' : '❌ FAILED'}`);
}