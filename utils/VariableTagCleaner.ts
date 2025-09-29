/**
 * VariableTagCleaner - Utility for cleaning Variables tags and splitting text into paragraphs
 * 
 * This module provides functions to:
 * 1. Remove <Variables>...</Variables> tags and their content from text
 * 2. Split text into paragraphs based on double newlines or HTML <p> tags
 * 3. Generate cache keys for render optimization
 */

import { Message } from '@/shared/types';

/**
 * Removes all <Variables>...</Variables> tags and their content from the input text
 * Uses non-greedy matching to handle multiple Variables blocks safely
 * 
 * @param text - The input text that may contain Variables tags
 * @returns Cleaned text with Variables tags removed
 */
export function cleanVariablesFromText(text: string): string {
  if (!text) return '';
  
  // Use non-greedy matching with case-insensitive flag
  // This regex matches <Variables> (with optional attributes) ... </Variables>
  // [\s\S]*? means any character including newlines, non-greedy
  // 1) remove Variables blocks
  let cleaned = text.replace(/<Variables\b[^>]*>[\s\S]*?<\/Variables>/gi, '');

  // 2) normalize line endings to LF so we can preserve them consistently
  cleaned = cleaned.replace(/\r\n?/g, '\n');

  // 3) collapse spaces and tabs but preserve newline characters
  //    replace sequences of spaces/tabs with a single space
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  // 4) trim whitespace at the start/end of each line, preserve empty lines
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

  // 5) trim leading/trailing newlines
  cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');

  return cleaned;
}

/**
 * Splits text into paragraphs based on multiple newlines or HTML paragraph tags
 * Also handles narrative sections in brackets that should be separate paragraphs
 * 
 * @param text - The input text to split
 * @returns Array of paragraph strings, with empty paragraphs filtered out
 */
export function splitIntoParagraphs(text: string): string[] {
  if (!text) return [];
  
  let processedText = text;
  
  // First, convert HTML paragraph tags to double newlines
  // Replace <p> and </p> tags with newlines for consistent splitting
  processedText = processedText
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p\b[^>]*>/gi, '\n\n');
  
  
  // Split by two or more consecutive newlines (paragraph breaks)
  const paragraphs = processedText
    .split(/\n{2,}/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0);
  
  // If we found multiple paragraphs, return them
  if (paragraphs.length > 1) {
    return paragraphs;
  }
  
  // If no double newlines, try single newlines as paragraph breaks
  const singleNewlineSplit = processedText
    .split(/\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph.length > 0);
  
  if (singleNewlineSplit.length > 1) {
    return singleNewlineSplit;
  }
  
  // If no paragraph breaks found, return the whole text as single paragraph
  if (processedText.trim()) {
    return [processedText.trim()];
  }
  
  return [];
}

/**
 * Generates a cache key for a message based on its content and metadata
 * Used for caching cleaned and split paragraph results
 * 
 * @param message - The message object
 * @returns A unique cache key string
 */
export function computeRenderKey(message: Message): string {
  // Create a simple hash of the text content for cache key
  const textHash = message.text ? simpleHash(message.text) : '0';
  const timestamp = message.timestamp || 0;
  
  return `${message.id}:${textHash}:${timestamp}`;
}

/**
 * Simple hash function for generating short hash strings
 * Uses djb2 algorithm for good distribution and speed
 * 
 * @param str - Input string to hash
 * @returns Hash value as string
 */
function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash).toString(36);
}

/**
 * Processes a message text by cleaning Variables tags and splitting into paragraphs
 * This is a convenience function that combines cleaning and splitting
 * 
 * @param text - The message text to process
 * @returns Object containing cleaned text and paragraphs array
 */
export function processMessageText(text: string): {
  cleanedText: string;
  paragraphs: string[];
} {
  const cleanedText = cleanVariablesFromText(text);
  const paragraphs = splitIntoParagraphs(cleanedText);
  
  return {
    cleanedText,
    paragraphs,
  };
}

/**
 * Validates if text should be split into paragraphs
 * Returns true if text contains multiple paragraphs worth splitting
 * 
 * @param text - Text to validate
 * @returns Boolean indicating if text should be split
 */
export function shouldSplitIntoParagraphs(text: string): boolean {
  if (!text) return false;
  
  const cleaned = cleanVariablesFromText(text);
  const paragraphs = splitIntoParagraphs(cleaned);
  
  // Only split if we have more than one meaningful paragraph
  return paragraphs.length > 1;
}