import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAppAuth } from '@/hooks/useAppAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

interface AuthScreenProps {
  onAuthenticated: () => void;
  registerEnabled: boolean; // true apenas se nenhum usuário existir (backend permitirá)
}

export const AuthScreen = ({ onAuthenticated, registerEnabled }: AuthScreenProps) => {
  const { register, login } = useAppAuth();
  const [tab, setTab] = useState<'login' | 'register'>(registerEnabled ? 'register' : 'login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (tab === 'register') {
        await register({ name: form.name, email: form.email, password: form.password });
        toast.success('Usuário criado e autenticado');
      } else {
        await login({ email: form.email, password: form.password });
        toast.success('Login realizado');
      }
      onAuthenticated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Falha na autenticação';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border border-slate-700 bg-slate-800/70 backdrop-blur">
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold text-slate-100 mb-4 text-center">Acesso à Plataforma</h1>
            <div className="flex mb-6 border-b border-slate-600">
              <button
                className={`flex-1 py-2 text-sm font-medium ${tab === 'login' ? 'text-white border-b-2 border-primary' : 'text-slate-400 hover:text-slate-200'}`}
                onClick={() => setTab('login')}
              >Login</button>
              <button
                className={`flex-1 py-2 text-sm font-medium ${tab === 'register' ? 'text-white border-b-2 border-primary' : 'text-slate-400 hover:text-slate-200'} ${!registerEnabled && 'opacity-40 cursor-not-allowed'}`}
                onClick={() => registerEnabled && setTab('register')}
                disabled={!registerEnabled}
              >Registrar</button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {tab === 'register' && (
                <input
                  name="name"
                  placeholder="Nome"
                  value={form.name}
                  onChange={handleChange}
                  required
                  className="w-full rounded bg-slate-700/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring focus:ring-primary/40"
                />
              )}
              <input
                name="email"
                type="email"
                placeholder="E-mail"
                value={form.email}
                onChange={handleChange}
                required
                className="w-full rounded bg-slate-700/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring focus:ring-primary/40"
              />
              <input
                name="password"
                type="password"
                placeholder="Senha"
                value={form.password}
                onChange={handleChange}
                required
                className="w-full rounded bg-slate-700/60 px-3 py-2 text-sm text-white focus:outline-none focus:ring focus:ring-primary/40"
              />
              {tab === 'register' && (
                <p className="text-xs text-slate-400">Apenas o primeiro registro é permitido aqui. Depois, novos usuários são criados por um ADMIN autenticado.</p>
              )}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Enviando...' : tab === 'register' ? 'Registrar' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
