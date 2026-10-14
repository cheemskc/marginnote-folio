var MNPLPaperData = (function () {
  const ADDON = "com.azeedel.marginnote.paper-library";
  let settingsCache = null;
  const pending = new Map();
  function file() { return Application.sharedInstance().documentPath + "/" + ADDON + "/paper-data-settings-v1.json"; }
  function settings() {
    if (settingsCache) return Object.assign({}, settingsCache);
    const data = NSData.dataWithContentsOfFile(file());
    let saved = {};
    if (data) {
      try { saved = MNPLNativeValues.plain(NSJSONSerialization.JSONObjectWithDataOptions(data, 0)); }
      catch (_) { throw new Error("文献数据设置文件无效，原文件未修改。"); }
      if (!saved || saved.schemaVersion !== 1) throw new Error("文献数据设置版本无效，原文件未修改。");
    }
    settingsCache = { schemaVersion: 1, autoLookup: saved.autoLookup === true, autoLibrary: saved.autoLibrary === true, crossref: saved.crossref !== false,
      openAlex: saved.openAlex !== false, overwrite: saved.overwrite === true };
    return Object.assign({}, settingsCache);
  }
  function saveSettings(patch) {
    const next = Object.assign(settings(), patch);
    ["autoLookup", "autoLibrary", "crossref", "openAlex", "overwrite"].forEach(function (key) {
      if (typeof next[key] !== "boolean") throw new Error("文献数据设置无效。");
    });
    const dir = Application.sharedInstance().documentPath + "/" + ADDON;
    const manager = NSFileManager.defaultManager();
    if (!manager.fileExistsAtPath(dir) && !manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(dir, true, null)) throw new Error("无法创建文献数据设置目录。");
    const data = NSJSONSerialization.dataWithJSONObjectOptions(next, 0);
    if (!data || !data.writeToFileAtomically(file(), true)) throw new Error("文献数据设置保存失败。");
    settingsCache = next;
    return Object.assign({}, next);
  }
  function doi(value) {
    const text = String(value || "").replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
    const match = text.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/i);
    return match ? match[0].replace(/\.pdf$/i, "").replace(/[.,;:)]+$/, "") : "";
  }
  function titleKey(value) {
    return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/\.pdf$/i, "")
      .replace(/<[^>]*>/g, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  }
  function titleMatches(query, candidate) {
    const a = titleKey(query), b = titleKey(candidate);
    if (!a || !b) return false;
    if (a === b) return true;
    const aw = a.split(" "), bw = b.split(" ");
    if (aw.length < 5 || bw.length < 5) return false;
    const overlap = aw.filter(function (word) { return bw.indexOf(word) >= 0; }).length;
    return overlap / Math.max(aw.length, bw.length) >= 0.95;
  }
  function clean(value) { return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
  function count(value) { const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null; }
  function identity(document) {
    const raw = String(document.title || document.fileName || "").replace(/\.pdf$/i, "").trim();
    const filename = raw.match(/^((?:19|20)\d{2})[_\s-]+([^_]+)(?:_([^_]+))?/);
    const structured = !document.metadataTitle && filename && raw.indexOf("_") >= 0;
    return { doi: doi(document.doi) || doi(raw) || doi(document.fileName),
      title: structured ? filename[2].trim() : raw,
      year: document.year || (structured ? filename[1] : ""),
      authorHint: structured ? String(filename[3] || "") : "", allowPartial: Boolean(structured) };
  }
  function verifiedTitle(requested, title, year, authors) {
    if (titleMatches(requested.title, title)) return true;
    // Filename titles may end halfway through a word. Require corroborating
    // year and author names, then reject ambiguous results in lookup().
    const prefix = titleKey(requested.title), full = titleKey(title);
    if (!requested.allowPartial || prefix.length < 40 || prefix.split(" ").length < 6 || !full.startsWith(prefix) ||
        !requested.year || !year || Math.abs(Number(requested.year) - year) > 1) return false;
    const families = requested.authorHint.split(/\band\b|[,;&]/i).map(function (author) {
      const parts = titleKey(author).split(" "); return parts[parts.length - 1];
    }).filter(function (name) { return name && name.length > 1 && !/^\d+$/.test(name); });
    const names = titleKey(authors.join(" ")).split(" ");
    return families.length > 0 && families.every(function (name) { return names.indexOf(name) >= 0; });
  }
  function crossrefRecord(item, requested) {
    if (!item || !item.DOI || !Array.isArray(item.title) || !item.title[0]) return null;
    const date = item.issued && item.issued["date-parts"] && item.issued["date-parts"][0] || [];
    const year = Number(date[0]) || 0;
    const authors = Array.isArray(item.author) ? item.author.map(function (a) { return clean([a.given, a.family].filter(Boolean).join(" ") || a.name); }).filter(Boolean) : [];
    if (requested.doi ? doi(item.DOI).toLowerCase() !== requested.doi.toLowerCase() : !verifiedTitle(requested, item.title[0], year, authors)) return null;
    if (!requested.doi && requested.year && year && Math.abs(Number(requested.year) - year) > 1) return null;
    const matchedTitle = clean(item.title[0]).slice(0, 500);
    return { title: matchedTitle, authors: authors.join(", ").slice(0, 500), year: year ? String(year) : "", venue: clean(item["container-title"] && item["container-title"][0]).slice(0, 250),
      doi: doi(item.DOI).slice(0, 200), abstract: clean(item.abstract).slice(0, 12000), metrics: {
        type: String(item.type || "").slice(0, 500), publisher: clean(item.publisher).slice(0, 500), citations: count(item["is-referenced-by-count"]),
        references: count(item["references-count"]), source: "Crossref", matchedTitle,
        sourceUrl: "https://doi.org/" + doi(item.DOI), indexedAt: "", updatedAt: new Date().toISOString() } };
  }
  function openAlexRecord(item, requested) {
    if (!item || !item.id || !item.display_name) return null;
    const actualDoi = doi(item.doi);
    const year = Number(item.publication_year) || 0;
    const authors = Array.isArray(item.authorships) ? item.authorships.map(function (a) { return clean(a.author && a.author.display_name); }).filter(Boolean) : [];
    if (requested.doi ? actualDoi.toLowerCase() !== requested.doi.toLowerCase() : !verifiedTitle(requested, item.display_name, year, authors)) return null;
    if (!requested.doi && requested.year && year && Math.abs(Number(requested.year) - year) > 1) return null;
    const words = [];
    const inverted = item.abstract_inverted_index || {};
    Object.keys(inverted).forEach(function (word) { (inverted[word] || []).forEach(function (i) { if (Number.isInteger(i) && i >= 0 && i < 10000) words[i] = word; }); });
    const source = item.primary_location && item.primary_location.source;
    return { title: clean(item.display_name).slice(0, 500), authors: authors.join(", ").slice(0, 500), year: year ? String(year) : "", venue: clean(source && source.display_name).slice(0, 250), doi: actualDoi.slice(0, 200),
      abstract: words.filter(Boolean).join(" ").slice(0, 12000), metrics: { type: String(item.type || ""), publisher: "",
        citations: count(item.cited_by_count), references: count(item.referenced_works_count), source: "OpenAlex",
        matchedTitle: clean(item.display_name).slice(0, 500), sourceUrl: /^https:\/\/openalex\.org\/W\d+$/.test(item.id) ? item.id : "https://openalex.org",
        indexedAt: "", updatedAt: new Date().toISOString() } };
  }
  function request(url) {
    return new Promise(function (resolve, reject) {
      try {
        const req = NSMutableURLRequest.requestWithURL(NSURL.URLWithString(url));
        req.setHTTPMethod("GET"); req.setTimeoutInterval(20);
        req.setAllHTTPHeaderFields({ Accept: "application/json" });
        NSURLConnection.sendAsynchronousRequestQueueCompletionHandler(req, NSOperationQueue.mainQueue(), function (response, data, error) {
          if (error && !(typeof NSNull !== "undefined" && error instanceof NSNull)) { reject(new Error("文献数据查询失败，请检查网络。")); return; }
          const status = response ? Number(response.statusCode()) : 0;
          if (status !== 200 || !data) { reject(new Error("文献数据源返回 HTTP " + status + "。")); return; }
          try { resolve(MNPLNativeValues.plain(NSJSONSerialization.JSONObjectWithDataOptions(data, 0))); }
          catch (_) { reject(new Error("文献数据源返回内容无效。")); }
        });
      } catch (_) { reject(new Error("无法发起文献数据查询。")); }
    });
  }
  function europePmcAbstract(doiValue, response) {
    const expected = doi(doiValue).toLowerCase();
    const rows = response && response.resultList && response.resultList.result;
    if (!expected || !Array.isArray(rows)) return "";
    const match = rows.find(function (row) { return row && doi(row.doi).toLowerCase() === expected; });
    return match ? clean(match.abstractText).slice(0, 12000) : "";
  }
  function lookupAbstractByDoi(doiValue) {
    const normalized = doi(doiValue);
    if (!normalized) return Promise.resolve("");
    const url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=" +
      encodeURIComponent('DOI:"' + normalized + '"') + "&format=json&resultType=core&pageSize=10";
    return request(url).then(function (response) { return europePmcAbstract(normalized, response); });
  }
  function lookup(document, options) {
    function cancelled() { return options && options.cancelled && options.cancelled(); }
    const requested = identity(document);
    if (!requested.doi && titleKey(requested.title).length < 12) { const error = new Error("标题过短，请先填写 DOI 或完整标题。"); error.kind = "unmatched"; return Promise.reject(error); }
    const key = (requested.doi || [titleKey(requested.title), requested.year, requested.authorHint].join("|")) + (options && options.includeAbstract ? "|abstract" : "");
    if (pending.has(key)) return pending.get(key);
    const config = settings(), errors = [];
    let chain = Promise.resolve(null);
    if (config.crossref) chain = chain.then(function () {
      if (cancelled()) return null;
      const url = requested.doi ? "https://api.crossref.org/works/" + encodeURIComponent(requested.doi) :
        "https://api.crossref.org/works?query.title=" + encodeURIComponent(requested.title) + "&rows=5";
      return request(url).then(function (response) {
        const entries = requested.doi ? [response.message] : response.message && response.message.items || [];
        const matches = entries.map(function (item) { return crossrefRecord(item, requested); }).filter(Boolean);
        return matches.length === 1 ? matches[0] : null;
      }).catch(function (error) { errors.push("Crossref：" + error.message); return null; });
    });
    if (options && options.includeAbstract) chain = chain.then(function (record) {
      if (cancelled() || !record || record.abstract || !record.doi) return record;
      return lookupAbstractByDoi(record.doi).then(function (abstract) {
        if (abstract) { record.abstract = abstract; record.metrics.abstractSource = "Europe PMC"; }
        return record;
      }).catch(function (error) {
        errors.push("Europe PMC：" + error.message);
        return record;
      });
    });
    if (config.openAlex) chain = chain.then(function (record) {
      if (cancelled()) return null;
      if (record && (!(options && options.includeAbstract) || record.abstract)) return record;
      const abstractRequest = record ? Object.assign({}, requested, { doi: record.doi }) : requested;
      const key = MNPLJournal.settings().openAlexKey;
      const url = (abstractRequest.doi ? "https://api.openalex.org/works?filter=doi:" + encodeURIComponent(abstractRequest.doi) + "&per_page=3" :
        "https://api.openalex.org/works?search=" + encodeURIComponent(requested.title) + "&per_page=5") +
        (key ? "&api_key=" + encodeURIComponent(key) : "");
      return request(url).then(function (response) {
        const matches = (response.results || []).map(function (item) { return openAlexRecord(item, abstractRequest); }).filter(Boolean);
        const match = matches.length === 1 ? matches[0] : null;
        if (record) {
          if (match && match.abstract) { record.abstract = match.abstract; record.metrics.abstractSource = "OpenAlex"; }
          return record;
        }
        return match;
      }).catch(function (error) {
        errors.push("OpenAlex：" + error.message);
        if (record) record.abstractLookupError = "摘要未能获取：OpenAlex：" + error.message;
        return record;
      });
    });
    chain = chain.then(function (record) {
      if (cancelled()) { const error = new Error("识别已停止。"); error.kind = "cancelled"; throw error; }
      if (!record) { const error = new Error(errors.join("；") || "未找到唯一匹配记录，请核对 DOI 或完整标题。"); error.kind = errors.length ? "failed" : "unmatched"; throw error; }
      if (record.abstract && !record.metrics.abstractSource) record.metrics.abstractSource = record.metrics.source;
      return record;
    }).then(function (record) { pending.delete(key); return record; }, function (error) { pending.delete(key); throw error; });
    pending.set(key, chain);
    return chain;
  }
  function merge(current, fetched, overwrite) {
    const patch = {}, metrics = {};
    if (fetched.title && (overwrite || !current.metadataTitle)) patch.title = fetched.title;
    ["authors", "year", "venue", "doi", "abstract"].forEach(function (key) {
      if (fetched[key] && (overwrite || !current[key])) patch[key] = fetched[key];
    });
    Object.keys(fetched.metrics || {}).forEach(function (key) {
      if (key === "abstractSource") { if (patch.abstract !== undefined) metrics[key] = fetched.metrics[key]; return; }
      const value = fetched.metrics[key];
      if (key === "source" || key === "matchedTitle" || key === "sourceUrl" || key === "updatedAt" || key === "indexedAt" ||
          (value !== null && value !== "" && (overwrite || (current.metrics || {})[key] == null || (current.metrics || {})[key] === ""))) metrics[key] = value;
    });
    patch.metrics = metrics;
    return patch;
  }
  return { settings, saveSettings, doi, identity, titleMatches, crossrefRecord, openAlexRecord, europePmcAbstract, lookup, merge };
})();
