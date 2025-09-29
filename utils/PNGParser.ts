import * as FileSystem from 'expo-file-system';
import base64 from 'base-64';

interface ChunkData {
  type: string;
  data: Uint8Array;
}

export class PNGParser {
  private static PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

  static async readPNGChunks(filePath: string): Promise<{[key: string]: any}> {
    try {
      const base64Content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      const buffer = new Uint8Array(base64.decode(base64Content).split('').map(c => c.charCodeAt(0)));
      
      // Verify PNG signature
      for (let i = 0; i < 8; i++) {
        if (buffer[i] !== this.PNG_SIGNATURE[i]) {
          throw new Error('Invalid PNG signature');
        }
      }

      let offset = 8;
      const chunks: ChunkData[] = [];
      const foundData: {[key: string]: any} = {};

      while (offset < buffer.length) {
        const length = (buffer[offset] << 24) | 
                      (buffer[offset + 1] << 16) |
                      (buffer[offset + 2] << 8) |
                      buffer[offset + 3];
        offset += 4;

        const type = String.fromCharCode(...buffer.slice(offset, offset + 4));
        offset += 4;

        const data = buffer.slice(offset, offset + length);
        offset += length;

        // Skip CRC
        offset += 4;

        if (type === 'tEXt') {
          try {
            const nullIndex = data.indexOf(0);
            if (nullIndex !== -1) {
              const keyword = new TextDecoder().decode(data.slice(0, nullIndex));
              const text = data.slice(nullIndex + 1);
              
              try {
                let decodedText;
                try {
                  // Try to decode as base64 first
                  decodedText = new TextDecoder().decode(
                    Uint8Array.from(atob(new TextDecoder().decode(text)), c => c.charCodeAt(0))
                  );
                } catch (decodeError) {
                  // If base64 decoding fails, try regular text
                  decodedText = new TextDecoder().decode(text);
                }

                try {
                  // Try to parse as JSON
                  foundData[keyword] = JSON.parse(decodedText);
                  
                  // Log successful parsing
                  console.log(`Successfully parsed JSON for ${keyword}, found keys:`, 
                    Object.keys(foundData[keyword]));
                  
                  // Special handling for chara keyword - extract nested data structure
                  if (keyword === 'chara' && foundData.chara.data) {
                    console.log('Found chara.data with keys:', Object.keys(foundData.chara.data));
                    // Log if alternate_greetings exists
                    if (Array.isArray(foundData.chara.data.alternate_greetings)) {
                      console.log('Found alternate_greetings:', 
                        foundData.chara.data.alternate_greetings.length);
                    }
                  }
                } catch (jsonError) {
                  // If JSON parsing fails, store as plain text
                  foundData[keyword] = decodedText;
                  console.log(`Stored ${keyword} as plain text`);
                }
              } catch (e) {
                console.error(`Failed to decode text for ${keyword}:`, e);
              }
            }
          } catch (e) {
            console.error('Error processing tEXt chunk:', e);
          }
        }

        if (type === 'IEND') break;
      }

      return foundData;
    } catch (error) {
      console.error('Error reading PNG:', error);
      throw error;
    }
  }
}
