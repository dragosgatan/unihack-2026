export const cacheSuccess = <Value>(load: () => Promise<Value>): (() => Promise<Value>) => {
  let cached: Promise<Value> | undefined;
  return () => {
    if (cached) return cached;
    const loading = load();
    loading.catch(() => {
      cached = undefined;
    });
    cached = loading;
    return loading;
  };
};
