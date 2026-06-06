import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabaseClient';

function calculateTimeAgo(timestamp) {
  if (!timestamp) return 'Just now';
  if (typeof timestamp === 'string' && (timestamp.includes('ago') || timestamp === 'Just now')) return timestamp;
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
  } catch (e) { return 'Just now'; }
}

/* ── Hover profile card ── */
function AuthorHoverCard({ authorName, items }) {
  const [profile, setProfile] = useState(null);
  const [recentPosts, setRecentPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // authorName is the display name (nickname). Try nickname first, fallback to username.
        let { data: prof } = await supabase
          .from('profiles')
          .select('username, nickname, bio, avatar_url, is_public')
          .eq('nickname', authorName)
          .maybeSingle();
        if (!prof) {
          const { data: prof2 } = await supabase
            .from('profiles')
            .select('username, nickname, bio, avatar_url, is_public')
            .eq('username', authorName)
            .maybeSingle();
          prof = prof2;
        }
        if (cancelled) return;
        if (prof) {
          setProfile(prof);
          if (prof.is_public) {
            // Get 3 most recent public posts by this author from the local items prop
            const authorPosts = items
              .filter(i => i.authorName === authorName && i.isPublic && !i.archived)
              .slice(0, 3);
            setRecentPosts(authorPosts);
          }
        }
      } catch (e) { /* silent */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [authorName]);

  if (loading) return <div className="hover-profile-card"><p className="hover-profile-loading">Loading…</p></div>;
  if (!profile) return null;

  const displayName = profile.nickname || profile.username;
  const isPrivate = !profile.is_public;

  return (
    <div className="hover-profile-card">
      <div className="hover-profile-top">
        <div className="hover-profile-avatar">
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={displayName} />
            : <div className="hover-profile-avatar-fallback">{displayName.charAt(0).toUpperCase()}</div>
          }
        </div>
        <div>
          <div className="hover-profile-name">{displayName}</div>
          <div className="hover-profile-handle">@{profile.username}</div>
        </div>
        {isPrivate && <span className="hover-profile-private-badge">🔒 Private</span>}
      </div>
      {profile.bio && <p className="hover-profile-bio">{profile.bio}</p>}
      {isPrivate ? (
        <p className="hover-profile-private-msg">This account is private.</p>
      ) : (
        recentPosts.length > 0 && (
          <div className="hover-profile-posts">
            <p className="hover-profile-posts-label">Recent entries</p>
            {recentPosts.map(p => {
              const el = document.createElement('div'); el.innerHTML = p.text || '';
              const title = el.querySelector('.post-compiled-title')?.textContent?.trim() || 'Untitled';
              return <div key={p.id} className="hover-profile-post-item">{title}</div>;
            })}
          </div>
        )
      )}
    </div>
  );
}

