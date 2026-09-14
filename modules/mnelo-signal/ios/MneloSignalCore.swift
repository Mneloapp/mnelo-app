import Foundation
import LibSignalClient

private enum SignalBridgeFailure: Error {
  case invalid, missingRecord, identityChanged, capacity
}

// These are opaque vendor record encodings, not a new cryptographic format.
// The caller commits this state together with its message/outbox transaction in
// SQLCipher. No operation mutates persistent state or emits secrets to logs here.
private struct SignalState: Codable {
  var version: Int = 1
  var identity: String
  var registration: UInt32
  var nextPreKey: UInt32 = 1
  var signedId: UInt32 = 1
  var sessions: [String: String] = [:]
  var identities: [String: String] = [:]
  var preKeys: [String: String] = [:]
  var signedKeys: [String: String] = [:]
  var kyberKeys: [String: String] = [:]
}

private final class SignalStore: IdentityKeyStore, SessionStore, PreKeyStore, SignedPreKeyStore, KyberPreKeyStore {
  var state: SignalState
  init(_ state: SignalState) throws {
    guard state.version == 1, state.registration > 0, state.registration <= 16383,
          state.sessions.count <= 500, state.identities.count <= 500,
          state.preKeys.count <= 200, state.kyberKeys.count <= 200,
          state.signedKeys.count <= 32 else { throw SignalBridgeFailure.capacity }
    self.state = state
  }
  func address(_ address: ProtocolAddress) -> String { "\(address.name):\(address.deviceId)" }
  func bytes(_ value: String?) throws -> Data {
    guard let value, let decoded = Data(base64Encoded: value) else { throw SignalBridgeFailure.missingRecord }
    return decoded
  }
  func identityKeyPair(context: StoreContext) throws -> IdentityKeyPair {
    try IdentityKeyPair(bytes: bytes(state.identity))
  }
  func localRegistrationId(context: StoreContext) throws -> UInt32 { state.registration }
  func identity(for remote: ProtocolAddress, context: StoreContext) throws -> IdentityKey? {
    guard let value = state.identities[address(remote)] else { return nil }
    return try IdentityKey(bytes: bytes(value))
  }
  func isTrustedIdentity(_ identity: IdentityKey, for remote: ProtocolAddress, direction: Direction, context: StoreContext) throws -> Bool {
    guard let known = state.identities[address(remote)] else { return false }
    return known == identity.serialize().base64EncodedString()
  }
  func saveIdentity(_ identity: IdentityKey, for remote: ProtocolAddress, context: StoreContext) throws -> IdentityChange {
    guard try isTrustedIdentity(identity, for: remote, direction: .receiving, context: context) else {
      throw SignalBridgeFailure.identityChanged
    }
    return .newOrUnchanged
  }
  func pin(_ key: String, for remote: ProtocolAddress) throws {
    _ = try IdentityKey(bytes: bytes(key))
    let name = address(remote)
    if let previous = state.identities[name], previous != key { throw SignalBridgeFailure.identityChanged }
    guard state.identities[name] != nil || state.identities.count < 500 else { throw SignalBridgeFailure.capacity }
    state.identities[name] = key
  }
  func loadSession(for remote: ProtocolAddress, context: StoreContext) throws -> SessionRecord? {
    guard let value = state.sessions[address(remote)] else { return nil }
    return try SessionRecord(bytes: bytes(value))
  }
  func loadExistingSessions(for addresses: [ProtocolAddress], context: StoreContext) throws -> [SessionRecord] {
    try addresses.map {
      guard let record = try loadSession(for: $0, context: context) else { throw SignalBridgeFailure.missingRecord }
      return record
    }
  }
  func storeSession(_ record: SessionRecord, for remote: ProtocolAddress, context: StoreContext) throws {
    let name = address(remote)
    guard state.sessions[name] != nil || state.sessions.count < 500 else { throw SignalBridgeFailure.capacity }
    state.sessions[name] = record.serialize().base64EncodedString()
  }
  func loadPreKey(id: UInt32, context: StoreContext) throws -> PreKeyRecord {
    try PreKeyRecord(bytes: bytes(state.preKeys[String(id)]))
  }
  func storePreKey(_ record: PreKeyRecord, id: UInt32, context: StoreContext) throws {
    state.preKeys[String(id)] = record.serialize().base64EncodedString()
  }
  func removePreKey(id: UInt32, context: StoreContext) throws { state.preKeys.removeValue(forKey: String(id)) }
  func loadSignedPreKey(id: UInt32, context: StoreContext) throws -> SignedPreKeyRecord {
    try SignedPreKeyRecord(bytes: bytes(state.signedKeys[String(id)]))
  }
  func storeSignedPreKey(_ record: SignedPreKeyRecord, id: UInt32, context: StoreContext) throws {
    state.signedKeys[String(id)] = record.serialize().base64EncodedString()
  }
  func loadKyberPreKey(id: UInt32, context: StoreContext) throws -> KyberPreKeyRecord {
    try KyberPreKeyRecord(bytes: bytes(state.kyberKeys[String(id)]))
  }
  func storeKyberPreKey(_ record: KyberPreKeyRecord, id: UInt32, context: StoreContext) throws {
    state.kyberKeys[String(id)] = record.serialize().base64EncodedString()
  }
  func markKyberPreKeyUsed(id: UInt32, signedPreKeyId: UInt32, baseKey: PublicKey, context: StoreContext) throws {
    // Published KEM keys are one-time keys, never a reusable last-resort key.
    guard state.kyberKeys.removeValue(forKey: String(id)) != nil else { throw SignalBridgeFailure.missingRecord }
  }
}

