import { describe, expect, it } from 'vitest';
import { UPDATE_FEED, releasesPageUrl, resolveUpdateFeed } from './update-feed.mjs';

describe('desktop update feed', () => {
  it('points electron-updater at severgrow/dawlessdaw GitHub Releases', () => {
    expect(UPDATE_FEED).toEqual({
      provider: 'github',
      owner: 'severgrow',
      repo: 'dawlessdaw',
    });
    expect(resolveUpdateFeed()).toEqual(UPDATE_FEED);
  });

  it('allows override for local smoke without mutating the default', () => {
    expect(resolveUpdateFeed({ owner: 'example' })).toEqual({
      provider: 'github',
      owner: 'example',
      repo: 'dawlessdaw',
    });
    expect(UPDATE_FEED.owner).toBe('severgrow');
  });

  it('builds the public Releases URL Patryk downloads from', () => {
    expect(releasesPageUrl()).toBe('https://github.com/severgrow/dawlessdaw/releases');
  });
});
