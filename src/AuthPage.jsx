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
    const checkSessionAndHash = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        onAuthSuccess(session.user);
        return;
      }

      if (window.location.hash && window.location.hash.includes('access_token=')) {
        const { data, error: hashError } = await supabase.auth.getUser();
        if (!hashError && data?.user) {
          onAuthSuccess(data.user);
        } else if (hashError) {
          setError("Session verification failed: " + hashError.message);
        }
      }
    };

    checkSessionAndHash();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setView('reset-password');
      } else if (event === 'SIGNED_IN' && session) {
        onAuthSuccess(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onAuthSuccess]);

  // Reset captcha whenever switching between views
  const handleViewChange = (newView) => {
    setView(newView);
    setError('');
    setMessage('');
    setCaptchaToken(null);
    if (captchaRef.current) {
      captchaRef.current.resetCaptcha();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    // Crucial Check: Enforce Captcha validation for both logging in AND signing up
    if ((view === 'login' || view === 'register') && !captchaToken) {
      setError("Please complete the Captcha puzzle first!");
      return;
    }

    setLoading(true);

    try {
      if (view === 'login') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: {
            captchaToken, // Passes the token to satisfy Supabase security rules
          }
        });

        if (signInError) {
          if (signInError.message.toLowerCase().includes('email not confirmed')) {
            throw new Error("Your email hasn't been verified yet! Check your spam folder.");
          }
          throw signInError;
        }

        if (data?.user) onAuthSuccess(data.user);

      } else if (view === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            captchaToken,
            emailRedirectTo: window.location.origin, 
          },
        });

        if (signUpError) throw signUpError;
        
        setMessage("Account created! Please check your email inbox to verify.");
        handleViewChange('login');

      } else if (view === 'forgot') {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (resetError) throw resetError;
        setMessage("Recovery link dispatched! Inspect your email inbox.");

      } else if (view === 'reset-password') {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setMessage("Password successfully updated!");
        handleViewChange('login');
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred.");
      // Reset captcha on failure so the user can try again
      if (captchaRef.current) captchaRef.current.resetCaptcha();
      setCaptchaToken(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#faf8f5', fontFamily: 'system-ui' }}>
      <div style={{ background: 'white', padding: '2.5rem', borderRadius: '16px', boxShadow: '0 8px 24px rgba(74,62,61,0.05)', width: '100%', maxWidth: '400px', textAlign: 'center', border: '1px solid #f5ebe6' }}>
        <h2 style={{ color: '#4a3e3d', marginBottom: '0.5rem', fontSize: '1.75rem', fontWeight: 800 }}>
          {view === 'login' ? 'Welcome Back' : 
           view === 'register' ? 'Create Space' : 
           view === 'forgot' ? 'Recover Account' : 'New Password'}
        </h2>
        <p style={{ color: '#8c7e7d', marginBottom: '2rem', fontSize: '0.95rem' }}>
          {view === 'login' ? 'Step into your stream of thought' : 
           view === 'register' ? 'Begin mapping out your day-to-day dump' : 
           view === 'forgot' ? 'Enter your email to receive a reset token' : 'Set a strong password for your profile'}
        </p>

        {error && <div style={{ background: '#fff5f5', color: '#ff8b94', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'left', border: '1px solid #ffe3e3', fontWeight: 500 }}>{error}</div>}
        {message && <div style={{ background: '#eaf5ed', color: '#6d9478', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'left', border: '1px solid #d1ebd9', fontWeight: 500 }}>{message}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {view !== 'reset-password' && (
            <div style={{ textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#4a3e3d', marginBottom: '0.4rem' }}>Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.85rem', border: '1px solid #f5ebe6', borderRadius: '8px', background: '#faf8f5', color: '#4a3e3d', outline: 'none', fontSize: '1rem' }} placeholder="you@example.com" />
            </div>
          )}

          {view !== 'forgot' && (
            <div style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4a3e3d' }}>Password</label>
                {view === 'login' && (
                  <button type="button" onClick={() => handleViewChange('forgot')} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Forgot?</button>
                )}
              </div>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.85rem', border: '1px solid #f5ebe6', borderRadius: '8px', background: '#faf8f5', color: '#4a3e3d', outline: 'none', fontSize: '1rem' }} placeholder="••••••••" />
            </div>
          )}

          {/* Renders the checkbox puzzle box for BOTH log in and sign up loops */}
          {(view === 'register' || view === 'login') && (
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}>
              <HCaptcha
                sitekey="25e6eb70-ad04-4aca-89de-71a0630ea790"
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken(null)}
                ref={captchaRef}
              />
            </div>
          )}

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
            <>Don't have an account? <button onClick={() => handleViewChange('register')} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Register here</button></>
          )}
          {view === 'register' && (
            <>Already initialized? <button onClick={() => handleViewChange('login')} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Log In</button></>
          )}
          {view === 'forgot' && (
            <button onClick={() => handleViewChange('login')} style={{ background: 'none', border: 'none', color: '#ff9aa2', fontWeight: 700, cursor: 'pointer', padding: 0 }}>Back to Log In</button>
          )}
        </div>
      </div>
    </div>
  );
}