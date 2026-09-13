import { unavailableRepository } from './unavailable-repository';
// Historical feature helpers cannot activate the retired server-persistence backend.
// The active app uses DeviceMessenger through DeviceProvider.
const retired = unavailableRepository();
export function repository() {
  return retired;
}