export default function ForumFeed({ items, activePostId, onSelectPost, onMoveItem, onDeleteItem, onUpdateItem, onLikeItem, viewMode, sidebarOpen, pinnedIds = [], onTogglePin, currentUserId }) {
  if (items.length === 0) {
    return (
      <div className="feed-empty-state">
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
            key={item.id} item={item} isActive={item.id === activePostId}
            onSelect={() => onSelectPost(item.id)} onDeleteItem={onDeleteItem}
            onUpdateItem={onUpdateItem} onLikeItem={onLikeItem}
            viewMode={viewMode} isPinned={pinnedIds.includes(item.id)}
            onTogglePin={onTogglePin} canPin={!pinnedIds.includes(item.id) && pinnedIds.length >= 3}
            isOwn={item._userId === currentUserId} allItems={items}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function parseCompiledHtml(htmlString) {
  if (!htmlString) return { title: '', bodyPreview: '' };
  const el = document.createElement('div');
  el.innerHTML = htmlString;
  const titleEl = el.querySelector('.post-compiled-title');
  const bodyEl = el.querySelector('.post-compiled-body');
  return {
    title: titleEl ? (titleEl.textContent || titleEl.innerText || '').trim() : '',
    bodyPreview: bodyEl ? (bodyEl.textContent || bodyEl.innerText || '').trim() : el.textContent || ''
  };
}

function ForumPost({ item, isActive, onSelect, onDeleteItem, onUpdateItem, onLikeItem, viewMode, isPinned, onTogglePin, canPin, isOwn = true, allItems }) {
  const { title, bodyPreview } = parseCompiledHtml(item.text);
  const [showFeedMenu, setShowFeedMenu] = useState(false);
  const [feedMenuPos, setFeedMenuPos] = useState({ top: 0, right: 0 });
  const feedMenuRef = useRef(null);
  const [showHoverCard, setShowHoverCard] = useState(false);
  const hoverTimer = useRef(null);
  const hoverCardRef = useRef(null);

  const displayAuthor = item.authorName || 'Anonymous';
  const displayTime = calculateTimeAgo(item.timestamp);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (feedMenuRef.current && !feedMenuRef.current.contains(event.target)) setShowFeedMenu(false);
    }
    if (showFeedMenu) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showFeedMenu]);

  const handleAuthorMouseEnter = () => {
    hoverTimer.current = setTimeout(() => setShowHoverCard(true), 400);
  };
  const handleAuthorMouseLeave = () => {
    clearTimeout(hoverTimer.current);
    setShowHoverCard(false);
  };

  const softSpringTransition = { type: "spring", duration: 0.35, bounce: 0.1 };

  const menuContent = (
    <div className="sidebar-dropdown-menu" style={{ position: 'fixed', top: feedMenuPos.top, right: feedMenuPos.right, zIndex: 999999, display: 'block', background: '#ffffff', boxShadow: '0px 4px 16px rgba(0,0,0,0.12)', borderRadius: '8px', minWidth: '170px', padding: '4px 0', border: '1px solid #f0e6e1' }}>
      {isOwn && <button type="button" style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#2c3e50' }} onClick={() => { onSelect(); setShowFeedMenu(false); }}>Edit Post</button>}
      {isOwn && <button type="button" style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', color: item.isPublic ? '#ff8b94' : '#2c3e50', fontWeight: item.isPublic ? 600 : 400 }} onClick={() => { onUpdateItem(item.id, { isPublic: !item.isPublic }); setShowFeedMenu(false); }}>{item.isPublic ? '🔒 Make Private' : '🌐 Make Public'}</button>}
      <button type="button" style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#2c3e50' }} onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + '/?post=' + item.id); } catch(e) { prompt('Copy this URL:', window.location.origin + '/?post=' + item.id); } setShowFeedMenu(false); }}>🔗 Copy URL</button>
      {isOwn && <button type="button" style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#2c3e50' }} onClick={() => { if (!canPin || isPinned) onTogglePin && onTogglePin(item.id); setShowFeedMenu(false); }} disabled={canPin && !isPinned}>{isPinned ? "Unpin Post" : "Pin Post"}</button>}
      {isOwn && <button type="button" style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', color: item.archived ? '#20c997' : '#8e9aa6' }} onClick={() => { onUpdateItem(item.id, { archived: !item.archived }); setShowFeedMenu(false); }}>{item.archived ? '▼ Unarchive' : '▼ Archive'}</button>}
      {isOwn && <div style={{ height: '1px', background: '#f0f0f0', margin: '4px 0' }} />}
      {isOwn && <button type="button" className="menu-delete-action" style={{ width: '100%', padding: '8px 12px', textAlign: 'left', background: 'none', border: 'none', fontSize: '13px', cursor: 'pointer', color: '#ff6b6b' }} onClick={() => { if (window.confirm("Permanently delete this entry?")) onDeleteItem(item.id); setShowFeedMenu(false); }}>Delete Post</button>}
    </div>
  );

  if (viewMode === 'gallery') {
    return (
      <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={softSpringTransition}
        className={`gallery-card ${isActive ? 'active-row' : ''} ${isPinned ? 'pinned-card' : ''}`}
        onClick={onSelect} style={{ padding: '16px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', paddingRight: '24px' }}>
          <div className="feed-user-meta-row" style={{ fontSize: '13px', color: '#8e9aa6', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px', textAlign: 'left', position: 'relative' }}
            onMouseEnter={handleAuthorMouseEnter} onMouseLeave={handleAuthorMouseLeave}>
            <span style={{ fontWeight: 700, color: '#ff8b94', cursor: 'pointer' }}>{displayAuthor}</span>
            <span style={{ color: '#8e9aa6' }}>{displayTime}</span>
            {showHoverCard && <div ref={hoverCardRef} style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999 }}><AuthorHoverCard authorName={displayAuthor} items={allItems || []} /></div>}
          </div>
        </div>
        <div className="feed-item-menu-container" ref={feedMenuRef} onClick={e => e.stopPropagation()} style={{ position: 'absolute', right: '12px', top: '12px', zIndex: 9999 }}>
          <button className="control-btn feed-three-dots-trigger" onClick={e => { e.stopPropagation(); if (!showFeedMenu) { const r = e.currentTarget.getBoundingClientRect(); setFeedMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right }); } setShowFeedMenu(v => !v); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '14px', color: '#8e9aa6', fontWeight: 'bold', lineHeight: 1 }}>•••</button>
          {showFeedMenu && menuContent}
        </div>
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800, textAlign: 'left', letterSpacing: '-0.2px' }}>
          {isPinned && <span style={{ fontSize: '12px', marginRight: '4px' }}>📌</span>}{title || 'Untitled Entry'}
        </h3>
        {bodyPreview && <p style={{ margin: '0 0 auto', fontSize: '13px', color: '#536471', lineHeight: '1.4', textAlign: 'left', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bodyPreview}</p>}
        {item.image && <img src={item.image} alt="" style={{ width: '100%', maxHeight: '120px', objectFit: 'cover', borderRadius: '8px', marginTop: '10px' }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#8e9aa6', fontSize: '13px', marginTop: '10px' }}>
          <button className="control-btn" onClick={e => { e.stopPropagation(); onLikeItem ? onLikeItem(item.id) : onUpdateItem(item.id, { liked: !item.liked }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: 0, color: item.liked ? '#ff8b94' : '#8e9aa6' }}>{item.liked ? "𖹭.ᐟ" : "♡"}</button>
          <button className="control-btn" onClick={e => { e.stopPropagation(); onUpdateItem(item.id, { bookmarked: !item.bookmarked }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: 0, color: item.bookmarked ? '#f5c518' : '#8e9aa6' }}>{item.bookmarked ? "★" : "☆"}</button>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>💬 {item.comments?.length || 0}</span>
          {item.isPublic && <span style={{ fontSize: '11px', color: '#ff8b94', fontWeight: 600, marginLeft: 'auto' }}>Public</span>}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -8 }} transition={softSpringTransition}
      className={`item-card ${isActive ? 'active-row' : ''} ${isPinned ? 'pinned-card' : ''}`}
      onClick={onSelect} style={{ position: 'relative', display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '16px' }}>
      <div className="post-main-content" style={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left' }}>
        {/* Author row with hover card */}
        <div
          className="feed-user-meta-row"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#8e9aa6', marginBottom: '6px', position: 'relative', cursor: 'pointer' }}
          onMouseEnter={handleAuthorMouseEnter}
          onMouseLeave={handleAuthorMouseLeave}
        >
          <span className="feed-author-bold-name" style={{ fontWeight: 700, color: '#ff8b94' }}>{displayAuthor}</span>
          <span className="feed-timestamp-split" style={{ color: '#8e9aa6', marginLeft: '2px' }}>{displayTime}</span>
          <AnimatePresence>
            {showHoverCard && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, marginTop: '4px' }}
                onClick={e => e.stopPropagation()}
              >
                <AuthorHoverCard authorName={displayAuthor} items={allItems || []} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="post-title-block" style={{ width: '100%', display: 'block', textAlign: 'left', margin: '0 0 6px 0' }}>
          <h3 className="post-compiled-title" style={{ margin: 0, fontSize: '16px', fontWeight: 800, textAlign: 'left', display: 'inline-block', width: '100%', letterSpacing: '-0.2px' }}>
            {isPinned && <span className="pin-badge" style={{ fontSize: '12px', marginRight: '4px', display: 'inline-block', verticalAlign: 'middle' }}>📌</span>}
            <span style={{ verticalAlign: 'middle' }}>{title || 'Untitled Entry'}</span>
          </h3>
        </div>

        {bodyPreview && <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#536471', lineHeight: '1.4', textAlign: 'left', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{bodyPreview}</p>}

        <div className="post-meta-bottom-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '14px', color: '#8e9aa6', fontSize: '13px', justifyContent: 'flex-start', marginTop: '4px' }}>
          <button className="control-btn reaction-heart" onClick={e => { e.stopPropagation(); onLikeItem ? onLikeItem(item.id) : onUpdateItem(item.id, { liked: !item.liked }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: 0, color: item.liked ? '#ff8b94' : '#8e9aa6', display: 'flex', alignItems: 'center' }}>
            {item.liked ? "𖹭.ᐟ" : "♡"}
          </button>
          <button className="control-btn reaction-star" onClick={e => { e.stopPropagation(); onUpdateItem(item.id, { bookmarked: !item.bookmarked }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '15px', padding: 0, color: item.bookmarked ? '#f5c518' : '#8e9aa6', display: 'flex', alignItems: 'center' }}>
            {item.bookmarked ? "★" : "☆"}
          </button>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>💬 {item.comments?.length || 0}</span>
          {item.isPublic && <span style={{ fontSize: '11px', color: '#ff8b94', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>Public</span>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <div className="feed-item-menu-container" ref={feedMenuRef}>
          <button className="control-btn feed-three-dots-trigger" onClick={e => { e.stopPropagation(); if (!showFeedMenu) { const r = e.currentTarget.getBoundingClientRect(); setFeedMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right }); } setShowFeedMenu(v => !v); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', fontSize: '14px', color: '#8e9aa6', fontWeight: 'bold', lineHeight: 1 }}>•••</button>
          {showFeedMenu && menuContent}
        </div>
        {item.image && <div style={{ width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}><img src={item.image} alt="Attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}
      </div>
    </motion.div>
  );
}