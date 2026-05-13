const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const androidRoot = path.resolve(projectRoot, 'android');
const gradlew = path.resolve(
  androidRoot,
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew',
);

const requiredSigningVars = [
  'IM_MOBILE_RELEASE_STORE_FILE',
  'IM_MOBILE_RELEASE_STORE_PASSWORD',
  'IM_MOBILE_RELEASE_KEY_ALIAS',
  'IM_MOBILE_RELEASE_KEY_PASSWORD',
];

const propertyFlags = {
  '--versionCode': 'IM_MOBILE_VERSION_CODE',
  '--versionName': 'IM_MOBILE_VERSION_NAME',
  '--minify': 'IM_MOBILE_MINIFY_RELEASE',
  '--appEnv': 'IM_MOBILE_APP_ENV',
  '--apiBaseUrl': 'IM_MOBILE_API_BASE_URL',
  '--wsBaseUrl': 'IM_MOBILE_WS_BASE_URL',
  '--fileBaseUrl': 'IM_MOBILE_FILE_BASE_URL',
};

const targetArg = process.argv[2];
const cliArgs = process.argv.slice(3);

const usage = () => {
  console.log(
    [
      'Usage:',
      '  npm run android:release:apk',
      '  npm run android:release:aab',
      '  npm run android:release:apk -- --versionCode 12 --versionName 1.2.0 --appEnv sit',
      '',
      'Required signing environment variables:',
      ...requiredSigningVars.map((name) => `  ${name}`),
    ].join('\n'),
  );
};

const resolveGradleTask = (target) => {
  if (target === 'apk') {
    return 'assembleRelease';
  }
  if (target === 'aab') {
    return 'bundleRelease';
  }
  return '';
};

const parseArgs = (argv) => {
  const gradleArgs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const propertyName = propertyFlags[current];

    if (propertyName) {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        console.error(`[mobile:android:release] Missing value for ${current}`);
        process.exit(1);
      }
      gradleArgs.push(`-P${propertyName}=${nextValue}`);
      index += 1;
      continue;
    }

    gradleArgs.push(current);
  }

  return gradleArgs;
};

const resolveKeystorePath = (storeFile) => {
  if (path.isAbsolute(storeFile)) {
    return storeFile;
  }
  return path.resolve(androidRoot, 'app', storeFile);
};

const maskValue = (value) => {
  if (!value) {
    return '(unset)';
  }
  if (value.length <= 4) {
    return '****';
  }
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
};

const validateSigningEnv = (env) => {
  const missing = requiredSigningVars.filter((name) => !String(env[name] || '').trim());
  if (missing.length > 0) {
    console.error(
      [
        '[mobile:android:release] Missing release signing environment variables:',
        ...missing.map((name) => `  - ${name}`),
        '',
        'Provide them locally before building release artifacts.',
      ].join('\n'),
    );
    usage();
    process.exit(1);
  }

  const storeFile = resolveKeystorePath(env.IM_MOBILE_RELEASE_STORE_FILE);
  if (!fs.existsSync(storeFile)) {
    console.error(`[mobile:android:release] Keystore file not found: ${storeFile}`);
    process.exit(1);
  }

  return storeFile;
};

(() => {
  const gradleTask = resolveGradleTask(targetArg);
  if (!gradleTask) {
    usage();
    process.exit(1);
  }

  if (!fs.existsSync(gradlew)) {
    console.error(`[mobile:android:release] Gradle wrapper not found: ${gradlew}`);
    process.exit(1);
  }

  const env = {...process.env};
  const storeFile = validateSigningEnv(env);
  const gradleArgs = [gradleTask, ...parseArgs(cliArgs)];

  console.log(
    [
      `[mobile:android:release] task=${gradleTask}`,
      `[mobile:android:release] appEnv=${env.IM_MOBILE_APP_ENV || '(default from Gradle)'}`,
      `[mobile:android:release] versionCode=${env.IM_MOBILE_VERSION_CODE || '(default from Gradle)'}`,
      `[mobile:android:release] versionName=${env.IM_MOBILE_VERSION_NAME || '(default from Gradle)'}`,
      `[mobile:android:release] storeFile=${storeFile}`,
      `[mobile:android:release] keyAlias=${maskValue(env.IM_MOBILE_RELEASE_KEY_ALIAS || '')}`,
    ].join('\n'),
  );

  const result = spawnSync(gradlew, gradleArgs, {
    cwd: androidRoot,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`[mobile:android:release] Failed to run Gradle: ${result.error.message}`);
    process.exit(1);
  }

  process.exit(typeof result.status === 'number' ? result.status : 1);
})();
