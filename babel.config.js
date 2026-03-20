module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // Expo's native internal fix for import.meta
          unstable_transformImportMeta: true,
        },
      ],
      'nativewind/babel',
    ],
    plugins: ['react-native-reanimated/plugin'],
  };
};
