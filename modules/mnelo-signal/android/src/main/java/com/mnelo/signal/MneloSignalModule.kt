package com.mnelo.signal

import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.security.SecureRandom
import java.util.UUID
import org.signal.libsignal.protocol.*
import org.signal.libsignal.protocol.ecc.*
import org.signal.libsignal.protocol.kem.*
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.groups.state.SenderKeyRecord
import org.signal.libsignal.protocol.state.*
import org.signal.libsignal.protocol.state.IdentityKeyStore.Direction
import org.signal.libsignal.protocol.state.IdentityKeyStore.IdentityChange

private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, Base64.NO_WRAP)
private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)
private fun JSONObject.ids(): List<String> = keys().asSequence().toList()
private class IdentityChanged : Exception()

// Vendor serialized records only. JS commits the returned state atomically with
// its SQLCipher message/outbox transaction. This module never persists or logs it.
private class SignalStore(val state: JSONObject) : SignalProtocolStore {
  init {
    require(state.getInt("version") == 1 && state.getInt("registration") in 1..16383)
    for ((key, max) in mapOf("sessions" to 500, "identities" to 500, "preKeys" to 200, "signedKeys" to 32, "kyberKeys" to 200)) {
      require(state.getJSONObject(key).length() <= max)
    }
  }
  private fun name(address: SignalProtocolAddress) = "${address.name}:${address.deviceId}"
  private fun records(kind: String) = state.getJSONObject(kind)
  private fun read(kind: String, id: String): ByteArray = decode(records(kind).getString(id))
  private fun write(kind: String, id: String, data: ByteArray, limit: Int = 200) {
    val values = records(kind)
    require(values.has(id) || values.length() < limit)
    values.put(id, encode(data))
  }
  fun pin(address: SignalProtocolAddress, value: String) {
    IdentityKey(decode(value))
    val previous = records("identities").optString(name(address), "")
    if (previous.isNotEmpty() && previous != value) throw IdentityChanged()
    write("identities", name(address), decode(value), 500)
  }
  override fun getIdentityKeyPair() = IdentityKeyPair(decode(state.getString("identity")))
  override fun getLocalRegistrationId() = state.getInt("registration")
  override fun getIdentity(address: SignalProtocolAddress): IdentityKey? =
    if (records("identities").has(name(address))) IdentityKey(read("identities", name(address))) else null
  override fun isTrustedIdentity(address: SignalProtocolAddress, identity: IdentityKey, direction: Direction) =
    records("identities").optString(name(address), "") == encode(identity.serialize())
  override fun saveIdentity(address: SignalProtocolAddress, identity: IdentityKey): IdentityChange {
    if (!isTrustedIdentity(address, identity, Direction.RECEIVING)) throw IdentityChanged()
    return IdentityChange.NEW_OR_UNCHANGED
  }
  override fun loadSession(address: SignalProtocolAddress): SessionRecord? =
    if (containsSession(address)) SessionRecord(read("sessions", name(address))) else null
  override fun loadExistingSessions(addresses: List<SignalProtocolAddress>): List<SessionRecord> =
    addresses.map { loadSession(it) ?: throw NoSessionException(it, "SIGNAL_SESSION_REQUIRED") }
  override fun storeSession(address: SignalProtocolAddress, record: SessionRecord) = write("sessions", name(address), record.serialize(), 500)
  override fun containsSession(address: SignalProtocolAddress) = records("sessions").has(name(address))
  override fun getSubDeviceSessions(name: String): List<Int> = records("sessions").ids()
    .filter { it.startsWith("$name:") }.map { it.substringAfterLast(':').toInt() }.filter { it != 1 }
  override fun deleteSession(address: SignalProtocolAddress) { records("sessions").remove(name(address)) }
  override fun deleteAllSessions(name: String) { records("sessions").ids().filter { it.startsWith("$name:") }.forEach { records("sessions").remove(it) } }
  override fun loadPreKey(id: Int) = PreKeyRecord(read("preKeys", id.toString()))
  override fun storePreKey(id: Int, record: PreKeyRecord) = write("preKeys", id.toString(), record.serialize())
  override fun containsPreKey(id: Int) = records("preKeys").has(id.toString())
  override fun removePreKey(id: Int) { records("preKeys").remove(id.toString()) }
  override fun loadSignedPreKey(id: Int) = SignedPreKeyRecord(read("signedKeys", id.toString()))
  override fun loadSignedPreKeys(): List<SignedPreKeyRecord> = records("signedKeys").ids().map { loadSignedPreKey(it.toInt()) }
  override fun storeSignedPreKey(id: Int, record: SignedPreKeyRecord) = write("signedKeys", id.toString(), record.serialize(), 32)
  override fun containsSignedPreKey(id: Int) = records("signedKeys").has(id.toString())
  override fun removeSignedPreKey(id: Int) { records("signedKeys").remove(id.toString()) }
  override fun loadKyberPreKey(id: Int) = KyberPreKeyRecord(read("kyberKeys", id.toString()))
  override fun loadKyberPreKeys(): List<KyberPreKeyRecord> = records("kyberKeys").ids().map { loadKyberPreKey(it.toInt()) }
  override fun storeKyberPreKey(id: Int, record: KyberPreKeyRecord) = write("kyberKeys", id.toString(), record.serialize())
  override fun containsKyberPreKey(id: Int) = records("kyberKeys").has(id.toString())
  override fun markKyberPreKeyUsed(id: Int, signedPreKeyId: Int, baseKey: ECPublicKey) {
    require(records("kyberKeys").remove(id.toString()) != null)
  }
  // Groups fan out individual authenticated sessions; sender-key distribution is
  // not exposed through this binding.
  override fun storeSenderKey(sender: SignalProtocolAddress, distributionId: UUID, record: SenderKeyRecord) { error("SIGNAL_OPERATION_UNSUPPORTED") }
  override fun loadSenderKey(sender: SignalProtocolAddress, distributionId: UUID): SenderKeyRecord? = null
}

class MneloSignalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MneloSignal")
    Function("version") { "0.102.2" }
    AsyncFunction("run") { encoded: String ->
      try { runOperation(encoded) }
      catch (_: IdentityChanged) { throw IllegalStateException("SIGNAL_IDENTITY_CHANGED") }
      catch (_: Exception) { throw IllegalStateException("SIGNAL_OPERATION_FAILED") }
    }
  }
  private fun runOperation(encoded: String): String {
    require(encoded.toByteArray().size <= 4_000_000)
    val input = JSONObject(encoded)
    val operation = input.getString("operation")
    val store: SignalStore
    if (operation == "create") {
      require(!input.has("state") || input.isNull("state"))
      val identity = IdentityKeyPair.generate()
      val state = JSONObject().put("version", 1).put("identity", encode(identity.serialize()))
        .put("registration", SecureRandom().nextInt(16383) + 1).put("nextPreKey", 1).put("signedId", 1)
      for (key in listOf("sessions", "identities", "preKeys", "signedKeys", "kyberKeys")) state.put(key, JSONObject())
      store = SignalStore(state)
      val signed = ECKeyPair.generate()
      store.storeSignedPreKey(1, SignedPreKeyRecord(1, System.currentTimeMillis(), signed,
        identity.privateKey.calculateSignature(signed.publicKey.serialize())))
    } else store = SignalStore(input.getJSONObject("state"))
    val result: JSONObject
    when (operation) {
      "create", "replenish" -> {
        val count = input.optInt("count", 50)
        val next = store.state.getInt("nextPreKey")
        require(count in 1..100 && next in 1 until (Int.MAX_VALUE - count))
        require(store.state.getJSONObject("preKeys").length() + count <= 200 && store.state.getJSONObject("kyberKeys").length() + count <= 200)
        val identity = store.identityKeyPair
        for (id in next until next + count) {
          store.storePreKey(id, PreKeyRecord(id, ECKeyPair.generate()))
          val kem = KEMKeyPair.generate(KEMKeyType.KYBER_1024)
          store.storeKyberPreKey(id, KyberPreKeyRecord(id, System.currentTimeMillis(), kem,
            identity.privateKey.calculateSignature(kem.publicKey.serialize())))
        }
        store.state.put("nextPreKey", next + count)
        result = publicBundle(store)
      }
      "public" -> result = publicBundle(store)
      "session" -> {
        val peer = input.getString("peer")
        require(Regex("^[a-f0-9]{64}$").matches(peer))
        result = JSONObject().put("needed", store.loadSession(SignalProtocolAddress(peer, 1))?.hasSenderChain() != true)
      }
      "encrypt", "decrypt" -> {
        val own = input.getString("own"); val peer = input.getString("peer")
        require(own != peer && Regex("^[a-f0-9]{64}$").matches(own) && Regex("^[a-f0-9]{64}$").matches(peer))
        val local = SignalProtocolAddress(own, 1); val remote = SignalProtocolAddress(peer, 1)
        val expected = input.getString("expectedIdentity")
        store.pin(remote, expected)
        val message = input.getString("message")
        require(message.length <= 180_000)
        val cipher = SessionCipher(store, local, remote)
        if (operation == "encrypt") {
          if (store.loadSession(remote)?.hasSenderChain() != true) {
            val bundle = input.getJSONObject("bundle")
            require(bundle.getString("identity") == expected && bundle.getInt("device") == 1)
            val signed = bundle.getJSONObject("signed"); val key = bundle.getJSONObject("oneTime"); val kem = key.getJSONObject("kyber")
            SessionBuilder(store, remote, local).process(PreKeyBundle(bundle.getInt("registration"), 1,
              key.getInt("id"), ECPublicKey(decode(key.getString("key"))),
              signed.getInt("id"), ECPublicKey(decode(signed.getString("key"))), decode(signed.getString("signature")),
              IdentityKey(decode(expected)), kem.getInt("id"), KEMPublicKey(decode(kem.getString("key"))), decode(kem.getString("signature"))))
          }
          val encrypted = cipher.encrypt(decode(message))
          result = JSONObject().put("type", encrypted.type).put("message", encode(encrypted.serialize()))
        } else {
          val plain = when (input.getInt("type")) {
            3 -> cipher.decrypt(PreKeySignalMessage(decode(message)))
            2 -> cipher.decrypt(SignalMessage(decode(message)))
            else -> error("SIGNAL_TYPE_INVALID")
          }
          result = JSONObject().put("message", encode(plain))
        }
      }
      else -> error("SIGNAL_OPERATION_INVALID")
    }
    return JSONObject().put("state", store.state).put("result", result).toString()
  }
  private fun publicBundle(store: SignalStore): JSONObject {
    val signed = store.loadSignedPreKey(store.state.getInt("signedId"))
    val oneTime = JSONArray()
    for (id in store.state.getJSONObject("preKeys").ids().map { it.toInt() }.sorted()) {
      if (!store.containsKyberPreKey(id)) continue
      val key = store.loadPreKey(id); val kem = store.loadKyberPreKey(id)
      oneTime.put(JSONObject().put("id", id).put("key", encode(key.keyPair.publicKey.serialize()))
        .put("kyber", JSONObject().put("id", id).put("key", encode(kem.keyPair.publicKey.serialize())).put("signature", encode(kem.signature))))
    }
    return JSONObject().put("identity", encode(store.identityKeyPair.publicKey.serialize()))
      .put("registration", store.localRegistrationId).put("device", 1)
      .put("signed", JSONObject().put("id", signed.id).put("key", encode(signed.keyPair.publicKey.serialize())).put("signature", encode(signed.signature)))
      .put("oneTime", oneTime)
  }
}
