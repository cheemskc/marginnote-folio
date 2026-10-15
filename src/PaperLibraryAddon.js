function createPaperLibraryAddon(mainPath) {
  return JSB.defineClass("MNPLAddon : JSExtension", {
    sceneWillConnect: function () {
      self.panel = MNPLPanel.create(mainPath, self);
      console.log("[MNPL] initialized");
    },
    sceneDidDisconnect: function () {
      if (self.panel) MNPLPanel.dispose(self.panel);
      self.panel = null;
    },
    notebookWillOpen: function () {
      if (self.panel) self.panel.addon = self;
    },
    documentDidOpen: function () {
      if (self.panel) MNPLPanel.notifyDocumentChanged(self.panel);
    },
    documentWillClose: function () {
      if (self.panel) MNPLPanel.notifyDocumentChanged(self.panel);
    },
    controllerWillLayoutSubviews: function (controller) {
      if (self.panel && controller === Application.sharedInstance().studyController(self.window)) {
        MNPLPanel.layout(self.panel);
      }
    },
    queryAddonCommandStatus: function () {
      return { image: "icon.png", object: self, selector: "togglePaperLibrary:",
        checked: Boolean(self.panel && self.panel.mnplVisible) };
    },
    togglePaperLibrary: function () {
      if (!self.panel) throw new Error("Folio 面板尚未初始化。");
      MNPLPanel.toggle(self.panel);
      const study = Application.sharedInstance().studyController(self.window);
      if (study) study.refreshAddonCommands();
    },
  });
}
