#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(RustE2eeModule, NSObject)

RCT_EXTERN_METHOD(
  generatePreKeyBundle:(nonnull NSNumber *)signedPreKeyId
  oneTimePreKeyStartId:(nonnull NSNumber *)oneTimePreKeyStartId
  oneTimePreKeyCount:(nonnull NSNumber *)oneTimePreKeyCount
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  createOutboundSession:(nonnull NSString *)sessionId
  identityKeyPairBincodeBase64:(nonnull NSString *)identityKeyPairBincodeBase64
  remoteBundleJson:(nonnull NSString *)remoteBundleJson
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  createInboundSession:(nonnull NSString *)sessionId
  identityKeyPairBincodeBase64:(nonnull NSString *)identityKeyPairBincodeBase64
  signedPreKeyPairBincodeBase64:(nonnull NSString *)signedPreKeyPairBincodeBase64
  oneTimePreKeyPairBincodeBase64:(nullable NSString *)oneTimePreKeyPairBincodeBase64
  remoteIdentityKeyBase64:(nonnull NSString *)remoteIdentityKeyBase64
  remoteEphemeralKeyBase64:(nonnull NSString *)remoteEphemeralKeyBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  encrypt:(nonnull NSString *)sessionId
  plaintextBase64:(nonnull NSString *)plaintextBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  decrypt:(nonnull NSString *)sessionId
  encryptedWireBase64:(nonnull NSString *)encryptedWireBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  exportSession:(nonnull NSString *)sessionId
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  restoreSession:(nonnull NSString *)sessionId
  stateBincodeBase64:(nonnull NSString *)stateBincodeBase64
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  removeSession:(nonnull NSString *)sessionId
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

@end
