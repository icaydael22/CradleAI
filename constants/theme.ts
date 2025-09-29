export const theme = {
  colors: {
    primary: 'rgb(255, 224, 195)',
    primaryDark: 'rgb(224, 196, 168)',
    primaryTransparent: 'rgba(255, 224, 195, 0.5)',
    background: '#212121',
    cardBackground: '#333333',
    backgroundSecondary: 'rgba(60, 60, 60, 0.5)',  // Add this line
    text: '#ffffff',
    textSecondary: '#aaaaaa',
    border: '#444444',
    success: '#4CAF50',
    danger: '#FF5252',
    warning: '#FFC107',
    info: '#2196F3',
    white: '#ffffff',
    black: '#000000',
    overlay: 'rgba(0, 0, 0, 0.6)',
    input: '#444444',
    disabled: '#666666',
    accent: '#4A90E2',
    buttonText:  'rgb(255, 224, 195)', // Add this line for button text/icons on light backgrounds
  },
  fontSizes: {
    xs: 10,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  shadows: {
    small: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 2,
    },
    medium: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 4,
    },
    large: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 8,
    },
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 16,
    xl: 24,
    full: 999,
  },
};

export type Theme = typeof theme;