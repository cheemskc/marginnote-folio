var MNPLBibliography = (function () {
  const types = [["journal-article", "期刊论文"], ["conference-paper", "会议论文"], ["thesis", "学位论文"],
    ["patent", "专利"], ["book", "图书 / 章节"], ["report", "报告"], ["preprint", "预印本"], ["unknown", "未识别类型"]];
  const sorts = [["year-desc", "年份：新 → 旧"], ["year-asc", "年份：旧 → 新"], ["title-asc", "标题：A → Z"],
    ["title-desc", "标题：Z → A"], ["author-asc", "作者"], ["venue-asc", "期刊 / 来源"], ["quartile-asc", "JCR 分区：Q1 → Q4"], ["if-desc", "影响因子：高 → 低"]];
  function type(value, title) {
    const key = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
    const aliases = { journalarticle: "journal-article", article: "journal-article", "期刊论文": "journal-article",
      conferencepaper: "conference-paper", "proceedings-article": "conference-paper", "会议论文": "conference-paper",
      dissertation: "thesis", "学位论文": "thesis", "专利": "patent", "book-chapter": "book", booksection: "book", "图书": "book", "报告": "report", "预印本": "preprint" };
    const known = aliases[key] || (types.some(function (entry) { return entry[0] === key; }) ? key : "unknown");
    if (known !== "unknown") return known;
    const name = String(title || "");
    if (/(?:^|[_\s\-—·])专利(?:$|[_\s\-—·])|专利申请$|\bpatent\b/i.test(name)) return "patent";
    if (/学位论文|(?:硕士|博士)论文|\b(?:master['’]s|doctoral) thesis\b/i.test(name)) return "thesis";
    return "unknown";
  }
  function typeLabel(value) { return types.find(function (entry) { return entry[0] === type(value); })[1]; }
  function normalizeJournal(input) {
    const source = input == null ? {} : input;
    if (typeof source !== "object" || Array.isArray(source)) throw new Error("期刊标签必须是对象。");
    const result = {};
    ["jcrQuartile", "casQuartile", "rankLabel", "year", "source", "updatedAt", "sourceUrl", "venue"].forEach(function (key) {
      const value = source[key] == null ? "" : source[key];
      if (typeof value !== "string" || value.length > 500) throw new Error("期刊字段 " + key + " 格式无效。");
      result[key] = value.trim();
    });
    ["impactFactor", "openAlexCitedness"].forEach(function (key) {
      const value = source[key];
      result[key] = value == null || value === "" ? null : Number(value);
      if (result[key] !== null && (typeof value !== "number" && typeof value !== "string" || !Number.isFinite(result[key]) || result[key] < 0)) throw new Error("期刊指标必须是非负数。");
    });
    if (result.year && !/^(19|20|21)\d{2}$/.test(result.year)) throw new Error("期刊指标年份请输入四位数字。");
    if (result.sourceUrl && !/^https?:\/\/[^\s]+$/i.test(result.sourceUrl)) throw new Error("期刊来源链接格式无效。");
    return result;
  }
  function badges(record) {
    const journal = record.journal || {};
    const year = journal.year ? " " + journal.year : "";
    const values = [];
    if (journal.jcrQuartile) values.push({ text: "JCR" + year + " " + journal.jcrQuartile, short: "JCR " + journal.jcrQuartile, tone: "rank" });
    else if (journal.casQuartile) values.push({ text: "中科院" + year + " " + journal.casQuartile, short: "中科院 " + journal.casQuartile, tone: "rank" });
    else if (journal.rankLabel || record.quartile) values.push({ text: journal.rankLabel || record.quartile, tone: "rank" });
    if (journal.impactFactor != null) values.push({ text: "IF" + year + " " + journal.impactFactor, short: "IF " + journal.impactFactor, tone: "if" });
    else if (!values.length && journal.openAlexCitedness != null) values.push({ text: "OA 两年被引 " + journal.openAlexCitedness, tone: "oa" });
    return values;
  }
  return { types, sorts, type, typeLabel, normalizeJournal, badges };
})();
