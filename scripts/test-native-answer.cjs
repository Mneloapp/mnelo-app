/* global __dirname */
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const scratch = mkdtempSync(join(tmpdir(), 'mnelo-answer-'));
try {
  const options = { cwd: resolve(__dirname, '..'), stdio: 'inherit' };
  const binary = join(scratch, 'probe');
  execFileSync(
    'xcrun',
    [
      'swiftc',
      'modules/mnelo-calls/ios/MneloAnswerCompletion.swift',
      'tests/native/answer-completion.swift',
      '-o',
      binary,
    ],
    options,
  );
  execFileSync(binary, [], options);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
