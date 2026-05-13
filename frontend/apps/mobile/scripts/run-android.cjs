const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.resolve(projectRoot, 'android');

const parseLocalProperties = () => {
  const localProperties = path.resolve(androidRoot, 'local.properties');
  if (!fs.existsSync(localProperties)) {
    return '';
  }
  const content = fs.readFileSync(localProperties, 'utf8');
  const match = content.match(/^sdk\.dir=(.+)$/m);
  if (!match) {
    return '';
  }
  return match[1].replace(/\\\\/g, '\\').replace(/\\:/g, ':').trim();
};

const sdkRoot =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  parseLocalProperties();

const env = {...process.env};
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
const extraPath = sdkRoot
  ? [
      path.resolve(sdkRoot, 'platform-tools'),
      path.resolve(sdkRoot, 'emulator'),
    ]
  : [];

if (sdkRoot) {
  env.ANDROID_HOME = env.ANDROID_HOME || sdkRoot;
  env.ANDROID_SDK_ROOT = env.ANDROID_SDK_ROOT || sdkRoot;
}
env[pathKey] = [...extraPath, env[pathKey]].filter(Boolean).join(path.delimiter);

const reactNativeCli = require.resolve('react-native/cli.js', {paths: [projectRoot]});
const result = spawnSync(
  process.execPath,
  [reactNativeCli, 'run-android', '--no-packager', ...process.argv.slice(2)],
  {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  },
);

if (result.error) {
  console.error(`Failed to run React Native Android CLI: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status || 0);
