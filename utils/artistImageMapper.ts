import { ImageSourcePropType } from 'react-native';

// Import all images statically - this is what React Native requires
// Import artist images - adjust the paths and filenames as needed
const artistImages: { [key: string]: ImageSourcePropType } = {
  '002.png': require('@/assets/artists/002.png'),
  '006.png': require('@/assets/artists/006.png'),
  '007.png': require('@/assets/artists/007.png'),
  '0011.png': require('@/assets/artists/0011.png'),
  '0013.png': require('@/assets/artists/0013.png'),
};

// For debugging purposes, log the available image keys
console.log("[ArtistImageMapper] Available artist images:", Object.keys(artistImages));

// Placeholder image to use when an image is not found
const placeholderImage = require('@/assets/images/image-placeholder.png');

/**
 * Gets the image source for an artist image filename
 * @param filename The image filename
 * @returns The image source that can be used with React Native Image component
 */
export const getArtistImageSource = (filename: string): ImageSourcePropType => {
  // Log when an image is not found
  if (!artistImages[filename]) {
    console.warn(`[ArtistImageMapper] Image not found: ${filename}`);
  }
  
  // Return the image if we have it, otherwise return placeholder
  return artistImages[filename] || placeholderImage;
};
