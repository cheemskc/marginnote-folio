var MNPLMetadataStore = (function () {
  const ADDON = "com.azeedel.marginnote.paper-library";
  let cache = null;

  function fail(code, message) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
  function directory() {
    const path = Application.sharedInstance().documentPath + "/" + ADDON;
    const manager = NSFileManager.defaultManager();
    if (!manager.fileExistsAtPath(path) &&
        !manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null)) {
      fail("STORE_UNAVAILABLE", "无法创建文献元数据目录。");
    }
    return path;
  }
  function file() { return directory() + "/metadata-v1.json"; }

  function plain(value, depth) {
    if (depth > 8) fail("STORE_INVALID", "文献元数据结构层级过深。");
    if (value == null || (typeof NSNull !== "undefined" && value instanceof NSNull)) return null;
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(function (item) { return plain(item, depth + 1); });
    if (typeof value.count === "function" && typeof value.objectAtIndex === "function") {
      return MNPLNativeValues.toArray(value).map(function (item) { return plain(item, depth + 1); });
    }
    const keys = typeof value.allKeys === "function" ? MNPLNativeValues.toArray(value.allKeys()) : Object.keys(value);
    const result = {};
    keys.forEach(function (key) {
      const name = String(key);
      if (name !== "__proto__" && name !== "constructor") {
        result[name] = plain(typeof value.objectForKey === "function" ? value.objectForKey(name) : value[name], depth + 1);
      }
    });
    return result;
  }

  function load() {
    if (cache) return cache;
    const path = file();
    const data = NSData.dataWithContentsOfFile(path);
    const length = data ? Number(typeof data.length === "function" ? data.length() : data.length) : 0;
    if (!length) { cache = { schemaVersion: 1, records: {} }; return cache; }
    let parsed;
    try { parsed = plain(NSJSONSerialization.JSONObjectWithDataOptions(data, 0), 0); }
    catch (_) { parsed = null; }
    if (parsed && parsed.schemaVersion > 1) fail("STORE_VERSION_UNSUPPORTED", "元数据文件来自较新版本，请升级插件后读取。");
    if (!parsed || parsed.schemaVersion !== 1 || !parsed.records || typeof parsed.records !== "object" || Array.isArray(parsed.records)) {
      if (!data.writeToFileAtomically(path + ".invalid-" + Date.now(), true)) {
        fail("STORE_INVALID", "元数据文件损坏且无法备份；未覆盖原文件。");
      }
      console.log("[MNPL] invalid metadata file backed up");
      cache = { schemaVersion: 1, records: {} };
    } else {
      const records = {};
      Object.keys(parsed.records).forEach(function (id) {
        try { records[id] = normalize(parsed.records[id]); }
        catch (_) { fail("STORE_INVALID", "文献元数据格式无效（" + id + "），原文件未修改。"); }
      });
      cache = { schemaVersion: 1, records };
    }
    return cache;
  }

  function normalize(input) {
    const source = input || {};
    if (typeof source !== "object" || Array.isArray(source)) fail("INVALID_METADATA", "文献信息必须是对象。");
    function text(key, max) {
      const value = source[key];
      if (value == null) return "";
      if (typeof value !== "string") fail("INVALID_METADATA", key + " 必须是文本。");
      const trimmed = value.trim();
      if (trimmed.length > max) fail("INVALID_METADATA", key + " 过长。");
      return trimmed;
    }
    const year = text("year", 4);
    if (year && !/^(18|19|20|21)\d{2}$/.test(year)) fail("INVALID_METADATA", "年份请输入四位数字。");
    const rating = source.rating === "" || source.rating == null ? 0 : Number(source.rating);
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) fail("INVALID_METADATA", "评分请选择 0 到 5 星。");
    if (source.favorite != null && typeof source.favorite !== "boolean") fail("INVALID_METADATA", "收藏状态必须是布尔值。");
    const rawMetrics = source.metrics == null ? {} : source.metrics;
    if (typeof rawMetrics !== "object" || Array.isArray(rawMetrics)) fail("INVALID_METADATA", "文献数据必须是对象。");
    const metrics = {};
    ["citations", "references"].forEach(function (key) {
      const value = rawMetrics[key];
      if (value == null || (typeof value === "string" && !value.trim())) { metrics[key] = null; return; }
      if (typeof value !== "number" && typeof value !== "string") fail("INVALID_METADATA", key + " 必须是非负整数。");
      const count = Number(value);
      if (!Number.isSafeInteger(count) || count < 0) fail("INVALID_METADATA", key + " 必须是非负整数。");
      metrics[key] = count;
    });
    ["type", "publisher", "source", "matchedTitle", "sourceUrl", "indexedAt", "updatedAt", "abstractSource"].forEach(function (key) {
      const value = rawMetrics[key];
      if (value == null) { metrics[key] = ""; return; }
      if (typeof value !== "string" || value.length > 500) fail("INVALID_METADATA", "文献数据 " + key + " 必须是 500 字以内的文本。");
      metrics[key] = value.trim();
    });
    if (metrics.sourceUrl && !/^https?:\/\/[^\s]+$/i.test(metrics.sourceUrl)) fail("INVALID_METADATA", "数据来源链接请输入 http 或 https 地址。");
    let journal;
    try { journal = MNPLBibliography.normalizeJournal(source.journal); }
    catch (error) { fail("INVALID_METADATA", error.message); }
    return { title: text("title", 500), authors: text("authors", 500), year, venue: text("venue", 250), journal,
      quartile: text("quartile", 40), rating, abstract: text("abstract", 12000), doi: text("doi", 200),
      favorite: source.favorite === true, metrics };
  }

  function get(id) { return load().records[id] || normalize({}); }
  function all() { return load().records; }
  function save(id, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) fail("INVALID_METADATA", "文献信息必须是对象。");
    const previous = get(id);
    const merged = Object.assign({}, previous, input);
    if (input.journal && typeof input.journal === "object" && !Array.isArray(input.journal)) {
      merged.journal = Object.assign({}, previous.journal, input.journal);
    }
    if (input.metrics && typeof input.metrics === "object" && !Array.isArray(input.metrics)) {
      merged.metrics = Object.assign({}, previous.metrics, input.metrics);
    }
    const record = normalize(merged);
    const data = { schemaVersion: 1, records: Object.assign({}, load().records) };
    data.records[id] = record;
    let written = false;
    try {
      const serialized = NSJSONSerialization.dataWithJSONObjectOptions(data, 0);
      written = serialized && serialized.writeToFileAtomically(file(), true);
    } catch (error) {
      console.log("[MNPL] metadata write failed: " + String(error && error.message || error));
    }
    if (!written) {
      fail("STORE_WRITE_FAILED", "文献元数据保存失败，请检查磁盘空间。");
    }
    cache = data;
    return record;
  }
  return { get, all, save };
})();
