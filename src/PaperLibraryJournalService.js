var MNPLJournal = (function () {
  const ADDON = "com.azeedel.marginnote.paper-library";
  let settingsCache = null;
  const pending = new Map(), cache = new Map();
  let requestQueue = Promise.resolve(), lastRequest = 0, easyScholarBlockedUntil = 0;
  function settings() {
    if (settingsCache) return Object.assign({}, settingsCache);
    const data = NSData.dataWithContentsOfFile(Application.sharedInstance().documentPath + "/" + ADDON + "/journal-settings-v1.json");
    let value = {};
    if (data) {
      value = MNPLNativeValues.plain(NSJSONSerialization.JSONObjectWithDataOptions(data, 0));
      if (!value || value.schemaVersion !== 1) throw new Error("期刊数据源设置格式无效，未覆盖原文件。");
    }
    settingsCache = { schemaVersion: 1, easyScholar: value.easyScholar !== false, openAlex: value.openAlex !== false,
      easyScholarKey: typeof value.easyScholarKey === "string" ? value.easyScholarKey : "",
      openAlexKey: typeof value.openAlexKey === "string" ? value.openAlexKey : "" };
    return Object.assign({}, settingsCache);
  }
  function saveSettings(patch) {
    const value = Object.assign(settings(), patch);
    ["easyScholarKey", "openAlexKey"].forEach(function (key) {
      if (typeof value[key] !== "string" || value[key].length > 1000) throw new Error("密钥格式无效。");
      value[key] = value[key].trim();
    });
    const dir = Application.sharedInstance().documentPath + "/" + ADDON;
    const manager = NSFileManager.defaultManager();
    if (!manager.fileExistsAtPath(dir) && !manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(dir, true, null)) throw new Error("无法保存期刊数据源设置。");
    const data = NSJSONSerialization.dataWithJSONObjectOptions(value, 0);
    if (!data || !data.writeToFileAtomically(dir + "/journal-settings-v1.json", true)) throw new Error("期刊数据源设置保存失败。");
    settingsCache = value;
    cache.clear();
  }
  function number(value) {
    if (value == null || String(value).trim() === "" || !/^\d+(\.\d+)?$/.test(String(value).trim())) return null;
    const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  function parseEasyScholar(response, venue) {
    if (!response || response.code !== 200) {
      if (Number(response && response.code) === 40006) {
        easyScholarBlockedUntil = Date.now() + 60000;
        throw new Error("easyScholar 请求频率过高，已暂停一分钟。");
      }
      if ([40002, 40005].indexOf(Number(response && response.code)) >= 0) throw new Error("easyScholar 密钥无效或未配置，请在设置中检查。");
      throw new Error("easyScholar 查询失败，请检查密钥或稍后重试。");
    }
    const all = response.data && response.data.officialRank && response.data.officialRank.all;
    if (!all || typeof all !== "object") throw new Error("easyScholar 没有返回该期刊的分级数据。");
    const jcr = String(all.sci || all.ssci || ""), cas = String(all.sciUp || all.sciBase || "");
    const known = { xr: "新锐", ccf: "CCF", cssci: "CSSCI", ei: "EI", ssci: "SSCI", ahci: "A&HCI", sciif5: "5年IF" };
    const ignored = { sci: true, ssci: true, sciup: true, scibase: true, sciif: true };
    const extra = Object.keys(all).filter(function (field) {
      return !ignored[field.toLowerCase()] && all[field] != null && String(all[field]).trim();
    }).map(function (field) {
      return (known[field.toLowerCase()] || field) + " " + String(all[field]).trim();
    });
    const custom = response.data.customRank || {};
    const rankInfo = Array.isArray(custom.rankInfo) ? custom.rankInfo : [];
    const customById = {};
    rankInfo.forEach(function (entry) { if (entry && entry.uuid) customById[String(entry.uuid)] = entry; });
    (Array.isArray(custom.rank) ? custom.rank : []).forEach(function (entry) {
      const parts = String(entry).split("&&&"), meta = customById[parts[0]], level = Number(parts[1]);
      if (!meta || !Number.isInteger(level) || level < 1 || level > 5) return;
      const field = ["oneRankText", "twoRankText", "threeRankText", "fourRankText", "fiveRankText"][level - 1];
      const label = String(meta[field] || level).trim(), name = String(meta.abbName || meta.name || "自定义分区").trim();
      if (label) extra.push(name + " " + label);
    });
    const rank = extra.join(" · ").slice(0, 500);
    const result = { venue, jcrQuartile: jcr, casQuartile: cas, rankLabel: rank, impactFactor: number(all.sciif),
      year: "", source: "easyScholar", sourceUrl: "https://www.easyscholar.cc", updatedAt: new Date().toISOString() };
    if (!jcr && !cas && !rank && result.impactFactor === null) throw new Error("easyScholar 未返回可显示的分区或影响因子。");
    return result;
  }
  function identity(text) { return String(text || "").normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " "); }
  function parseOpenAlex(response, venue) {
    const matches = (response && response.results || []).filter(function (source) { return source.type === "journal" && identity(source.display_name) === identity(venue); });
    if (matches.length !== 1) throw new Error("OpenAlex 未找到唯一同名期刊；请核对完整期刊名。");
    const source = matches[0], value = number(source.summary_stats && source.summary_stats["2yr_mean_citedness"]);
    if (value === null) throw new Error("该期刊没有 OpenAlex 两年平均被引率。");
    return { venue, openAlexCitedness: value, source: "OpenAlex", sourceUrl: /^https:\/\/openalex\.org\/S\d+$/.test(source.id) ? source.id : "https://openalex.org",
      updatedAt: new Date().toISOString() };
  }
  function request(url) {
    // A single queue caps all journal requests below easyScholar's 2/s limit.
    const task = requestQueue.then(function () {
      return new Promise(function (resolve, reject) {
        function start() {
          lastRequest = Date.now();
          try {
            const req = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(url));
            req.setHTTPMethod("GET"); req.setTimeoutInterval(20);
            req.setAllHTTPHeaderFields({ Accept: "application/json" });
            NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(req, NSOperationQueue.mainQueue(), function (response, data, error) {
              // Native errors may contain a credential-bearing URL. Never echo them.
              if (error && !(typeof NSNull !== "undefined" && error instanceof NSNull)) { reject(new Error("期刊数据请求失败，请检查网络连接。")); return; }
              try {
                const code = response ? Number(response.statusCode()) : 0;
                if (code === 429 && url.indexOf("easyscholar.cc") >= 0) easyScholarBlockedUntil = Date.now() + 60000;
                if (code !== 200 || !data) throw new Error("期刊数据服务返回 HTTP " + code + (code === 429 ? "，已暂停请求一分钟。" : "。"));
                resolve(MNPLNativeValues.plain(NSJSONSerialization.JSONObjectWithDataOptions(data, 0)));
              } catch (parseError) { reject(parseError instanceof Error ? parseError : new Error("期刊服务未返回有效数据，请检查配置或稍后重试。")); }
            });
          } catch (_) { reject(new Error("无法发起期刊数据请求。")); }
        }
        const delay = Math.max(0, 550 - (Date.now() - lastRequest));
        if (delay) NSTimer.scheduledTimerWithTimeInterval(delay / 1000, false, start); else start();
      });
    });
    requestQueue = task.catch(function () {});
    return task;
  }
  function lookup(venue) {
    venue = String(venue || "").trim();
    if (!venue) return Promise.reject(new Error("请先在文献信息中填写完整期刊名。"));
    const config = settings(), key = identity(venue);
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    const errors = [];
    let result = {};
    let work = Promise.resolve();
    if (config.easyScholar && config.easyScholarKey) work = work.then(function () {
      if (Date.now() < easyScholarBlockedUntil) { errors.push("easyScholar 暂停请求中，请稍后重试"); return; }
      return request("https://www.easyscholar.cc/open/getPublicationRank?secretKey=" + encodeURIComponent(config.easyScholarKey) + "&publicationName=" + encodeURIComponent(venue))
        .then(function (data) { result = parseEasyScholar(data, venue); })
        .catch(function (error) { errors.push(error && error.message || "easyScholar 请求失败"); });
    });
    else if (config.easyScholar) errors.push("easyScholar 尚未配置密钥");
    work = work.then(function () {
      if (!config.openAlex || Object.keys(result).length) return;
      return request("https://api.openalex.org/sources?search=" + encodeURIComponent(venue) + "&per_page=10&select=id,display_name,type,summary_stats" + (config.openAlexKey ? "&api_key=" + encodeURIComponent(config.openAlexKey) : ""))
        .then(function (data) { result = parseOpenAlex(data, venue); })
        .catch(function (error) { errors.push(error.message); });
    }).then(function () {
      if (!Object.keys(result).length) throw new Error(errors.join("；") || "请先启用期刊数据源。");
      const normalized = MNPLBibliography.normalizeJournal(result);
      const value = { journal: normalized, warnings: errors };
      cache.set(key, value); pending.delete(key); return value;
    }, function (error) { pending.delete(key); throw error; });
    // Include validation failures from the final stage in cleanup.
    work = work.catch(function (error) { pending.delete(key); throw error; });
    pending.set(key, work); return work;
  }
  return { settings, saveSettings, lookup, parseEasyScholar, parseOpenAlex };
})();
