var MNPLBatchLookup = (function () {
  function journalMissing(value) {
    const journal = value || {};
    return !journal.jcrQuartile && !journal.casQuartile && !journal.rankLabel && journal.impactFactor == null;
  }
  function needsWork(item) {
    return !item.authors || !item.year || !item.venue || !item.hasAbstract || journalMissing(item.journal);
  }
  function candidates(addon) {
    const ids = [];
    let offset = 0, total = 0;
    do {
      const page = MNPLService.list(addon, { offset, limit: 100 });
      total = page.total;
      page.items.forEach(function (item) {
        if (needsWork(item)) ids.push(item.id);
      });
      offset += page.items.length;
      if (!page.items.length) break;
    } while (offset < total);
    return ids;
  }
  function start(addon, hooks) {
    const config = MNPLPaperData.settings(), journalConfig = MNPLJournal.settings();
    if (!config.crossref && !config.openAlex && !journalConfig.easyScholar && !journalConfig.openAlex)
      throw new Error("请先在设置中启用文献数据或期刊指标来源。");
    const ids = candidates(addon);
    const job = { total: ids.length, current: 0, saved: 0, unmatched: 0, failed: 0, lastError: "", stopped: false, rateLimited: false };
    let finished = false;
    function finish() { if (finished) return; finished = true; if (hooks.done) hooks.done(job); }
    function failure(error) {
      if (error && error.kind === "unmatched") job.unmatched += 1;
      else job.failed += 1;
      job.lastError = String(error && error.message || "文献读取或保存失败。").slice(0, 180);
      if (/HTTP\s*429|限流|请求过于频繁|频率过高/i.test(job.lastError)) job.rateLimited = true;
    }
    function progress() { if (hooks.progress) hooks.progress(job); }
    function next() {
      if (job.stopped || finished) return;
      if (job.current >= job.total || job.rateLimited) { finish(); return; }
      const id = ids[job.current];
      let doc;
      try {
        doc = MNPLService.record(addon, { id });
        if (!MNPLService.inScope(id)) { job.current += 1; progress(); NSTimer.scheduledTimerWithTimeInterval(0.01, false, next); return; }
      } catch (error) {
        failure(error); job.current += 1; progress(); NSTimer.scheduledTimerWithTimeInterval(0.01, false, next); return;
      }
      const originalTitle = doc.title, originalDoi = doc.doi || "";
      const missingBib = !doc.authors || !doc.year || !doc.venue || !doc.abstract;
      const needJournal = journalMissing(doc.journal) && !!doc.venue && (journalConfig.easyScholar || journalConfig.openAlex);
      let paperTask = Promise.resolve(null);
      if (missingBib && (config.crossref || config.openAlex)) {
        try { paperTask = MNPLPaperData.lookup(doc, { includeAbstract: true, cancelled: function () { return job.stopped; } }); }
        catch (error) { paperTask = Promise.reject(error); }
      }
      paperTask.then(function (fetched) { return { fetched: fetched, paperError: null }; }, function (error) {
        return { fetched: null, paperError: error };
      }).then(function (paperResult) {
        if (job.stopped || finished) return null;
        if (!needJournal) return { fetched: paperResult.fetched, journal: null, journalError: null, paperError: paperResult.paperError };
        return MNPLJournal.lookup(doc.venue).then(function (value) {
          return { fetched: paperResult.fetched, journal: value.journal, journalError: null, paperError: paperResult.paperError };
        }, function (error) {
          return { fetched: paperResult.fetched, journal: null, journalError: error, paperError: paperResult.paperError };
        });
      }).then(function (result) {
        if (job.stopped || finished || !result) return;
        let saved = null;
        try {
          const current = MNPLService.record(addon, { id });
          if (!MNPLService.inScope(id) || current.title !== originalTitle || (current.doi || "") !== originalDoi) throw new Error("文献已变更");
          let patch = result.fetched ? MNPLPaperData.merge(current, result.fetched, MNPLPaperData.settings().overwrite) : { metrics: {} };
          if (result.journal) patch.journal = result.journal;
          if (!result.fetched && !result.journal) throw result.paperError || result.journalError || new Error("未找到可补全的数据。");
          saved = MNPLService.saveMetadata(addon, { id, metadata: patch, background: true });
          job.saved += 1;
          if (result.paperError) failure(result.paperError);
          if (result.journalError) failure(result.journalError);
        } catch (error) { failure(error); }
        if (saved && hooks.saved) {
          try { hooks.saved(id, saved); } catch (_) { console.log("[MNPL] batch UI refresh failed"); }
        }
        job.current += 1; progress();
        if (job.rateLimited) { finish(); return; }
        NSTimer.scheduledTimerWithTimeInterval(0.7, false, next);
      }, function (error) {
        if (job.stopped || finished) return;
        failure(error); job.current += 1; progress();
        if (job.rateLimited) { finish(); return; }
        NSTimer.scheduledTimerWithTimeInterval(0.7, false, next);
      });
    }
    job.stop = function () { if (finished) return; job.stopped = true; finish(); };
    progress();
    NSTimer.scheduledTimerWithTimeInterval(0.01, false, next);
    return job;
  }
  return { candidates, start };
})();
