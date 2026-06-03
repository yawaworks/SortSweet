import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function calculateTimeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  
  if (typeof timestamp === 'string' && (timestamp.includes('ago') || timestamp === 'Just now')) {
    return timestamp;
  }

  try {
    const postDate = new Date(timestamp);
    if (isNaN(postDate.getTime())) return timestamp;
    
    const now = new Date();
    const diffInSeconds = Math.floor((now - postDate) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays > 30) return '>30d ago';
    return `${diffInDays}d ago`;
  } catch (e) {
    return 'Just now';
  }
}

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
  const text = el.textContent || el.innerText || '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function ForumPost({ item, isActive, onSelect, onDeleteItem, onUpdateItem, viewMode, isPinned, onTogglePin, canPin }) {
  const { title, bodyHtml } = parseCompiledHtml(item.text);
  const bodyPreview = getBodyPreview(bodyHtml);
  const [showFeedMenu, setShowFeedMenu] = useState(false);
  const feedMenuRef = useRef(null);

  const displayAuthor = item.authorName || 'Anonymous';
  const displayHandle = item.authorHandle ? ` ${item.authorHandle}` : '';
  const displayTime = calculateTimeAgo(item.timestamp);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (feedMenuRef.current && !feedMenuRef.current.contains(event.target)) {
        setShowFeedMenu(false);
      }
    }
    if (showFeedMenu) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showFeedMenu]);

  if (viewMode === 'gallery') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`gallery-card ${isActive ? 'active-row' : ''} ${isPinned ? 'pinned-card' : ''}`}
        onClick={onSelect}
      >
        <div className="gallery-card-controls" onClick={e => e.stopPropagation()}>
          <button 
            className="gallery-action-btn reaction-heart" 
            onClick={() => onUpdateItem(item.id, { liked: !item.liked })}
            style={{ marginRight: '4px' }}
          >
            {item.liked ? "𖹭.ᐟ" : "♡"}
          </button>
          <button 
            className="gallery-action-btn reaction-star" 
            onClick={() => onUpdateItem(item.id, { bookmarked: !item.bookmarked })}
            style={{ marginRight: '4px' }}
          >
            {item.bookmarked ? "★" : "☆ "}
          </button>
          <button
            className={`gallery-action-btn pin-toggle-btn ${isPinned ? 'pinned' : ''}`}
            onClick={() => { if (!canPin || isPinned) onTogglePin(item.id); }}
            disabled={canPin && !isPinned}
          >
            📌
          </button>
          <button className="gallery-action-btn gallery-delete-btn" onClick={() => onDeleteItem(item.id)}>
            ✕
          </button>
        </div>

        {item.image && (
          <img src={item.image} alt="" className="gallery-card-img" />
        )}

        {!item.image && bodyPreview && (
          <p className="gallery-card-preview" style={{ textAlign: 'left !important' }}>{bodyPreview}</p>
        )}

        <div className="gallery-card-info" style={{ textAlign: 'left' }}>
          <div className="feed-user-meta-row" style={{ fontSize: '12px', color: '#8e9aa6', marginBottom: '4px' }}>
            <span style={{ fontWeight: 700, color: '#ff8b94' }}>{displayAuthor}</span>
            <span>{displayHandle}</span>
            <span style={{ margin: '0 4px' }}>•</span>
            <span>{displayTime}</span>
          </div>
          <h3 className="gallery-card-title" style={{ textAlign: 'left !important', margin: '0 0 4px 0', width: '100%' }}>
            {title || 'Untitled Entry'}
          </h3>
          <div className="gallery-card-meta">
            <span>💬 {item.comments?.length || 0}</span>
            {item.isPublic && <span style={{ marginLeft: '6px', color: '#ff8b94', fontWeight: 'bold' }}>🌐 Public</span>}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 600, damping: 50 }}
      className={`item-card ${isActive ? 'active-row' : ''} ${isPinned ? 'pinned-card' : ''}`}
      onClick={onSelect}
      style={{ position: 'relative' }}
    >
      <div className="post-main-content" style={{ display: 'block', textAlign: 'left', width: '100%' }}>
        
        <div className="feed-user-meta-row" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#8e9aa6', marginBottom: '6px', fontFamily: 'sans-serif', width: '100%', justifyContent: 'flex-start' }}>
          <span className="feed-author-bold-name" style={{ fontWeight: 700, color: '#ff8b94' }}>{displayAuthor}</span>
          <span className="feed-author-handle-gray" style={{ color: '#8e9aa6' }}>{displayHandle}</span>
          <span className="feed-timestamp-split" style={{ color: '#8e9aa6', marginLeft: '2px' }}>{displayTime}</span>
        </div>

        <div className="post-title-block" style={{ width: '100%', display: 'block', textAlign: 'left', margin: '0 0 6px 0' }}>
          <h3 className="post-compiled-title" style={{ margin: 0, fontSize: '16px', fontWeight: 800, textAlign: 'left !important', display: 'inline-block', width: '100%', letterSpacing: '-0.2px' }}>
            {isPinned && <span className="pin-badge" style={{ fontSize: '12px', marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }}>📌</span>}
            <span style={{ verticalAlign: 'middle' }}>{title || 'Untitled Entry'}</span>
          </h3>
        </div>
        
        {bodyPreview && (
          <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#536471', lineHeight: 1.4, textAlign: 'left !important', width: '100%' }}>
            {bodyPreview}
          </p>
        )}
        
        {/* Heart, Star, Comment and Status elements gathered perfectly at bottom */}
        <div className="post-meta-bottom-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '14px', color: '#8e9aa6', fontSize: '13px', width: '100%', justifyContent: 'flex-start', marginTop: '4px' }}>
          <button 
            className="control-btn reaction-heart" 
            onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { liked: !item.liked }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: 0, color: item.liked ? '#ff8b94' : '#8e9aa6', display: 'flex', alignItems: 'center' }}
          >
            {item.liked ? "𖹭.ᐟ" : "♡"}
          </button>
          
          <button 
            className="control-btn reaction-star" 
            onClick={(e) => { e.stopPropagation(); onUpdateItem(item.id, { bookmarked: !item.bookmarked }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: 0, color: item.bookmarked ? '#f5c518' : '#8e9aa6', display: 'flex', alignItems: 'center' }}
          >
            {item.bookmarked ? "★" : "☆"}
          </button>

          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            💬 {item.comments?.length || 0}
          </span>

          {item.isPublic && (
            <span style={{ fontSize: '11px', color: '#ff8b94', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
              🌐 Public
            </span>
          )}
        </div>
      </div>

      <div className="post-right-aside" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto', flexShrink: 0, position: 'relative' }}>
        {item.image && <img src={item.image} alt="Attachment" className="post-thumbnail" style={{ marginRight: '4px' }} />}
        
        {/* Unified Three-Dot Dropdown Trigger Menu Box */}
        <div className="feed-item-menu-container" ref={feedMenuRef} style={{ position: 'relative' }}>
          <button
            className="control-btn feed-three-dots-trigger"
            onClick={() => setShowFeedMenu(!showFeedMenu)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', fontSize: '14px', color: '#8e9aa6', fontWeight: 'bold' }}
            title="Post options"
          >
            •••
          </button>

          {showFeedMenu && (
            <div className="sidebar-dropdown-menu" style={{ position: 'absolute', right: 0, top: '100%', zIndex: 99, display: 'block', background: '#ffffff', boxShadow: '0px 4px 12px rgba(0,0,0,0.08)', borderRadius: '8px', minWidth: '140px', padding: '4px 0' }}>
              <button 
                type="button" 
                style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer' }}
                onClick={() => { onSelectPost(item.id); setShowFeedMenu(false); }}
              >
                📝 Edit Post
              </button>
              <button 
                type="button" 
                style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer' }}
                onClick={() => { alert("Post shared successfully!"); setShowFeedMenu(false); }}
              >
                🔗 Share
              </button>
              <button 
                type="button" 
                style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer' }}
                onClick={() => { navigator.clipboard.writeText(window.location.origin + '?post=' + item.id); alert("URL copied to clipboard!"); setShowFeedMenu(false); }}
              >
                📋 Copy URL
              </button>
              <button 
                type="button" 
                style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer' }}
                onClick={() => { if (!canPin || isPinned) onTogglePin(item.id); setShowFeedMenu(false); }}
                disabled={canPin && !isPinned}
              >
                {isPinned ? "📌 Unpin Post" : "📌 Pin Post"}
              </button>
              <div style={{ height: '1px', background: '#f0f0f0', margin: '4px 0' }} />
              <button 
                type="button" 
                className="menu-delete-action"
                style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#ff6b6b' }}
                onClick={() => { if (window.confirm("Permanently delete this entry?")) onDeleteItem(item.id); setShowFeedMenu(false); }}
              >
                ✕ Delete Post
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}