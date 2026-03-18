import { useState } from 'react';
import { supabase, supabaseConfigError } from '../../lib/supabase';

type AuthMode = 'login' | 'signup';

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (supabaseConfigError || !supabase) {
      setError(supabaseConfigError || 'Supabase is not configured.');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          throw signInError;
        }

        setMessage('Signed in successfully.');
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        throw signUpError;
      }

      setMessage('Account created. If email confirmation is enabled, confirm your inbox before logging in.');
      setMode('login');
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Authentication failed.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#d8fff0_0%,_#f4f7f5_45%,_#ffffff_100%)] px-6 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-between gap-12">
        <section className="max-w-xl">
          <p className="mb-4 inline-flex rounded-full border border-[#c9ded6] bg-white/80 px-4 py-2 font-['Satoshi_Variable:Medium',sans-serif] text-sm tracking-[0.18em] text-[#245d4a]">
            VIZTWIN CLOUD
          </p>
          <h1 className="font-['Aeonik_Extended_TRIAL:Medium',sans-serif] text-[clamp(3rem,7vw,6rem)] leading-[0.95] text-[#000001]">
            Scan.
            <br />
            Classify.
            <br />
            Return later.
          </h1>
          <p className="mt-6 max-w-lg font-['Satoshi_Variable:Regular',sans-serif] text-lg leading-8 text-[#4d4d4d]">
            Sign in to keep processed point clouds, BIM outputs, and project history in Supabase instead of browser memory.
          </p>
        </section>

        <section className="w-full max-w-md rounded-[32px] border border-[#d7d7d7] bg-white p-8 shadow-[0_24px_80px_rgba(0,0,0,0.08)]">
          {supabaseConfigError ? (
            <div className="mb-6 rounded-2xl bg-[#fff7e6] px-4 py-4 font-['Satoshi_Variable:Medium',sans-serif] text-sm leading-6 text-[#8a5a00]">
              {supabaseConfigError}
            </div>
          ) : null}

          <div className="mb-8 flex rounded-full bg-[#eef2f0] p-1">
            {(['login', 'signup'] as const).map((entryMode) => (
              <button
                key={entryMode}
                type="button"
                onClick={() => {
                  setMode(entryMode);
                  setError('');
                  setMessage('');
                }}
                className={`flex-1 rounded-full px-4 py-3 font-['Satoshi_Variable:Bold',sans-serif] text-sm tracking-[0.14em] transition-colors ${
                  mode === entryMode
                    ? 'bg-[#91f9d0] text-[#000001]'
                    : 'text-[#5b5b5d]'
                }`}
              >
                {entryMode === 'login' ? 'LOG IN' : 'SIGN UP'}
              </button>
            ))}
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block font-['Satoshi_Variable:Bold',sans-serif] text-sm tracking-[0.14em] text-[#000001]">
                EMAIL
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-[#d7d7d7] px-4 py-4 font-['Satoshi_Variable:Regular',sans-serif] text-base outline-none transition-colors focus:border-[#91f9d0]"
                placeholder="you@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block font-['Satoshi_Variable:Bold',sans-serif] text-sm tracking-[0.14em] text-[#000001]">
                PASSWORD
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[#d7d7d7] px-4 py-4 font-['Satoshi_Variable:Regular',sans-serif] text-base outline-none transition-colors focus:border-[#91f9d0]"
                placeholder="Minimum 6 characters"
              />
            </label>

            {error ? (
              <p className="rounded-2xl bg-[#fff1f1] px-4 py-3 font-['Satoshi_Variable:Medium',sans-serif] text-sm text-[#b42318]">
                {error}
              </p>
            ) : null}

            {message ? (
              <p className="rounded-2xl bg-[#edfdf6] px-4 py-3 font-['Satoshi_Variable:Medium',sans-serif] text-sm text-[#027a48]">
                {message}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#000001] px-5 py-4 font-['Satoshi_Variable:Bold',sans-serif] text-sm tracking-[0.16em] text-white transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'PLEASE WAIT' : mode === 'login' ? 'ENTER VIZTWIN' : 'CREATE ACCOUNT'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
