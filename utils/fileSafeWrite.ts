import * as FileSystem from 'expo-file-system';

// Queue to serialize all write operations and prevent race conditions
let writeQueue: Promise<any> = Promise.resolve();

/**
 * Enqueue a write operation to prevent concurrent file writes
 * All file writes will be executed sequentially to avoid data corruption
 */
export function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const currentWrite = writeQueue.then(fn).catch(err => {
    console.error('[enqueueWrite] Write operation failed:', err);
    throw err; // Re-throw to maintain error handling
  });
  
  // Update queue but don't block on errors
  writeQueue = currentWrite.catch(() => {});
  
  return currentWrite;
}

/**
 * Safely write JSON data to a file using atomic write (temp file + move)
 * This prevents file corruption if the write is interrupted
 */
export async function safeWriteJson(filePath: string, data: any): Promise<void> {
  const tmpPath = filePath + '.tmp';
  
  try {
    // 1. Write to temporary file
    const jsonString = JSON.stringify(data, null, 2);
    await FileSystem.writeAsStringAsync(tmpPath, jsonString, { 
      encoding: FileSystem.EncodingType.UTF8 
    });
    
    // 2. Verify the temp file was written correctly
    const written = await FileSystem.readAsStringAsync(tmpPath);
    const parsed = JSON.parse(written);
    
    // 3. Atomic move - delete target first if it exists (expo-file-system requirement)
    try {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    } catch (e) {
      // File might not exist, continue
    }
    
    // 4. Move temp file to target location
    await FileSystem.moveAsync({ from: tmpPath, to: filePath });
    
  } catch (error) {
    // Clean up temp file on error
    try {
      await FileSystem.deleteAsync(tmpPath, { idempotent: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Safely read JSON data from a file with error handling
 */
export async function safeReadJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8
    });
    return JSON.parse(content);
  } catch (error) {
    console.warn(`[safeReadJson] Failed to read ${filePath}, using default:`, error);
    return defaultValue;
  }
}

/**
 * Read JSON with a maximum size guard to avoid OOM on platforms with limited memory.
 * If the file exceeds maxSizeBytes, the function will log a warning and return the default value.
 */
export async function safeReadJsonWithLimit<T>(filePath: string, defaultValue: T, maxSizeBytes: number = 5 * 1024 * 1024): Promise<T> {
  try {
    // Check file size first to avoid loading very large files into memory
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists) {
      return defaultValue;
    }

    // If size is unknown, we still attempt to read but be conservative
    const size = typeof info.size === 'number' ? info.size : -1;
    if (size > 0 && size > maxSizeBytes) {
      console.warn(`[safeReadJsonWithLimit] File ${filePath} is too large (${size} bytes), limit ${maxSizeBytes} bytes. Skipping read and returning default.`);
      return defaultValue;
    }

    // Fallback: if size wasn't provided (-1) we still attempt but wrap in try/catch
    const content = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
    // Extra safety: if the string length indicates a very large payload, bail out
    if (content.length > maxSizeBytes * 2) {
      // content length is in chars; UTF-8 may differ but this is a heuristic
      console.warn(`[safeReadJsonWithLimit] Content for ${filePath} appears very large (chars: ${content.length}), limit heuristics triggered. Returning default.`);
      return defaultValue;
    }

    return JSON.parse(content);
  } catch (error) {
    // If the underlying read failed due to OOM or other reasons, log and return default
    console.warn(`[safeReadJsonWithLimit] Failed to read ${filePath} (or parsing error), using default:`, error);
    return defaultValue;
  }
}

/**
 * Create directory if it doesn't exist
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(dirPath);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
    }
  } catch (error) {
    console.error('[ensureDirectory] Failed to create directory:', error);
    throw error;
  }
}

/**
 * Get file size in bytes
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists ? info.size || 0 : 0;
  } catch (error) {
    return 0;
  }
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists;
  } catch (error) {
    return false;
  }
}