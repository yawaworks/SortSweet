import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
    try { return JSON.parse(localStorage.getItem('sortsweet-user') || 'null'); } catch { return null; }
  });
  const [userId, setUserId] = useState(null);
  const userIdRef = useRef(null);

  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Drafts still local (no auth needed, user-private scratch)
  const [drafts, setDrafts] = useState(() => {
    try { return JSON.parse(localStorage.getItem('sortsweet-drafts') || '[]'); } catch { return []; }
  });

  const [activePostId, setActivePostId] = useState(null);
  const [activeDraft, setActiveDraft] = useState(null);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // Left nav panel state
  const [leftNavOpen, setLeftNavOpen] = useState(false);
  const [leftNavView, setLeftNavView] = useState(null); // 'drafts'|'bookmarks'|'archive'|'notifications'
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const leftNavRef = useRef(null);

  // Likes & bookmarks from Supabase (keyed by post_id)
  const [userLikes, setUserLikes] = useState({});
  const [userBookmarks, setUserBookmarks] = useState({});
  const userLikesRef = useRef(userLikes);
  const userBookmarksRef = useRef(userBookmarks);
  useEffect(() => { userLikesRef.current = userLikes; }, [userLikes]);
  useEffect(() => { userBookmarksRef.current = userBookmarks; }, [userBookmarks]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewMode, setViewMode] = useState('list');
  const [showSortPanel, setShowSortPanel] = useState(false);
  const sortPanelRef = useRef(null);

  // Close sort panel & left nav on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (sortPanelRef.current && !sortPanelRef.current.contains(e.target)) setShowSortPanel(false);
      if (leftNavRef.current && !leftNavRef.current.contains(e.target)) {
        const hamburger = document.getElementById('hamburger-btn');
        if (hamburger && hamburger.contains(e.target)) return;
        setLeftNavOpen(false);
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
      if (session?.user) { setUserId(session.user.id); userIdRef.current = session.user.id; fetchOrCreateProfile(session.user); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        userIdRef.current = session.user.id;
        // Only fetch profile on actual sign-in events, not token refreshes or
        // USER_UPDATED events — those would overwrite a just-saved profile update.
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          fetchOrCreateProfile(session.user);
        }
      }
      else if (event === 'SIGNED_OUT') {
        setUser(null); setUserId(null); userIdRef.current = null; setItems([]);
        setUserLikes({}); setUserBookmarks({});
        localStorage.removeItem('sortsweet-user');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── URL deep-link to post ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    if (postId) setActivePostId(postId);
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post');
    if (postId && items.find(i => i.id === postId)) {
      setActivePostId(postId);
      fetchComments(postId);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [items]);

  // ── Realtime: posts ──
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('posts-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, (payload) => {
        setItems(prev => prev.map(item =>
          item.id === payload.new.id ? { ...item, ...rowToItemPartial(payload.new) } : item
        ));
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
        if (payload.new.user_id !== userId && payload.new.is_public) {
          const row = payload.new;
          setItems(prev => [{
            id: row.id, text: row.text, category: row.category,
            image: row.image_url || null,
            authorName: row.author_name, authorAvatar: row.author_avatar || '',
            timestamp: row.created_at ? new Date(row.created_at).toISOString() : '',
            createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
            comments: row.comments || [], isPublic: row.is_public || false,
            archived: row.archived || false,
            liked: !!(userLikesRef.current[row.id]),
            bookmarked: !!(userBookmarksRef.current[row.id]),
            _userId: row.user_id,
          }, ...prev]);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  // ── Realtime: notifications ──
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-realtime-${userId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          setNotifications(prev => {
            if (prev.find(n => n.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  // ── Realtime: comments ──
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('comments-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments' }, (payload) => {
        const r = payload.new;
        // Skip own inserts — already handled optimistically
        if (r.author_user_id === userIdRef.current) return;
        const incoming = {
          id: r.id, text: r.text,
          author: r.author, authorAvatar: r.author_avatar || '',
          authorUserId: r.author_user_id,
          timestamp: new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          replyTo: r.reply_to || null,
          replyToAuthor: r.reply_to_author || null,
        };
        setItems(prev => prev.map(item => {
          if (item.id !== r.post_id) return item;
          if (item.comments?.find(c => c.id === r.id)) return item; // dedupe
          return { ...item, comments: [...(item.comments || []), incoming] };
        }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'comments' }, (payload) => {
        const { id, post_id } = payload.old;
        setItems(prev => prev.map(item =>
          item.id === post_id
            ? { ...item, comments: (item.comments || []).filter(c => c.id !== id && c.replyTo !== id) }
            : item
        ));
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId]);

  // ── Fetch helpers ──
  const fetchNotifications = async (uid) => {
    try {
      const { data } = await supabase
        .from('notifications').select('*').eq('recipient_id', uid)
        .order('created_at', { ascending: false }).limit(50);
      if (data) setNotifications(data);
    } catch (err) { console.error('fetchNotifications error:', err); }
  };

  const fetchInteractions = async (uid) => {
    try {
      const { data } = await supabase
        .from('user_interactions').select('post_id, type').eq('user_id', uid);
      if (data) {
        const likes = {}, bookmarks = {};
        data.forEach(r => {
          if (r.type === 'like') likes[r.post_id] = true;
          if (r.type === 'bookmark') bookmarks[r.post_id] = true;
        });
        setUserLikes(likes);
        setUserBookmarks(bookmarks);
        userLikesRef.current = likes;
        userBookmarksRef.current = bookmarks;
      }
    } catch (err) { console.error('fetchInteractions error:', err); }
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
      const likes = userLikesRef.current;
      const bookmarks = userBookmarksRef.current;
      setItems(deduped.map(row => ({
        id: row.id, text: row.text, category: row.category,
        image: row.image_url || null,
        authorName: row.author_name, authorAvatar: row.author_avatar || '',
        timestamp: row.created_at || '',
        createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
        comments: row.comments || [], isPublic: row.is_public || false,
        archived: row.archived || false,
        liked: !!(likes[row.id]),
        bookmarked: !!(bookmarks[row.id]),
        _userId: row.user_id,
      })));
    } catch (err) { console.error('fetchPosts error:', err); }
    finally { setItemsLoading(false); }
  };

  const rowToItemPartial = (row) => ({
    text: row.text, category: row.category, image: row.image_url || null,
    authorName: row.author_name, authorAvatar: row.author_avatar || '',
    comments: row.comments || [], isPublic: row.is_public || false,
    archived: row.archived || false,
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
      await fetchInteractions(authUser.id);
      fetchPosts(authUser.id);
      fetchNotifications(authUser.id);
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null); setUserId(null); setItems([]);
    setUserLikes({}); setUserBookmarks({});
    localStorage.removeItem('sortsweet-user');
    setActivePostId(null); setLeftNavOpen(false);
  };

  // ── Push notification ──
  const pushNotification = async (recipientId, type, actorName, postId, postTitle) => {
    if (!recipientId || recipientId === userIdRef.current) return;
    const { error } = await supabase.from('notifications').insert({
      recipient_id: recipientId, actor_name: actorName,
      type, post_id: postId, post_title: postTitle,
      read: false, created_at: new Date().toISOString(),
    });
    if (error) console.error('pushNotification error:', error.message);
  };

  // ── CRUD ──
  const handleAddItem = async (content, category, imageUrl) => {
    const currentName = user?.nickname || user?.username || 'Anonymous';
    const uid = userIdRef.current;
    const newItem = {
      id: crypto.randomUUID(), text: content, category,
      image: imageUrl || null, authorName: currentName,
      authorAvatar: user?.avatar || '',
      timestamp: new Date().toISOString(),
      createdAt: Date.now(), comments: [], isPublic: false,
      archived: false, _userId: uid,
    };
    setItems(prev => [newItem, ...prev]);
    setShowCreatePanel(false);
    if (activeDraft) { setDrafts(prev => prev.filter(d => d.id !== activeDraft.id)); setActiveDraft(null); }
    try {
      const { error } = await supabase.from('posts').insert({
        id: newItem.id, user_id: uid, text: newItem.text, category: newItem.category,
        image_url: newItem.image, author_name: newItem.authorName,
        author_avatar: newItem.authorAvatar, comments: [], is_public: false,
      });
      if (error) throw error;
    } catch (err) {
      console.error('insert error:', err);
      setItems(prev => prev.filter(i => i.id !== newItem.id));
      alert('Failed to save post: ' + err.message);
    }
  };

  const handleUpdateItem = async (id, updatedFields) => {
    // Bookmarks: Supabase user_interactions table
    if ('bookmarked' in updatedFields) {
      const newVal = updatedFields.bookmarked;
      setUserBookmarks(prev => {
        const next = { ...prev };
        if (newVal) next[id] = true; else delete next[id];
        return next;
      });
      try {
        if (newVal) {
          await supabase.from('user_interactions').upsert(
            { user_id: userIdRef.current, post_id: id, type: 'bookmark' },
            { onConflict: 'user_id,post_id,type' }
          );
        } else {
          await supabase.from('user_interactions')
            .delete().eq('user_id', userIdRef.current).eq('post_id', id).eq('type', 'bookmark');
        }
      } catch (err) { console.error('bookmark error:', err); }
    }

    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updatedFields } : item));

    try {
      const dbFields = {};
      if ('text' in updatedFields) dbFields.text = updatedFields.text;
      if ('category' in updatedFields) dbFields.category = updatedFields.category;
      if ('isPublic' in updatedFields) dbFields.is_public = updatedFields.isPublic;
      if ('archived' in updatedFields) dbFields.archived = updatedFields.archived;
      // comments updated separately via handleAddComment/handleDeleteComment
      if (Object.keys(dbFields).length === 0) return;
      const { error } = await supabase.from('posts').update(dbFields).eq('id', id).eq('user_id', userIdRef.current);
      if (error) throw error;
    } catch (err) { console.error('update error:', err); }
  };

  const handleDeleteItem = async (id) => {
    if (activePostId === id) setActivePostId(null);
    setItems(prev => prev.filter(item => item.id !== id));
    try {
      const { error } = await supabase.from('posts').delete().eq('id', id).eq('user_id', userIdRef.current);
      if (error) throw error;
    } catch (err) { console.error('delete error:', err); }
  };

  const handleMoveItem = (id, newCategory) => handleUpdateItem(id, { category: newCategory });

  // ── Comments — now use the dedicated comments table ──
  const fetchComments = useCallback(async (postId) => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });
      if (error) { console.error('fetchComments error:', error); return; }
      const mapped = (data || []).map(r => ({
        id: r.id,
        text: r.text,
        author: r.author,
        authorAvatar: r.author_avatar || '',
        authorUserId: r.author_user_id,
        timestamp: new Date(r.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        replyTo: r.reply_to || null,
        replyToAuthor: r.reply_to_author || null,
      }));
      setItems(prev => prev.map(item => item.id === postId ? { ...item, comments: mapped } : item));
    } catch (err) { console.error('fetchComments error:', err); }
  }, []);

  const handleSelectPost = useCallback((postId) => {
    setActivePostId(postId);
    if (postId) fetchComments(postId);
  }, [fetchComments]);

  const handleAddComment = async (postId, commentText, authorName, authorAvatar, replyToId = null) => {
    const post = items.find(i => i.id === postId);
    if (!post) return;
    const parentComment = replyToId ? (post.comments || []).find(c => c.id === replyToId) : null;

    // Optimistic update
    const tempId = crypto.randomUUID();
    const optimistic = {
      id: tempId, text: commentText,
      author: authorName, authorAvatar: authorAvatar || '',
      authorUserId: userIdRef.current,
      timestamp: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      replyTo: replyToId || null,
      replyToAuthor: parentComment?.author || null,
    };
    setItems(prev => prev.map(item =>
      item.id === postId ? { ...item, comments: [...(item.comments || []), optimistic] } : item
    ));

    try {
      const { data, error } = await supabase.from('comments').insert({
        post_id: postId,
        author: authorName,
        author_avatar: authorAvatar || '',
        author_user_id: userIdRef.current,
        text: commentText,
        reply_to: replyToId || null,
        reply_to_author: parentComment?.author || null,
      }).select().single();
      if (error) throw error;

      // Replace temp with real DB row
      setItems(prev => prev.map(item => {
        if (item.id !== postId) return item;
        return {
          ...item,
          comments: item.comments.map(c => c.id === tempId ? {
            ...optimistic,
            id: data.id,
            timestamp: new Date(data.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          } : c),
        };
      }));

      const el = document.createElement('div'); el.innerHTML = post.text || '';
      const postTitle = el.querySelector('.post-compiled-title')?.textContent?.trim() || 'a post';
      if (post._userId && post._userId !== userIdRef.current) {
        await pushNotification(post._userId, replyToId ? 'reply' : 'comment', authorName, postId, postTitle);
      }
      if (replyToId && parentComment?.authorUserId && parentComment.authorUserId !== userIdRef.current && parentComment.authorUserId !== post._userId) {
        await pushNotification(parentComment.authorUserId, 'reply', authorName, postId, postTitle);
      }
    } catch (err) {
      console.error('comment error:', err);
      // Roll back optimistic update on failure
      setItems(prev => prev.map(item =>
        item.id === postId ? { ...item, comments: (item.comments || []).filter(c => c.id !== tempId) } : item
      ));
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    const uid = userIdRef.current;
    const post = items.find(i => i.id === postId);
    const comment = post?.comments?.find(c => c.id === commentId);
    if (!comment) return;

    const isCommentAuthor = comment.authorUserId === uid;
    const isPostOwner = post?._userId === uid;
    if (!isCommentAuthor && !isPostOwner) return; // guard: only author or post owner may delete

    // Optimistic: remove comment and its replies
    setItems(prev => prev.map(item =>
      item.id === postId
        ? { ...item, comments: (item.comments || []).filter(c => c.id !== commentId && c.replyTo !== commentId) }
        : item
    ));
    try {
      // Build query: comment author deletes their own; post owner can moderate any comment on their post
      let query = supabase.from('comments').delete().eq('id', commentId);
      if (isCommentAuthor) {
        query = query.eq('author_user_id', uid);
      } else {
        // Post owner moderating — verify the comment belongs to this post
        query = query.eq('post_id', postId);
      }
      const { error } = await query;
      if (error) throw error;
    } catch (err) {
      console.error('deleteComment error:', err);
      fetchComments(postId); // restore correct state on failure
    }
  };

  // ── Like — Supabase user_interactions ──
  const handleLikeItem = async (id) => {
    const post = items.find(i => i.id === id);
    if (!post) return;
    const newLiked = !userLikes[id];
    setUserLikes(prev => { const next = { ...prev }; if (newLiked) next[id] = true; else delete next[id]; return next; });
    setItems(prev => prev.map(item => item.id === id ? { ...item, liked: newLiked } : item));
    try {
      if (newLiked) {
        await supabase.from('user_interactions').upsert(
          { user_id: userIdRef.current, post_id: id, type: 'like' },
          { onConflict: 'user_id,post_id,type' }
        );
        if (post._userId && post._userId !== userIdRef.current) {
          const el = document.createElement('div'); el.innerHTML = post.text || '';
          const postTitle = el.querySelector('.post-compiled-title')?.textContent?.trim() || 'a post';
          await pushNotification(post._userId, 'like', user?.nickname || user?.username || 'Someone', id, postTitle);
        }
      } else {
        await supabase.from('user_interactions')
          .delete().eq('user_id', userIdRef.current).eq('post_id', id).eq('type', 'like');
      }
    } catch (err) { console.error('like error:', err); }
  };

  const markNotificationsRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await supabase.from('notifications').update({ read: true }).eq('recipient_id', userIdRef.current).eq('read', false);
    } catch (e) { /* silent */ }
  };

  const handleSaveDraft = (draftObject) => {
    setDrafts(prev => {
      const exists = prev.find(d => d.id === draftObject.id);
      return exists ? prev.map(d => d.id === draftObject.id ? draftObject : d) : [draftObject, ...prev];
    });
    setShowCreatePanel(false);
  };

  const handleLoadDraft = (draft) => { setActiveDraft(draft); setLeftNavOpen(false); setShowCreatePanel(true); };
  const handleDeleteDraft = (draftId) => {
    setDrafts(prev => prev.filter(d => d.id !== draftId));
    if (activeDraft?.id === draftId) setActiveDraft(null);
  };

  const handleUpdateUserProfile = async (updatedUserObj) => {
    setUser(updatedUserObj);
    localStorage.setItem('sortsweet-user', JSON.stringify(updatedUserObj));

    const newName = updatedUserObj.nickname || updatedUserObj.username || '';
    const newAvatar = updatedUserObj.avatar || updatedUserObj.avatarUrl || '';

    // Update in-memory posts so the feed reflects the new name/avatar immediately
    setItems(prev => prev.map(item =>
      item._userId === updatedUserObj.id
        ? { ...item, authorName: newName, authorAvatar: newAvatar }
        : item
    ));

    // Persist the new author_name / author_avatar on all the user's posts in DB
    try {
      const uid = userIdRef.current;
      if (uid) {
        await supabase
          .from('posts')
          .update({ author_name: newName, author_avatar: newAvatar })
          .eq('user_id', uid);
      }
    } catch (err) {
      console.error('Failed to update post author info:', err);
    }
  };

  const displayedItems = useMemo(() => {
    let result = items
      .filter(i => !i.archived)
      .map(i => ({ ...i, liked: !!(userLikes[i.id]), bookmarked: !!(userBookmarks[i.id]) }));
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
    else if (sortBy === 'comments') result.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    return result;
  }, [items, searchQuery, filterCategory, sortBy, userLikes, userBookmarks]);

  if (!user) return <AuthPage onAuthSuccess={(u) => { if (u?.id) { setUserId(u.id); fetchOrCreateProfile(u); } }} />;

  const activePost = items.find(item => item.id === activePostId);
  const unreadCount = notifications.filter(n => !n.read).length;
  const displayName = user?.nickname || user?.username || 'User';

  // Which modal to show inside left nav
  const navBookmarkedItems = items.filter(i => userBookmarks[i.id] && !i.archived).map(i => ({ ...i, bookmarked: true }));
  const navArchivedItems = items.filter(i => i.archived);

  return (
    <div className="app-root-layout">
      {/* ── Left Nav Overlay backdrop ── */}
      {leftNavOpen && <div className="left-nav-backdrop" onClick={() => setLeftNavOpen(false)} />}

      {/* ── Left Navigation Panel ── */}
      <nav className={`left-nav-panel ${leftNavOpen ? 'open' : ''}`} ref={leftNavRef}>
        {/* User identity */}
        <div className="left-nav-user-row">
          <div className="left-nav-avatar">
            {user?.avatar
              ? <img src={user.avatar} alt={displayName} />
              : <span>{displayName.charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className="left-nav-user-info">
            <div className="left-nav-display-name">{displayName}</div>
            <div className="left-nav-handle">@{user?.username}</div>
          </div>
        </div>

        <div className="left-nav-divider" />

        {/* Nav items */}
        <button className={`left-nav-item ${leftNavView === 'notifications' ? 'active' : ''}`}
          onClick={() => { setLeftNavView(v => v === 'notifications' ? null : 'notifications'); markNotificationsRead(); }}>
          <span className="left-nav-icon">🔔</span>
          <span>Notifications</span>
          {unreadCount > 0 && <span className="left-nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>

        <button className={`left-nav-item ${leftNavView === 'drafts' ? 'active' : ''}`}
          onClick={() => setLeftNavView(v => v === 'drafts' ? null : 'drafts')}>
          <span className="left-nav-icon">📋</span>
          <span>Drafts</span>
          {drafts.length > 0 && <span className="left-nav-count">{drafts.length}</span>}
        </button>

        <button className={`left-nav-item ${leftNavView === 'bookmarks' ? 'active' : ''}`}
          onClick={() => setLeftNavView(v => v === 'bookmarks' ? null : 'bookmarks')}>
          <span className="left-nav-icon">★</span>
          <span>Bookmarks</span>
        </button>

        <button className={`left-nav-item ${leftNavView === 'archive' ? 'active' : ''}`}
          onClick={() => setLeftNavView(v => v === 'archive' ? null : 'archive')}>
          <span className="left-nav-icon">▼</span>
          <span>Archive</span>
        </button>

        <button className={`left-nav-item ${showSettingsModal ? 'active' : ''}`}
          onClick={() => setShowSettingsModal(true)}>
          <span className="left-nav-icon">⚙️</span>
          <span>Settings</span>
        </button>

        <div className="left-nav-divider" />

        <button className="left-nav-item left-nav-logout" onClick={handleLogout}>
          <span className="left-nav-icon">↩</span>
          <span>Log out</span>
        </button>

        {/* ── Inline panel content ── */}
        {leftNavView === 'notifications' && (
          <div className="left-nav-inline-panel">
            <div className="left-nav-inline-header">
              Notifications
              {notifications.length > 0 && (
                <button className="left-nav-inline-action" onClick={async () => {
                  setNotifications([]);
                  await supabase.from('notifications').delete().eq('recipient_id', userId);
                }}>Clear all</button>
              )}
            </div>
            {notifications.length === 0
              ? <p className="left-nav-inline-empty">No notifications yet</p>
              : notifications.map(n => (
                <div key={n.id} className={`left-nav-notif-item ${n.read ? '' : 'unread'}`}
                  onClick={() => { if (n.post_id) { handleSelectPost(n.post_id); setLeftNavOpen(false); } }}>
                  <span className="notif-icon">{n.type === 'like' ? '♡' : n.type === 'reply' ? '↩' : '💬'}</span>
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

        {leftNavView === 'drafts' && (
          <div className="left-nav-inline-panel">
            <div className="left-nav-inline-header">Drafts ({drafts.length})</div>
            {drafts.length === 0
              ? <p className="left-nav-inline-empty">No saved drafts</p>
              : drafts.map(draft => (
                <div key={draft.id} className="left-nav-draft-item">
                  <div className="left-nav-draft-info" onClick={() => handleLoadDraft(draft)}>
                    <div className="left-nav-draft-title">{draft.title || '(Untitled)'}</div>
                    <div className="left-nav-draft-time">Saved {draft.savedAt}</div>
                  </div>
                  <button className="left-nav-draft-delete" onClick={() => handleDeleteDraft(draft.id)}>✕</button>
                </div>
              ))
            }
          </div>
        )}

        {leftNavView === 'bookmarks' && (
          <div className="left-nav-inline-panel">
            <div className="left-nav-inline-header">Bookmarks</div>
            {navBookmarkedItems.length === 0
              ? <p className="left-nav-inline-empty">No bookmarks yet. Star a post ☆ to save it.</p>
              : navBookmarkedItems.map(item => {
                const el = document.createElement('div'); el.innerHTML = item.text || '';
                const title = el.querySelector('.post-compiled-title')?.textContent?.trim() || 'Untitled Entry';
                return (
                  <div key={item.id} className="left-nav-list-item" onClick={() => { handleSelectPost(item.id); setLeftNavOpen(false); }}>
                    {item.image && <img src={item.image} className="left-nav-list-thumb" alt="" />}
                    <div className="left-nav-list-text">
                      <div className="left-nav-list-title">{title}</div>
                      <div className="left-nav-list-meta">{item.authorName} · {new Date(item.timestamp).toLocaleDateString()}</div>
                    </div>
                    <button className="left-nav-list-action" title="Remove" onClick={e => { e.stopPropagation(); handleUpdateItem(item.id, { bookmarked: false }); }}>★</button>
                  </div>
                );
              })
            }
          </div>
        )}

        {leftNavView === 'archive' && (
          <div className="left-nav-inline-panel">
            <div className="left-nav-inline-header">Archive</div>
            {navArchivedItems.length === 0
              ? <p className="left-nav-inline-empty">Nothing archived yet</p>
              : navArchivedItems.map(item => {
                const el = document.createElement('div'); el.innerHTML = item.text || '';
                const title = el.querySelector('.post-compiled-title')?.textContent?.trim() || 'Untitled';
                return (
                  <div key={item.id} className="left-nav-list-item" onClick={() => { handleSelectPost(item.id); setLeftNavOpen(false); }}>
                    <div className="left-nav-list-text">
                      <div className="left-nav-list-title">{title}</div>
                      <div className="left-nav-list-meta">{item.authorName}</div>
                    </div>
                    <div className="left-nav-list-actions" onClick={e => e.stopPropagation()}>
                      <button className="left-nav-restore-btn" onClick={() => handleUpdateItem(item.id, { archived: false })}>▲</button>
                      <button className="left-nav-delete-btn" onClick={() => { if (window.confirm('Delete permanently?')) handleDeleteItem(item.id); }}>✕</button>
                    </div>
                  </div>
                );
              })
            }
          </div>
        )}

      </nav>

      {/* ── Main content ── */}
      <div className="app-main-content">
        <div className="app-container">
          <header className="app-header">
            <div className="header-wrapper-flex">
              <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button id="hamburger-btn" className="hamburger-btn" onClick={() => setLeftNavOpen(v => !v)} title="Menu">
                  <span /><span /><span />
                </button>
                <div>
                  <h1>Sort<span className="highlight">Sweet</span></h1>
                  <p>Welcome back, <span className="highlight">{displayName}</span>!</p>
                </div>
              </div>
              {/* Notification bell stays in header as quick access */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="header-notif-btn" onClick={() => {
                  setLeftNavOpen(true);
                  setLeftNavView('notifications');
                  markNotificationsRead();
                }}>
                  🔔
                  {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
              </div>
            </div>
          </header>

          {!showCreatePanel && (
            <div className="search-create-bar">
              <span className="search-icon-inline">🔍</span>
              <input className="search-bar-input" placeholder="Search posts…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
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
                    onSelectPost={handleSelectPost}
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
                onLikeItem={handleLikeItem}
                currentUser={user}
              />
            )}
          </div>
        </div>
      </div>
      {showSettingsModal && (
        <ProfileDashboard
          user={user}
          onUpdateUser={handleUpdateUserProfile}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}