import 'dart:io';

Future<void> main() async {
  final scriptPath = File.fromUri(Platform.script).absolute;
  final packageDir = scriptPath.parent.parent;
  final flutterDir = packageDir.parent.parent;
  final repoRoot = flutterDir.parent;
  final rustDir = Directory('${repoRoot.path}${Platform.pathSeparator}rust');
  final libraryPath = _nativeLibraryPath(rustDir);

  await _run(
    'cargo',
    ['build', '-p', 'im-flutter-bridge', '--release'],
    workingDirectory: rustDir.path,
  );

  await _run(
    'flutter',
    ['test', 'test/rust_bridge_initializer_smoke_test.dart'],
    workingDirectory: packageDir.path,
    environment: {
      ...Platform.environment,
      'IM_RUST_BRIDGE_SMOKE': '1',
      'IM_RUST_BRIDGE_DYLIB_PATH': libraryPath,
    },
  );
}

String _nativeLibraryPath(Directory rustDir) {
  final fileName = Platform.isWindows
      ? 'im_rust_bridge.dll'
      : Platform.isMacOS
          ? 'libim_rust_bridge.dylib'
          : 'libim_rust_bridge.so';
  return [
    rustDir.path,
    'target',
    'release',
    fileName,
  ].join(Platform.pathSeparator);
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
    environment: environment,
    runInShell: Platform.isWindows,
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
