import { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { Auth } from './components/Auth';
import { SuperAdminDashboard } from './components/SuperAdminDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { UserDashboard } from './components/UserDashboard';
import { Loader2, LogOut, User as UserIcon, Building2, ShieldCheck } from 'lucide-react';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export default function App() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Auth />
        <Toaster />
      </>
    );
  }

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast.success('Berhasil keluar');
    } catch (error) {
      toast.error('Gagal keluar');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {profile?.role !== 'USER' && (
        <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600 text-white shadow-lg shadow-green-200">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">
                Smart<span className="text-green-600">santri</span>
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden flex-col items-end sm:flex">
                <span className="text-sm font-medium text-gray-900">{profile?.name || user.email}</span>
                <span className="text-xs text-gray-500">{profile?.role || 'User'}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-gray-500 hover:text-red-600">
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </nav>
      )}

      <main className={`mx-auto max-w-7xl ${profile?.role === 'USER' ? '' : 'px-4 py-8 sm:px-6 lg:px-8'}`}>
        {profile?.role === 'SUPER_ADMIN' && <SuperAdminDashboard />}
        {profile?.role === 'ADMIN' && <AdminDashboard profile={profile} />}
        {profile?.role === 'USER' && <UserDashboard profile={profile} />}
        
        {!profile && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 rounded-full bg-yellow-100 p-4">
              <UserIcon className="h-12 w-12 text-yellow-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Profil Tidak Ditemukan</h2>
            <p className="mt-2 text-gray-600">Silakan hubungi administrator Anda untuk mengatur akun Anda.</p>
            <Button onClick={handleLogout} className="mt-6">Keluar</Button>
          </div>
        )}
      </main>
      <Toaster position="top-center" />
    </div>
  );
}
