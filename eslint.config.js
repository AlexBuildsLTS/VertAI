import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactNative from 'eslint-plugin-react-native';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: {
      'react-native': reactNative,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-native/no-unused-styles': 'error',
      'react-native/no-inline-styles': 'warn',
    },
  },
);
