const fs = require('fs');
const http = require('http');
const os = require('os');
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
const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';
const adb = sdkRoot ? path.resolve(sdkRoot, 'platform-tools', adbName) : adbName;

const checkMetro = () =>
  new Promise((resolve) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        path: '/status',
        port: 8081,
        timeout: 1500,
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          resolve(response.statusCode === 200 && body.includes('packager-status:running'));
        });
      },
    );

    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });

const warnMetroUnavailable = () => {
  console.warn(
    [
      '[mobile:android] Metro is not reachable at http://127.0.0.1:8081/status.',
      'Start Metro in another terminal before launching the debug app:',
      '  npm run mobile:start -- --reset-cache',
      'Then run:',
      '  npm run mobile:reverse',
      'If the red screen is already open, tap Reload after Metro and adb reverse are ready.',
    ].join('\n'),
  );
};

const getConnectedDevices = () => {
  const result = spawnSync(adb, ['devices'], {
    encoding: 'utf8',
    env,
  });
  if (result.error) {
    console.warn(`[mobile:android] Unable to run adb devices: ${result.error.message}`);
    return [];
  }
  if (result.status !== 0) {
    console.warn('[mobile:android] adb devices returned a non-zero status; skipping automatic adb reverse.');
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => /\sdevice$/.test(line))
    .map((line) => line.split(/\s+/)[0]);
};

const isEmulatorDevice = (serial) =>
  serial.startsWith('emulator-') || serial.startsWith('localhost:') || serial.startsWith('127.0.0.1:');

const getLanIpv4 = () => {
  const candidates = [];
  const interfaces = os.networkInterfaces();
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (item.family !== 'IPv4' || item.internal) {
        continue;
      }
      const address = item.address;
      if (!address || address.startsWith('169.254.')) {
        continue;
      }
      candidates.push(address);
    }
  }
  return (
    candidates.find((address) => /^192\.168\./.test(address)) ||
    candidates.find((address) => /^10\./.test(address)) ||
    candidates.find((address) => /^172\.(1[6-9]|2\d|3[01])\./.test(address)) ||
    candidates[0] ||
    ''
  );
};

const hasExplicitRuntimeUrl = () =>
  Boolean(
    env.IM_MOBILE_API_BASE_URL ||
      env.IM_MOBILE_WS_BASE_URL ||
      env.IM_MOBILE_FILE_BASE_URL ||
      env.API_BASE_URL ||
      env.WS_BASE_URL ||
      env.FILE_BASE_URL,
  );

const applyPhysicalDeviceRuntimeConfig = (connectedDevices) => {
  const physicalDevices = connectedDevices.filter((serial) => !isEmulatorDevice(serial));
  if (physicalDevices.length === 0 || hasExplicitRuntimeUrl()) {
    return;
  }
  const host = getLanIpv4();
  if (!host) {
    console.warn('[mobile:android] Physical Android device detected, but no LAN IPv4 was found. Keep explicit IM_MOBILE_* URL env vars for device testing.');
    return;
  }
  env.IM_MOBILE_APP_ENV = env.IM_MOBILE_APP_ENV || 'dev-device';
  env.IM_MOBILE_API_BASE_URL = `http://${host}:8082/api`;
  env.IM_MOBILE_WS_BASE_URL = `ws://${host}:8082`;
  env.IM_MOBILE_FILE_BASE_URL = `http://${host}:8082`;
  console.log(
    [
      `[mobile:android] Physical device detected: ${physicalDevices.join(', ')}`,
      `[mobile:android] Using LAN backend: ${env.IM_MOBILE_API_BASE_URL}`,
      '[mobile:android] Ensure the backend listens on 0.0.0.0:8082 and the phone is on the same network.',
    ].join('\n'),
  );
};

const configureAdbReverse = (phase, connectedDevices = getConnectedDevices()) => {
  if (sdkRoot && !fs.existsSync(adb)) {
    console.warn(`[mobile:android] adb not found at ${adb}; skipping automatic adb reverse.`);
    return;
  }

  if (connectedDevices.length === 0) {
    console.warn(`[mobile:android] No authorized Android device found ${phase}; skipping automatic adb reverse.`);
    return;
  }
  if (connectedDevices.length > 1 && !env.ANDROID_SERIAL) {
    console.warn(
      `[mobile:android] Multiple Android devices are connected ${phase}; set ANDROID_SERIAL or run npm run mobile:reverse manually.`,
    );
    return;
  }

  const reverseArgs = env.ANDROID_SERIAL
    ? ['-s', env.ANDROID_SERIAL, 'reverse', 'tcp:8081', 'tcp:8081']
    : ['reverse', 'tcp:8081', 'tcp:8081'];
  const result = spawnSync(adb, reverseArgs, {
    env,
    stdio: 'inherit',
  });
  if (result.error) {
    console.warn(`[mobile:android] Failed to configure adb reverse ${phase}: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    console.warn(`[mobile:android] adb reverse failed ${phase}; run npm run mobile:reverse after the device is ready.`);
  }
};

(async () => {
  const metroRunning = await checkMetro();
  if (!metroRunning) {
    warnMetroUnavailable();
  }

  const connectedDevices = getConnectedDevices();
  applyPhysicalDeviceRuntimeConfig(connectedDevices);
  configureAdbReverse('before launch', connectedDevices);

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

  if (result.status === 0) {
    configureAdbReverse('after launch');
  }

  process.exit(typeof result.status === 'number' ? result.status : 1);
})();