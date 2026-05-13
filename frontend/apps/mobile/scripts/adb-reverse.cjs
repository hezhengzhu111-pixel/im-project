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

const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';
const adb = sdkRoot ? path.resolve(sdkRoot, 'platform-tools', adbName) : adbName;

const run = (args) => {
  const result = spawnSync(adb, args, {stdio: 'inherit'});
  if (result.error) {
    console.error(`Failed to run ${adb}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

run(['reverse', 'tcp:8081', 'tcp:8081']);
console.log('adb reverse tcp:8081 tcp:8081 configured');
