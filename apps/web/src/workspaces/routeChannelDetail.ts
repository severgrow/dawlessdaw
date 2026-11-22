import type { ChannelFilter } from '@dawlessdaw/routing';

/** Show source filter and remapped dest channel (e.g. "6→13", not just "6"). */
export function formatRouteChannelDetail(channel?: ChannelFilter): string {
  if (!channel?.allow?.length) return '';
  const parts = channel.allow.map((src) => {
    const dest = channel.remap?.[src];
    return dest !== undefined && dest !== src ? `${src}→${dest}` : String(src);
  });
  return ` · ch ${parts.join(',')}`;
}
