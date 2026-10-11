import type { CollectionEntry } from 'astro:content';

type Package = NonNullable<CollectionEntry<'projects'>['data']['package']>;

const USER_AGENT = 'codinganarchy-site (https://codinganarchy.dev)';

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchLatestVersion({ registry, name }: Package): Promise<string | undefined> {
  if (registry === 'crates') {
    const { crate } = await fetchJson(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
    return crate.max_stable_version ?? crate.max_version;
  }
  const gem = await fetchJson(`https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`);
  return gem.version;
}

// One request per package per build, shared by every page that shows it.
const cache = new Map<string, Promise<string | undefined>>();

// The latest published version, or undefined if the registry can't be reached.
// A registry outage leaves the version off the page rather than failing the build.
export function getLatestVersion(pkg: Package | undefined) {
  if (!pkg) return Promise.resolve(undefined);
  const key = `${pkg.registry}:${pkg.name}`;
  let version = cache.get(key);
  if (!version) {
    version = fetchLatestVersion(pkg).catch((error) => {
      console.warn(`Couldn't fetch the latest version of ${key}: ${error}`);
      return undefined;
    });
    cache.set(key, version);
  }
  return version;
}
