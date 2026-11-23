/**
 * GitHub Releases feed for electron-updater.
 * Keep owner/repo in one place so packaging + tests stay aligned.
 */

export const UPDATE_FEED = Object.freeze({
  provider: 'github',
  owner: 'severgrow',
  repo: 'dawlessdaw',
});

/**
 * @param {{ provider?: string, owner?: string, repo?: string }} [overrides]
 */
export function resolveUpdateFeed(overrides = {}) {
  return {
    provider: overrides.provider ?? UPDATE_FEED.provider,
    owner: overrides.owner ?? UPDATE_FEED.owner,
    repo: overrides.repo ?? UPDATE_FEED.repo,
  };
}

/**
 * Human-facing Releases page (manual download / first install).
 */
export function releasesPageUrl(feed = UPDATE_FEED) {
  return `https://github.com/${feed.owner}/${feed.repo}/releases`;
}
