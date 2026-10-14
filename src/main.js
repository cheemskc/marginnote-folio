JSB.require("PaperLibraryNativeValues");
JSB.require("PaperLibraryBibliography");
JSB.require("PaperLibraryMetadataStore");
JSB.require("PaperLibraryFolders");
JSB.require("PaperLibraryFolderTree");
JSB.require("PaperLibraryService");
JSB.require("PaperLibraryJournalService");
JSB.require("PaperLibraryPaperData");
JSB.require("PaperLibraryRelations");
JSB.require("PaperLibraryBatchLookup");
JSB.require("PaperLibraryNativeUI");
JSB.require("PaperLibraryNativeDetail");
JSB.require("PaperLibraryNativeOptions");
JSB.require("PaperLibraryNativeSettings");
JSB.require("PaperLibraryNativePanel");
JSB.require("PaperLibraryAddon");

JSB.newAddon = function (mainPath) {
  return createPaperLibraryAddon(mainPath);
};
