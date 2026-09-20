/* global __dirname */
// Exercise the installed native converter's actual pool-size block. The archive
// also compiles it against RTCConfiguration from the pinned iPhone SDK framework.
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const root = resolve(__dirname, '..');
const source = readFileSync(
  join(root, 'node_modules/@livekit/react-native-webrtc/ios/RCTWebRTC/RCTConvert+WebRTC.m'),
  'utf8',
);
const block = source.match(/    if \(\[json\[@"iceCandidatePoolSize"\][\s\S]*?\n    }/)?.[0];
if (!block) throw Error('Native ICE pool patch is missing');
const scratch = mkdtempSync(join(tmpdir(), 'mnelo-call-ice-'));
try {
  const file = join(scratch, 'probe.m'),
    binary = join(scratch, 'probe');
  writeFileSync(
    file,
    `#import <Foundation/Foundation.h>
@interface RCTConvert : NSObject
+ (int)int:(id)value;
@end
@implementation RCTConvert
+ (int)int:(id)value { return [value intValue]; }
@end
@interface Configuration : NSObject
@property(nonatomic) int iceCandidatePoolSize;
@end
@implementation Configuration
@end
static int convert(NSDictionary *json) {
  Configuration *config = [Configuration new];
${block}
  return config.iceCandidatePoolSize;
}
int main(void) { @autoreleasepool {
  NSArray *values = @[@0, @1, @99, @(-1), @"1", [NSNull null]];
  int expected[] = {0, 1, 1, 0, 0, 0};
  for (NSUInteger i=0; i<values.count; i++)
    if (convert(@{@"iceCandidatePoolSize":values[i]}) != expected[i]) return 1;
  if (convert(@{}) != 0) return 2;
  puts("PASS: native ICE pool parser preserves default, accepts one, clamps excess, rejects non-numbers");
  return 0;
}}
`,
  );
  execFileSync(
    'xcrun',
    ['clang', '-fobjc-arc', '-Werror', '-framework', 'Foundation', file, '-o', binary],
    { stdio: 'inherit' },
  );
  execFileSync(binary, [], { stdio: 'inherit' });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
