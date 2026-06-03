import React, { useState, useEffect, useRef } from 'react';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import { supabase } from './supabaseClient';

export default function AuthPage({ onAuthSuccess }) {
  const [view, setView] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  
  const captchaRef = useRef(null);

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('reset-password');
      }
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (view === 'register' && !captchaToken) {
      setError("Please complete the Captcha puzzle first!");
      return;
    }

    setLoading(true);

    try {
      if (view === 'login') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          if (signInError.message === "Invalid login credentials") {
            setError("Account not found or password incorrect. Try registering first!");
          } else {
            setError(signInError.message);
          }
        } else if (data.user) {
          const profileName = data.user.user_metadata?.username || data.user.email.split('@')[0];
          onAuthSuccess({ username: profileName, email: data.user.email });
        }

      } else if (view === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            captchaToken: captchaToken,
            data: { username: email.split('@')[0] }
          }
        });

        if (signUpError) throw signUpError;
        if (data.user) {
          setMessage('Registration successful! Please verify your inbox.');
          setCaptchaToken(null);
          captchaRef.current?.resetCaptcha();
        }

      } else if (view === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });

        if (resetError) throw resetError;
        setMessage('Password reset link sent! Check your email inbox shortly.');

      } else if (view === 'reset-password') {
        const { error: updateError } = await supabase.auth.updateUser({
          password: password
        });

        if (updateError) throw updateError;
        setMessage('Your password has been securely updated! Moving to login panel...');
        setTimeout(() => {
          setView('login');
          setPassword('');
        }, 2500);
      }
    } catch (err) {
      setError(err.message);
      setCaptchaToken(null);
      captchaRef.current?.resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#faf6f5' }}>
      <div className="auth-card" style={{ background: '#ffffff', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 8px 24px rgba(74, 62, 61, 0.05)', width: '100%', maxWidth: '420px', textAlign: 'center' }}>
        
        <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#4a3e3d', marginBottom: '0.5rem' }}>
          Sort<span style={{ color: '#ff9aa2' }}>Sweet</span>
        </h2>
        
        <p style={{ color: '#8c7e7c', fontSize: '0.95rem', marginBottom: '2rem' }}>
          {view === 'login' && "Welcome back! Ready to organize?"}
          {view === 'register' && "Create your private journal base."}
          {view === 'forgot' && "Recover your secret safe credentials."}
          {view === 'reset-password' && "Type your brand new security password."}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', textAlign: 'left' }}>
          
          {view !== 'reset-password' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#8c7e7c', marginBottom: '0.4rem', textTransform: 'uppercase' }}>Email Address</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid #f5ebe6', background: '#fff9f8', outline: 'none', fontSize: '1rem' }}
              />
            </div>
          )}

          {(view === 'login' || view === 'register' || view === 'reset-password') && (
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#8c7e7c', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                {view === 'reset-password' ? "New Password" : "Password"}
              </label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
                style={{ width: '100%', padding: '0.8rem 1rem', borderRadius: '8px', border: '1px solid #f5ebe6', background: '#fff9f8', outline: 'none', fontSize: '1rem' }}
              />
            </div>
          )}

          {view === 'login' && (
            <div style={{ textAlign: 'right', marginTop: '-0.5rem' }}>
              <button type="button" onClick={() => { setView('forgot'); setError(''); setMessage(''); }} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
                Forgot Password?
              </button>
            </div>
          )}

          {view === 'register' && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}>
              <HCaptcha
                ref={captchaRef}
                sitekey="10000000-ffff-ffff-ffff-ffffffffffff" 
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
              />
            </div>
          )}

          {error && <p style={{ color: '#ffb7b2', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{error}</p>}
          {message && <p style={{ color: '#b5e2b9', fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>{message}</p>}

          <button type="submit" disabled={loading} style={{ width: '100%', padding: '1rem', background: '#ff9aa2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem', transition: 'background 0.2s' }}>
            {loading ? 'Processing...' : (
              view === 'login' ? 'Log In' : 
              view === 'register' ? 'Register Account' : 
              view === 'forgot' ? 'Send Recovery Link' : 'Update Password'
            )}
          </button>
        </form>

        <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#8c7e7c' }}>
          {view === 'login' && (
            <>Don't have an account? <button onClick={() => { setView('register'); setError(''); setMessage(''); }} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Register here</button></>
          )}
          {view === 'register' && (
            <>Already initialized? <button onClick={() => { setView('login'); setError(''); setMessage(''); }} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Log In</button></>
          )}
          {view === 'forgot' && (
            <button onClick={() => { setView('login'); setError(''); setMessage(''); }} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Return to Login</button>
          )}
        </div>

      </div>
    </div>
  );
}