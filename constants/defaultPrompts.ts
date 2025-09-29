// Define default positive prompts for image generation
export const DEFAULT_POSITIVE_PROMPTS = [
  "masterpiece",
  "high score",
  "great score",
  "best quality",
  "amazing quality",
  "very aesthetic",
  "absurdres"
];

// Define default negative prompts for image generation
export const DEFAULT_NEGATIVE_PROMPTS = [
  "blurry", 
  "text", 
  "lowres", 
  "error", 
  "film grain", 
  "scan artifacts", 
  "worst quality", 
  "bad quality", 
  "jpeg artifacts", 
  "very displeasing", 
  "chromatic aberration", 
  "logo", 
  "dated", 
  "signature", 
  "multiple views", 
  "gigantic breasts", 
  "white blank page", 
  "blank page", 
  "nsfw", 
  "Bad hands", 
  "bad eyes", 
  "bad scores", 
  "extra fingers", 
  "fewer fingers", 
  "ugly", 
  "deformed", 
  "disproportionate", 
  "displeasing"
];

// Function to get default positive prompts as a string WITHOUT SPACES after commas
export const getDefaultPositivePromptsString = (): string => {
  // Use join with just ',' - no space after comma
  return DEFAULT_POSITIVE_PROMPTS.join(',');
};
// Function to get default negative prompts as a string WITHOUT SPACES after commas
export const getDefaultNegativePromptsString = (): string => {
  // Use join with just ',' - no space after comma
  return DEFAULT_NEGATIVE_PROMPTS.join(',');
};


