const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.resolve(projectRoot, 'android');
const logsRoot = path.resolve(projectRoot, 'logs');
const packageName = 'com.immobile';
const defaultMinutes = 15;

const parseArgs = (argv) => {
  const options = {
    clear: false,
    minutes: defaultMinutes,
    output: '',
    serial: process.env.ANDROID_SERIAL || '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--clear') {
      options.clear = true;
      continue;
    }
    if (value === '--serial' && argv[index + 1]) {
      options.serial = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--minutes' && argv[index + 1]) {
      const parsed = Number.parseInt(argv[index + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.minutes = parsed;
      }
      index += 1;
      continue;
    }
    if (value === '--output' && argv[index + 1]) {
      options.output = path.resolve(argv[index + 1]);
      index += 1;
    }
  }

  return options;
};

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

const resolveSdkRoot = () =>
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  parseLocalProperties();

const resolveAdbPath = (sdkRoot) => {
  const adbName = process.platform === 'win32' ? 'adb.exe' : 'adb';
  if (!sdkRoot) {
    return adbName;
  }
  return path.resolve(sdkRoot, 'platform-tools', adbName);
};

const runAdb = (adbPath, args, options = {}) => {
  const result = spawnSync(adbPath, args, {
    encoding: 'utf8',
    maxBuffer: 25 * 1024 * 1024,
    ...options,
  });

  if (result.error) {
    return {
      ok: false,
      output: '',
      message: result.error.message,
    };
  }

  return {
    ok: result.status === 0,
    output: `${result.stdout || ''}${result.stderr || ''}`,
    message: result.status === 0 ? '' : `adb exited with status ${result.status}`,
  };
};

const listDevices = (adbPath) => {
  const result = runAdb(adbPath, ['devices']);
  if (!result.ok) {
    return { devices: [], warning: result.message || 'adb devices failed' };
  }

  const devices = result.output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => /\sdevice$/.test(line))
    .map((line) => line.split(/\s+/)[0]);

  return { devices, warning: '' };
};

const chooseDevice = (adbPath, preferredSerial) => {
  const { devices, warning } = listDevices(adbPath);
  if (devices.length === 0) {
    return {
      serial: '',
      warning: warning || 'no authorized Android device or emulator detected',
    };
  }

  if (preferredSerial) {
    if (devices.includes(preferredSerial)) {
      return { serial: preferredSerial, warning: '' };
    }
    return {
      serial: devices[0],
      warning: `ANDROID_SERIAL=${preferredSerial} not found; falling back to ${devices[0]}`,
    };
  }

  if (devices.length > 1) {
    return {
      serial: devices[0],
      warning: `multiple devices detected (${devices.join(', ')}); using ${devices[0]}`,
    };
  }

  return { serial: devices[0], warning: '' };
};

const formatTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const shouldKeepLine = (line) => {
  const text = line.toLowerCase();
  return [
    packageName,
    'reactnativejs',
    'androidruntime',
    'fcm',
    'firebase',
    'notifee',
    'websocket',
    'markread',
    'notification',
    'mainactivity',
  ].some((keyword) => text.includes(keyword));
};

const filterRecentLines = (output, minutes) => {
  const lines = output.split(/\r?\n/);
  const maxLines = Math.max(200, minutes * 80);
  return lines.filter(shouldKeepLine).slice(-maxLines);
};

const buildSummary = (lines) => {
  const summary = {
    total: lines.length,
    fatal: 0,
    error: 0,
    warning: 0,
  };

  lines.forEach((line) => {
    if (/FATAL EXCEPTION|AndroidRuntime/i.test(line)) {
      summary.fatal += 1;
    }
    if (/\bE\/| error | failed /i.test(line)) {
      summary.error += 1;
    }
    if (/\bW\/| warn /i.test(line)) {
      summary.warning += 1;
    }
  });

  return summary;
};

const writeOutput = (filePath, serial, minutes, lines, summary, warning) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = [
    `# Android Logcat Capture`,
    ``,
    `generated_at=${new Date().toISOString()}`,
    `device_serial=${serial || 'N/A'}`,
    `package=${packageName}`,
    `time_window_hint_minutes=${minutes}`,
    `summary_total_lines=${summary.total}`,
    `summary_fatal_matches=${summary.fatal}`,
    `summary_error_matches=${summary.error}`,
    `summary_warning_matches=${summary.warning}`,
    `warning=${warning || 'none'}`,
    ``,
    `---`,
    ``,
    ...lines,
    '',
  ].join('\n');

  fs.writeFileSync(filePath, content, 'utf8');
};

(() => {
  const options = parseArgs(process.argv.slice(2));
  const sdkRoot = resolveSdkRoot();
  const adbPath = resolveAdbPath(sdkRoot);

  if (sdkRoot && !fs.existsSync(adbPath)) {
    console.warn(`[android-logcat] adb not found at ${adbPath}`);
    process.exit(0);
  }

  const device = chooseDevice(adbPath, options.serial);
  if (!device.serial) {
    console.warn(`[android-logcat] ${device.warning}`);
    process.exit(0);
  }

  const adbArgs = ['-s', device.serial];

  if (options.clear) {
    const cleared = runAdb(adbPath, [...adbArgs, 'logcat', '-c']);
    if (!cleared.ok) {
      console.warn(`[android-logcat] failed to clear logcat: ${cleared.message}`);
    }
  }

  const capture = runAdb(adbPath, [...adbArgs, 'logcat', '-d', '-v', 'time']);
  if (!capture.ok) {
    console.warn(`[android-logcat] failed to capture logcat: ${capture.message}`);
    process.exit(0);
  }

  const filteredLines = filterRecentLines(capture.output, options.minutes);
  const summary = buildSummary(filteredLines);
  const outputPath =
    options.output ||
    path.resolve(logsRoot, `android-logcat-${formatTimestamp()}.txt`);

  writeOutput(outputPath, device.serial, options.minutes, filteredLines, summary, device.warning);

  console.log(`[android-logcat] wrote ${filteredLines.length} filtered lines to ${outputPath}`);
  console.log(
    `[android-logcat] summary: fatal=${summary.fatal}, error=${summary.error}, warning=${summary.warning}, total=${summary.total}`,
  );
  if (device.warning) {
    console.log(`[android-logcat] note: ${device.warning}`);
  }
})();
