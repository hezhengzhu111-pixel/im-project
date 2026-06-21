import 'dart:io';

Future<void> main() async {
  final scriptPath = File.fromUri(Platform.script).absolute;
  final flutterDir = scriptPath.parent.parent;
  final repoRoot = flutterDir.parent;
  final webAppDir = Directory(
    [
      flutterDir.path,
      'apps',
      'web',
    ].join(Platform.pathSeparator),
  );
  final outputDir = Directory(
    [
      repoRoot.path,
      'build',
      'dist',
      'frontend',
      'web',
    ].join(Platform.pathSeparator),
  );

  await _buildWasmBridge(repoRoot);

  await _run(
    'flutter',
    [
      'build',
      'web',
      '--release',
      '--pwa-strategy=none',
      '--no-wasm-dry-run',
      '--output=${outputDir.path}',
    ],
    workingDirectory: webAppDir.path,
  );
}

Future<void> _buildWasmBridge(Directory repoRoot) async {
  final bridgeDir = Directory(
    [
      repoRoot.path,
      'rust',
      'crates',
      'im-flutter-bridge',
    ].join(Platform.pathSeparator),
  );
  final pkgDir = Directory(
    [
      repoRoot.path,
      'flutter',
      'apps',
      'web',
      'web',
      'pkg',
    ].join(Platform.pathSeparator),
  );
  final patchScript = File(
    [
      bridgeDir.path,
      'patch_wasm_js.py',
    ].join(Platform.pathSeparator),
  );

  await _run(
    'wasm-pack',
    [
      'build',
      '--target',
      'no-modules',
      '--out-dir',
      pkgDir.path,
      '--no-default-features',
    ],
    workingDirectory: bridgeDir.path,
    environment: const {
      'RUSTFLAGS': '-C target-feature=-atomics,-bulk-memory,-mutable-globals',
    },
  );
  await _run(
    Platform.isWindows ? 'python' : 'python3',
    [
      patchScript.path,
      File([pkgDir.path, 'im_rust_bridge.js'].join(Platform.pathSeparator)).path
    ],
    workingDirectory: bridgeDir.path,
  );
  _assertWasmBridgeAssets(pkgDir);
}

void _assertWasmBridgeAssets(Directory pkgDir) {
  final jsFile = File([pkgDir.path, 'im_rust_bridge.js'].join(Platform.pathSeparator));
  final wasmFile = File([pkgDir.path, 'im_rust_bridge_bg.wasm'].join(Platform.pathSeparator));
  final required = [jsFile, wasmFile];
  for (final file in required) {
    if (!file.existsSync()) {
      throw StateError(
        'Rust bridge web asset was not generated: ${file.path}. '
        'Install wasm-pack and rebuild the web bridge before Flutter web.',
      );
    }
  }

  // The single-threaded WASM build cannot work without the fake-worker patch.
  // This guards against deploying an unpatched bridge (which panics with
  // "DataCloneError: #<Memory> could not be cloned" at runtime).
  final jsContent = jsFile.readAsStringSync();
  if (!jsContent.contains('_FakeWorker')) {
    throw StateError(
      'Rust bridge web asset is missing the single-threaded WASM worker patch. '
      'Run: bash rust/crates/im-flutter-bridge/build_wasm.sh',
    );
  }
}

Future<void> _run(
  String executable,
  List<String> arguments, {
  required String workingDirectory,
  Map<String, String>? environment,
}) async {
  stdout.writeln(
    '> $executable ${arguments.join(' ')}'
    ' (cwd: $workingDirectory)',
  );
  final process = await Process.start(
    executable,
    arguments,
    workingDirectory: workingDirectory,
    runInShell: Platform.isWindows,
    environment: environment == null
        ? null
        : {
            ...Platform.environment,
            ...environment,
          },
  );
  await Future.wait([
    stdout.addStream(process.stdout),
    stderr.addStream(process.stderr),
  ]);
  final exitCode = await process.exitCode;
  if (exitCode != 0) {
    throw ProcessException(
      executable,
      arguments,
      'Command failed with exit code $exitCode',
      exitCode,
    );
  }
}
