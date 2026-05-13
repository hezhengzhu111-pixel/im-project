const path = require('path');
const fs = require('fs');
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

const resolveExistingSource = (basePath) => {
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.native.ts`,
    `${basePath}.native.tsx`,
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
};

const resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@/')) {
    return context.resolveRequest(
      context,
      path.resolve(projectRoot, 'src', moduleName.slice(2)),
      platform,
    );
  }
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    const sourcePath = resolveExistingSource(
      path.resolve(path.dirname(context.originModulePath), moduleName.slice(0, -3)),
    );
    if (sourcePath) {
      return context.resolveRequest(context, sourcePath, platform);
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

const config = {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    ...defaultConfig.resolver,
    nodeModulesPaths: [
      path.resolve(workspaceRoot, 'node_modules'),
      path.resolve(projectRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@': path.resolve(projectRoot, 'src'),
    },
    resolveRequest,
    unstable_enableSymlinks: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);
