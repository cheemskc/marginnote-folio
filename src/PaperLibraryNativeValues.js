var MNPLNativeValues = (function () {
  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value.count !== "function" || typeof value.objectAtIndex !== "function") {
      throw new Error("MarginNote 未返回可读取的文档列表。");
    }
    const count = Number(value.count());
    if (!Number.isInteger(count) || count < 0) throw new Error("MarginNote 文档列表数量无效。");
    const result = [];
    for (let i = 0; i < count; i += 1) result.push(value.objectAtIndex(i));
    return result;
  }
  function plain(value, depth) {
    if ((depth || 0) > 12) throw new Error("数据嵌套层级过深。");
    if (value == null || (typeof NSNull !== "undefined" && value instanceof NSNull)) return null;
    if (typeof value !== "object") return value;
    if (Array.isArray(value) || typeof value.objectAtIndex === "function") return toArray(value).map(function (entry) { return plain(entry, (depth || 0) + 1); });
    const keys = typeof value.allKeys === "function" ? toArray(value.allKeys()) : Object.keys(value);
    const result = {};
    keys.forEach(function (key) {
      key = String(key);
      if (key !== "__proto__" && key !== "constructor" && key !== "prototype") result[key] = plain(typeof value.objectForKey === "function" ? value.objectForKey(key) : value[key], (depth || 0) + 1);
    });
    return result;
  }
  return { toArray, plain };
})();
