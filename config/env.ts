// Environment configuration for API tokens and other settings

interface EnvConfig {
  REPLICATE_API_TOKEN: string;
  // Add other environment variables as needed
}

// Default config for development (never use real tokens here)
const devConfig: EnvConfig = {
  REPLICATE_API_TOKEN: '',
};

// Production config that should be loaded from a secure source
// In a real app, you might use react-native-dotenv, react-native-config, or other solutions
const prodConfig: EnvConfig = {
  REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || '',
};

// Use development config for debug builds, production config otherwise
const ENV = __DEV__ ? devConfig : prodConfig;

export default ENV;
