import type { MidiRoute } from '@dawlessdaw/routing';
import type { HardwareTransport } from '@dawlessdaw/midi';

export function songTrackRoutes(routes: readonly MidiRoute[], source: string | null | undefined, track: number) {
  return routes.filter((route) =>
    route.enabled && route.sourcePortId === source &&
    !route.blockKinds?.includes('note-on') &&
    (!route.channel?.allow?.length || route.channel.allow.includes(track)),
  );
}

export function songTrackOutputs(
  routes: readonly MidiRoute[],
  ports: ReturnType<HardwareTransport['listPorts']>,
  source: string | null | undefined,
  track: number,
) {
  return songTrackRoutes(routes, source, track).flatMap((route) =>
    route.destinations.filter((dest) => dest.enabled !== false && dest.portId !== source).map((dest) => {
      const port = ports.find((item) => item.id === dest.portId);
      const channel = route.channel?.remap?.[track] ?? track;
      return { portId: dest.portId, name: port?.name ?? dest.portId, connected: port?.type === 'output' && port.state === 'connected', channel };
    }),
  );
}
