import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './JournalEditor.css';

export default function PostDetailSidebar({ 
  item, onClose, onDeletePost, onUpdateItem,
  onAddComment, onDeleteComment, currentUser 
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // { commentId, author }
  const [copyLabel, setCopyLabel] = useState('🔗 Copy URL');
  const menuRef = useRef(null);
  const menuBtnRef = useRef(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

  const currentUserName = currentUser?.nickname || currentUser?.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const currentUserAvatar = currentUser?.avatar || currentUser?.avatarUrl || null;
  const isOp = !!(currentUser?.id && item._userId === currentUser?.id);

  useEffect(() => {
    if (item) {
      setEditTitle(getPlainTitleText(item.text) || '');
      const el = document.createElement('div');
      el.innerHTML = getBodyHtmlContent(item.text);
      setEditBody((el.textContent || '').trim());
    }
    // Reset comment state when post changes
    setCommentText('');
    setReplyingTo(null);
    setIsEditing(false);
  }, [item?.id]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setShowMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!item) return null;

  const getPlainTitleText = (htmlString) => {
    if (!htmlString) return '';
    const el = document.createElement('div');
    el.innerHTML = htmlString;
    const titleEl = el.querySelector('.post-compiled-title');
    if (titleEl) return titleEl.textContent || '';
    const heading = el.querySelector('h1, h2, h3');
    return heading ? heading.textContent || '' : '';
  };

  const getBodyHtmlContent = (htmlString) => {
    if (!htmlString) return '';
    const el = document.createElement('div');
    el.innerHTML = htmlString;
    const bodyEl = el.querySelector('.post-compiled-body');
    return bodyEl ? bodyEl.innerHTML : htmlString;
  };

  const plainTextLabel = getPlainTitleText(item.text);
  const bodyContentHtml = getBodyHtmlContent(item.text);
  const bodyContentWithoutImages = bodyContentHtml.replace(/<img[^>]*>/gi, '');

  const formattedTimestamp = React.useMemo(() => {
    const raw = item.timestamp || item.createdAt;
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return typeof raw === 'string' ? raw : '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  }, [item.id, item.timestamp]);

  const formattedDateHeader = React.useMemo(() => {
    const raw = item.timestamp || item.createdAt;
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  }, [item.id, item.timestamp]);

  const handleSaveEdit = () => {
    if (!editTitle.trim() && !editBody.trim()) return;
    const rebuilt = `<div class="journal-post-compiled"><h2 class="post-compiled-title">${editTitle.trim() || 'Untitled Entry'}</h2><div class="post-compiled-body rich-text-display-pane"><p>${editBody.trim()}</p></div></div>`;
    onUpdateItem(item.id, { text: rebuilt });
    setIsEditing(false);
  };

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}${window.location.pathname}?post=${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyLabel('✓ Copied!');
    } catch (e) {
      // Fallback for browsers that block clipboard
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); setCopyLabel('Copied!'); }
      catch { prompt('Copy this link:', url); }
      document.body.removeChild(ta);
    }
    setTimeout(() => setCopyLabel('Copy URL'), 2000);
    setShowMenu(false);
  };

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    if (typeof onAddComment === 'function') {
      onAddComment(item.id, commentText.trim(), currentUserName, currentUserAvatar, replyingTo?.commentId || null);
    }
    setCommentText('');
    setReplyingTo(null);
  };

  const authorName = item.authorName || currentUserName;
  const authorAvatar = item.authorAvatar || currentUserAvatar;
  const authorHandle = '@' + authorName.toLowerCase().replace(/\s+/g, '_');

  const topLevelComments = (item.comments || []).filter(c => !c.replyTo);
  const getReplies = (commentId) => (item.comments || []).filter(c => c.replyTo === commentId);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      className="post-detail-sidebar-container"
    >
      {/* Top bar */}
      <div className="sidebar-upper-control-panel">
        <span className="sidebar-topbar-post-name">{plainTextLabel || 'Untitled Entry'}</span>
        <div className="sidebar-action-menu-wrapper" ref={menuRef}>
          <button type="button" className="sidebar-three-dots-btn" ref={menuBtnRef}
            onClick={() => {
              if (!showMenu && menuBtnRef.current) {
                const r = menuBtnRef.current.getBoundingClientRect();
                setDropdownPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
              }
              setShowMenu(v => !v);
            }} title="Options">•••</button>
          {showMenu && (
            <div className="sidebar-dropdown-menu" style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 999999 }}>
              {isOp && (
                <button type="button" onClick={() => { setIsEditing(true); setShowMenu(false); }}>Edit Post</button>
              )}
              <button type="button" onClick={handleCopyUrl}>{copyLabel}</button>
              {isOp && (
                <button type="button" className="menu-delete-action" onClick={() => {
                  if (window.confirm("Delete this entry permanently?")) { onDeletePost(item.id); onClose(); }
                }}>Delete Post</button>
              )}
            </div>
          )}
          <button className="sidebar-close-panel-btn" onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="sidebar-scrollable-body-content">
        {isEditing ? (
          <div className="sidebar-edit-mode-container">
            <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} className="sidebar-edit-title-input" placeholder="Post title…" />
            <textarea value={editBody} onChange={e => setEditBody(e.target.value)} className="sidebar-edit-textarea" placeholder="Post body…" rows={5} />
            <div className="sidebar-edit-actions">
              <button type="button" className="edit-cancel" onClick={() => setIsEditing(false)}>Cancel</button>
              <button type="button" className="edit-save" onClick={handleSaveEdit}>Save</button>
            </div>
          </div>
        ) : (
          <h1 className="sidebar-main-compiled-headline">{plainTextLabel || 'Untitled Entry'}</h1>
        )}

        {!isEditing && formattedDateHeader && (
          <div className="sidebar-date-header-row">
            <span className="sidebar-date-header-line" />
            <span className="sidebar-date-header-label">{formattedDateHeader}</span>
            <span className="sidebar-date-header-line" />
          </div>
        )}

        {/* Author row */}
        <div className="sidebar-author-op-profile-row">
          <div className="sidebar-author-avatar-circle">
            {authorAvatar
              ? <img src={authorAvatar} alt={authorName} />
              : <div className="sidebar-avatar-fallback">{authorName.charAt(0).toUpperCase()}</div>
            }
          </div>
          <div className="sidebar-author-identity-info">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="sidebar-author-display-name">{authorName}</span>
              {isOp && <span className="sidebar-op-badge">OP</span>}
            </div>
            <span className="sidebar-author-handle-sub">{authorHandle} · {formattedTimestamp}</span>
          </div>
        </div>

        {/* Body content */}
        {!isEditing && (
          <div className="sidebar-compiled-html-body-view rich-text-display-pane">
            <div dangerouslySetInnerHTML={{ __html: bodyContentWithoutImages }} />
            {item.image && <img src={item.image} alt="Attachment" className="sidebar-body-embedded-media" />}
          </div>
        )}

        {/* Action bar */}
        <div className="sidebar-post-action-bar">
          <button type="button" className="sidebar-action-pill-btn" onClick={handleCopyUrl}>
            🔗 Share
          </button>
        </div>

        <div className="sidebar-divider" />

        {/* Comments section */}
        <div className="sidebar-comments-section">
          <p className="sidebar-comments-count">
            {(item.comments || []).length} comment{(item.comments || []).length !== 1 ? 's' : ''}
          </p>

          <AnimatePresence>
            {topLevelComments.map((comment) => (
              <React.Fragment key={comment.id}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="sidebar-comment-item"
                >
                  <div className="sidebar-author-avatar-circle sidebar-comment-avatar">
                    {comment.authorAvatar
                      ? <img src={comment.authorAvatar} alt={comment.author} />
                      : <div className="sidebar-avatar-fallback">{(comment.author || 'U').charAt(0).toUpperCase()}</div>
                    }
                  </div>
                  <div className="sidebar-comment-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="sidebar-author-display-name" style={{ fontSize: 13 }}>{comment.author || 'User'}</span>
                      {comment.author === authorName && <span className="sidebar-op-badge">OP</span>}
                      <span className="sidebar-author-handle-sub" style={{ marginLeft: 'auto' }}>{comment.timestamp}</span>
                      {/* Comment author can delete their own; post owner (OP) can moderate any comment */}
                      {(comment.authorUserId === currentUser?.id || isOp) && typeof onDeleteComment === 'function' && (
                        <button className="sidebar-comment-delete-btn" onClick={() => onDeleteComment(item.id, comment.id)} title="Delete">✕</button>
                      )}
                    </div>
                    <p className="sidebar-comment-text">{comment.text}</p>
                    <button
                      className="sidebar-comment-reply-btn"
                      onClick={() => setReplyingTo({ commentId: comment.id, author: comment.author })}
                    >
                      ↩ Reply
                    </button>
                  </div>
                </motion.div>

                {/* Nested replies */}
                {getReplies(comment.id).map(reply => (
                  <motion.div
                    key={reply.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="sidebar-comment-item sidebar-comment-reply-indent"
                  >
                    <div className="sidebar-author-avatar-circle sidebar-comment-avatar">
                      {reply.authorAvatar
                        ? <img src={reply.authorAvatar} alt={reply.author} />
                        : <div className="sidebar-avatar-fallback">{(reply.author || 'U').charAt(0).toUpperCase()}</div>
                      }
                    </div>
                    <div className="sidebar-comment-body">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="sidebar-author-display-name" style={{ fontSize: 13 }}>{reply.author || 'User'}</span>
                        {reply.author === authorName && <span className="sidebar-op-badge">OP</span>}
                        <span className="sidebar-reply-to-label">↩ {reply.replyToAuthor}</span>
                        <span className="sidebar-author-handle-sub" style={{ marginLeft: 'auto' }}>{reply.timestamp}</span>
                        {(reply.authorUserId === currentUser?.id || isOp) && typeof onDeleteComment === 'function' && (
                          <button className="sidebar-comment-delete-btn" onClick={() => onDeleteComment(item.id, reply.id)} title="Delete">✕</button>
                        )}
                      </div>
                      <p className="sidebar-comment-text">{reply.text}</p>
                      <button
                        className="sidebar-comment-reply-btn"
                        onClick={() => setReplyingTo({ commentId: comment.id, author: reply.author })}
                      >
                        ↩ Reply
                      </button>
                    </div>
                  </motion.div>
                ))}
              </React.Fragment>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Comment input pinned to bottom */}
      <div className="sidebar-comment-form-wrapper">
        {replyingTo && (
          <div className="sidebar-replying-to-bar">
            <span>Replying to <strong>{replyingTo.author}</strong></span>
            <button type="button" onClick={() => setReplyingTo(null)}>✕</button>
          </div>
        )}
        <div className="sidebar-comment-form">
          <div className="sidebar-author-avatar-circle" style={{ width: 32, height: 32, flexShrink: 0 }}>
            {currentUserAvatar
              ? <img src={currentUserAvatar} alt={currentUserName} />
              : <div className="sidebar-avatar-fallback">{currentUserName.charAt(0).toUpperCase()}</div>
            }
          </div>
          <input
            type="text"
            className="comment-input-bar"
            placeholder={replyingTo ? `Reply to ${replyingTo.author}…` : `Add a comment…`}
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
          />
          <button
            type="button"
            className="submit-post-btn"
            style={{ padding: '6px 14px', fontSize: 13, flexShrink: 0 }}
            onClick={handlePostComment}
            disabled={!commentText.trim()}
          >
            Post
          </button>
        </div>
      </div>
    </motion.aside>
  );
}