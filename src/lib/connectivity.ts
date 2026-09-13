// We intentionally disable third-party reachability probes. In NetInfo's fallback,
// that makes isInternetReachable=false mean "probe disabled", not "device offline".
// Use link connectivity; service failures are handled separately at the repository.
export function hasConnection(state: { isConnected: boolean | null }): boolean {
  return state.isConnected !== false;
}
