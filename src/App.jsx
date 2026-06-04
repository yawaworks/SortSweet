import React, { useState, useEffect, useMemo } from 'react';
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

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [showSortPanel, setShowSortPanel] = useState(false);
  const sortPanelRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(e) {
      if (sortPanelRef.current && !sortPanelRef.current.contains(e.target)) {
        setShowSortPanel(false);
      }
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
      if (session?.user) {
        setUserId(session.user.id);
        fetchOrCreateProfile(session.user);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        fetchOrCreateProfile(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserId(null);
        setItems([]);
        localStorage.removeItem('sortsweet-user');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load posts when userId is available ──
  useEffect(() => {
    if (userId) fetchPosts(userId);
  }, [userId]);

  // ── Fetch all posts for this user ──
  const fetchPosts = async (uid) => {
    setItemsLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setItems((data || []).map(rowToItem));
    } catch (err) {
      console.error('fetchPosts error:', err);
    } finally {
      setItemsLoading(false);
    }
  };

  // ── DB row → app item ──
  const rowToItem = (row) => ({
    id: row.id,
    text: row.text,
    category: row.category,
    image: row.image_url || null,
    authorName: row.author_name,
    authorAvatar: row.author_avatar || '',
    timestamp: row.created_at
      ? new Date(row.created_at).toLocaleString([], {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', hour12: false
        })
      : '',
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    comments: row.comments || [],
    isPublic: row.is_public || false,
  });

  const fetchOrCreateProfile = async (authUser) => {
    try {
      const { data: profile } = await supabase
        .from('profiles').select('*').eq('id', authUser.id).single();
      let userData;
      if (profile) {
        userData = { username: profile.username, email: authUser.email, bio: profile.bio || '', avatar: profile.avatar_url || '' };
      } else {
        userData = {
          username: authUser.user_metadata?.username || authUser.email.split('@')[0],
          email: authUser.email, bio: authUser.user_metadata?.bio || '', avatar: authUser.user_metadata?.avatar || ''
        };
      }
      setUser(userData);
      localStorage.setItem('sortsweet-user', JSON.stringify(userData));
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserId(null);
    setItems([]);
    localStorage.removeItem('sortsweet-user');
    setActivePostId(null);
  };

  // ── Add post → Supabase insert ──
  const handleAddItem = async (content, category, imageUrl) => {
    const newItem = {
      id: crypto.randomUUID(),
      text: content,
      category,
      image: imageUrl || null,
      authorName: user?.username || 'Original Poster',
      authorAvatar: user?.avatar || '',
      timestamp: new Date().toLocaleString([], {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
      createdAt: Date.now(),
      comments: [],
    };

    // Optimistic UI
    setItems(prev => [newItem, ...prev]);
    setShowCreatePanel(false);
    if (activeDraft) {
      setDrafts(prev => prev.filter(d => d.id !== activeDraft.id));
      setActiveDraft(null);
    }

    try {
      const { error } = await supabase.from('posts').insert({
        id: newItem.id,
        user_id: userId,
        text: newItem.text,
        category: newItem.category,
        image_url: newItem.image,
        author_name: newItem.authorName,
        author_avatar: newItem.authorAvatar,
        comments: [],
      });
      if (error) throw error;
    } catch (err) {
      console.error('insert error:', err);
      setItems(prev => prev.filter(i => i.id !== newItem.id));
      alert('Failed to save post: ' + err.message);
    }
  };

  // ── Update post → Supabase update ──
  const handleUpdateItem = async (id, updatedFields) => {
    // Optimistic UI
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updatedFields } : item));

    try {
      const dbFields = {};
      if ('text' in updatedFields) dbFields.text = updatedFields.text;
      if ('category' in updatedFields) dbFields.category = updatedFields.category;
      if ('comments' in updatedFields) dbFields.comments = updatedFields.comments;
      if ('isPublic' in updatedFields) dbFields.is_public = updatedFields.isPublic;

      if (Object.keys(dbFields).length === 0) return;

      const { error } = await supabase
        .from('posts')
        .update(dbFields)
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    } catch (err) {
      console.error('update error:', err);
    }
  };

  // ── Delete post → Supabase delete ──
  const handleDeleteItem = async (id) => {
    if (activePostId === id) setActivePostId(null);
    setItems(prev => prev.filter(item => item.id !== id));
    try {
      const { error } = await supabase.from('posts').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
    } catch (err) {
      console.error('delete error:', err);
    }
  };

  const handleMoveItem = (id, newCategory) => handleUpdateItem(id, { category: newCategory });

  // ── Comments (stored as JSON array in the post row) ──
  const handleAddComment = async (postId, commentText, authorName, authorAvatar) => {
    const post = items.find(i => i.id === postId);
    if (!post) return;
    const newComment = {
      id: crypto.randomUUID(),
      text: commentText,
      author: authorName,
      authorAvatar: authorAvatar || '',
      timestamp: new Date().toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }),
    };
    await handleUpdateItem(postId, { comments: [...(post.comments || []), newComment] });
  };

  const handleDeleteComment = async (postId, commentId) => {
    const post = items.find(i => i.id === postId);
    if (!post) return;
    await handleUpdateItem(postId, { comments: (post.comments || []).filter(c => c.id !== commentId) });
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
    let result = [...items];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => {
        const el = document.createElement('div');
        el.innerHTML = item.text || '';
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

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-wrapper-flex">
          <div className="header-left">
            <h1>Sort<span className="highlight">Sweet</span></h1>
            <p>Welcome back, <span className="highlight">{user.username}</span>!</p>
          </div>
          <div className="header-right-action-bay">
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowProfileModal(true)}>⚙️ Settings</button>
            <button className="drafts-drawer-toggle-btn" onClick={() => setShowDraftsModal(true)}>📋 Drafts ({drafts.length})</button>
            <button onClick={handleLogout} className="control-btn logout-header-btn">Logout</button>
          </div>
        </div>
      </header>

      {!showCreatePanel && (
        <div className="search-create-bar">
          <span className="search-icon-inline">🔍</span>
          <input
            className="search-bar-input"
            placeholder="Search or create a post..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button className="new-post-btn" onClick={() => setShowCreatePanel(true)}>💬 New Post</button>
        </div>
      )}

      {showCreatePanel && (
        <BrainDumpInput
          onAddItem={handleAddItem}
          drafts={drafts}
          onSaveDraft={handleSaveDraft}
          activeDraft={activeDraft}
          onClearActiveDraft={() => { setActiveDraft(null); setShowCreatePanel(false); }}
          currentUser={user}
          onCancel={() => setShowCreatePanel(false)}
        />
      )}

      {/* ── Sort & View pill + dropdown ── */}
      <div className="sort-view-pill-wrapper" ref={sortPanelRef}>
        <button
          className={`sort-view-pill-btn ${showSortPanel ? 'open' : ''}`}
          onClick={() => setShowSortPanel(v => !v)}
        >
          <span className="sort-view-pill-icon">⇅</span>
          Sort &amp; View
          <span className="sort-view-pill-chevron">{showSortPanel ? '︿' : '﹀'}</span>
        </button>

        {showSortPanel && (
          <div className="sort-view-dropdown-panel">
            <div className="svp-section-label">Sort By</div>
            {[
              { value: 'newest', label: 'Recently Active' },
              { value: 'oldest', label: 'Date Posted' },
              { value: 'comments', label: 'Most Comments' },
            ].map(opt => (
              <label key={opt.value} className="svp-radio-row">
                <span className="svp-radio-label">{opt.label}</span>
                <input type="radio" name="sortBy" checked={sortBy === opt.value} onChange={() => setSortBy(opt.value)} className="svp-radio-input" />
                <span className={`svp-radio-circle ${sortBy === opt.value ? 'checked' : ''}`} />
              </label>
            ))}

            <div className="svp-divider" />
            <div className="svp-section-label">Filter By Tag</div>
            {[
              { value: 'all', label: 'All' },
              { value: 'now', label: 'Now' },
              { value: 'delegate', label: 'Delegate' },
              { value: 'someday', label: 'Someday' },
            ].map(opt => (
              <label key={opt.value} className="svp-radio-row">
                <span className="svp-radio-label">{opt.label}</span>
                <input type="radio" name="filterCategory" checked={filterCategory === opt.value} onChange={() => setFilterCategory(opt.value)} className="svp-radio-input" />
                <span className={`svp-radio-circle ${filterCategory === opt.value ? 'checked' : ''}`} />
              </label>
            ))}

            <div className="svp-divider" />
            <div className="svp-section-label">View As</div>
            {[
              { value: 'list', label: 'List' },
              { value: 'gallery', label: 'Gallery' },
            ].map(opt => (
              <label key={opt.value} className="svp-radio-row">
                <span className="svp-radio-label">{opt.label}</span>
                <input type="radio" name="viewMode" checked={viewMode === opt.value} onChange={() => setViewMode(opt.value)} className="svp-radio-input" />
                <span className={`svp-radio-circle ${viewMode === opt.value ? 'checked' : ''}`} />
              </label>
            ))}

            <div className="svp-divider" />
            <button className="svp-reset-btn" onClick={() => { setSortBy('newest'); setViewMode('list'); setFilterCategory('all'); setShowSortPanel(false); }}>
              Reset to default
            </button>
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
                viewMode={viewMode}
                sidebarOpen={!!activePost}
              />
          }
        </div>

        {activePost && (
          <PostDetailSidebar
            item={activePost}
            onClose={() => setActivePostId(null)}
            onAddComment={handleAddComment}
            onDeletePost={handleDeleteItem}
            onDeleteComment={handleDeleteComment}
            onUpdateItem={handleUpdateItem}
            currentUser={user}
          />
        )}
      </div>

      {showDraftsModal && (
        <DraftsManager drafts={drafts} onLoadDraft={handleLoadDraft} onDeleteDraft={handleDeleteDraft} onClose={() => setShowDraftsModal(false)} />
      )}
      {showProfileModal && (
        <ProfileDashboard user={user} onUpdateUser={handleUpdateUserProfile} onClose={() => setShowProfileModal(false)} />
      )}
    </div>
  );
}