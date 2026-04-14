import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Tenant } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Building2, Users, Activity, Trash2, Edit2, MapPin, ShieldCheck, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { createAuthUser } from '../lib/authUtils';
import { setDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/errorUtils';

export function SuperAdminDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditTenantOpen, setIsEditTenantOpen] = useState(false);
  const [isManageAdminOpen, setIsManageAdminOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const [newAdmin, setNewAdmin] = useState({
    name: '',
    email: '',
    password: ''
  });

  const [superAdminProfile, setSuperAdminProfile] = useState({
    username: '',
    password: ''
  });

  const [newTenant, setNewTenant] = useState({
    name: '',
    lat: 0,
    lng: 0,
    radius: 100,
    status: 'active' as const,
    subscription_plan: 'Pro',
    check_in_time: '07:00',
    check_out_time: '16:00'
  });

  useEffect(() => {
    const q = query(collection(db, 'tenants'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tenant));
      setTenants(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tenants');
    });
    return () => unsubscribe();
  }, []);

  const handleAddTenant = async () => {
    if (!newTenant.name || !newTenant.lat || !newTenant.lng) {
      toast.error('Harap isi semua kolom yang wajib diisi');
      return;
    }
    try {
      await addDoc(collection(db, 'tenants'), {
        ...newTenant,
        createdAt: serverTimestamp()
      });
      setIsAddOpen(false);
      setNewTenant({ name: '', lat: 0, lng: 0, radius: 100, status: 'active', subscription_plan: 'Pro', check_in_time: '07:00', check_out_time: '16:00' });
      toast.success('Tenant berhasil dibuat');
    } catch (error) {
      toast.error('Gagal membuat tenant');
    }
  };

  const handleEditTenant = async () => {
    if (!editingTenant || !editingTenant.name || !editingTenant.lat || !editingTenant.lng) {
      toast.error('Harap isi semua kolom yang wajib diisi');
      return;
    }
    try {
      await updateDoc(doc(db, 'tenants', editingTenant.id), {
        name: editingTenant.name,
        lat: editingTenant.lat,
        lng: editingTenant.lng,
        radius: editingTenant.radius
      });
      setIsEditTenantOpen(false);
      setEditingTenant(null);
      toast.success('Tenant berhasil diperbarui');
    } catch (error) {
      toast.error('Gagal memperbarui tenant');
    }
  };

  const toggleStatus = async (tenant: Tenant) => {
    try {
      await updateDoc(doc(db, 'tenants', tenant.id), {
        status: tenant.status === 'active' ? 'inactive' : 'active'
      });
      toast.success('Status tenant diperbarui');
    } catch (error) {
      toast.error('Gagal memperbarui status');
    }
  };

  const deleteTenant = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus tenant ini?')) return;
    try {
      await deleteDoc(doc(db, 'tenants', id));
      toast.success('Tenant dihapus');
    } catch (error) {
      toast.error('Gagal menghapus tenant');
    }
  };

  const handleCreateAdmin = async () => {
    if (!selectedTenant || !newAdmin.name || !newAdmin.email || !newAdmin.password) {
      toast.error('Harap isi semua kolom');
      return;
    }
    if (newAdmin.password.length < 6) {
      toast.error('Kata sandi minimal 6 karakter');
      return;
    }

    setIsSubmitting(true);
    try {
      const adminEmail = newAdmin.email.includes('@') ? newAdmin.email : `${newAdmin.email}@attendance.local`;
      
      console.log("Creating Admin for Tenant:", {
        id: selectedTenant.id,
        name: selectedTenant.name,
        newAdminEmail: adminEmail,
        newAdminName: newAdmin.name
      });

      // 1. Create Auth User
      const uid = await createAuthUser(adminEmail, newAdmin.password);
      console.log("Auth User Created with UID:", uid);

      // 2. Create Firestore Profile
      const profileData = {
        name: newAdmin.name,
        email: adminEmail,
        role: 'ADMIN',
        tenant_id: selectedTenant.id,
        createdAt: serverTimestamp()
      };
      console.log("Saving Firestore Profile:", profileData);
      
      await setDoc(doc(db, 'users', uid), profileData);
      console.log("Firestore Profile Saved Successfully");

      setIsManageAdminOpen(false);
      setNewAdmin({ name: '', email: '', password: '' });
      toast.success(`Admin untuk ${selectedTenant.name} berhasil dibuat`);
    } catch (error: any) {
      console.error(error);
      toast.error('Gagal membuat admin: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetupSuperAdminLogin = async () => {
    if (!superAdminProfile.username || !superAdminProfile.password) {
      toast.error('Harap isi username dan kata sandi');
      return;
    }
    if (superAdminProfile.password.length < 6) {
      toast.error('Kata sandi minimal 6 karakter');
      return;
    }

    setIsSubmitting(true);
    try {
      const email = `${superAdminProfile.username}@attendance.local`;
      let uid: string;
      
      try {
        // Try creating new user
        uid = await createAuthUser(email, superAdminProfile.password);
      } catch (error: any) {
        // If user already exists, we might need a different approach to update password
        // but for now, let's assume we are setting it up for the first time or using a new username
        if (error.code === 'auth/email-already-in-use') {
          throw new Error('Username sudah digunakan. Silakan pilih username lain.');
        }
        throw error;
      }

      // Update or Create the Firestore profile for this UID as SUPER_ADMIN
      await setDoc(doc(db, 'users', uid), {
        name: 'Super Admin',
        email: 'iruelpraker@gmail.com', // Keep original email for identification in rules
        username: superAdminProfile.username,
        role: 'SUPER_ADMIN',
        tenant_id: 'system',
        createdAt: serverTimestamp()
      });

      setIsProfileOpen(false);
      setSuperAdminProfile({ username: '', password: '' });
      toast.success('Login username/password Super Admin berhasil dikonfigurasi');
    } catch (error: any) {
      console.error(error);
      toast.error('Gagal mengonfigurasi login: ' + (error.message || 'Error tidak diketahui'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ringkasan Global</h1>
          <p className="text-gray-500">Kelola semua organisasi dan kesehatan sistem</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Tenant Baru
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buat Tenant Baru</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nama Organisasi</Label>
                <Input id="name" value={newTenant.name} onChange={e => setNewTenant({...newTenant, name: e.target.value})} placeholder="e.g. Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="lat">Garis Lintang (Latitude)</Label>
                  <Input id="lat" type="number" value={newTenant.lat} onChange={e => setNewTenant({...newTenant, lat: parseFloat(e.target.value)})} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lng">Garis Bujur (Longitude)</Label>
                  <Input id="lng" type="number" value={newTenant.lng} onChange={e => setNewTenant({...newTenant, lng: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="radius">Radius (meter)</Label>
                <Input id="radius" type="number" value={newTenant.radius} onChange={e => setNewTenant({...newTenant, radius: parseInt(e.target.value)})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Batal</Button>
              <Button onClick={handleAddTenant} className="bg-green-600 hover:bg-green-700">Buat Tenant</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button variant="outline" onClick={() => setIsProfileOpen(true)}>
          <ShieldCheck className="mr-2 h-4 w-4 text-green-600" /> Profil Super Admin
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Tenant</CardTitle>
            <Building2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{tenants.length}</div>
            <p className="text-xs text-gray-500">Di semua wilayah</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Pengguna Aktif</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,284</div>
            <p className="text-xs text-gray-500">+12% dari bulan lalu</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Log Global</CardTitle>
            <Activity className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">42,891</div>
            <p className="text-xs text-gray-500">Total absensi tercatat</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle>Direktori Organisasi</CardTitle>
          <CardDescription>Kelola status langganan dan pengaturan geofence</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisasi</TableHead>
                <TableHead>Lokasi</TableHead>
                <TableHead>Radius</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paket</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPin className="h-3 w-3" />
                      {tenant.lat.toFixed(4)}, {tenant.lng.toFixed(4)}
                    </div>
                  </TableCell>
                  <TableCell>{tenant.radius}m</TableCell>
                  <TableCell>
                    <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'} className={tenant.status === 'active' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                      {tenant.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{tenant.subscription_plan}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          setEditingTenant(tenant);
                          setIsEditTenantOpen(true);
                        }}
                        className="text-orange-600 hover:text-orange-700"
                        title="Edit Organisasi"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          setSelectedTenant(tenant);
                          setNewAdmin({ name: '', email: '', password: '' });
                          setIsManageAdminOpen(true);
                        }}
                        className="text-blue-600 hover:text-blue-700"
                        title="Kelola Admin"
                      >
                        <ShieldCheck className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => toggleStatus(tenant)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteTenant(tenant.id)} className="text-red-500 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                    Tidak ada tenant ditemukan. Buat organisasi pertama Anda untuk memulai.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isEditTenantOpen} onOpenChange={setIsEditTenantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organisasi</DialogTitle>
          </DialogHeader>
          {editingTenant && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nama Organisasi</Label>
                <Input id="edit-name" value={editingTenant.name} onChange={e => setEditingTenant({...editingTenant, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-lat">Garis Lintang (Latitude)</Label>
                  <Input id="edit-lat" type="number" value={editingTenant.lat} onChange={e => setEditingTenant({...editingTenant, lat: parseFloat(e.target.value)})} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-lng">Garis Bujur (Longitude)</Label>
                  <Input id="edit-lng" type="number" value={editingTenant.lng} onChange={e => setEditingTenant({...editingTenant, lng: parseFloat(e.target.value)})} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-radius">Radius (meter)</Label>
                <Input id="edit-radius" type="number" value={editingTenant.radius} onChange={e => setEditingTenant({...editingTenant, radius: parseInt(e.target.value)})} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditTenantOpen(false)}>Batal</Button>
            <Button onClick={handleEditTenant} className="bg-orange-600 hover:bg-orange-700">Simpan Perubahan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isManageAdminOpen} onOpenChange={setIsManageAdminOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat Admin untuk {selectedTenant?.name}</DialogTitle>
            <DialogDescription>
              Admin ini akan memiliki akses penuh untuk mengelola karyawan di {selectedTenant?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="adminName">Nama Lengkap Admin</Label>
              <Input id="adminName" value={newAdmin.name} onChange={e => setNewAdmin({...newAdmin, name: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adminEmail">Email Admin</Label>
              <Input id="adminEmail" type="email" value={newAdmin.email} onChange={e => setNewAdmin({...newAdmin, email: e.target.value})} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="adminPassword">Kata Sandi</Label>
              <div className="relative">
                <Input 
                  id="adminPassword" 
                  type={showPassword ? "text" : "password"} 
                  value={newAdmin.password} 
                  onChange={e => setNewAdmin({...newAdmin, password: e.target.value})} 
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageAdminOpen(false)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={handleCreateAdmin} className="bg-blue-600 hover:bg-blue-700" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Buat Akun Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pengaturan Login Super Admin</DialogTitle>
            <DialogDescription>
              Konfigurasi username dan password agar Anda bisa login tanpa Google.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="superUsername">Username</Label>
              <Input 
                id="superUsername" 
                value={superAdminProfile.username} 
                onChange={e => setSuperAdminProfile({...superAdminProfile, username: e.target.value})} 
                placeholder="e.g. superadmin"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="superPassword">Kata Sandi Baru</Label>
              <div className="relative">
                <Input 
                  id="superPassword" 
                  type={showPassword ? "text" : "password"} 
                  value={superAdminProfile.password} 
                  onChange={e => setSuperAdminProfile({...superAdminProfile, password: e.target.value})} 
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-0 right-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProfileOpen(false)} disabled={isSubmitting}>Batal</Button>
            <Button onClick={handleSetupSuperAdminLogin} className="bg-green-600 hover:bg-green-700" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan Pengaturan Login
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
