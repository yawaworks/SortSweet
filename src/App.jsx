import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import AuthPage from './AuthPage';
import BrainDumpInput from './BrainDumpInput';
import ForumFeed from './ForumFeed';
import PostDetailSidebar from './PostDetailSidebar';
import DraftsManager from './DraftsManager';
import ProfileDashboard from './ProfileDashboard';
import './App.css';

export default function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('sortsweet-user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [userId, setUserId] = useState(null);

  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  const [drafts, setDrafts] = useState(() => {
    const savedDrafts = localStorage.getItem('sortsweet-drafts');
    return savedDrafts ? JSON.parse(savedDrafts) : [];
  });

  const [activePostId, setActivePostId] = useState(null);
  const [activeDraft, setActiveDraft] = useState(null);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [showSortPanel, setShowSortPanel] = useState(false);
  const sortPanelRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (sortPanelRef.current && !sortPanelRef.current.contains(e.target)) setShowSortPanel(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    localStorage.setItem('sortsweet-drafts', JSON.stringify(drafts));
  }, [drafts]);

  // ── Auth listener ──
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUserId(session.user.id); fetchOrCreateProfile(session.user); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) { setUserId(session.user.id); fetchOrCreateProfile(session.user); }
      else if (event === 'SIGNED_OUT') {
        setUser(null); setUserId(null); setItems([]);
        localStorage.removeItem('sortsweet-user');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId) { fetchPosts(userId); fetchNotifications(userId); }
  }, [userId]);

  // ── Realtime subscription for comments/likes (so cross-user updates appear) ──
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('posts-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload) => {
        setItems(prev => prev.map(item => {
          if (item.id === payload.new.id) return { ...item, ...rowToItemPartial(payload.new) };
          return item;
        }));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.new.user_id !== userId && payload.new.is_public) {
          setItems(prev => [rowToItem(payload.new), ...prev]);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  // ── Realtime notifications ──
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, (payload) => {
        setNotifications(prev => [payload.new, ...prev]);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  const fetchNotifications = async (uid) => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', uid)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) setNotifications(data);
    } catch (err) { console.error('fetchNotifications error:', err); }
  };

  const fetchPosts = async (uid) => {
    setItemsLoading(true);
    try {
      const [ownResult, publicResult] = await Promise.all([
        supabase.from('posts').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('posts').select('*').eq('is_public', true).neq('user_id', uid).order('created_at', { ascending: false }),
      ]);
      if (ownResult.error) throw ownResult.error;
      if (publicResult.error) throw publicResult.error;
      const combined = [...(ownResult.data || []), ...(publicResult.data || [])];
      const seen = new Set();
      const deduped = combined.filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true; });
      deduped.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setItems(deduped.map(rowToItem));
    } catch (err) { console.error('fetchPosts error:', err); }
    finally { setItemsLoading(false); }
  };

  const rowToItem = (row) => ({
    id: row.id, text: row.text, category: row.category,
    image: row.image_url || null,
    authorName: row.author_name, authorAvatar: row.author_avatar || '',
    timestamp: row.created_at ? new Date(row.created_at).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    comments: row.comments || [], isPublic: row.is_public || false,
    archived: row.archived || false, liked: row.liked || false, bookmarked: row.bookmarked || false,
    _userId: row.user_id,
  });

  const rowToItemPartial = (row) => ({
    text: row.text, category: row.category, image: row.image_url || null,
    authorName: row.author_name, authorAvatar: row.author_avatar || '',
    comments: row.comments || [], isPublic: row.is_public || false,
    archived: row.archived || false, liked: row.liked || false, bookmarked: row.bookmarked || false,
  });

  const fetchOrCreateProfile = async (authUser) => {
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', authUser.id).single();
      let userData;
      if (profile) {
        userData = {
          id: authUser.id,
          username: profile.username,
          nickname: profile.nickname || profile.username,
          email: authUser.email,
          bio: profile.bio || '',
          avatar: profile.avatar_url || '',
          isPublic: profile.is_public !== false,
        };
      } else {
        const meta = authUser.user_metadata || {};
        userData = {
          id: authUser.id,
          username: meta.username || authUser.email.split('@')[0],
          nickname: meta.nickname || meta.username || authUser.email.split('@')[0],
          email: authUser.email, bio: '', avatar: '', isPublic: true,
        };
      }
      setUser(userData);
      localStorage.setItem('sortsweet-user', JSON.stringify(userData));
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setUserId(null); setItems([]);
    localStorage.removeItem('sortsweet-user');
    setActivePostId(null);
  };

  // Push a notification row to Supabase (best effort)
  const pushNotification = async (recipientId, type, actorName, postId, postTitle) => {
    if (!recipientId || recipientId === userId) return; // don't notify yourself
    try {
      await supabase.from('notifications').insert({
        recipient_id: recipientId,
        actor_name: actorName,
        type, // 'like' | 'comment' | 'reply'
        post_id: postId,
        post_title: postTitle,
        read: false,
      });
    } catch (e) { /* silent */ }
  };

  const handleAddItem = async (content, category, imageUrl) => {
    const currentName = user?.nickname || user?.username || 'Original Poster';
    const newItem = {
      id: crypto.randomUUID(), text: content, category,
      image: imageUrl || null, authorName: currentName,
      authorAvatar: user?.avatar || '',
      timestamp: new Date().toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(), comments: [],
    };
    setItems(prev => [newItem, ...prev]);
    setShowCreatePanel(false);
    if (activeDraft) { setDrafts(prev => prev.filter(d => d.id !== activeDraft.id)); setActiveDraft(null); }
    try {
      const { error } = await supabase.from('posts').insert({
        id: newItem.id, user_id: userId, text: newItem.text, category: newItem.category,
        image_url: newItem.image, author_name: newItem.authorName,
        author_avatar: newItem.authorAvatar, comments: [],
      });
      if (error) throw error;
    } catch (err) {
      console.error('insert error:', err);
      setItems(prev => prev.filter(i => i.id !== newItem.id));
      alert('Failed to save post: ' + err.message);
    }
  };

  const handleUpdateItem = async (id, updatedFields) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updatedFields } : item));
    try {
      const dbFields = {};
      if ('text' in updatedFields) dbFields.text = updatedFields.text;
      if ('category' in updatedFields) dbFields.category = updatedFields.category;
      if ('comments' in updatedFields) dbFields.comments = updatedFields.comments;
      if ('isPublic' in updatedFields) dbFields.is_public = updatedFields.isPublic;
      if ('archived' in updatedFields) dbFields.archived = updatedFields.archived;
      if (Object.keys(dbFields).length === 0) return;
      const { error } = await supabase.from('posts').update(dbFields).eq('id', id).eq('user_id', userId);
      if (error) throw error;
    } catch (err) { console.error('update error:', err); }
  };

  const handleDeleteItem = async (id) => {
    if (activePostId === id) setActivePostId(null);
    setItems(prev => prev.filter(item => item.id !== id));
    try {
      const { error } = await supabase.from('posts').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
    } catch (err) { console.error('delete error:', err); }
  };

  const handleMoveItem = (id, newCategory) => handleUpdateItem(id, { category: newCategory });

  // ── Comments — stored as JSON in post row ──
  // Uses RPC or direct update; also pushes notifications
  const handleAddComment = async (postId, commentText, authorName, authorAvatar, replyToId = null) => {
    const post = items.find(i => i.id === postId);
    if (!post) return;

    // Find parent comment info for reply
    const parentComment = replyToId ? (post.comments || []).find(c => c.id === replyToId) : null;

    const newComment = {
      id: crypto.randomUUID(),
      text: commentText,
      author: authorName,
      authorAvatar: authorAvatar || '',
      timestamp: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      replyTo: replyToId || null,
      replyToAuthor: parentComment?.author || null,
    };
    const updatedComments = [...(post.comments || []), newComment];

    // Optimistic update — use direct Supabase update (not just local state) so other users see it
    setItems(prev => prev.map(item => item.id === postId ? { ...item, comments: updatedComments } : item));
    try {
      const { error } = await supabase.from('posts').update({ comments: updatedComments }).eq('id', postId);
      if (error) throw error;

      // Notification: notify post owner if it's someone else's post
      const el = document.createElement('div'); el.innerHTML = post.text || '';
      const titleEl = el.querySelector('.post-compiled-title');
      const postTitle = titleEl ? titleEl.textContent.trim() : 'a post';
      if (post._userId && post._userId !== userId) {
        await pushNotification(post._userId, replyToId ? 'reply' : 'comment', authorName, postId, postTitle);
      }
      // Also notify parent comment author if replying
      if (replyToId && parentComment && post._userId !== userId) {
        // We'd need parent comment author's userId — we store authorName only. Skip for now unless we track userId in comments.
      }
    } catch (err) { console.error('comment error:', err); }
  };

  const handleDeleteComment = async (postId, commentId) => {
    const post = items.find(i => i.id === postId);
    if (!post) return;
    const updatedComments = (post.comments || []).filter(c => c.id !== commentId && c.replyTo !== commentId);
    setItems(prev => prev.map(item => item.id === postId ? { ...item, comments: updatedComments } : item));
    try {
      const { error } = await supabase.from('posts').update({ comments: updatedComments }).eq('id', postId);
      if (error) throw error;
    } catch (err) { console.error('deleteComment error:', err); }
  };

  // ── Like with notification ──
  const handleLikeItem = async (id) => {
    const post = items.find(i => i.id === id);
    if (!post) return;
    const newLiked = !post.liked;
    setItems(prev => prev.map(item => item.id === id ? { ...item, liked: newLiked } : item));
    try {
      await supabase.from('posts').update({ liked: newLiked }).eq('id', id);
      if (newLiked && post._userId && post._userId !== userId) {
        const el = document.createElement('div'); el.innerHTML = post.text || '';
        const titleEl = el.querySelector('.post-compiled-title');
        const postTitle = titleEl ? titleEl.textContent.trim() : 'a post';
        const actorName = user?.nickname || user?.username || 'Someone';
        await pushNotification(post._userId, 'like', actorName, id, postTitle);
      }
    } catch (err) { console.error('like error:', err); }
  };

  const markNotificationsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await supabase.from('notifications').update({ read: true }).eq('recipient_id', userId).eq('read', false);
    } catch (e) { /* silent */ }
  };

  const handleSaveDraft = (draftObject) => {
    setDrafts(prev => {
      const exists = prev.find(d => d.id === draftObject.id);
      return exists ? prev.map(d => d.id === draftObject.id ? draftObject : d) : [draftObject, ...prev];
    });
    setShowCreatePanel(false);
  };

  const handleLoadDraft = (draft) => { setActiveDraft(draft); setShowDraftsModal(false); setShowCreatePanel(true); };
  const handleDeleteDraft = (draftId) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId));
    if (activeDraft?.id === draftId) setActiveDraft(null);
  };

  const handleUpdateUserProfile = (updatedUserObj) => {
    setUser(updatedUserObj);
    localStorage.setItem('sortsweet-user', JSON.stringify(updatedUserObj));
  };

  const displayedItems = useMemo(() => {
    let result = items.filter(i => !i.archived);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => {
        const el = document.createElement('div'); el.innerHTML = item.text || '';
        return (el.textContent || '').toLowerCase().includes(q);
      });
    }
    if (filterCategory !== 'all') result = result.filter(i => i.category === filterCategory);
    if (sortBy === 'newest') result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else if (sortBy === 'oldest') result.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    else if (sortBy === 'category') result.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
    else if (sortBy === 'comments') result.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    return result;
  }, [items, searchQuery, filterCategory, sortBy]);

  if (!user) return <AuthPage onAuthSuccess={(u) => setUser(u)} />;
  const activePost = items.find(item => item.id === activePostId);
  const unreadCount = notifications.filter(n => !n.read).length;
  const displayName = user?.nickname || user?.username || 'User';

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-wrapper-flex">
          <div className="header-left">
            <h1>Sort<span className="highlight">Sweet</span></h1>
            <p>Welcome back, <span className="highlight">{displayName}</span>!</p>
          </div>
          <div className="header-right-action-bay">
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowProfileModal(true)}>⚙️ Settings</button>
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowDraftsModal(true)}>📋 Drafts ({drafts.length})</button>
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowBookmarks(true)}>★ Bookmarks</button>
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowArchive(true)}>▼ Archive</button>

            {/* ── Notifications bell ── */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                className="drafts-drawer-toggle-btn notif-bell-btn"
                onClick={() => { setShowNotifications(v => !v); if (!showNotifications) markNotificationsRead(); }}
              >
                🔔
                {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              {showNotifications && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">
                    <span>Notifications</span>
                    {notifications.length > 0 && (
                      <button onClick={async () => {
                        setNotifications([]);
                        await supabase.from('notifications').delete().eq('recipient_id', userId);
                      }} className="notif-clear-btn">Clear all</button>
                    )}
                  </div>
                  {notifications.length === 0
                    ? <p className="notif-empty">No notifications yet</p>
                    : notifications.map(n => (
                      <div
                        key={n.id}
                        className={`notif-item ${n.read ? '' : 'unread'}`}
                        onClick={() => { if (n.post_id) { setActivePostId(n.post_id); setShowNotifications(false); } }}
                      >
                        <span className="notif-icon">
                          {n.type === 'like' ? '♡' : n.type === 'reply' ? '↩' : '💬'}
                        </span>
                        <div className="notif-text">
                          <strong>{n.actor_name}</strong>
                          {n.type === 'like' ? ' liked' : n.type === 'reply' ? ' replied to' : ' commented on'}
                          {' '}your post <em>{n.post_title || 'a post'}</em>
                          <div className="notif-time">{n.created_at ? new Date(n.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                        </div>
                        {!n.read && <span className="notif-dot" />}
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            <button onClick={handleLogout} className="control-btn logout-header-btn">Logout</button>
          </div>
        </div>
      </header>

      {!showCreatePanel && (
        <div className="search-create-bar">
          <span className="search-icon-inline">🔍</span>
          <input className="search-bar-input" placeholder="Search or create a post..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          <button className="new-post-btn" onClick={() => setShowCreatePanel(true)}>💬 New Post</button>
        </div>
      )}

      {showCreatePanel && (
        <BrainDumpInput
          onAddItem={handleAddItem} drafts={drafts} onSaveDraft={handleSaveDraft}
          activeDraft={activeDraft}
          onClearActiveDraft={() => { setActiveDraft(null); setShowCreatePanel(false); }}
          currentUser={user} onCancel={() => setShowCreatePanel(false)}
        />
      )}

      {/* Sort & View */}
      <div className="sort-view-pill-wrapper" ref={sortPanelRef}>
        <button className={`sort-view-pill-btn ${showSortPanel ? 'open' : ''}`} onClick={() => setShowSortPanel(v => !v)}>
          <span className="sort-view-pill-icon">⇅</span> Sort &amp; View
          <span className="sort-view-pill-chevron">{showSortPanel ? '︿' : '﹀'}</span>
        </button>
        {showSortPanel && (
          <div className="sort-view-dropdown-panel">
            <div className="svp-section-label">Sort By</div>
            {[{ value: 'newest', label: 'Recently Active' }, { value: 'oldest', label: 'Date Posted' }, { value: 'comments', label: 'Most Comments' }].map(opt => (
              <label key={opt.value} className="svp-radio-row">
                <span className="svp-radio-label">{opt.label}</span>
                <input type="radio" name="sortBy" checked={sortBy === opt.value} onChange={() => setSortBy(opt.value)} className="svp-radio-input" />
                <span className={`svp-radio-circle ${sortBy === opt.value ? 'checked' : ''}`} />
              </label>
            ))}
            <div className="svp-divider" />
            <div className="svp-section-label">Filter By Tag</div>
            {[{ value: 'all', label: 'All' }, { value: 'now', label: 'Now' }, { value: 'delegate', label: 'Delegate' }, { value: 'someday', label: 'Someday' }].map(opt => (
              <label key={opt.value} className="svp-radio-row">
                <span className="svp-radio-label">{opt.label}</span>
                <input type="radio" name="filterCategory" checked={filterCategory === opt.value} onChange={() => setFilterCategory(opt.value)} className="svp-radio-input" />
                <span className={`svp-radio-circle ${filterCategory === opt.value ? 'checked' : ''}`} />
              </label>
            ))}
            <div className="svp-divider" />
            <div className="svp-section-label">View As</div>
            {[{ value: 'list', label: 'List' }, { value: 'gallery', label: 'Gallery' }].map(opt => (
              <label key={opt.value} className="svp-radio-row">
                <span className="svp-radio-label">{opt.label}</span>
                <input type="radio" name="viewMode" checked={viewMode === opt.value} onChange={() => setViewMode(opt.value)} className="svp-radio-input" />
                <span className={`svp-radio-circle ${viewMode === opt.value ? 'checked' : ''}`} />
              </label>
            ))}
            <div className="svp-divider" />
            <button className="svp-reset-btn" onClick={() => { setSortBy('newest'); setViewMode('list'); setFilterCategory('all'); setShowSortPanel(false); }}>Reset to default</button>
          </div>
        )}
      </div>

      <div className={`workspace-layout ${activePost ? 'split-view' : ''}`}>
        <div className="feed-pane">
          {itemsLoading
            ? <p style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>Loading posts…</p>
            : <ForumFeed
                items={displayedItems}
                activePostId={activePostId}
                onSelectPost={setActivePostId}
                onMoveItem={handleMoveItem}
                onDeleteItem={handleDeleteItem}
                onUpdateItem={handleUpdateItem}
                onLikeItem={handleLikeItem}
                viewMode={viewMode}
                sidebarOpen={!!activePost}
                currentUserId={userId}
              />
          }
        </div>
        {activePost && (
          <PostDetailSidebar
            item={activePost} onClose={() => setActivePostId(null)}
            onAddComment={handleAddComment} onDeletePost={handleDeleteItem}
            onDeleteComment={handleDeleteComment} onUpdateItem={handleUpdateItem}
            currentUser={user}
          />
        )}
      </div>

      {showDraftsModal && <DraftsManager drafts={drafts} onLoadDraft={handleLoadDraft} onDeleteDraft={handleDeleteDraft} onClose={() => setShowDraftsModal(false)} />}
      {showProfileModal && <ProfileDashboard user={user} onUpdateUser={handleUpdateUserProfile} onClose={() => setShowProfileModal(false)} />}

      {showBookmarks && (
        <BookmarksModal
          items={items.filter(i => i.bookmarked && !i.archived)}
          onClose={() => setShowBookmarks(false)}
          onSelect={(id) => { setActivePostId(id); setShowBookmarks(false); }}
          handleUpdateItem={handleUpdateItem}
        />
      )}
      {showArchive && (
        <ArchiveModal
          items={items.filter(i => i.archived)}
          onClose={() => setShowArchive(false)}
          onSelect={(id) => { setActivePostId(id); setShowArchive(false); }}
          onUnarchive={(id) => handleUpdateItem(id, { archived: false })}
          onDelete={handleDeleteItem}
        />
      )}
    </div>
  );
}

/* ── Bookmarks Modal ── */
function BookmarksModal({ items, onClose, onSelect, handleUpdateItem }) {
  return (
    <div className="overlay-modal-backdrop" onClick={onClose}>
      <div className="overlay-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="overlay-modal-header">
          <h2 className="overlay-modal-title">★ Bookmarks</h2>
          <button className="overlay-modal-close" onClick={onClose}>✕</button>
        </div>
        {items.length === 0 ? (
          <div className="overlay-modal-empty"><p>No bookmarks yet.</p><p style={{ fontSize: 13, color: '#aaa' }}>Star a post with ☆ to save it here.</p></div>
        ) : (
          <div className="overlay-modal-list">
            {items.map(item => {
              const el = document.createElement('div'); el.innerHTML = item.text || '';
              const titleEl = el.querySelector('.post-compiled-title');
              const bodyEl = el.querySelector('.post-compiled-body');
              const title = titleEl ? titleEl.textContent.trim() : 'Untitled Entry';
              const preview = bodyEl ? bodyEl.textContent.trim().slice(0, 100) : '';
              return (
                <div key={item.id} className="overlay-modal-item" onClick={() => onSelect(item.id)}>
                  <div className="overlay-modal-item-left">
                    {item.image && <div className="overlay-modal-thumb"><img src={item.image} alt="" /></div>}
                    <div className="overlay-modal-item-text">
                      <p className="overlay-modal-item-title">{title}</p>
                      {preview && <p className="overlay-modal-item-preview">{preview}…</p>}
                      <p className="overlay-modal-item-meta">{item.authorName} · {item.timestamp}</p>
                    </div>
                  </div>
                  <button className="overlay-modal-item-action" title="Remove bookmark" onClick={e => { e.stopPropagation(); handleUpdateItem(item.id, { bookmarked: false }); }}>★</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Archive Modal ── */
function ArchiveModal({ items, onClose, onSelect, onUnarchive, onDelete }) {
  return (
    <div className="overlay-modal-backdrop" onClick={onClose}>
      <div className="overlay-modal-panel" onClick={e => e.stopPropagation()}>
        <div className="overlay-modal-header">
          <h2 className="overlay-modal-title">▼ Archive</h2>
          <button className="overlay-modal-close" onClick={onClose}>✕</button>
        </div>
        {items.length === 0 ? (
          <div className="overlay-modal-empty"><p>Nothing archived yet.</p></div>
        ) : (
          <div className="overlay-modal-list">
            {items.map(item => {
              const el = document.createElement('div'); el.innerHTML = item.text || '';
              const title = (el.querySelector('.post-compiled-title')?.textContent || 'Untitled').trim();
              const preview = (el.querySelector('.post-compiled-body')?.textContent || '').trim().slice(0, 100);
              return (
                <div key={item.id} className="overlay-modal-item" onClick={() => onSelect(item.id)}>
                  <div className="overlay-modal-item-left">
                    {item.image && <div className="overlay-modal-thumb"><img src={item.image} alt="" /></div>}
                    <div className="overlay-modal-item-text">
                      <p className="overlay-modal-item-title">{title}</p>
                      {preview && <p className="overlay-modal-item-preview">{preview}…</p>}
                      <p className="overlay-modal-item-meta">{item.authorName} · {item.timestamp}</p>
                    </div>
                  </div>
                  <div className="overlay-modal-item-actions" onClick={e => e.stopPropagation()}>
                    <button className="overlay-modal-restore-btn" onClick={() => onUnarchive(item.id)}>▲ Restore</button>
                    <button className="overlay-modal-delete-btn" onClick={() => { if (window.confirm('Delete permanently?')) onDelete(item.id); }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}