private struct SignedKeyInput: Codable { let id: UInt32; let key: String; let signature: String }
private struct PreKeyInput: Codable { let id: UInt32; let key: String; let kyber: SignedKeyInput }
private struct BundleInput: Codable {
  let identity: String
  let registration: UInt32
  let device: UInt32
  let signed: SignedKeyInput
  let oneTime: PreKeyInput
}
private struct SignalInput: Decodable {
  let operation: String
  let state: SignalState?
  let count: Int?
  let own: String?
  let peer: String?
  let expectedIdentity: String?
  let bundle: BundleInput?
  let message: String?
  let type: Int?
}

public enum MneloSignalCore {
  public static func run(_ encoded: String) throws -> String {
    do { return try perform(encoded) }
    catch SignalBridgeFailure.identityChanged { throw NSError(domain: "SIGNAL_IDENTITY_CHANGED", code: 2) }
    catch { throw NSError(domain: "SIGNAL_OPERATION_FAILED", code: 1) }
  }
  private static func perform(_ encoded: String) throws -> String {
    guard encoded.utf8.count <= 4_000_000 else { throw SignalBridgeFailure.capacity }
    let input = try JSONDecoder().decode(SignalInput.self, from: Data(encoded.utf8))
    let context = NullContext()
    let store: SignalStore
    if input.operation == "create" {
      guard input.state == nil else { throw SignalBridgeFailure.invalid }
      let identity = IdentityKeyPair.generate()
      store = try SignalStore(SignalState(identity: identity.serialize().base64EncodedString(), registration: UInt32.random(in: 1...16383)))
      let signed = PrivateKey.generate()
      let signature = identity.privateKey.generateSignature(message: signed.publicKey.serialize())
      try store.storeSignedPreKey(SignedPreKeyRecord(id: 1, timestamp: UInt64(Date().timeIntervalSince1970 * 1000), privateKey: signed, signature: signature), id: 1, context: context)
    } else {
      guard let state = input.state else { throw SignalBridgeFailure.invalid }
      store = try SignalStore(state)
    }
    var result: [String: Any] = [:]
    switch input.operation {
    case "create", "replenish":
      let count = input.count ?? 50
      guard count > 0, count <= 100, store.state.preKeys.count + count <= 200,
            store.state.kyberKeys.count + count <= 200, store.state.nextPreKey < 0x7fffffff - UInt32(count) else { throw SignalBridgeFailure.capacity }
      let identity = try store.identityKeyPair(context: context)
      for _ in 0..<count {
        let id = store.state.nextPreKey
        let ec = PrivateKey.generate(), kem = KEMKeyPair.generate()
        try store.storePreKey(PreKeyRecord(id: id, privateKey: ec), id: id, context: context)
        let signature = identity.privateKey.generateSignature(message: kem.publicKey.serialize())
        try store.storeKyberPreKey(KyberPreKeyRecord(id: id, timestamp: UInt64(Date().timeIntervalSince1970 * 1000), keyPair: kem, signature: signature), id: id, context: context)
        store.state.nextPreKey += 1
      }
      result = try publicBundle(store)
    case "public":
      result = try publicBundle(store)
    case "session":
      guard let peer = input.peer, peer.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw SignalBridgeFailure.invalid }
      let remote = try ProtocolAddress(name: peer, deviceId: 1)
      result = ["needed": try store.loadSession(for: remote, context: context)?.hasCurrentState != true]
    case "encrypt", "decrypt":
      guard let own = input.own, let peer = input.peer, own != peer,
            own.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
            peer.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
            let expected = input.expectedIdentity, let message = input.message,
            message.count <= 180_000, let bytes = Data(base64Encoded: message) else { throw SignalBridgeFailure.invalid }
      let local = try ProtocolAddress(name: own, deviceId: 1), remote = try ProtocolAddress(name: peer, deviceId: 1)
      try store.pin(expected, for: remote)
      if input.operation == "encrypt" {
        if try store.loadSession(for: remote, context: context)?.hasCurrentState != true {
          guard let bundle = input.bundle, bundle.identity == expected, bundle.device == 1 else { throw SignalBridgeFailure.invalid }
          let native = try PreKeyBundle(registrationId: bundle.registration, deviceId: bundle.device,
            prekeyId: bundle.oneTime.id, prekey: PublicKey(store.bytes(bundle.oneTime.key)),
            signedPrekeyId: bundle.signed.id, signedPrekey: PublicKey(store.bytes(bundle.signed.key)),
            signedPrekeySignature: store.bytes(bundle.signed.signature), identity: IdentityKey(bytes: store.bytes(bundle.identity)),
            kyberPrekeyId: bundle.oneTime.kyber.id, kyberPrekey: KEMPublicKey(store.bytes(bundle.oneTime.kyber.key)),
            kyberPrekeySignature: store.bytes(bundle.oneTime.kyber.signature))
          try processPreKeyBundle(native, for: remote, ourAddress: local, sessionStore: store, identityStore: store, context: context)
        }
        let message = try signalEncrypt(message: bytes, for: remote, localAddress: local, sessionStore: store, identityStore: store, context: context)
        result = ["type": Int(message.messageType.rawValue), "message": message.serialize().base64EncodedString()]
      } else {
        let plaintext: Data
        switch input.type {
        case 3:
          plaintext = try signalDecryptPreKey(message: PreKeySignalMessage(bytes: bytes), from: remote, localAddress: local, sessionStore: store, identityStore: store, preKeyStore: store, signedPreKeyStore: store, kyberPreKeyStore: store, context: context)
        case 2:
          plaintext = try signalDecrypt(message: SignalMessage(bytes: bytes), from: remote, to: local, sessionStore: store, identityStore: store, context: context)
        default: throw SignalBridgeFailure.invalid
        }
        result = ["message": plaintext.base64EncodedString()]
      }
    default: throw SignalBridgeFailure.invalid
    }
    let stateObject = try JSONSerialization.jsonObject(with: JSONEncoder().encode(store.state))
    let output = try JSONSerialization.data(withJSONObject: ["state": stateObject, "result": result], options: [.sortedKeys])
    guard let string = String(data: output, encoding: .utf8) else { throw SignalBridgeFailure.invalid }
    return string
  }

  private static func publicBundle(_ store: SignalStore) throws -> [String: Any] {
    let context = NullContext()
    let identity = try store.identityKeyPair(context: context)
    let signed = try store.loadSignedPreKey(id: store.state.signedId, context: context)
    let oneTime: [[String: Any]] = try store.state.preKeys.keys.sorted { (UInt32($0) ?? 0) < (UInt32($1) ?? 0) }.compactMap { id in
      guard let number = UInt32(id), store.state.kyberKeys[id] != nil else { return nil }
      let key = try store.loadPreKey(id: number, context: context), kem = try store.loadKyberPreKey(id: number, context: context)
      return ["id": number, "key": try key.publicKey().serialize().base64EncodedString(),
              "kyber": ["id": number, "key": try kem.publicKey().serialize().base64EncodedString(), "signature": kem.signature.base64EncodedString()]]
    }
    return ["identity": identity.publicKey.serialize().base64EncodedString(), "registration": store.state.registration, "device": 1,
            "signed": ["id": signed.id, "key": try signed.publicKey().serialize().base64EncodedString(), "signature": signed.signature.base64EncodedString()], "oneTime": oneTime]
  }
}
