var MNPLDetail = (function () {
  const INFO = [["title", "文献库标题"], ["authors", "作者"], ["year", "年份"], ["venue", "期刊 / 来源"], ["doi", "DOI"]];
  const BIB = [["type", "文献类型"], ["publisher", "出版方"]];
  const JOURNAL = [["jcrQuartile", "JCR 分区"], ["casQuartile", "中科院分区"], ["rankLabel", "其他期刊分级"], ["impactFactor", "JCR 影响因子 IF"], ["year", "指标年份（来源未提供时留空）"], ["openAlexCitedness", "OpenAlex 两年平均被引率"], ["source", "期刊指标来源"], ["updatedAt", "获取时间"], ["sourceUrl", "期刊数据来源链接"]];
  const EDIT_INFO = INFO.concat(BIB.map(function (field) { return ["metrics." + field[0], field[1]]; })).concat(JOURNAL.map(function (field) { return ["journal." + field[0], field[1]]; }));
  function capture(controller) {
    if (!controller.mnplEditing) return;
    const draft = controller.mnplDraft || {};
    Object.keys(controller.mnplInputs || {}).forEach(function (key) { draft[key] = String(controller.mnplInputs[key].text || ""); });
    controller.mnplDraft = draft;
  }
  function render(controller) {
    const ui = MNPLUI, host = controller.mnplDetail;
    if (!host || host.hidden) return;
    const stamp = (controller.mnplDocument ? controller.mnplDocument.id : "") + ":" + controller.mnplTab + ":" + Boolean(controller.mnplEditing);
    const offset = controller.mnplDetailStamp === stamp && controller.mnplDetailScroll ? controller.mnplDetailScroll.contentOffset : null;
    controller.mnplDetailStamp = stamp;
    capture(controller);
    ui.clear(host);
    controller.mnplInputs = {};
    const width = host.bounds.width, height = host.bounds.height;
    const tabs = [["info", "文献信息"], ["citations", "参考文献与引文"]];
    tabs.forEach(function (tab, index) {
      const control = ui.button(host, tab[1], ui.rect(index * width / tabs.length, 0, width / tabs.length, 43), controller, "detailTab");
      control.tag = index;
      control.enabled = !controller.mnplEditing;
      if (controller.mnplTab === tab[0]) ui.box(host, ui.rect(index * width / tabs.length + 14, 40, width / tabs.length - 28, 2), "accent");
    });
    const editing = Boolean(controller.mnplEditing);
    // Create the editor actions before building any field, outside the scrolling form.
    if (editing) {
      ui.label(host, "编辑文献信息", ui.rect(18, 51, width - 166, 32), 13, "ink", true);
      ui.control(host, "取消", ui.rect(width - 142, 50, 60, 34), controller, "cancelEdit");
      const save = ui.control(host, "保存", ui.rect(width - 74, 50, 60, 34), controller, "saveEdit");
      save.backgroundColor = ui.color(ui.colors.selected);
      ui.box(host, ui.rect(0, 90, width, 1), "line");
    }
    const scrollTop = editing ? 94 : 44;
    const scroll = new UIScrollView(ui.rect(0, scrollTop, width, height - scrollTop - (editing ? 0 : 50)));
    scroll.showsHorizontalScrollIndicator = false;
    scroll.backgroundColor = ui.color(ui.colors.sidebar);
    host.addSubview(scroll);
    controller.mnplDetailScroll = scroll;
    let y = 16;
    function text(value, size, tone, bold, maxHeight) {
      const label = ui.label(scroll, value, ui.rect(18, y, width - 36, 24), size, tone, bold);
      label.numberOfLines = 0;
      const needed = label.sizeThatFits({ width: width - 36, height: 100000 }).height;
      const h = Math.max(20, Math.min(maxHeight || 100000, needed));
      label.frame = ui.rect(18, y, width - 36, h);
      y += h + 10;
      scroll.contentSize = { width, height: y + 16 };
    }
    function field(name, value) {
      text(name, 11, "muted"); y -= 5;
      text(value == null || value === "" ? "—" : String(value), 13, "ink"); y += 3;
    }
    const doc = controller.mnplDocument;
    if (!doc) { text("从文献列表选择一篇，查看详情。", 14, "muted"); return; }
    text((doc.venue || "来源待补充") + " · " + (doc.year || "年份 —"), 11, "muted");
    text(doc.title, editing ? 13 : 18, "ink", true);
    if (doc.isCurrent) text("当前阅读", 11, "accent", true);
    y += 4;
    const tab = controller.mnplTab;
    if (controller.mnplEditing) {
      const fields = EDIT_INFO;
      fields.forEach(function (field) {
        text(field[1], 11, "muted"); y -= 5;
        const input = new UITextField(ui.rect(18, y, width - 36, 34));
        input.text = controller.mnplDraft[field[0]] == null ? "" : String(controller.mnplDraft[field[0]]);
        input.borderStyle = 0;
        input.font = UIFont.systemFontOfSize(13);
        input.textColor = ui.color(ui.colors.ink);
        input.backgroundColor = ui.color(ui.colors.paper);
        input.layer.borderWidth = 1;
        input.layer.borderColor = ui.color(ui.colors.line);
        input.layer.cornerRadius = 6;
        input.leftView = new UIView(ui.rect(0, 0, 10, 1));
        input.leftViewMode = 3;
        input.delegate = controller;
        scroll.addSubview(input);
        controller.mnplInputs[field[0]] = input;
        y += 46;
        scroll.contentSize = { width, height: y + 16 };
        if (field[0] === "title") text("留空时使用 MarginNote 文档标题", 11, "muted");
      });
      if (tab === "info") {
        text("摘要", 11, "muted");
        try {
          const input = new UITextView(ui.rect(18, y, width - 36, 170), null);
          input.text = controller.mnplDraft.abstract || "";
          input.font = UIFont.systemFontOfSize(13); input.editable = true;
          input.textColor = ui.color(ui.colors.ink);
          input.backgroundColor = ui.color(ui.colors.paper);
          input.layer.borderWidth = 1;
          input.layer.borderColor = ui.color(ui.colors.line);
          input.layer.cornerRadius = 6;
          input.textContainerInset = { top: 10, left: 6, bottom: 10, right: 6 };
          scroll.addSubview(input); controller.mnplInputs.abstract = input; y += 182;
        } catch (error) {
          console.log("[MNPL] abstract editor: " + String(error && error.message || error));
          text("摘要编辑框未能加载；仍可保存其他字段，已有摘要会保留。", 12, "muted");
        }
      }
    } else {
      if (tab === "info") {
        field("作者", doc.authors);
        field("摘要", doc.abstract || "尚未获取摘要");
        if ((doc.metrics || {}).abstractSource) text("摘要来源：" + doc.metrics.abstractSource, 10, "muted");
        if (!doc.abstract) {
          const abstractButton = ui.control(scroll, controller.mnplPaperLoading ? "正在获取摘要…" : "获取摘要", ui.rect(18, y, width - 36, 32), controller, "fetchAbstract");
          abstractButton.enabled = !controller.mnplPaperLoading; y += 40;
        }
        field("文献类型", MNPLBibliography.typeLabel(MNPLBibliography.type((doc.metrics || {}).type, doc.title)));
        field("DOI", doc.doi);
        if ((doc.metrics || {}).publisher) field("出版方", doc.metrics.publisher);
        const badges = MNPLBibliography.badges(doc).map(function (badge) { return badge.text; }).join(" · ");
        field("期刊标签", badges);
        if ((doc.journal || {}).source) field("期刊指标来源", doc.journal.source);
        if ((doc.journal || {}).updatedAt) field("期刊指标更新时间", doc.journal.updatedAt);
        if ((doc.metrics || {}).source) field("资料来源", doc.metrics.source);
        if ((doc.metrics || {}).updatedAt) field("资料更新时间", doc.metrics.updatedAt);
        const paperButton = ui.control(scroll, controller.mnplPaperLoading ? "正在识别文献…" : "识别并补全文献信息", ui.rect(18, y, width - 36, 34), controller, "fetchPaperData");
        paperButton.enabled = !controller.mnplPaperLoading;
        y += 42;
        const journalButton = ui.control(scroll, controller.mnplJournalLoading ? "正在获取期刊标签…" : "获取期刊标签", ui.rect(18, y, width - 36, 34), controller, "fetchJournal");
        journalButton.enabled = !controller.mnplJournalLoading;
        y += 42;
      } else {
        let relations = {};
        try { relations = MNPLRelations.get(doc); }
        catch (error) { text(error.message, 12, "muted"); }
        controller.mnplRelationLinks = [];
        const stateKey = doc.id + ":" + MNPLRelations.fingerprint(doc);
        const states = (controller.mnplRelationStates || {})[stateKey] || {};
        [["references", "参考文献", "本文引用的文献"], ["citations", "引文", "引用本文的文献"]].forEach(function (section, index) {
          const page = relations[section[0]], state = states[section[0]] || {};
          text(section[1] + (page ? " · " + page.total : ""), 15, "ink", true);
          text(section[2], 11, "muted");
          if (!page) {
            const count = (doc.metrics || {})[section[0]];
            if (count != null) text("已存统计：" + count + " · " + ((doc.metrics || {}).source || "来源未记录"), 11, "muted");
            text("尚未获取具体文献列表。", 12, "muted");
          } else {
            text("OpenAlex · 已加载 " + page.items.length + " / " + page.total, 11, "muted");
            text("更新于 " + page.updatedAt, 10, "muted");
            if (!page.items.length) text("OpenAlex 暂未收录此方向的引用记录。", 12, "muted");
            page.items.forEach(function (item, position) {
              const contentWidth = width - 36;
              const title = ui.label(scroll, "", ui.rect(18, y + 4, contentWidth, 18), 12, "ink", true);
              title.text = ui.fit(title, (position + 1) + ". " + String(item.title || "").replace(/\s+/g, " "), contentWidth, true).text;
              const authors = ui.label(scroll, "", ui.rect(18, y + 24, contentWidth, 15), 10, "muted");
              authors.text = ui.fit(authors, item.authors || "作者待补充", contentWidth, true).text;
              const sourceWidth = contentWidth - 88;
              const source = ui.label(scroll, "", ui.rect(18, y + 46, sourceWidth, 16), 10, "muted");
              source.text = ui.fit(source, [item.year, item.venue].filter(Boolean).join(" · ") || "年份与来源待补充", sourceWidth, true).text;
              const link = ui.button(scroll, "打开来源 ↗", ui.rect(width - 98, y + 40, 80, 28), controller, "openRelation");
              link.titleLabel.font = UIFont.systemFontOfSize(11);
              link.tag = controller.mnplRelationLinks.length;
              controller.mnplRelationLinks.push(item.url);
              ui.box(scroll, ui.rect(18, y + 71, contentWidth, 0.5), "line");
              y += 76;
            });
          }
          if (state.error) text(state.error, 12, "muted");
          const refresh = ui.control(scroll, state.loading ? "正在获取…" : page ? "刷新列表" : "获取列表", ui.rect(18, y, width - 36, 34), controller, "fetchRelations");
          refresh.tag = index; refresh.enabled = !state.loading; y += 42;
          if (page && page.cursor) {
            const more = ui.control(scroll, "加载更多", ui.rect(18, y, width - 36, 34), controller, "fetchRelations");
            more.tag = index + 2; more.enabled = !state.loading; y += 42;
          }
          y += 16;
        });
        text("列表按 OpenAlex 的收录范围展示，可能少于其他来源的统计数量。", 11, "muted");
      }
    }
    scroll.contentSize = { width, height: y + 16 };
    if (!editing) {
      const open = ui.button(host, "在 MarginNote 中打开 ↗", ui.rect(12, height - 44, width - (tab === "info" ? 118 : 24), 36), controller, "openDetail");
      open.enabled = true;
      open.backgroundColor = ui.color(ui.colors.selected);
      if (tab === "info") ui.control(host, "编辑", ui.rect(width - 98, height - 44, 86, 36), controller, "editDetail");
    }
    controller.mnplDetailScroll = scroll;
    if (offset) scroll.setContentOffsetAnimated({ x: 0, y: Math.max(0, Math.min(offset.y, y + 16 - scroll.bounds.height)) }, false);
  }
  function edit(controller) {
    const doc = controller.mnplDocument;
    if (!doc || controller.mnplTab !== "info") return;
    controller.mnplDraft = Object.assign({}, doc);
    if (controller.mnplTab === "info") controller.mnplDraft.title = doc.metadataTitle || "";
    if (controller.mnplTab === "info") BIB.forEach(function (field) {
      controller.mnplDraft["metrics." + field[0]] = (doc.metrics || {})[field[0]];
    });
    if (controller.mnplTab === "info") JOURNAL.forEach(function (field) {
      controller.mnplDraft["journal." + field[0]] = (doc.journal || {})[field[0]];
    });
    controller.mnplInputs = {};
    controller.mnplEditing = true;
    render(controller);
  }
  function save(controller) {
    capture(controller);
    const patch = {};
    INFO.forEach(function (field) { patch[field[0]] = controller.mnplDraft[field[0]] == null ? "" : controller.mnplDraft[field[0]]; });
    if (controller.mnplTab === "info") { patch.abstract = controller.mnplDraft.abstract || "";  }
    const journal = {};
    if (controller.mnplTab === "info") {
      JOURNAL.forEach(function (field) { const value = controller.mnplDraft["journal." + field[0]]; journal[field[0]] = value == null ? "" : value; });
      journal.venue = patch.venue || "";
      patch.journal = journal;
      patch.metrics = {};
      BIB.forEach(function (field) { patch.metrics[field[0]] = controller.mnplDraft["metrics." + field[0]] || ""; });
      if (patch.abstract !== (controller.mnplDocument.abstract || "")) patch.metrics.abstractSource = patch.abstract ? "手动编辑" : "";
    }
    const doc = MNPLService.saveMetadata(controller.addon, { id: controller.mnplDocument.id,
      metadata: patch });
    controller.mnplDocument = doc;
    controller.mnplEditing = false;
    controller.mnplInputs = {};
    render(controller);
  }
  return { render, capture, edit, save };
})();
