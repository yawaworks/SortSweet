import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ForumFeed({ items, activePostId, onSelectPost, onMoveItem, onDeleteItem, onUpdateItem, viewMode, sidebarOpen, pinnedIds = [], onTogglePin }) {
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
            onDeleteItem={onDeleteItem}
            onUpdateItem={onUpdateItem}
            viewMode={viewMode}
            isPinned={pinnedIds.includes(item.id)}
            onTogglePin={onTogglePin}
            canPin={!pinnedIds.includes(item.id) && pinnedIds.length >= 3}
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

function ForumPost({ item, isActive, onSelect, onDeleteItem, viewMode, isPinned, onTogglePin, canPin }) {
  const { title, bodyHtml } = parseCompiledHtml(item.text);
  const bodyPreview = getBodyPreview(bodyHtml);
  const tagLabels = { now: 'Now', delegate: 'Delegate', someday: 'Later' };

  if (viewMode === 'gallery') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        className={`gallery-card ${isActive ? 'active-row' : ''} ${isPinned ? 'pinned-card' : ''}`}
        onClick={onSelect}
      >
        {/* Top bar: author + timestamp + controls */}
        <div className="gallery-card-meta">
          <span className="gallery-card-author">{item.authorName || 'User'}</span>
          <span className="gallery-card-timestamp">{item.timestamp || ''}</span>
          <div className="gallery-card-controls" onClick={e => e.stopPropagation()}>
            {isPinned && <span className="pin-badge gallery-pin-badge">📌</span>}
            <button
              className="gallery-action-btn"
              title={isPinned ? 'Unpin' : canPin ? 'Max 3 pins reached' : 'Pin post'}
              onClick={e => { e.stopPropagation(); if (!canPin) onTogglePin(item.id); }}
              style={{ opacity: canPin ? 0.35 : 1 }}
            >
              {isPinned ? '📌' : '📍'}
            </button>
            <button
              className="gallery-action-btn gallery-delete-btn"
              onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }}
            >✕</button>
          </div>
        </div>

        {/* Title */}
        <h3 className="gallery-card-title">{title || 'Untitled Entry'}</h3>

        {/* Full-bleed image — no wrapper div */}
        {item.image && (
          <img src={item.image} alt="" className="gallery-card-img" />
        )}

        {/* Body preview (text-only cards) */}
        {!item.image && bodyPreview && (
          <p className="gallery-card-preview">{bodyPreview}</p>
        )}

        {/* Footer */}
        <div className="gallery-card-footer">
          <span className="gallery-card-comments">💬 {item.comments?.length || 0}</span>
          <span className={`tag-pill active-${item.category}`} style={{ fontSize: 11, padding: '2px 8px' }}>
            {tagLabels[item.category]}
          </span>
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
      transition={{ type: 'spring', stiffness: 600, damping: 50 }}
      className={`item-card ${isActive ? 'active-row' : ''} ${isPinned ? 'pinned-card' : ''}`}
      onClick={onSelect}
    >
      <div className="post-main-content">
        <div className="post-title-row">
          {isPinned && <span className="pin-badge">📌 Pinned</span>}
          <h3 className="post-compiled-title" style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, textAlign: 'left' }}>
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
      </div>

      <div className="post-right-aside" onClick={e => e.stopPropagation()}>
        {item.image && <img src={item.image} alt="Attachment" className="post-thumbnail" />}
        <div className="post-controls">
          <button
            className={`pin-toggle-btn ${isPinned ? 'pinned' : ''}`}
            title={isPinned ? 'Unpin' : canPin ? 'Max 3 pins reached' : 'Pin post'}
            onClick={e => { e.stopPropagation(); if (!canPin) onTogglePin(item.id); }}
            disabled={canPin}
          >
            {isPinned ? '📌' : '📍'}
          </button>
          <button className="text-cancel-btn" onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }}>✕</button>
        </div>
      </div>
    </motion.div>
  );
}