import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ForumFeed({ items, activePostId, onSelectPost, onMoveItem, onDeleteItem, onUpdateItem, viewMode, sidebarOpen }) {
  if (items.length === 0) {
    return (
      <div className="feed-empty-state">
        <p className="feed-empty-icon">📝</p>
        <p className="feed-empty-title">Nothing here yet</p>
        <p className="feed-empty-sub">Hit "New Post" to add your first entry.</p>
      </div>
    );
  }

  return (
    <div className={`forum-feed ${viewMode === 'gallery' ? (sidebarOpen ? 'gallery-view-narrow' : 'gallery-view') : 'list-view'}`}>
      <AnimatePresence mode="popLayout">
        {items.map(item => (
          <ForumPost
            key={item.id}
            item={item}
            isActive={item.id === activePostId}
            onSelect={() => onSelectPost(item.id)}
            onMoveItem={onMoveItem}
            onDeleteItem={onDeleteItem}
            onUpdateItem={onUpdateItem}
            viewMode={viewMode}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function parseCompiledHtml(htmlString) {
  if (!htmlString) return { title: '', bodyHtml: '' };
  const el = document.createElement('div');
  el.innerHTML = htmlString;
  const titleEl = el.querySelector('.post-compiled-title');
  const bodyEl = el.querySelector('.post-compiled-body');
  return {
    title: titleEl ? (titleEl.textContent || titleEl.innerText || '').trim() : '',
    bodyHtml: bodyEl ? bodyEl.innerHTML : htmlString,
  };
}

function getBodyPreview(bodyHtml, maxLen = 100) {
  const el = document.createElement('div');
  el.innerHTML = bodyHtml;
  const text = (el.textContent || el.innerText || '').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

function ForumPost({ item, isActive, onSelect, onMoveItem, onDeleteItem, onUpdateItem, viewMode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  const { title, bodyHtml } = parseCompiledHtml(item.text);
  const bodyPreview = getBodyPreview(bodyHtml);

  const handleSave = (e) => {
    e.stopPropagation();
    if (editText.trim()) {
      onUpdateItem(item.id, { text: editText });
      setIsEditing(false);
    }
  };

  const tagLabels = { now: 'Now', delegate: 'Delegate', someday: 'Later' };

  if (viewMode === 'gallery') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
        className={`gallery-card ${isActive ? 'active-row' : ''}`}
        onClick={onSelect}
      >
        {item.image && <img src={item.image} alt="" className="gallery-card-img" />}
        <div className="gallery-card-body">
          <span className={`tag-pill active-${item.category}`}>{tagLabels[item.category]}</span>
          <h3 className="gallery-card-title">{title || 'Untitled Entry'}</h3>
          {bodyPreview && <p className="gallery-card-preview">{bodyPreview}</p>}
          <div className="post-meta" style={{ marginTop: 'auto' }}>
            <span>{item.comments?.length || 0} comments · {item.timestamp || ''}</span>
          </div>
        </div>
        <div className="gallery-card-controls" onClick={e => e.stopPropagation()}>
          <select value={item.category} onChange={e => onMoveItem(item.id, e.target.value)} className="tag-pill" style={{ fontSize: 11 }}>
            <option value="now">Now</option>
            <option value="delegate">Delegate</option>
            <option value="someday">Later</option>
          </select>
          <button className="text-cancel-btn" onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }}>✕</button>
        </div>
      </motion.div>
    );
  }

  // List view
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 600, damping: 50 }}
      className={`item-card ${isActive ? 'active-row' : ''}`}
      onClick={onSelect}
    >
      <div className="post-main-content">
        {isEditing ? (
          <input
            type="text"
            value={editText}
            onChange={e => setEditText(e.target.value)}
            className="sidebar-edit-textarea"
            onKeyDown={e => e.key === 'Enter' && handleSave(e)}
            onClick={e => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <>
            <div className="post-title-row">
              <h3 className="post-compiled-title" style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>
                {title || 'Untitled Entry'}
              </h3>
            </div>
            {bodyPreview && (
              <p style={{ margin: '0 0 6px', fontSize: 13, color: '#536471', lineHeight: 1.4 }}>{bodyPreview}</p>
            )}
            <div className="post-meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`tag-pill active-${item.category}`} style={{ fontSize: 11, padding: '2px 8px' }}>
                {tagLabels[item.category]}
              </span>
              <span>💬 {item.comments?.length || 0}</span>
              <span>· {item.timestamp || ''}</span>
            </div>
          </>
        )}
      </div>

      <div className="post-right-aside" onClick={e => e.stopPropagation()}>
        {item.image && <img src={item.image} alt="Attachment" className="post-thumbnail" />}
        <div className="post-controls">
          <select value={item.category} onChange={e => onMoveItem(item.id, e.target.value)} className="tag-pill" style={{ fontSize: 11 }}>
            <option value="now">Now</option>
            <option value="delegate">Delegate</option>
            <option value="someday">Later</option>
          </select>
          <button className="draft-save-btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={e => {
            e.stopPropagation();
            if (isEditing) handleSave(e); else setIsEditing(true);
          }}>
            {isEditing ? 'Save' : 'Edit'}
          </button>
          <button className="text-cancel-btn" onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }}>✕</button>
        </div>
      </div>
    </motion.div>
  );
}