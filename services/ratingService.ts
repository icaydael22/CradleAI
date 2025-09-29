import AsyncStorage from '@react-native-async-storage/async-storage';

const RATINGS_STORAGE_KEY_PREFIX = '@message_ratings_';

/**
 * Service to handle message ratings storage and retrieval
 */
class RatingService {
  /**
   * Save a message rating for a character
   */
  async saveRating(characterId: string, messageId: string, isUpvote: boolean): Promise<void> {
    try {
      // Get existing ratings
      const ratings = await this.getRatingsForCharacter(characterId);
      
      // Update with new rating
      const updatedRatings = {
        ...ratings,
        [messageId]: isUpvote
      };
      
      // Save back to storage
      await AsyncStorage.setItem(
        this.getStorageKey(characterId),
        JSON.stringify(updatedRatings)
      );
      
      console.log(`Rating saved for character ${characterId}, message ${messageId}: ${isUpvote ? 'upvote' : 'downvote'}`);
    } catch (error) {
      console.error('Error saving message rating:', error);
    }
  }
  
  /**
   * Get all message ratings for a character
   */
  async getRatingsForCharacter(characterId: string): Promise<Record<string, boolean>> {
    try {
      const ratingsJson = await AsyncStorage.getItem(this.getStorageKey(characterId));
      if (ratingsJson) {
        return JSON.parse(ratingsJson);
      }
      return {};
    } catch (error) {
      console.error('Error loading message ratings:', error);
      return {};
    }
  }
  
  /**
   * Remove a rating
   */
  async removeRating(characterId: string, messageId: string): Promise<void> {
    try {
      const ratings = await this.getRatingsForCharacter(characterId);
      
      // Delete the rating
      if (messageId in ratings) {
        delete ratings[messageId];
        
        // Save back to storage
        await AsyncStorage.setItem(
          this.getStorageKey(characterId),
          JSON.stringify(ratings)
        );
        
        console.log(`Rating removed for message ${messageId}`);
      }
    } catch (error) {
      console.error('Error removing message rating:', error);
    }
  }
  
  /**
   * Get storage key for a character's ratings
   */
  private getStorageKey(characterId: string): string {
    return `${RATINGS_STORAGE_KEY_PREFIX}${characterId}`;
  }
}

// Export singleton instance
export const ratingService = new RatingService();
