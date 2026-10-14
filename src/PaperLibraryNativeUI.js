// Native APIs checked against mn-docs and marginnoteapp/Addon API/UIKit.
var MNPLUI = (function () {
  function rect(x, y, width, height) { return { x, y, width: Math.max(0, width), height: Math.max(0, height) }; }
  function color(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return UIColor.colorWithRedGreenBlueAlpha((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1);
  }
  const colors = { ink: "263F48", muted: "667177", accent: "376853", paper: "FFFFFF", sidebar: "F4F6F5", line: "D8DEDA", selected: "EAF2ED", control: "F8FAF9" };
  function clear(view) { MNPLNativeValues.toArray(view.subviews || []).forEach(function (child) { child.removeFromSuperview(); }); }
  function label(parent, text, frame, size, tone, bold) {
    const view = new UILabel(frame);
    view.text = String(text == null ? "" : text);
    view.font = bold ? UIFont.boldSystemFontOfSize(size || 14) : UIFont.systemFontOfSize(size || 14);
    view.textColor = color(colors[tone] || tone || colors.ink);
    view.numberOfLines = 1;
    if (parent) parent.addSubview(view);
    return view;
  }
  function button(parent, title, frame, target, action) {
    const view = new UIButton(frame);
    view.setTitleForState(title, 0);
    view.setTitleColorForState(color(colors.accent), 0);
    view.titleLabel.font = UIFont.systemFontOfSize(13);
    view.addTargetActionForControlEvents(target, action + ":", 1 << 6);
    parent.addSubview(view);
    return view;
  }
  function control(parent, title, frame, target, action) {
    const view = button(parent, title, frame, target, action);
    view.backgroundColor = color(colors.control);
    view.layer.borderWidth = 1;
    view.layer.borderColor = color(colors.line);
    view.layer.cornerRadius = 6;
    view.titleLabel.font = UIFont.systemFontOfSize(12);
    return view;
  }
  function box(parent, frame, tone) {
    const view = new UIView(frame);
    view.backgroundColor = color(colors[tone] || tone || colors.paper);
    parent.addSubview(view);
    return view;
  }
  function measure(view, text) {
    view.text = text;
    return view.sizeThatFits({ width: 100000, height: 1000 }).width;
  }
  function fit(view, text, width, ellipsis) {
    const points = Array.from(text);
    if (measure(view, text) <= width) return { text, rest: "" };
    let low = 0, high = points.length;
    const suffix = ellipsis ? "…" : "";
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (measure(view, points.slice(0, mid).join("") + suffix) <= width) low = mid;
      else high = mid - 1;
    }
    // Prefer a word boundary unless it would leave most of the line empty.
    let count = low;
    if (!ellipsis) {
      const prefix = points.slice(0, low).join("");
      const boundary = prefix.lastIndexOf(" ");
      if (boundary > prefix.length * 0.6) count = Array.from(prefix.slice(0, boundary)).length;
    }
    return { text: points.slice(0, count).join("").trimEnd() + suffix, rest: points.slice(count).join("").trimStart() };
  }
  const icons = {};
  function documentIcon(parent, x, y, itemType, mainPath) {
    const type = MNPLBibliography.type(itemType);
    const key = mainPath + "/type-" + type + ".png";
    if (!icons[key]) icons[key] = UIImage.imageWithContentsOfFile(key);
    const icon = new UIImageView(rect(x, y, 27, 27));
    icon.image = icons[key];
    parent.addSubview(icon);
  }
  function asset(parent, path, frame) {
    if (!icons[path]) icons[path] = UIImage.imageWithContentsOfFile(path);
    const icon = new UIImageView(frame);
    icon.image = icons[path]; parent.addSubview(icon);
    return icon;
  }
  function folderCell(table, controller, folder, index, settings) {
    const reuse = settings ? "MNPLSettingsFolder" : "MNPLFolder";
    const cell = table.dequeueReusableCellWithIdentifier(reuse) || UITableViewCell.makeWithStyleReuseIdentifier(0, reuse);
    cell.selectionStyle = 0; cell.textLabel.text = "";
    const content = cell.contentView; clear(content);
    const width = table.bounds.width;
    const root = settings ? "" : controller.mnplLibrary.rootPath;
    const depth = Math.max(0, folder.depth - (root ? root.split("/").length : 0));
    const expanded = settings ? controller.mnplSettingsExpanded : controller.mnplFolderExpanded;
    const children = MNPLFolderTree.hasChildren(controller.mnplLibrary.folders, folder.path);
    const selected = folder.path === (settings ? controller.mnplLibrary.rootPath : controller.mnplFolder);
    content.backgroundColor = color(selected ? colors.selected : colors.sidebar);
    cell.backgroundColor = content.backgroundColor;
    const x = 8 + Math.min(depth, 10) * 14;
    if (children) {
      const hit = button(content, "", rect(x, 2, 32, 38), controller, "toggleFolderNode");
      hit.tag = settings ? 100000 + index : index;
      asset(hit, controller.mainPath + "/type-chevron-" + (expanded.has(folder.path) ? "down" : "right") + ".png", rect(10, 12, 13, 13));
    }
    const folderX = x + 31;
    asset(content, controller.mainPath + "/type-folder" + (children && expanded.has(folder.path) ? "-open" : "") + ".png", rect(folderX, 10, 22, 22));
    const nameX = folderX + 27, nameWidth = Math.max(24, width - nameX - 54);
    const name = label(content, "", rect(nameX, 10, nameWidth, 22), 12, selected ? "ink" : "muted", selected);
    name.text = fit(name, folder.name, nameWidth, true).text;
    const count = box(content, rect(width - 48, 9, 38, 24), "EDF1F4");
    count.layer.cornerRadius = 12;
    const number = label(count, String(folder.count), rect(0, 3, 38, 18), 11, "muted");
    number.textAlignment = 1;
    return cell;
  }
  function paperCell(table, controller, item, index) {
    let cell = table.dequeueReusableCellWithIdentifier("MNPLPaper");
    if (!cell) cell = UITableViewCell.makeWithStyleReuseIdentifier(0, "MNPLPaper");
    cell.selectionStyle = 0;
    const content = cell.contentView;
    clear(content);
    content.backgroundColor = color(item.id === controller.mnplSelectedId ? colors.selected : colors.paper);
    cell.backgroundColor = content.backgroundColor;
    const width = table.bounds.width;
    const left = 43, textWidth = Math.max(60, width - left - 67);
    documentIcon(content, 8, 10, item.itemType, controller.mainPath);
    const first = label(content, "", rect(left, 5, textWidth, 20), 13, "ink", true);
    const badge = label(null, "", rect(0, 0, 10, 18), 9, "accent");
    const badges = MNPLBibliography.badges(item);
    const maxBadgeWidth = Math.max(20, textWidth * 0.72);
    const badgeWidths = badges.map(function (entry) {
      const available = maxBadgeWidth / badges.length - 16;
      entry.display = fit(badge, measure(badge, entry.text) > available && entry.short ? entry.short : entry.text, available, true).text;
      return measure(badge, entry.display) + 10;
    });
    const badgeWidth = badgeWidths.reduce(function (sum, value) { return sum + value + 4; }, 0);
    const title = String(item.title || "未命名文献").replace(/\s+/g, " ");
    const titleWidth = Math.max(24, textWidth - (badgeWidth ? badgeWidth + 7 : 0));
    first.text = fit(first, title, titleWidth, true).text;
    badge.frame = rect(left + Math.min(titleWidth, measure(first, first.text)) + 7, 5, badgeWidth, 18);
    let badgeX = badge.frame.x;
    badges.forEach(function (entry, i) {
      const pill = label(content, entry.display, rect(badgeX, badge.frame.y + 2, badgeWidths[i], 15), 9, entry.tone === "if" ? "605D9B" : "accent", true);
      pill.textAlignment = 1;
      pill.backgroundColor = color(entry.tone === "if" ? "EEECFA" : "E3F1E9");
      pill.layer.cornerRadius = 7; pill.layer.masksToBounds = true;
      badgeX += badgeWidths[i] + 4;
    });
    label(content, item.authors || "作者待补充", rect(left, 29, textWidth, 16), 11, "ink");
    label(content, (item.year || "年份 —") + "  ·  " + (item.venue || "来源待补充"), rect(left, 48, textWidth, 16), 11, "muted");
    const starPath = controller.mainPath + "/type-star" + (item.favorite ? "-filled" : "") + ".png";
    if (!icons[starPath]) icons[starPath] = UIImage.imageWithContentsOfFile(starPath);
    const star = new UIImageView(rect(width - 43, 7, 20, 20));
    star.image = icons[starPath]; content.addSubview(star);
    const favorite = button(content, "", rect(width - 64, 2, 58, 31), controller, "favoritePaper");
    favorite.tag = index;
    const open = button(content, "打开 ↗", rect(width - 64, 37, 58, 26), controller, "openPaper");
    open.titleLabel.font = UIFont.systemFontOfSize(11);
    open.tag = index;
    box(content, rect(left, 71, width - left, 0.5), "line");
    return cell;
  }
  return { rect, color, colors, clear, label, button, control, box, paperCell, folderCell, fit };
})();
