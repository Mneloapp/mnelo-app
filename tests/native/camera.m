// Compile the installed, patched SDK's applyConstraints method verbatim against
// deterministic camera doubles. No device camera, microphone or user data used.
#import <Foundation/Foundation.h>
typedef NS_ENUM(NSInteger, AVCaptureDevicePosition) {
  AVCaptureDevicePositionUnspecified, AVCaptureDevicePositionBack, AVCaptureDevicePositionFront
};
@interface AVCaptureDevice : NSObject
@property(nonatomic, copy) NSString *uniqueID;
@property(nonatomic) AVCaptureDevicePosition position;
+ (instancetype)deviceWithUniqueID:(NSString *)identifier;
@end
static AVCaptureDevice *front;
static AVCaptureDevice *back;
@implementation AVCaptureDevice
+ (instancetype)deviceWithUniqueID:(NSString *)identifier {
  if ([front.uniqueID isEqualToString:identifier]) return front;
  if ([back.uniqueID isEqualToString:identifier]) return back;
  return nil;
}
@end
@interface CameraProbe : NSObject
@property(nonatomic, copy) NSString *deviceId;
@property(nonatomic) BOOL usingFrontCamera;
@property(nonatomic) BOOL running;
@property(nonatomic) int width, height, frameRate, starts, stops;
@property(nonatomic) BOOL missingBack;
@end
@implementation CameraProbe
- (AVCaptureDevice *)findDeviceForPosition:(AVCaptureDevicePosition)position {
  // The actual SDK helper falls back to the first available camera.
  return position == AVCaptureDevicePositionFront || self.missingBack ? front : back;
}
- (void)stopCapture { self.stops++; self.running = NO; }
- (void)startCapture { self.starts++; self.running = YES; }
#include "CameraConstraints.inc"
@end
#define CHECK(condition) NSCAssert(condition, @"Camera regression: %s", #condition)
int main(void) {
  @autoreleasepool {
    front = [AVCaptureDevice new]; front.uniqueID = @"front"; front.position = AVCaptureDevicePositionFront;
    back = [AVCaptureDevice new]; back.uniqueID = @"back"; back.position = AVCaptureDevicePositionBack;
    CameraProbe *camera = [CameraProbe new];
    camera.deviceId = @"front"; camera.usingFrontCamera = YES; camera.running = YES;
    camera.width = 640; camera.height = 480; camera.frameRate = 24;
    NSMutableDictionary *constraints = [@{@"width":@640, @"height":@480, @"frameRate":@24, @"facingMode":@"environment"} mutableCopy];
    NSError *error = nil;
    [camera applyConstraints:constraints error:&error];
    CHECK(!error && [camera.deviceId isEqualToString:@"back"] && !camera.usingFrontCamera);
    CHECK(camera.starts == 1 && camera.stops == 1 && camera.frameRate == 24);
    [camera applyConstraints:constraints error:&error];
    CHECK(camera.starts == 1 && camera.stops == 1);
    constraints[@"facingMode"] = @"user";
    [camera applyConstraints:constraints error:&error];
    CHECK(!error && camera.usingFrontCamera && [camera.deviceId isEqualToString:@"front"]);
    CHECK(camera.starts == 2 && camera.stops == 2);
    camera.missingBack = YES; constraints[@"facingMode"] = @"environment";
    [camera applyConstraints:constraints error:&error];
    CHECK(error && camera.usingFrontCamera && camera.running);
    CHECK(camera.starts == 2 && camera.stops == 2);
    error = nil; constraints[@"deviceId"] = @"absent";
    [camera applyConstraints:constraints error:&error];
    CHECK(error && [camera.deviceId isEqualToString:@"front"]);
    error = nil; constraints[@"deviceId"] = @"back";
    [camera applyConstraints:constraints error:&error];
    CHECK(!error && [camera.deviceId isEqualToString:@"back"] && !camera.usingFrontCamera);
    CHECK(camera.starts == 3 && camera.stops == 3);
    // Changing a stopped/disabled capture's desired camera must not start it.
    camera.running = NO; constraints[@"deviceId"] = @"front";
    [camera applyConstraints:constraints error:&error];
    CHECK(!error && camera.usingFrontCamera && !camera.running);
    CHECK(camera.starts == 3 && camera.stops == 3);
    // Camera and dimensions together perform exactly one capture restart.
    camera.running = YES; constraints[@"deviceId"] = @"back"; constraints[@"width"] = @480;
    [camera applyConstraints:constraints error:&error];
    CHECK(!error && camera.width == 480 && camera.starts == 4 && camera.stops == 4);
    puts("PASS: native camera front/back, no-op, unavailable, deviceId, stopped and single-restart constraints");
  }
  return 0;
}
