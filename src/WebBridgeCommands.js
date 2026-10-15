var MNPLWebBridgeCommands = (function () {
  function settings(c) {
    const journal = MNPLJournal.settings();
    return { paper: MNPLPaperData.settings(), journal: { easyScholar: journal.easyScholar, openAlex: journal.openAlex,
      easyScholarConfigured: !!journal.easyScholarKey, openAlexConfigured: !!journal.openAlexKey }, batch: batch(c) };
  }
  function batch(c) {
    const j = c.mnplBatch || c.mnplLastBatch;
    if (!j) return null;
    return { running: !!c.mnplBatch, total: j.total, current: j.current, saved: j.saved,
      unmatched: j.unmatched, failed: j.failed || 0, stopped: j.stopped, rateLimited: j.rateLimited, lastError: j.lastError || "" };
  }
  function documentFor(c, payload) {
    if (!payload || !MNPLService.inScope(payload.id)) throw new Error("文献不在当前文献库范围内。");
    return MNPLService.record(c.addon, payload);
  }
  function lookup(c, p) {
    const doc = documentFor(c, p), generation = c.mnplGeneration;
    return MNPLPaperData.lookup(doc, { includeAbstract: true, cancelled: function () { return c.mnplDisposed || c.mnplGeneration !== generation; } }).then(function (fetched) {
      if (c.mnplDisposed || c.mnplGeneration !== generation) throw new Error("识别已取消。");
      const current = documentFor(c, p);
      if (current.title !== doc.title || current.doi !== doc.doi) throw new Error("标题或 DOI 已变更，请重新识别。");
      if (p.abstractOnly && current.abstract !== doc.abstract) throw new Error("摘要已更改，保留当前内容。");
      const patch = p.abstractOnly ? (fetched.abstract ? { abstract: fetched.abstract, metrics: { abstractSource: fetched.metrics.abstractSource || fetched.metrics.source } } : {}) : MNPLPaperData.merge(current, fetched, MNPLPaperData.settings().overwrite);
      const saved = MNPLService.saveMetadata(c.addon, { id: p.id, metadata: patch });
      return { document: saved, message: p.abstractOnly && !fetched.abstract ? fetched.abstractLookupError || "数据源未提供摘要，可手动填写。" : "文献资料已保存。" };
    });
  }
  const commands = {
    getFolders: function (c, p) { return MNPLService.folders(p); },
    setRootFolder: function (c, p) { if (c.mnplBatch) c.mnplBatch.stop(); return MNPLService.setRootFolder(c.addon, p); },
    listDocuments: function (c, p) { return MNPLService.list(c.addon, p); },
    getDocument: function (c, p) { documentFor(c,p); return MNPLService.detail(c.addon,p); },
    saveMetadata: function (c, p) { documentFor(c,p); return MNPLService.saveMetadata(c.addon,p); },
    setFavorite: function (c, p) { documentFor(c,p); return MNPLService.setFavorite(c.addon,p); },
    getCurrentDocument: function (c) {
      const doc = MNPLService.currentDocument(c.addon);
      return doc && MNPLService.inScope(doc.id) ? doc : null;
    },
    openDocument: function (c, p) { documentFor(c,p); const r=MNPLService.open(c.addon,p); MNPLPanel.close(c); return r; },
    closePanel: function (c) { MNPLPanel.close(c); return { closed: true }; },
    openSource: function (c, p) {
      const url=String(p && p.url || "");
      if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error("来源链接无效。");
      Application.sharedInstance().openURL(NSURL.URLWithString(url)); return { opened: true };
    },
    getSettings: function(c) { return settings(c); },
    saveSettings: function(c,p) {
      if (p.paper) {
        const patch={}; ["crossref","openAlex","autoLookup","autoLibrary","overwrite"].forEach(function(k) { if(typeof p.paper[k]==="boolean")patch[k]=p.paper[k]; });
        MNPLPaperData.saveSettings(patch);
      }
      if (p.journal) {
        const patch={}; ["easyScholar","openAlex"].forEach(function(k){if(typeof p.journal[k]==="boolean")patch[k]=p.journal[k];});
        ["easyScholarKey","openAlexKey"].forEach(function(k){if(typeof p.journal[k]==="string")patch[k]=p.journal[k];});
        MNPLJournal.saveSettings(patch);
      }
      return settings(c);
    },
    lookupPaper: lookup,
    lookupJournal: function(c,p) {
      const doc=documentFor(c,p), generation=c.mnplGeneration;
      if(!doc.venue)throw new Error("请先补充期刊或来源。");
      return MNPLJournal.lookup(doc.venue).then(function(r){
        if(c.mnplDisposed || generation!==c.mnplGeneration)throw new Error("查询已取消。");
        if(documentFor(c,p).venue!==doc.venue)throw new Error("来源已更改，请重新查询。");
        return {document:MNPLService.saveMetadata(c.addon,{id:p.id,metadata:{journal:r.journal}}),message:r.warnings && r.warnings.join("；") || "期刊标签已保存。"};
      });
    },
    getRelations: function(c,p) { return MNPLRelations.get(documentFor(c,p)); },
    loadRelations: function(c,p) { return MNPLRelations.load(documentFor(c,p),p.kind,!!p.append); },
    startBatch: function(c) {
      if(c.mnplBatch)return batch(c);
      const job=MNPLBatchLookup.start(c.addon,{ progress:function(){}, done:function(state){c.mnplLastBatch=state;c.mnplBatch=null;} });
      c.mnplBatch=job;return batch(c);
    },
    stopBatch: function(c) { if(c.mnplBatch)c.mnplBatch.stop();return batch(c); },
    getBatch: function(c) { return batch(c); }
  };
  return { commands: commands };
})();
