import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import './JournalEditor.css';

export default function PostDetailSidebar({ 
  item, 
  onClose, 
  onDeletePost, 
  onUpdateItem,
  currentUser 
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const menuRef = useRef(null);

  const currentUserName = currentUser?.username || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User';
  const currentUserAvatar = currentUser?.avatar || currentUser?.avatarUrl || null;
  const isOp = !item.authorName || item.authorName === currentUserName || item.authorName === 'Original Poster';

  useEffect(() => {
    if (item) {
      setEditText(item.text || '');
    }
  }, [item]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!item) return null;

  const getPlainTitleText = (htmlString) => {
    if (!htmlString) return '';
    const tempElement = document.createElement('div');
    tempElement.innerHTML = htmlString;
    const titleEl = tempElement.querySelector('.post-compiled-title');
    if (titleEl) return titleEl.textContent || titleEl.innerText || '';
    // Fallback: no compiled wrapper — extract first heading or return empty
    const heading = tempElement.querySelector('h1, h2, h3');
    return heading ? heading.textContent || '' : '';
  };

  const getBodyHtmlContent = (htmlString) => {
    if (!htmlString) return '';
    const tempElement = document.createElement('div');
    tempElement.innerHTML = htmlString;
    const bodyEl = tempElement.querySelector('.post-compiled-body');
    if (bodyEl) return bodyEl.innerHTML;
    // Fallback: no compiled wrapper — return full HTML as body
    return htmlString;
  };

  const plainTextLabel = getPlainTitleText(item.text);
  const bodyContentHtml = getBodyHtmlContent(item.text);

  const handleSaveEdit = () => {
    if (editText.trim()) {
      onUpdateItem(item.id, { text: editText });
      setIsEditing(false);
    }
  };

  const formattedTimestamp = React.useMemo(() => {
    return item.timestamp || new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.timestamp]);

  const tagLabels = {
    now: 'Now',
    delegate: 'Delegate',
    someday: 'Later'
  };

  return (
    <motion.aside 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ type: "spring", stiffness: 500, damping: 35 }}
      className="post-detail-sidebar-container"
    >
      <div className="sidebar-upper-control-panel">
        <span className={`sidebar-panel-tag ${item.category}`}>
          #{tagLabels[item.category] || 'Thread'}
        </span>
        
        <div className="sidebar-action-menu-wrapper" ref={menuRef}>
          <button 
            type="button" 
            className="sidebar-three-dots-btn" 
            onClick={() => setShowMenu(!showMenu)}
            title="Options"
          >
            •••
          </button>
          
          {showMenu && (
            <div className="sidebar-dropdown-menu">
              {isOp && (
                <>
                  <button type="button" onClick={() => { setIsEditing(true); setShowMenu(false); }}>
                    Edit Post
                  </button>
                  <button 
                    type="button" 
                    className="menu-delete-action"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to permanently delete this entry?")) {
                        onDeletePost(item.id);
                        onClose();
                      }
                    }}
                  >
                    Delete Post
                  </button>
                </>
              )}
              <button type="button" onClick={() => { alert("Following thread..."); setShowMenu(false); }}>
                Follow Thread
              </button>
              <button type="button" onClick={() => { alert("Link copied to clipboard!"); setShowMenu(false); }}>
                Share
              </button>
            </div>
          )}
          
          <button className="sidebar-close-panel-btn" onClick={onClose} title="Close Pane">✕</button>
        </div>
      </div>

      <div className="sidebar-scrollable-body-content">
        <div className="sidebar-author-op-profile-row">
          <div className="sidebar-author-avatar-circle">
            {(item.authorAvatar || currentUserAvatar) && (
              <img src={item.authorAvatar || currentUserAvatar} alt="" />
            )}
          </div>
          <div className="sidebar-author-identity-info">
            <span className="sidebar-author-display-name">{item.authorName || currentUserName}</span>
            <span className="sidebar-author-handle-sub">@{(item.authorName || currentUserName).toLowerCase().replace(/\s+/g, '_')}</span>
          </div>
        </div>

        {isEditing ? (
          <div className="sidebar-edit-mode-container">
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="sidebar-edit-textarea"
            />
            <div className="sidebar-edit-actions">
              <button type="button" className="edit-cancel" onClick={() => setIsEditing(false)}>Cancel</button>
              <button type="button" className="edit-save" onClick={handleSaveEdit}>Save</button>
            </div>
          </div>
        ) : (
          <h1 className="sidebar-main-compiled-headline">
            {plainTextLabel || 'Untitled Entry'}
          </h1>
        )}

        <div className="sidebar-realtime-timestamp-row">
          {formattedTimestamp}
        </div>

        {!isEditing && (
          <div className="sidebar-compiled-html-body-view rich-text-display-pane">
            <div dangerouslySetInnerHTML={{ __html: bodyContentHtml }} />
            {item.image && (
              <img src={item.image} alt="Attachment View" className="sidebar-body-embedded-media" />
            )}
          </div>
        )}
      </div>
    </motion.aside>
  );
}