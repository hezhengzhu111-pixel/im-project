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
      'flutter',
      'web',
    ].join(Platform.pathSeparator),
  );

  await _run(
    'flutter',
    [
      'build',
      'web',
      '--pwa-strategy=none',
      '--no-wasm-dry-run',
      '--output=${outputDir.path}',
    ],
    workingDirectory: webAppDir.path,
  );
}

Future<void> _run(
  String executable,
  List<String> arguments, {
  required String workingDirectory,
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
