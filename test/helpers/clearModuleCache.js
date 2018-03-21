export default function clearModuleCache() {
  Object.keys(require.cache).forEach((key) => { delete require.cache[key]; });
}
