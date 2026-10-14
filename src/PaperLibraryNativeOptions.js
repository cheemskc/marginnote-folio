var MNPLOptions = (function () {
  function close(c) { if (c.mnplMenu) c.mnplMenu.removeFromSuperview(); c.mnplMenu = null; }
  function show(c, kind) {
    close(c);
    const ui = MNPLUI;
    const options = kind === "sort" ? MNPLBibliography.sorts :
      [["all", "全部类型"]].concat(MNPLBibliography.types, [["favorites", "仅显示收藏"]]);
    c.mnplMenuOptions = options; c.mnplMenuKind = kind;
    const anchor = kind === "sort" ? c.mnplSortButton : c.mnplFilterButton;
    const width = anchor.frame.width, x = anchor.frame.x, y = anchor.frame.y + anchor.frame.height + 4;
    const footer = kind === "filter" ? 34 : 0;
    const height = Math.min(options.length * 34 + footer + 8, c.view.bounds.height - y - 12);
    const menu = ui.box(c.view, ui.rect(x, y, width, height), "paper");
    menu.layer.borderWidth = 1; menu.layer.borderColor = ui.color(ui.colors.line); menu.layer.cornerRadius = 7;
    const scrollHeight = Math.max(30, height - footer - 8);
    const scroll = new UIScrollView(ui.rect(0, 4, width, scrollHeight)); menu.addSubview(scroll);
    options.forEach(function (entry, i) {
      const key = entry[0];
      const selected = kind === "sort" ? key === c.mnplSort :
        key === "all" ? c.mnplItemTypes.length === 0 && !c.mnplFavoritesOnly : key === "favorites" ? c.mnplFavoritesOnly : c.mnplItemTypes.indexOf(key) >= 0;
      const shortSort = { "year-desc": "年份 ↓", "year-asc": "年份 ↑", "title-asc": "标题 A→Z", "title-desc": "标题 Z→A",
        "author-asc": "作者", "venue-asc": "来源", "quartile-asc": "JCR Q1→Q4", "if-desc": "影响因子 ↓" };
      const button = ui.button(scroll, (selected ? "✓  " : "    ") + (kind === "sort" ? shortSort[key] : entry[1]), ui.rect(4, i * 34, width - 8, 33), c, "chooseOption");
      button.tag = i; button.contentHorizontalAlignment = 1;
      button.titleLabel.font = UIFont.systemFontOfSize(11);
      button.setTitleColorForState(ui.color(ui.colors.ink), 0);
      if (selected) button.backgroundColor = ui.color(ui.colors.selected);
    });
    scroll.contentSize = { width, height: options.length * 34 + 4 };
    if (kind === "filter") {
      const done = ui.control(menu, "完成", ui.rect(4, height - 37, width - 8, 31), c, "closeOptions");
      done.backgroundColor = ui.color(ui.colors.selected);
    }
    c.mnplMenu = menu; c.mnplMenuWidth = c.view.bounds.width;
  }
  return { show, close };
})();
