var MNPLFolderTree = (function () {
  function rows(folders, root, expanded) {
    return folders.filter(function (folder) {
      if (!MNPLFolders.within(folder.path, root)) return false;
      let parent = folder.parentPath;
      while (parent !== null && MNPLFolders.within(parent, root)) {
        if (!expanded.has(parent)) return false;
        const slash = parent.lastIndexOf("/");
        parent = parent ? (slash < 0 ? "" : parent.slice(0, slash)) : null;
      }
      return true;
    });
  }
  function hasChildren(folders, path) {
    return folders.some(function (folder) { return folder.parentPath === path; });
  }
  function toggle(expanded, path) {
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
  }
  return { rows, hasChildren, toggle };
})();
