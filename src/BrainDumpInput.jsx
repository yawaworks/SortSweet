import React, { useState, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import './JournalEditor.css';

export default function BrainDumpInput({ onAddItem, onSaveDraft, activeDraft, onClearActiveDraft, currentUser, onCancel }) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('now');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        allowBase64: true,
      }),
    ],
    content: '',
    placeholder: "What's happening?",
  });

  useEffect(() => {
    if (activeDraft && editor) {
      setTitle(activeDraft.title || '');
      setCategory(activeDraft.category || 'now');
      editor.commands.setContent(activeDraft.bodyHtml || '');
    }
  }, [activeDraft, editor]);

  if (!editor) return null;

    const addImage = () => {
  const input = document.createElement('input');

  input.type = 'file';
  input.accept = 'image/*';

  input.onchange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onloadend = () => {
      editor
        .chain()
        .focus()
        .setImage({
          src: reader.result,
        })
        .run();
    };

    reader.readAsDataURL(file);
  };

  input.click();
};

  const triggerSubmitPost = (e) => {
    e.preventDefault();
    if (!title.trim()) { alert('Please enter a title for your post.'); return; }

    const htmlContent = editor.getHTML();
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const firstImg = doc.querySelector('img');
    const extractedImageUrl = firstImg ? firstImg.getAttribute('src') : null;

    const finalCompiledPayload = `
      <div class="journal-post-compiled">
        <h2 class="post-compiled-title">${title.trim()}</h2>
        <div class="post-compiled-body rich-text-display-pane">${htmlContent}</div>
      </div>
    `;

    if (typeof onAddItem === 'function') {
      onAddItem(finalCompiledPayload, category, extractedImageUrl);
    }
    resetFormState();
  };

  const triggerSaveDraft = () => {
    if (!title.trim() && editor.isEmpty) return;

    onSaveDraft({
      id: activeDraft?.id || crypto.randomUUID(),
      title,
      bodyHtml: editor.getHTML(),
      category,
      savedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    resetFormState();
  };

  const resetFormState = () => {
    setTitle('');
    editor.commands.setContent('');
    setCategory('now');
    onClearActiveDraft();
  };

  const handleCancel = () => {
    resetFormState();
    if (typeof onCancel === 'function') onCancel();
  };

  return (
    <div className="editor-container">
      <form onSubmit={triggerSubmitPost} className="form-layout">
        <div className="main-row">
          <div className="avatar-column">
            <div className="user-avatar" style={currentUser?.avatar || currentUser?.avatarUrl ? { backgroundImage: 'none', padding: 0 } : {}}>
              {(currentUser?.avatar || currentUser?.avatarUrl) && (
                <img src={currentUser.avatar || currentUser.avatarUrl} alt="avatar"
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
              )}
            </div>
          </div>
          
          <div className="editor-column">
            <div className="title-wrapper">
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (required)"
                className="title-field"
                maxLength={150}
                required
              />
              <span className={`title-char-counter ${title.length >= 130 ? 'title-char-warn' : ''}`}>{title.length}/150</span>
            </div>

            <div className="editor-content">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>

        <div className="category-row">
          <span className="tag-label-lead">Tag:</span>
          {['now', 'delegate', 'someday'].map((tag) => (
            <button
              key={tag}
              type="button"
              className={`tag-pill ${category === tag ? 'active-' + tag : ''}`}
              onClick={() => setCategory(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="footer-actions">
          <div className="toolbar">
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              className={editor.isActive('bold') ? 'tool-active' : ''}
              title="Bold"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              className={editor.isActive('italic') ? 'tool-active' : ''}
              title="Italic"
            >
              <i>i</i>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              className={editor.isActive('strike') ? 'tool-active' : ''}
              title="Strikethrough"
            >
              <s>S</s>
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              className={editor.isActive('heading', { level: 2 }) ? 'tool-active' : ''}
              title="Heading 1"
            >
              h1
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              className={editor.isActive('heading', { level: 3 }) ? 'tool-active' : ''}
              title="Heading 2"
            >
              h2
            </button>

            <div className="divider" />

            <button type="button" onClick={addImage} title="Insert Image">
              🖼️
            </button>

            <div className="divider" />

            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              className={editor.isActive('bulletList') ? 'tool-active' : ''}
              title="Bullet List"
            >
              • List
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              className={editor.isActive('orderedList') ? 'tool-active' : ''}
              title="Ordered List"
            >
              1. List
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              className={editor.isActive('blockquote') ? 'tool-active' : ''}
              title="Blockquote"
            >
              “ ”
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              className={editor.isActive('codeBlock') ? 'tool-active' : ''}
              title="Code Block"
            >
              &lt;/&gt;
            </button>
          </div>

          <div className="actions-right">
            <button type="button" className="text-cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            <button type="button" className="draft-save-btn" onClick={triggerSaveDraft}>
              Save Draft
            </button>
            <button type="submit" className="submit-post-btn" disabled={!title.trim()}>
              Post
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}