import objectHash from 'object-hash';
import stringHash from 'string-hash';
import LRU from 'lru-cache';

export function hashPair(qs, qa = {}) {
  return stringHash(`${stringHash(qs)}${stringHash(objectHash(qa))}`);
}

export class Cache {
  /**
   * Cache Constructor
   * @param config
   */
  constructor(config) {
    const { cache = { maxAge: 1000 * 60 * 10 } } = config;
    this.cache = new LRU(cache);
  }

  /**
   * Executes and stores the data in the cache if the `key` is not present,
   * else it will retrieve the data using the `key`
   * @param key
   * @param fn
   * @returns {Promise.<*>}
   */
  async execute(key, fn) {
    let data = this.cache.get(key);
    if (!data) {
      data = await fn();
      this.cache.set(key, data);
    }

    return data;
  }

  /**
   * Invalidates the key and returns the value associated.
   * @param key
   * @returns {Promise.<*>}
   */
  async invalidate(key) {
    const data = this.cache.get(key);
    this.cache.del(key);
    return data;
  }
}
