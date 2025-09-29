import React from 'react';

// Define a proper theme interface that includes tint
interface Theme {
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
  text?: string;
  background?: string;
}

// Create context with default theme values
const ThemeContext = React.createContext<Theme>({
  tint: '#2f95dc', // Default tint color
  tabIconDefault: '#ccc',
  tabIconSelected: '#2f95dc',
});

export const ThemeProvider = ThemeContext.Provider;
export const useTheme = () => React.useContext(ThemeContext);

export default ThemeContext;
