import { useState } from "react";

export function FolderTree({ folders, rootPath, selectedPath, onSelect }) {
  const [collapsed, setCollapsed] = useState(new Set());
  const children = new Map();
  folders.forEach((folder) => {
    const siblings = children.get(folder.parentPath) || [];
    siblings.push(folder); children.set(folder.parentPath, siblings);
  });
  const render = (folder, level) => {
    const nested = children.get(folder.path) || [];
    const folded = collapsed.has(folder.path);
    return <div key={folder.path}>
      <div className={`folder-node${selectedPath === folder.path ? " active" : ""}`} style={{ paddingLeft: 6 + level * 12 }}>
        {nested.length ? <button className="folder-toggle" aria-label={`${folded ? "展开" : "折叠"}${folder.name}`} aria-expanded={!folded} onClick={() => setCollapsed((old) => { const next = new Set(old); if (next.has(folder.path)) next.delete(folder.path); else next.add(folder.path); return next; })}>{folded ? "›" : "⌄"}</button> : <span className="folder-toggle-spacer" />}
        <button className="folder-link" aria-current={selectedPath === folder.path ? "page" : undefined} title={folder.path || "全部文献"} onClick={() => onSelect(folder.path)}><span className="folder-symbol" aria-hidden="true">▱</span><span className="folder-name">{folder.path === rootPath ? (folder.path ? folder.name : "全部文献") : folder.name}</span><em>{folder.count}</em></button>
      </div>
      {!folded && nested.map((child) => render(child, level + 1))}
    </div>;
  };
  const root = folders.find((folder) => folder.path === rootPath);
  return <nav className="folder-tree" aria-label="文献库文件夹">{root ? render(root, 0) : <div className="folder-empty">根目录已不存在</div>}</nav>;
}

export function FolderPicker({ library, saving, error, onSave, onClose }) {
  const [path, setPath] = useState(library.rootPath);
  return <div className="folder-modal-backdrop" onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section className="folder-modal" role="dialog" aria-modal="true" aria-labelledby="folder-picker-title">
      <div className="folder-modal-heading"><h2 id="folder-picker-title">选择文献库文件夹</h2><button aria-label="关闭文件夹设置" disabled={saving} onClick={onClose}>×</button></div>
      <p>选择 MarginNote 内的文件夹，里面的文献和所有子文件夹都会显示在文献库中。</p>
      <label>根目录<select autoFocus aria-label="文献库根目录" value={path} onChange={(event) => setPath(event.target.value)} disabled={saving}>
        {library.folders.map((folder) => <option key={folder.path} value={folder.path}>{folder.path || "全部文献（整个 MarginNote 资料库）"} · {folder.count} 篇</option>)}
      </select></label>
      <p className="folder-picker-note">你可以先在 MarginNote 资料库中创建文件夹，再回到这里刷新并选择。文献信息和评分会随文献保留。</p>
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="edit-actions"><button disabled={saving} onClick={onClose}>取消</button><button disabled={saving} onClick={() => onSave(path)}>{saving ? "保存中…" : "设为文献库"}</button></div>
    </section>
  </div>;
}
