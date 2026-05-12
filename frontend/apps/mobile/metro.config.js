const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const workspaceRoot = path.resolve(__dirname, '../..');
const projectRoot = __dirname;
const defaultConfig = getDefaultConfig(projectRoot);

const config = {
  projectRoot,
  watchFolders: [path.resolve(workspaceRoot, 'packages')],
  resolver: {
    ...defaultConfig.resolver,
    nodeModulesPaths: [
      path.resolve(workspaceRoot, 'node_modules'),
      path.resolve(projectRoot, 'node_modules'),
    ],
    unstable_enableSymlinks: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);
