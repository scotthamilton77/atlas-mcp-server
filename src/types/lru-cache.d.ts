declare module 'lru-cache' {
  export interface Options<K, V> {
    max?: number;
    ttl?: number;
    updateAgeOnGet?: boolean;
    updateAgeOnHas?: boolean;
    allowStale?: boolean;
    dispose?: (value: V, key: K) => void;
    noDisposeOnSet?: boolean;
    maxSize?: number;
    sizeCalculation?: (value: V, key: K) => number;
  }

  export default class LRUCache<K = any, V = any> {
    constructor(options?: Options<K, V>);
    set(key: K, value: V, options?: { ttl?: number }): boolean;
    get(key: K): V | undefined;
    peek(key: K): V | undefined;
    has(key: K): boolean;
    delete(key: K): boolean;
    clear(): void;
    keys(): IterableIterator<K>;
    values(): IterableIterator<V>;
    entries(): IterableIterator<[K, V]>;
    forEach(callbackfn: (value: V, key: K, cache: this) => void): void;
    load(arr: readonly (readonly [K, V])[]): void;
    dump(): Array<[K, V]>;
    readonly size: number;
    readonly max: number;
    readonly maxSize: number | undefined;
    readonly allowStale: boolean;
    readonly updateAgeOnGet: boolean;
    readonly updateAgeOnHas: boolean;
  }
}
