#import <Foundation/Foundation.h>

typedef struct { BOOL isInputAvailable; BOOL isOutputAvailable; } RTCAudioEngineAvailability;
@interface RTCAudioSession : NSObject
@property BOOL useManualAudio;
@property BOOL isActive;
@property BOOL isAudioEnabled;
+ (instancetype)sharedInstance;
@end
@implementation RTCAudioSession
+ (instancetype)sharedInstance {
  static RTCAudioSession *session;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ session = [RTCAudioSession new]; });
  return session;
}
@end
@interface FakeADM : NSObject
@property RTCAudioEngineAvailability availability;
@property BOOL running;
@property NSInteger changes;
@property NSInteger result;
- (NSInteger)setEngineAvailability:(RTCAudioEngineAvailability)value;
@end
@implementation FakeADM
- (NSInteger)setEngineAvailability:(RTCAudioEngineAvailability)value {
  // Engine input/output must never be opened against an inactive OS session.
  NSCAssert(!value.isInputAvailable || [RTCAudioSession sharedInstance].isActive, @"premature input");
  NSCAssert(value.isInputAvailable == value.isOutputAvailable, @"one-sided gate");
  self.availability = value; self.changes += 1;
  self.running = value.isInputAvailable && self.result == 0;
  return self.result;
}
@end
@interface WebRTCModule : NSObject
@property(strong) dispatch_queue_t workerQueue;
@property(strong) FakeADM *audioDeviceModule;
- (void)mneloSyncCallKitAudio;
- (void)audioSession:(RTCAudioSession *)session didChangeCanPlayOrRecord:(BOOL)value;
- (void)audioSession:(RTCAudioSession *)session didSetActive:(BOOL)value;
- (void)audioSessionDidBeginInterruption:(RTCAudioSession *)session;
- (void)audioSessionDidEndInterruption:(RTCAudioSession *)session shouldResumeSession:(BOOL)value;
@end
@implementation WebRTCModule
// PRODUCTION METHODS INSERTED HERE
@end
static void drain(WebRTCModule *module) { dispatch_sync(module.workerQueue, ^{}); }
int main(void) {
  @autoreleasepool {
    RTCAudioSession *session = [RTCAudioSession sharedInstance];
    session.useManualAudio = YES;
    WebRTCModule *module = [WebRTCModule new];
    module.workerQueue = dispatch_queue_create("probe.worker", DISPATCH_QUEUE_SERIAL);
    module.audioDeviceModule = [FakeADM new];
    [module mneloSyncCallKitAudio]; drain(module);
    NSCAssert(!module.audioDeviceModule.running, @"cold engine must remain closed");
    session.isAudioEnabled = YES;
    [module audioSession:session didChangeCanPlayOrRecord:YES]; drain(module);
    NSCAssert(!module.audioDeviceModule.running, @"track consent alone cannot activate session");
    session.isActive = YES;
    [module audioSession:session didSetActive:YES]; drain(module);
    NSCAssert(module.audioDeviceModule.running, @"activation must start input and output");
    session.isAudioEnabled = NO;
    [module audioSession:session didChangeCanPlayOrRecord:NO]; drain(module);
    NSCAssert(!module.audioDeviceModule.running, @"end must shut both paths");
    session.isAudioEnabled = YES;
    [module mneloSyncCallKitAudio]; drain(module);
    NSCAssert(module.audioDeviceModule.running, @"second call must restart audio");
    session.isActive = NO;
    [module audioSessionDidBeginInterruption:session]; drain(module);
    NSCAssert(!module.audioDeviceModule.running, @"interruption must stop audio");
    session.isActive = YES;
    [module audioSessionDidEndInterruption:session shouldResumeSession:YES]; drain(module);
    NSCAssert(module.audioDeviceModule.running, @"resume must restore both paths");
    // Hold the worker to reproduce activation followed by end before dispatch.
    dispatch_semaphore_t hold = dispatch_semaphore_create(0);
    dispatch_async(module.workerQueue, ^{ dispatch_semaphore_wait(hold, DISPATCH_TIME_FOREVER); });
    [module audioSession:session didChangeCanPlayOrRecord:YES];
    session.isAudioEnabled = NO;
    [module audioSession:session didChangeCanPlayOrRecord:NO];
    dispatch_semaphore_signal(hold); drain(module);
    NSCAssert(!module.audioDeviceModule.running, @"stale activation must not reopen mic");
    // A recreated native module must reconcile an activation delivered earlier.
    WebRTCModule *replacement = [WebRTCModule new];
    replacement.workerQueue = module.workerQueue; replacement.audioDeviceModule = [FakeADM new];
    session.isAudioEnabled = YES;
    [replacement mneloSyncCallKitAudio]; drain(replacement);
    NSCAssert(replacement.audioDeviceModule.running, @"activation before module creation lost");
    session.useManualAudio = NO;
    NSInteger changes = replacement.audioDeviceModule.changes;
    [replacement mneloSyncCallKitAudio]; drain(replacement);
    NSCAssert(replacement.audioDeviceModule.changes == changes, @"automatic audio must stay independent");
    puts("PASS native AudioEngine gate: cold/early activation, both paths, end, second call, interruption, stale callback and module recreation");
  }
  return 0;
}
