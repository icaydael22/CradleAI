/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#2f95dc';
const tintColorDark = '#fff';

export const Colors = {
  primary: '#1a237e',
  background: '#282828',
  card: '#333333',
  text: '#FFFFFF',
  inputBackground: '#444444',
  accent: 'rgb(255, 224, 195)',
  white: '#FFFFFF',
  black: '#000000',
  grey: '#9E9E9E',
  lightGrey: '#CCCCCC',
  darkGrey: '#666666',
  error: '#B71C1C',
  success: '#388E3C',
  warning: '#F57F17',
  positive: '#4CAF50',
  negative: '#E53935',
  neutral: '#9E9E9E',
  caution: '#FF9800',
  veryPositive: '#3F51B5',
};

export default {
  light: {
    text: '#000',
    background: '#fff',
    tint: tintColorLight,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#fff',
    background: '#000',
    tint: tintColorDark,
    tabIconDefault: '#ccc',
    tabIconSelected: tintColorDark,
  },
};
