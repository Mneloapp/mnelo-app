import * as Signal from '@signalapp/libsignal-client';
import { randomInt } from 'node:crypto';
import type { PublishedSignalKeys } from '../../src/messenger/delivery/schema';

// Synthetic devices only. This uses the vendor's Rust-backed implementation,
// never a mocked cipher, and is never imported by mobile or hosted services.
export class SignalFixture
  implements
    Signal.SessionStore,
    Signal.IdentityKeyStore,
    Signal.PreKeyStore,
    Signal.SignedPreKeyStore,
    Signal.KyberPreKeyStore
{
  readonly identity: Signal.IdentityKeyPair;
  readonly registration: number;
  readonly address: Signal.ProtocolAddress;
  readonly sessions = new Map<string, Uint8Array<ArrayBuffer>>();
  readonly identities = new Map<string, Signal.PublicKey>();
  readonly prekeys = new Map<number, Signal.PreKeyRecord>();
  readonly signed = new Map<number, Signal.SignedPreKeyRecord>();
  readonly kyber = new Map<number, Signal.KyberPreKeyRecord>();
  nextPreKey = 2;
  constructor(
    readonly key: string,
    restored?: { identity: Signal.IdentityKeyPair; registration: number },
  ) {
    this.identity = restored?.identity ?? Signal.IdentityKeyPair.generate();
    this.registration = restored?.registration ?? randomInt(1, 16384);
    this.address = Signal.ProtocolAddress.new(key, 1);
  }
  async getIdentityKey() {
    return this.identity.privateKey;
  }
  async getIdentityKeyPair() {
    return this.identity;
  }
  async getLocalRegistrationId() {
    return this.registration;
  }
  async getIdentity(name: Signal.ProtocolAddress) {
    return this.identities.get(name.toString()) ?? null;
  }
  async isTrustedIdentity(name: Signal.ProtocolAddress, key: Signal.PublicKey) {
    return this.identities.get(name.toString())?.equals(key) ?? false;
  }
  async saveIdentity(name: Signal.ProtocolAddress, key: Signal.PublicKey) {
    if (!(await this.isTrustedIdentity(name, key))) throw new Error('FIXTURE_IDENTITY_CHANGED');
    return Signal.IdentityChange.NewOrUnchanged;
  }
  async saveSession(name: Signal.ProtocolAddress, record: Signal.SessionRecord) {
    this.sessions.set(name.toString(), record.serialize());
  }
  async getSession(name: Signal.ProtocolAddress) {
    const bytes = this.sessions.get(name.toString());
    return bytes ? Signal.SessionRecord.deserialize(bytes) : null;
  }
  async getExistingSessions(names: Signal.ProtocolAddress[]) {
    return Promise.all(
      names.map(async (name) => {
        const session = await this.getSession(name);
        if (!session) throw new Error('FIXTURE_NO_SESSION');
        return session;
      }),
    );
  }
  async savePreKey(id: number, record: Signal.PreKeyRecord) {
    this.prekeys.set(id, record);
  }
  async getPreKey(id: number) {
    return this.required(this.prekeys, id);
  }
  async removePreKey(id: number) {
    this.prekeys.delete(id);
  }
  async saveSignedPreKey(id: number, record: Signal.SignedPreKeyRecord) {
    this.signed.set(id, record);
  }
  async getSignedPreKey(id: number) {
    return this.required(this.signed, id);
  }
  async saveKyberPreKey(id: number, record: Signal.KyberPreKeyRecord) {
    this.kyber.set(id, record);
  }
  async getKyberPreKey(id: number) {
    return this.required(this.kyber, id);
  }
  async markKyberPreKeyUsed(id: number) {
    if (!this.kyber.delete(id)) throw new Error('FIXTURE_PREKEY_ALREADY_USED');
  }
  private required<T>(map: Map<number, T>, id: number): T {
    const value = map.get(id);
    if (!value) throw new Error('FIXTURE_PREKEY_MISSING');
    return value;
  }
  bundle() {
    const ec = Signal.PrivateKey.generate(),
      signed = Signal.PrivateKey.generate(),
      kem = Signal.KEMKeyPair.generate();
    const ecSignature = this.identity.privateKey.sign(signed.getPublicKey().serialize());
    const kemSignature = this.identity.privateKey.sign(kem.getPublicKey().serialize());
    this.prekeys.set(1, Signal.PreKeyRecord.new(1, ec.getPublicKey(), ec));
    this.signed.set(
      1,
      Signal.SignedPreKeyRecord.new(1, Date.now(), signed.getPublicKey(), signed, ecSignature),
    );
    this.kyber.set(1, Signal.KyberPreKeyRecord.new(1, Date.now(), kem, kemSignature));
    return Signal.PreKeyBundle.new(
      this.registration,
      1,
      1,
      ec.getPublicKey(),
      1,
      signed.getPublicKey(),
      ecSignature,
      this.identity.publicKey,
      1,
      kem.getPublicKey(),
      kemSignature,
    );
  }
  publicKeys(): PublishedSignalKeys {
    if (!this.signed.size) this.bundle();
    const to64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
    const signed = this.signed.get(1)!;
    return {
      identity: to64(this.identity.publicKey.serialize()),
      registration: this.registration,
      device: 1,
      signed: {
        id: 1,
        key: to64(signed.publicKey().serialize()),
        signature: to64(signed.signature()),
      },
      oneTime: [...this.prekeys].map(([id, key]) => {
        const kem = this.kyber.get(id)!;
        return {
          id,
          key: to64(key.publicKey().serialize()),
          kyber: { id, key: to64(kem.publicKey().serialize()), signature: to64(kem.signature()) },
        };
      }),
    };
  }
  replenish(count: number) {
    if (count < 1 || count > 100 || this.prekeys.size + count > 200)
      throw new Error('SIGNAL_KEYS_CAPACITY');
    for (let index = 0; index < count; index++) {
      const id = this.nextPreKey++,
        ec = Signal.PrivateKey.generate(),
        kem = Signal.KEMKeyPair.generate();
      this.prekeys.set(id, Signal.PreKeyRecord.new(id, ec.getPublicKey(), ec));
      this.kyber.set(
        id,
        Signal.KyberPreKeyRecord.new(
          id,
          Date.now(),
          kem,
          this.identity.privateKey.sign(kem.getPublicKey().serialize()),
        ),
      );
    }
  }
  async connect(peer: SignalFixture) {
    this.identities.set(peer.address.toString(), peer.identity.publicKey);
    peer.identities.set(this.address.toString(), this.identity.publicKey);
    await Signal.processPreKeyBundle(peer.bundle(), peer.address, this.address, this, this);
  }
  async encrypt(peer: Signal.ProtocolAddress, text: string) {
    const message = await Signal.signalEncrypt(Buffer.from(text), peer, this.address, this, this);
    return {
      type: message.type() as 2 | 3,
      ciphertext: Buffer.from(message.serialize()).toString('base64'),
    };
  }
  async decrypt(sender: Signal.ProtocolAddress, message: { type: 2 | 3; ciphertext: string }) {
    const bytes = Buffer.from(message.ciphertext, 'base64');
    const plaintext =
      message.type === 3
        ? await Signal.signalDecryptPreKey(
            Signal.PreKeySignalMessage.deserialize(bytes),
            sender,
            this.address,
            this,
            this,
            this,
            this,
            this,
          )
        : await Signal.signalDecrypt(
            Signal.SignalMessage.deserialize(bytes),
            sender,
            this.address,
            this,
            this,
          );
    return Buffer.from(plaintext).toString('utf8');
  }
}
