const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

// THE KILL SWITCH: Force Metro to use the CommonJS version of Zustand
// so the web browser never sees the toxic "import.meta" syntax.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'zustand' || moduleName.startsWith('zustand/')) {
    return {
      filePath: require.resolve(moduleName),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

config.resolver.nodeModulesPaths = [path.resolve(__dirname, './node_modules')];

module.exports = withNativeWind(config, {
  input: './global.css',
  projectRoot: __dirname,
  inlineRem: 16,
});
