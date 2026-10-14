var MNPLRelations = (function () {
  const ADDON = "com.azeedel.marginnote.paper-library", PAGE = 25;
  let cache = null, nextRequest = 0, cooldown = 0, cooldownKey = null;
  const pending = new Map(), resolving = new Map();
  function fingerprint(doc) {
    return MNPLPaperData.doi(doc.doi).toLowerCase() || (/^https:\/\/openalex\.org\/W\d+$/.test((doc.metrics || {}).sourceUrl || "") ? doc.metrics.sourceUrl : "");
  }
  function path() { return Application.sharedInstance().documentPath + "/" + ADDON + "/relations-v1.json"; }
  function store() {
    if (cache) return cache;
    const data = NSData.dataWithContentsOfFile(path());
    let saved = { schemaVersion: 1, records: {} };
    if (data) {
      try { saved = MNPLNativeValues.plain(NSJSONSerialization.JSONObjectWithDataOptions(data, 0)); }
      catch (_) { throw new Error("参考文献缓存无法读取，原文件已保留。"); }
      if (!saved || saved.schemaVersion !== 1 || !saved.records || typeof saved.records !== "object" || Array.isArray(saved.records)) throw new Error("参考文献缓存格式无效，原文件已保留。");
    }
    cache = saved;
    return cache;
  }
  function get(doc) {
    const record = store().records[doc.id];
    return record && record.fingerprint === fingerprint(doc) ? record : {};
  }
  function save(doc, record) {
    const next = { schemaVersion: 1, records: Object.assign({}, store().records) };
    next.records[doc.id] = record;
    const dir = Application.sharedInstance().documentPath + "/" + ADDON;
    const manager = NSFileManager.defaultManager();
    if (!manager.fileExistsAtPath(dir) && !manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(dir, true, null)) throw new Error("无法保存参考文献列表。");
    const data = NSJSONSerialization.dataWithJSONObjectOptions(next, 0);
    if (!data || !data.writeToFileAtomically(path(), true)) throw new Error("参考文献列表保存失败。");
    cache = next;
  }
  function request(query) {
    return new Promise(function (resolve, reject) {
      function run() {
        try {
          const key = MNPLJournal.settings().openAlexKey;
          if (key !== cooldownKey) cooldown = 0;
          if (Date.now() < cooldown) { reject(new Error("OpenAlex 查询受限，请稍后重试；也可在设置中配置或检查 OpenAlex 密钥额度。")); return; }
          const url = "https://api.openalex.org/works?" + query + (key ? "&api_key=" + encodeURIComponent(key) : "");
          const req = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(url));
          req.setHTTPMethod("GET"); req.setTimeoutInterval(20); req.setAllHTTPHeaderFields({ Accept: "application/json" });
          NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(req, NSOperationQueue.mainQueue(), function (response, data, error) {
            if (error && !(typeof NSNull !== "undefined" && error instanceof NSNull)) { reject(new Error("参考文献查询失败，请检查网络。")); return; }
            const status = response ? Number(response.statusCode()) : 0;
            if (status === 429) {
              let seconds = 60;
              try {
                const headers = MNPLNativeValues.plain(response.allHeaderFields()), lower = {};
                Object.keys(headers || {}).forEach(function (name) { lower[name.toLowerCase()] = headers[name]; });
                seconds = Math.max(seconds, Number(lower["retry-after"]) || 0);
                if (String(lower["x-ratelimit-remaining"]) === "0") seconds = Math.max(seconds, Number(lower["x-ratelimit-reset"]) || 0);
              } catch (_) {}
              cooldown = Date.now() + Math.min(seconds, 86400) * 1000;
              cooldownKey = key;
              reject(new Error("OpenAlex 已限流或额度耗尽（429）。列表已保留，请稍后重试或检查设置中的 OpenAlex 密钥。")); return;
            }
            if (status !== 200 || !data) { reject(new Error("OpenAlex 查询返回 HTTP " + status + "。")); return; }
            try { resolve(MNPLNativeValues.plain(NSJSONSerialization.JSONObjectWithDataOptions(data, 0))); }
            catch (_) { reject(new Error("OpenAlex 返回内容无效。")); }
          });
        } catch (_) { reject(new Error("无法发起参考文献查询。")); }
      }
      const delay = Math.max(0, nextRequest - Date.now());
      nextRequest = Date.now() + delay + 1000;
      if (delay) NSTimer.scheduledTimerWithTimeInterval(delay / 1000, false, run); else run();
    });
  }
  function workId(doc) {
    const identity = fingerprint(doc);
    if (!identity) return Promise.reject(new Error("请先在文献信息中识别或填写 DOI，再获取引用列表。"));
    const cached = get(doc);
    if (/^W\d+$/.test(cached.workId || "")) return Promise.resolve(cached.workId);
    if (/^https:\/\/openalex\.org\/W\d+$/.test(identity)) return Promise.resolve(identity.split("/").pop());
    if (resolving.has(identity)) return resolving.get(identity);
    const job = request("filter=doi:" + encodeURIComponent(identity) + "&per_page=2").then(function (result) {
      const matches = (result.results || []).filter(function (item) { return MNPLPaperData.doi(item.doi).toLowerCase() === identity && /^https:\/\/openalex\.org\/W\d+$/.test(item.id || ""); });
      if (matches.length !== 1) throw new Error("OpenAlex 未找到与 DOI 唯一对应的文献。");
      return matches[0].id.split("/").pop();
    }).then(function (id) { resolving.delete(identity); return id; }, function (error) { resolving.delete(identity); throw error; });
    resolving.set(identity, job); return job;
  }
  function entry(item) {
    if (!item || !/^https:\/\/openalex\.org\/W\d+$/.test(item.id || "")) throw new Error("OpenAlex 返回的文献记录无效。");
    const doi = MNPLPaperData.doi(item.doi);
    return { id: item.id, title: String(item.display_name || "未提供标题").slice(0, 1000),
      authors: (item.authorships || []).map(function (a) { return a.author && a.author.display_name || ""; }).filter(Boolean).join(", ").slice(0, 1500),
      year: item.publication_year ? String(item.publication_year) : "", venue: String(item.primary_location && item.primary_location.source && item.primary_location.source.display_name || "").slice(0, 300),
      url: doi ? "https://doi.org/" + doi : item.id };
  }
  function load(doc, kind, append) {
    if (kind !== "references" && kind !== "citations") return Promise.reject(new Error("引用列表类型无效。"));
    if (!MNPLPaperData.settings().openAlex) return Promise.reject(new Error("请先在设置中启用 OpenAlex 文献数据源。"));
    const identity = fingerprint(doc), key = doc.id + ":" + identity + ":" + kind;
    if (pending.has(key)) return pending.get(key);
    const previous = get(doc)[kind];
    if (append && previous && !previous.cursor) return Promise.resolve(previous);
    const job = workId(doc).then(function (id) {
      const cursor = append && previous ? previous.cursor : "*";
      // cited_by is outgoing references; cites is incoming citations.
      return request("filter=" + (kind === "references" ? "cited_by:" : "cites:") + id + "&per_page=" + PAGE + "&cursor=" + encodeURIComponent(cursor) + "&select=id,display_name,doi,publication_year,authorships,primary_location").then(function (response) {
        if (!Array.isArray(response.results) || !response.meta || !Number.isSafeInteger(response.meta.count) || response.meta.count < 0) throw new Error("OpenAlex 引用列表格式无效。");
        const items = append && previous ? previous.items.slice() : [], seen = new Set(items.map(function (item) { return item.id; }));
        response.results.map(entry).forEach(function (item) { if (!seen.has(item.id)) { items.push(item); seen.add(item.id); } });
        const nextCursor = response.meta.next_cursor;
        const page = { items, total: response.meta.count, cursor: response.results.length && typeof nextCursor === "string" && nextCursor !== cursor ? nextCursor : null,
          source: "OpenAlex", updatedAt: new Date().toISOString() };
        const record = Object.assign({}, get(doc), { fingerprint: identity, workId: id });
        record[kind] = page; save(doc, record); return page;
      });
    }).then(function (result) { pending.delete(key); return result; }, function (error) { pending.delete(key); throw error; });
    pending.set(key, job); return job;
  }
  return { get, load, fingerprint };
})();
