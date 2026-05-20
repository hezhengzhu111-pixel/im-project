import Foundation
import React

/// Mobile Rust E2EE Native Module for iOS.
///
/// ## Current state: FAIL-FAST
///
/// The native Rust `e2ee-ffi` static library has not yet been linked into this
/// iOS target. All method calls throw "not linked" errors.
///
/// ## Integration checklist (TODO)
///
/// 1. Build `e2ee-ffi` for iOS:
///    ```
///    cd backend/e2ee-ffi
///    cargo build --release --target aarch64-apple-ios
///    cargo build --release --target x86_64-apple-ios   # simulator
///    ```
///
/// 2. Generate Swift bindings via UniFFI:
///    ```
///    uniffi-bindgen generate src/e2ee_ffi.udl --language swift --out-dir ../../frontend/apps/mobile/ios/ImMobile/
///    ```
///    This produces `e2ee_ffi.swift` with the `SessionManager` class.
///
/// 3. Add the static library to Xcode:
///    - Drag `backend/e2ee-ffi/target/aarch64-apple-ios/release/libe2ee_ffi.a`
///      into the Xcode project's "Link Binary With Libraries" build phase.
///    - Add the library search path in Build Settings → Library Search Paths.
///
/// 4. Add the UniFFI-generated `e2ee_ffi.swift` and this file to the Xcode project.
///
/// 5. Verify the module is registered: React Native auto-discovers
///    `RCT_EXTERN_MODULE` macros at runtime.
///
/// 6. Once the above steps are complete, replace the fail-fast stubs in this
///    file with real SessionManager delegation (mirroring Android's
///    `RustE2eeModule.kt`).

@objc(RustE2eeModule)
class RustE2eeModule: NSObject {

  static let NOT_LINKED = "Mobile Rust E2EE runtime is not linked (iOS)"

  private func failFast(
    _ reject: RCTPromiseRejectBlock,
    _ method: String = #function
  ) {
    let error = NSError(
      domain: "RustE2eeModule",
      code: -1,
      userInfo: [NSLocalizedDescriptionKey: Self.NOT_LINKED]
    )
    reject("RUST_E2EE_NOT_LINKED", "\(method): \(Self.NOT_LINKED)", error)
  }

  @objc
  static func requiresMainQueueSetup() -> Bool { false }

  @objc(generatePreKeyBundle:oneTimePreKeyStartId:oneTimePreKeyCount:resolver:rejecter:)
  func generatePreKeyBundle(
    _ signedPreKeyId: NSNumber,
    _ oneTimePreKeyStartId: NSNumber,
    _ oneTimePreKeyCount: NSNumber,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // resolve(manager.generatePreKeyBundle(
    //   signedPreKeyId: signedPreKeyId.uint32Value,
    //   oneTimePreKeyStartId: oneTimePreKeyStartId.uint32Value,
    //   oneTimePreKeyCount: oneTimePreKeyCount.uint32Value
    // ))
    failFast(reject)
  }

  @objc(createOutboundSession:identityKeyPairBincodeBase64:remoteBundleJson:resolver:rejecter:)
  func createOutboundSession(
    _ sessionId: String,
    _ identityKeyPairBincodeBase64: String,
    _ remoteBundleJson: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // let ikp = Data(base64Encoded: identityKeyPairBincodeBase64)!
    // let result = try manager.createOutboundSession(
    //   sessionId: sessionId,
    //   identityKeyPairBincode: [UInt8](ikp),
    //   remoteBundleJson: remoteBundleJson
    // )
    // resolve(Data(result).base64EncodedString())
    failFast(reject)
  }

  @objc(createInboundSession:identityKeyPairBincodeBase64:signedPreKeyPairBincodeBase64:oneTimePreKeyPairBincodeBase64:remoteIdentityKeyBase64:remoteEphemeralKeyBase64:resolver:rejecter:)
  func createInboundSession(
    _ sessionId: String,
    _ identityKeyPairBincodeBase64: String,
    _ signedPreKeyPairBincodeBase64: String,
    _ oneTimePreKeyPairBincodeBase64: String?,
    _ remoteIdentityKeyBase64: String,
    _ remoteEphemeralKeyBase64: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // let ikp = Data(base64Encoded: identityKeyPairBincodeBase64)!
    // let spkp = Data(base64Encoded: signedPreKeyPairBincodeBase64)!
    // let otkp = oneTimePreKeyPairBincodeBase64.flatMap { Data(base64Encoded: $0) }
    // let rik = Data(base64Encoded: remoteIdentityKeyBase64)!
    // let rek = Data(base64Encoded: remoteEphemeralKeyBase64)!
    // try manager.createInboundSession(
    //   sessionId: sessionId,
    //   identityKeyPairBincode: [UInt8](ikp),
    //   signedPreKeyPairBincode: [UInt8](spkp),
    //   oneTimePreKeyPairBincode: otkp.map { [UInt8]($0) },
    //   remoteIdentityKeyBytes: [UInt8](rik),
    //   remoteEphemeralKeyBytes: [UInt8](rek)
    // )
    // resolve(nil)
    failFast(reject)
  }

  @objc(encrypt:plaintextBase64:resolver:rejecter:)
  func encrypt(
    _ sessionId: String,
    _ plaintextBase64: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // let pt = Data(base64Encoded: plaintextBase64)!
    // let wire = try manager.encrypt(sessionId: sessionId, plaintext: [UInt8](pt))
    // resolve(Data(wire).base64EncodedString())
    failFast(reject)
  }

  @objc(decrypt:encryptedWireBase64:resolver:rejecter:)
  func decrypt(
    _ sessionId: String,
    _ encryptedWireBase64: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // let wire = Data(base64Encoded: encryptedWireBase64)!
    // let pt = try manager.decrypt(sessionId: sessionId, encrypted: [UInt8](wire))
    // resolve(Data(pt).base64EncodedString())
    failFast(reject)
  }

  @objc(exportSession:resolver:rejecter:)
  func exportSession(
    _ sessionId: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // let state = try manager.exportSession(sessionId: sessionId)
    // resolve(Data(state).base64EncodedString())
    failFast(reject)
  }

  @objc(restoreSession:stateBincodeBase64:resolver:rejecter:)
  func restoreSession(
    _ sessionId: String,
    _ stateBincodeBase64: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // let state = Data(base64Encoded: stateBincodeBase64)!
    // try manager.restoreSession(sessionId: sessionId, stateBincode: [UInt8](state))
    // resolve(nil)
    failFast(reject)
  }

  @objc(removeSession:resolver:rejecter:)
  func removeSession(
    _ sessionId: String,
    resolve: RCTPromiseResolveBlock,
    reject: RCTPromiseRejectBlock
  ) {
    // TODO: Uncomment once e2ee-ffi is linked.
    // let manager = SessionManager()
    // manager.removeSession(sessionId: sessionId)
    // resolve(nil)
    failFast(reject)
  }
}
