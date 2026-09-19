import { getRandomBytes, randomUUID } from 'expo-crypto';
import { openDeviceDatabase } from './database';
import { DeviceMessenger } from './engine';
import { PeerMesh } from './peer-mesh';
import { makePeer } from './peer-platform';
import { DeviceCalls } from './calls';
import { relayAddress } from './signaling';
import { devicePhoneClient } from './phone-client';
import { deviceIceConfiguration } from './ice-client';
import { DeviceWake } from './wake-client';
import { cacheSystemCallContact, observeSystemCalls } from './system-calls';
import { enrollmentAllowsAccess } from './enrollment';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { ApplicationDelivery } from './delivery/application';
import { DeliveredCallControl } from './delivery/call-control';
import { nativeSignal } from './delivery/native';
import type { DeliveryState } from './delivery/pump';
import { savedPhoneName, savedPhoneNames } from './phonebook';
import { deliveryV2 } from './delivery-mode';
type NetworkView = {
  mesh: PeerMesh | null;
  calls: DeviceCalls | null;
  invalid: boolean;
  delivery: DeliveryState | null;
};
const emptyNetwork: NetworkView = { mesh: null, calls: null, invalid: false, delivery: null };
let view: NetworkView = emptyNetwork;
const observers = new Set<() => void>();
export const deviceNetworkSnapshot = () => view;
export const observeDeviceNetwork = (listener: () => void) => {
  observers.add(listener);
  return () => {
    observers.delete(listener);
  };
};
function publish(next: NetworkView) {
  view = next;
  observers.forEach((listener) => listener());
}
export function deviceNetworkFailed() {
  publish({ ...emptyNetwork, invalid: true });
}
let enginePromise: Promise<DeviceMessenger> | null = null;
let engineUsers = 0;
let closing: Promise<void> = Promise.resolve();
let network: {
  engine: DeviceMessenger;
  key: string;
  mesh: PeerMesh;
  calls: DeviceCalls;
  users: number;
  listeners: Set<() => void>;
  dispose: () => void;
} | null = null;
export async function acquireDeviceEngine() {
  engineUsers++;
  if (!enginePromise)
    enginePromise = closing.then(async () => {
      const database = await openDeviceDatabase();
      const engine = new DeviceMessenger(database, getRandomBytes, randomUUID);
      try {
        await engine.initialize();
        return engine;
      } catch (error) {
        await database.close();
        throw error;
      }
    });
  const current = enginePromise;
  let engine: DeviceMessenger;
  try {
    engine = await current;
  } catch (error) {
    engineUsers--;
    if (enginePromise === current) enginePromise = null;
    throw error;
  }
  let released = false;
  return {
    engine,
    release() {
      if (released) return;
      released = true;
      engineUsers--;
      if (engineUsers === 0 && enginePromise === current) {
        enginePromise = null;
        closing = engine.close().catch(() => undefined);
      }
    },
  };
}
export function acquireDeviceNetwork(engine: DeviceMessenger, changed: () => void) {
  const own = engine.currentIdentity();
  if (
    !own ||
    !enrollmentAllowsAccess(
      own,
      engine.currentEnrollment(),
      process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
      process.env.EXPO_PUBLIC_APP_ENV,
    )
  )
    return null;
  if (network && (network.engine !== engine || network.key !== own.key)) {
    network.dispose();
    network = null;
  }
  if (!network) {
    const local = !process.env.EXPO_PUBLIC_APP_ENV || process.env.EXPO_PUBLIC_APP_ENV === 'local';
    const address = relayAddress(process.env.EXPO_PUBLIC_RELAY_URL, local);
    if (!address) return null;
    const phone = devicePhoneClient(own);
    if (!local && !phone) throw new Error('PHONE_SERVICE_REQUIRED');
    const queued = deliveryV2;
    if (engine.currentDeliveryVersion() === 2 && !queued)
      throw new Error('DELIVERY_UPDATE_REQUIRED');
    if (queued && !phone) throw new Error('PHONE_SERVICE_REQUIRED');
    const listeners = new Set<() => void>();
    const mesh = new PeerMesh(
      own,
      engine,
      address,
      makePeer,
      randomUUID,
      () => listeners.forEach((listener) => listener()),
      local ? undefined : deviceIceConfiguration(phone!),
      phone && !local
        ? async (number, peer) =>
            (await phone.execute({ action: 'lookup', phone: number })).key === peer
        : undefined,
    );
    const delivery = queued
      ? new ApplicationDelivery(
          engine,
          phone!,
          nativeSignal(),
          getRandomBytes,
          randomUUID,
          (state) => {
            if (view.mesh === mesh) {
              publish({ ...view, delivery: state });
              listeners.forEach((listener) => listener());
            }
          },
          (number) => savedPhoneName(number, engine.currentEnrollment()?.phone),
        )
      : null;
    if (delivery) {
      mesh.deliveryWake = () => delivery.pump.receiveWake();
      mesh.callSignaling = (peer, envelope) => delivery.sendSignal(peer, envelope);
    } else if (phone && !local) mesh.wake = new DeviceWake(engine, phone);
    const calls = new DeviceCalls(
      engine,
      mesh,
      randomUUID,
      delivery
        ? {
            ringingReceipt: (peer, id) => delivery.sendRingingReceipt(peer, id),
            send: async (peer, control) => {
              if (!(await delivery.sendDurable(peer, control))) throw new Error('CALL_UNAVAILABLE');
            },
          }
        : undefined,
    );
    let stopCallTracking: (() => void) | undefined;
    if (delivery) {
      const control = new DeliveredCallControl(engine, calls);
      stopCallTracking = calls.subscribe(() => {
        void control.track().catch(() => undefined);
      });
      delivery.calls = {
        ringingReceipt: (peer, id) => calls.receiveRingingReceipt(peer, id),
        recover: () => control.recover(),
        control: (peer, packet, context) => control.receive(peer, packet, context),
        signal: (peer, envelope) => mesh.receiveCallSignal(peer, envelope),
      };
    }
    const stopSystem = phone
      ? observeSystemCalls(calls, phone, async (call) => {
          const contact = (await engine.contacts()).find(
            (peer) => peer.key === call.peer && !peer.blocked,
          );
          if (!contact) return null;
          const names = await engine.contactDisplayNames();
          const saved = contact.phone
            ? await savedPhoneName(contact.phone, engine.currentEnrollment()?.phone).catch(
                () => null,
              )
            : null;
          const name = saved ?? names.get(contact.key) ?? contact.name;
          await cacheSystemCallContact(contact.key, name, contact.phone ?? '').catch(
            () => undefined,
          );
          const chat = call.group ? await engine.chat(call.chat) : null;
          return {
            name: chat ? `${name} · ${chat.title}` : name,
            phone: call.group ? '' : (contact.phone ?? ''),
          };
        })
      : () => undefined;
    if (phone)
      void (async () => {
        const contacts = (await engine.contacts()).filter((contact) => !contact.blocked);
        const names = await engine.contactDisplayNames();
        const phoneNames = await savedPhoneNames(
          contacts.flatMap((contact) => (contact.phone ? [contact.phone] : [])),
          engine.currentEnrollment()?.phone,
        ).catch(() => new Map<string, string>());
        for (const contact of contacts) {
          const name = contact.phone ? phoneNames.get(contact.phone) : null;
          await cacheSystemCallContact(
            contact.key,
            name ?? names.get(contact.key) ?? contact.name,
            contact.phone ?? '',
          ).catch(() => undefined);
        }
      })().catch(() => undefined);
    engine.attachTransport(
      delivery
        ? {
            send: () => false, // Callers must await the durable API. No live fallback.
            sendDurable: (peer, packet, event) => delivery.sendDurable(peer, packet, event),
            stop: () => {
              delivery.stop();
              mesh.stop();
            },
          }
        : mesh,
    );
    mesh.start();
    const reconcile = () => {
      void mesh.enforceContacts().catch(() => undefined);
      void mesh.wake?.reconcile().catch(() => undefined);
      if (delivery) {
        delivery.pump.wake();
        void engine.flush().catch(() => undefined);
      }
    };
    const unsubscribe = engine.subscribe(reconcile);
    // A block made without connectivity remains queued until acknowledged.
    // This timer runs only while this existing shared runtime is alive; it does
    // not request independent background execution or send empty network polls.
    const revocations = setInterval(() => {
      void mesh.wake?.reconcile().catch(() => undefined);
    }, 30000);
    reconcile();
    publish({ mesh, calls, invalid: false, delivery: delivery ? 'starting' : null });
    if (delivery)
      void delivery
        .start()
        .then(() => engine.flush())
        .catch(() => {
          if (view.mesh === mesh) publish({ ...view, delivery: 'update-required' });
        });
    const foreground = delivery
      ? AppState.addEventListener('change', (state) => {
          if (state === 'active') {
            delivery.pump.receiveWake();
            void engine.flush().catch(() => undefined);
          }
        })
      : null;
    const connectivity = delivery
      ? NetInfo.addEventListener((state) => {
          if (state.isConnected) {
            delivery.pump.receiveWake();
            void engine.flush().catch(() => undefined);
          }
        })
      : null;
    network = {
      engine,
      key: own.key,
      mesh,
      calls,
      listeners,
      users: 0,
      dispose() {
        clearInterval(revocations);
        unsubscribe();
        stopSystem();
        stopCallTracking?.();
        foreground?.remove();
        connectivity?.();
        delivery?.stop();
        mesh.stop();
      },
    };
  }
  const current = network;
  current.users++;
  current.listeners.add(changed);
  let released = false;
  return {
    mesh: current.mesh,
    calls: current.calls,
    release() {
      if (released) return;
      released = true;
      current.listeners.delete(changed);
      current.users--;
      if (current.users === 0 && network === current) {
        network = null;
        current.dispose();
        publish(emptyNetwork);
      }
    },
  };
}
