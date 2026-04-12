import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { UserProfile, AttendanceRecord, Tenant, Journal, Holiday } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Loader2, MapPin, Camera, CheckCircle2, XCircle, AlertTriangle, Clock, History, BookOpen, Plus, Home, User, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { validateLocation, getFaceDescriptor, loadFaceModels, compareFaces, calculateDistance } from '../lib/attendance';
import { handleFirestoreError, OperationType } from '../lib/errorUtils';

export function UserDashboard({ profile }: { profile: UserProfile }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [lastLog, setLastLog] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [location, setLocation] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [isJournalOpen, setIsJournalOpen] = useState(false);
  const [isProfileCameraOpen, setIsProfileCameraOpen] = useState(false);
  const [newJournal, setNewJournal] = useState({ subject: '', class_name: '', time: '', material: '', description: '' });
  
  const [activeTab, setActiveTab] = useState<'home' | 'journal' | 'history' | 'profile'>('home');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTimeInRange = (startTime?: string, endTime?: string) => {
    if (!startTime || !endTime) return true;
    
    const now = new Date();
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    const start = new Date();
    start.setHours(startH, startM, 0);
    
    const end = new Date();
    end.setHours(endH, endM, 0);
    
    return now >= start && now <= end;
  };

  useEffect(() => {
    if (!profile.tenant_id) return;

    // Fetch Tenant
    const unsubTenant = onSnapshot(doc(db, 'tenants', profile.tenant_id), (docSnap) => {
      if (docSnap.exists()) setTenant({ id: docSnap.id, ...docSnap.data() } as Tenant);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tenants');
    });

    // Fetch Last Log & History
    const q = query(
      collection(db, 'attendance'),
      where('user_id', '==', profile.id),
      orderBy('check_in', 'desc'),
      limit(10)
    );
    const unsubLogs = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setLastLog(logs[0] || null);
      setHistory(logs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    });

    // Fetch Journals for today's attendance
    const unsubJournals = onSnapshot(
      query(collection(db, 'journals'), where('user_id', '==', profile.id), orderBy('createdAt', 'desc'), limit(20)),
      (snapshot) => {
        setJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Journal)));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'journals');
      }
    );

    // Fetch Holidays
    const unsubHolidays = onSnapshot(
      query(collection(db, 'holidays'), where('tenant_id', '==', profile.tenant_id)),
      (snapshot) => {
        const allHolidays = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Holiday));
        // Filter to only show global holidays or holidays specific to this user
        setHolidays(allHolidays.filter(h => !h.user_id || h.user_id === profile.id));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'holidays');
      }
    );

    // Watch Location
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => toast.error('Akses lokasi ditolak'),
      { enableHighAccuracy: true }
    );

    return () => {
      unsubTenant();
      unsubLogs();
      unsubJournals();
      unsubHolidays();
      navigator.geolocation.clearWatch(watchId);
    };
  }, [profile.tenant_id, profile.id]);

  const handleCheckIn = async () => {
    if (!location || !tenant) {
      toast.error('Data lokasi tidak tersedia');
      return;
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay();
    
    const todayHoliday = holidays.find(h => 
      (h.date === todayStr || h.day === dayOfWeek) && 
      (!h.user_id || h.user_id === profile.id)
    );
    const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);

    if (todayHoliday) {
      toast.error(`Hari ini adalah hari libur: ${todayHoliday.name}`);
      return;
    }

    if (isWeeklyOff) {
      toast.error('Hari ini adalah libur mingguan.');
      return;
    }

    if (!isTimeInRange(tenant.check_in_time, tenant.check_in_end_time)) {
      toast.error(`Check-in hanya tersedia antara jam ${tenant.check_in_time} - ${tenant.check_in_end_time}`);
      return;
    }

    setIsCameraOpen(true);
    await loadFaceModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      toast.error('Akses kamera diperlukan untuk verifikasi wajah');
      setIsCameraOpen(false);
    }
  };

  const handleStartFaceRegistration = async () => {
    setIsRegisteringFace(true);
    await loadFaceModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      toast.error('Akses kamera diperlukan untuk mendaftarkan wajah');
      setIsRegisteringFace(false);
    }
  };

  const processFaceRegistration = async () => {
    if (!videoRef.current) return;
    setIsProcessing(true);
    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (!descriptor) {
        toast.error('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas.');
        return;
      }
      
      // Capture image
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      }
      const imageUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      await updateDoc(doc(db, 'users', profile.id), {
        face_descriptor: Array.from(descriptor),
        face_image_url: imageUrl
      });
      
      toast.success('Wajah berhasil didaftarkan!');
      setIsRegisteringFace(false);
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      toast.error('Gagal mendaftarkan wajah.');
    } finally {
      setIsProcessing(false);
    }
  };

  const processCheckIn = async () => {
    if (!videoRef.current || !location || !tenant) return;
    setIsProcessing(true);

    try {
      // 1. Validate Location
      const locStatus = await validateLocation(
        location.lat, 
        location.lng, 
        location.accuracy, 
        tenant.lat, 
        tenant.lng, 
        tenant.radius
      );

      // 2. Face Recognition
      const descriptor = await getFaceDescriptor(videoRef.current);
      let faceMatch = false;
      if (descriptor && profile.face_descriptor) {
        faceMatch = compareFaces(Array.from(descriptor), profile.face_descriptor);
      } else if (!profile.face_descriptor) {
        toast.warning('Wajah belum didaftarkan. Melewati pemeriksaan biometrik.');
        faceMatch = true; // Allow if not registered (admin should register later)
      }

      // 3. Determine Status
      let status: 'valid' | 'rejected' | 'suspicious' = 'valid';
      let reason = '';

      if (!locStatus.isValid) {
        status = 'rejected';
        reason = locStatus.reason || 'Validasi lokasi gagal';
      } else if (locStatus.isSuspicious || !faceMatch) {
        status = 'suspicious';
        reason = !faceMatch ? 'Wajah tidak cocok' : locStatus.reason || 'Aktivitas mencurigakan';
      }

      // 4. Save Record
      await addDoc(collection(db, 'attendance'), {
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        check_in: serverTimestamp(),
        lat: location.lat,
        lng: location.lng,
        status,
        rejection_reason: reason
      });

      if (status === 'valid') toast.success('Check-in berhasil!');
      else if (status === 'suspicious') toast.warning('Check-in ditandai: ' + reason);
      else toast.error('Check-in ditolak: ' + reason);

      setIsCameraOpen(false);
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      toast.error('Check-in gagal. Silakan coba lagi.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckOut = async () => {
    if (!lastLog || lastLog.check_out) return;
    
    if (tenant && !isTimeInRange(tenant.check_out_time, tenant.check_out_end_time)) {
      toast.error(`Check-out hanya tersedia antara jam ${tenant.check_out_time} - ${tenant.check_out_end_time}`);
      return;
    }
    
    // Check if journal is submitted for this attendance
    const hasJournal = journals.some(j => j.attendance_id === lastLog.id);
    if (!hasJournal) {
      toast.error('Anda harus mengirimkan jurnal mengajar sebelum check-out.');
      setIsJournalOpen(true);
      return;
    }

    setIsProcessing(true);
    try {
      await updateDoc(doc(db, 'attendance', lastLog.id), {
        check_out: serverTimestamp()
      });
      toast.success('Check-out berhasil!');
    } catch (error) {
      toast.error('Check-out gagal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddJournal = async () => {
    if (!newJournal.subject || !newJournal.class_name || !newJournal.material) {
      toast.error('Harap isi semua kolom yang wajib diisi');
      return;
    }
    if (!lastLog) return;

    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'journals'), {
        ...newJournal,
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        attendance_id: lastLog.id,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      toast.success('Jurnal berhasil dikirim');
      setIsJournalOpen(false);
      setNewJournal({ subject: '', class_name: '', time: '', material: '', description: '' });
    } catch (error) {
      toast.error('Gagal mengirim jurnal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartProfilePhotoCapture = async () => {
    setIsProfileCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      toast.error('Akses kamera diperlukan untuk mengambil foto');
      setIsProfileCameraOpen(false);
    }
  };

  const processProfilePhotoCapture = async () => {
    if (!videoRef.current) return;
    setIsProcessing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      }
      const imageUrl = canvas.toDataURL('image/jpeg', 0.8);
      
      await updateDoc(doc(db, 'users', profile.id), {
        face_image_url: imageUrl
      });
      
      toast.success('Foto profil berhasil diperbarui!');
      setIsProfileCameraOpen(false);
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      toast.error('Gagal memperbarui foto profil.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error('Harap isi semua kolom kata sandi');
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error('Konfirmasi kata sandi baru tidak cocok');
      return;
    }
    if (passwords.new.length < 6) {
      toast.error('Kata sandi baru minimal 6 karakter');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      // For simplicity in this multi-tenant setup where users might use username/password 
      // stored in Firestore (like Super Admin), we update the 'password' field in the user document.
      // Note: In a real production app with Firebase Auth, you'd use updatePassword(auth.currentUser, newPassword)
      await updateDoc(doc(db, 'users', profile.id), {
        password: passwords.new
      });
      toast.success('Kata sandi berhasil diperbarui');
      setIsChangingPassword(false);
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (error) {
      toast.error('Gagal memperbarui kata sandi');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const isCheckedIn = lastLog && !lastLog.check_out && lastLog.check_in?.toDate().toDateString() === new Date().toDateString();
  const currentJournals = journals.filter(j => j.attendance_id === lastLog?.id);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayHoliday = holidays.find(h => h.date === todayStr);
  const isWeeklyOff = tenant?.off_days?.includes(new Date().getDay());

  return (
    <div className="space-y-6 sm:space-y-8 pb-24 sm:pb-8">
      {activeTab === 'home' && (
        <>
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Selamat Datang, {profile.name}</h1>
            <p className="text-sm sm:text-base text-gray-500">{tenant?.name}</p>
          </div>

          {(todayHoliday || isWeeklyOff) ? (
            <Card className="mx-auto w-full max-w-md border-none shadow-xl shadow-red-100/50 bg-red-50/30">
              <CardContent className="flex flex-col items-center py-10 text-center">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <Calendar className="h-12 w-12" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-red-900">
                  {todayHoliday ? `Hari Libur: ${todayHoliday.name}` : 'Libur Mingguan'}
                </h2>
                <p className="mb-4 text-sm text-red-600/80">
                  Hari ini sistem absensi dinonaktifkan karena hari libur. Selamat beristirahat!
                </p>
                <Badge variant="outline" className="border-red-200 text-red-700 bg-white">
                  {new Date().toLocaleDateString('id-ID', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </Badge>
              </CardContent>
            </Card>
          ) : !profile.face_descriptor || profile.face_descriptor.length === 0 ? (
            <Card className="mx-auto w-full max-w-md border-none shadow-xl shadow-gray-200/50">
              <CardContent className="flex flex-col items-center py-10 text-center">
                <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-yellow-50 text-yellow-600">
                  <Camera className="h-12 w-12" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-gray-900">Pendaftaran Wajah Diperlukan</h2>
                <p className="mb-8 text-sm text-gray-500">
                  Untuk melakukan absensi, Anda harus mendaftarkan wajah Anda terlebih dahulu. Pastikan Anda berada di tempat dengan pencahayaan yang baik.
                </p>
                <Button 
                  size="lg" 
                  onClick={handleStartFaceRegistration}
                  className="w-full rounded-xl bg-blue-600 hover:bg-blue-700"
                >
                  <Camera className="mr-2 h-5 w-5" /> Daftarkan Wajah Sekarang
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center gap-6">
              <Card className="w-full max-w-md border-none shadow-xl shadow-gray-200/50">
                <CardContent className="flex flex-col items-center py-10">
                  <div className={`mb-8 flex h-32 w-32 items-center justify-center rounded-full border-8 ${isCheckedIn ? 'border-orange-100 bg-orange-50 text-orange-600' : 'border-green-100 bg-green-50 text-green-600'} transition-all duration-500`}>
                    {isCheckedIn ? <Clock className="h-16 w-16" /> : <CheckCircle2 className="h-16 w-16" />}
                  </div>

                  <div className="mb-8 text-center">
                    <div className="text-4xl font-black tracking-tight text-gray-900">
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-sm font-medium text-gray-500">{new Date().toLocaleDateString('id-ID', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                  </div>

                  <div className="mb-6 text-center">
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-100 px-4 py-1">
                      <Clock className="mr-2 h-3 w-3" />
                      {isCheckedIn 
                        ? `Jadwal Check-out: ${tenant?.check_out_time || '16:00'} - ${tenant?.check_out_end_time || '18:00'}`
                        : `Jadwal Check-in: ${tenant?.check_in_time || '07:00'} - ${tenant?.check_in_end_time || '09:00'}`
                      }
                    </Badge>
                  </div>

                  <Button 
                    size="lg" 
                    onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
                    disabled={isProcessing || !location}
                    className={`h-20 w-full rounded-2xl text-xl font-bold shadow-lg ${isCheckedIn ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'}`}
                  >
                    {isProcessing ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : null}
                    {isCheckedIn ? 'Check Out' : 'Check In Sekarang'}
                  </Button>

                  <div className="mt-6 flex w-full flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 rounded-xl bg-gray-50 p-4">
                    <div className="flex items-center gap-3">
                      <MapPin className={`h-6 w-6 sm:h-5 sm:w-5 ${location ? 'text-green-600' : 'text-gray-400'}`} />
                      <div className="text-left">
                        <div className="text-sm sm:text-xs font-bold text-gray-900">Status GPS</div>
                        <div className="text-xs sm:text-[10px] text-gray-500">
                          {location ? `Akurasi: ${location.accuracy.toFixed(1)}m` : 'Mencari lokasi...'}
                        </div>
                      </div>
                    </div>
                    {location && tenant && (
                      <Badge variant={calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'default' : 'destructive'} className={`w-full sm:w-auto justify-center ${calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}`}>
                        {calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'Di Dalam Area' : 'Di Luar Area'}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {activeTab === 'journal' && (
        <div className="w-full max-w-md mx-auto space-y-4">
          <div className="flex items-center justify-between text-gray-900">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold">Jurnal Saya</h3>
            </div>
            <Dialog open={isJournalOpen} onOpenChange={setIsJournalOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" className="h-9 sm:h-8 text-sm sm:text-xs" />}>
                <Plus className="mr-1 h-4 w-4 sm:h-3 sm:w-3" /> Tambah Jurnal
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Jurnal Mengajar</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="subject">Mata Pelajaran *</Label>
                      <Input id="subject" value={newJournal.subject} onChange={e => setNewJournal({...newJournal, subject: e.target.value})} placeholder="misal. Matematika" />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="class">Kelas *</Label>
                      <Input id="class" value={newJournal.class_name} onChange={e => setNewJournal({...newJournal, class_name: e.target.value})} placeholder="misal. 10A" />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="time">Waktu</Label>
                    <Input id="time" type="time" value={newJournal.time} onChange={e => setNewJournal({...newJournal, time: e.target.value})} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="material">Materi yang Diajarkan *</Label>
                    <Input id="material" value={newJournal.material} onChange={e => setNewJournal({...newJournal, material: e.target.value})} placeholder="misal. Dasar Aljabar" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Deskripsi / Catatan</Label>
                    <Textarea id="description" value={newJournal.description} onChange={e => setNewJournal({...newJournal, description: e.target.value})} placeholder="Catatan tambahan..." />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsJournalOpen(false)}>Batal</Button>
                  <Button onClick={handleAddJournal} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Kirim Jurnal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="space-y-3">
            {journals.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
                Belum ada jurnal yang dikirimkan.
              </div>
            ) : (
              journals.map(journal => (
                <div key={journal.id} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="font-medium text-gray-900 text-sm sm:text-base">{journal.subject} <span className="text-gray-500">({journal.class_name})</span></div>
                    <Badge variant={journal.status === 'approved' ? 'default' : journal.status === 'rejected' ? 'destructive' : 'secondary'} className={`w-fit ${journal.status === 'approved' ? 'bg-green-100 text-green-700' : ''}`}>
                      {journal.status === 'approved' ? 'Disetujui' : journal.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                    </Badge>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">{journal.createdAt?.toDate().toLocaleDateString('id-ID')}</div>
                  <div className="mt-2 sm:mt-1 text-xs sm:text-sm text-gray-600">{journal.material}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="w-full max-w-md mx-auto space-y-4">
          <div className="flex items-center gap-2 text-gray-900">
            <History className="h-5 w-5" />
            <h3 className="font-bold">Riwayat Absensi</h3>
          </div>
          {history.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
              Belum ada riwayat absensi.
            </div>
          ) : (
            history.map(log => (
              <Card key={log.id} className="border-none shadow-sm">
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-2 ${log.status === 'valid' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                      {log.status === 'valid' ? <CheckCircle2 className="h-5 w-5 sm:h-4 sm:w-4" /> : <AlertTriangle className="h-5 w-5 sm:h-4 sm:w-4" />}
                    </div>
                    <div>
                      <div className="text-sm sm:text-base font-bold text-gray-900">
                        {log.check_in?.toDate().toLocaleDateString('id-ID')}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-500">
                        {log.check_in?.toDate().toLocaleTimeString('id-ID')} - {log.check_out?.toDate().toLocaleTimeString('id-ID') || 'Hadir'}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="w-fit text-[10px] sm:text-xs uppercase tracking-wider">
                    {log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan'}
                  </Badge>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="w-full max-w-md mx-auto space-y-6">
          <div className="flex items-center gap-2 text-gray-900">
            <User className="h-5 w-5" />
            <h3 className="font-bold">Profil Saya</h3>
          </div>
          <Card className="border-none shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative group">
                  <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-green-100 text-green-600 overflow-hidden border-2 border-white shadow-md">
                    {profile.face_image_url ? (
                      <img src={profile.face_image_url} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-12 w-12" />
                    )}
                  </div>
                  <button 
                    onClick={handleStartProfilePhotoCapture}
                    className="absolute bottom-4 right-0 rounded-full bg-white p-1.5 shadow-md border hover:bg-gray-50 transition-colors"
                  >
                    <Camera className="h-4 w-4 text-gray-600" />
                  </button>
                </div>
                <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
                <p className="text-sm text-gray-500">{profile.email}</p>
                <Badge className="mt-2 bg-green-100 text-green-700">{profile.role === 'USER' ? 'Karyawan' : 'Admin'}</Badge>
              </div>
              
              <div className="mt-8 space-y-4">
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Organisasi</span>
                  <span className="font-medium text-gray-900">{tenant?.name}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="text-gray-500">Status Wajah</span>
                  <span className="font-medium text-gray-900">
                    {profile.face_descriptor ? 'Terdaftar' : 'Belum Terdaftar'}
                  </span>
                </div>
                
                <div className="pt-4 space-y-3">
                  <Dialog open={isChangingPassword} onOpenChange={setIsChangingPassword}>
                    <DialogTrigger render={<Button variant="outline" className="w-full" />}>
                      <Lock className="mr-2 h-4 w-4" /> Ganti Kata Sandi
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Ganti Kata Sandi</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="current-pass">Kata Sandi Saat Ini</Label>
                          <Input 
                            id="current-pass" 
                            type="password" 
                            value={passwords.current} 
                            onChange={e => setPasswords({...passwords, current: e.target.value})} 
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="new-pass">Kata Sandi Baru</Label>
                          <Input 
                            id="new-pass" 
                            type="password" 
                            value={passwords.new} 
                            onChange={e => setPasswords({...passwords, new: e.target.value})} 
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="confirm-pass">Konfirmasi Kata Sandi Baru</Label>
                          <Input 
                            id="confirm-pass" 
                            type="password" 
                            value={passwords.confirm} 
                            onChange={e => setPasswords({...passwords, confirm: e.target.value})} 
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsChangingPassword(false)}>Batal</Button>
                        <Button onClick={handleChangePassword} disabled={isUpdatingProfile} className="bg-blue-600 hover:bg-blue-700">
                          {isUpdatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Simpan Kata Sandi
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {!profile.face_descriptor && (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={handleStartFaceRegistration}
                    >
                      <Camera className="mr-2 h-4 w-4" /> Daftarkan Wajah Sekarang
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Bottom Navigation Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white pb-safe sm:hidden">
        <div className="flex justify-around p-2">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center p-2 min-w-[64px] ${activeTab === 'home' ? 'text-green-600' : 'text-gray-500'}`}
          >
            <Home className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-medium">Beranda</span>
          </button>
          <button 
            onClick={() => setActiveTab('journal')}
            className={`flex flex-col items-center p-2 min-w-[64px] ${activeTab === 'journal' ? 'text-green-600' : 'text-gray-500'}`}
          >
            <BookOpen className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-medium">Jurnal</span>
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center p-2 min-w-[64px] ${activeTab === 'history' ? 'text-green-600' : 'text-gray-500'}`}
          >
            <History className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-medium">Riwayat</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center p-2 min-w-[64px] ${activeTab === 'profile' ? 'text-green-600' : 'text-gray-500'}`}
          >
            <User className="h-6 w-6 mb-1" />
            <span className="text-[10px] font-medium">Profil</span>
          </button>
        </div>
      </div>

      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="p-6 text-center">
              <h2 className="text-xl font-bold text-gray-900">Verifikasi Wajah</h2>
              <p className="text-sm text-gray-500">Memindai kecocokan biometrik...</p>
            </div>
            <div className="relative aspect-[3/4] sm:aspect-square w-full bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-56 sm:h-64 sm:w-64 rounded-full border-2 border-green-500/50 shadow-[0_0_0_1000px_rgba(0,0,0,0.5)]" />
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Loader2 className="h-12 w-12 animate-spin text-white" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6">
              <Button variant="outline" className="flex-1" onClick={() => {
                setIsCameraOpen(false);
                const stream = videoRef.current?.srcObject as MediaStream;
                stream?.getTracks().forEach(track => track.stop());
              }}>Batal</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={processCheckIn} disabled={isProcessing}>
                Verifikasi & Check In
              </Button>
            </div>
          </div>
        </div>
      )}

      {isRegisteringFace && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="p-6 text-center">
              <h2 className="text-xl font-bold text-gray-900">Daftarkan Wajah</h2>
              <p className="text-sm text-gray-500">Posisikan wajah Anda di dalam lingkaran</p>
            </div>
            <div className="relative aspect-[3/4] sm:aspect-square w-full bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-56 sm:h-64 sm:w-64 rounded-full border-2 border-blue-500/50 shadow-[0_0_0_1000px_rgba(0,0,0,0.5)]" />
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Loader2 className="h-12 w-12 animate-spin text-white" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6">
              <Button variant="outline" className="flex-1" onClick={() => {
                setIsRegisteringFace(false);
                const stream = videoRef.current?.srcObject as MediaStream;
                stream?.getTracks().forEach(track => track.stop());
              }}>Batal</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={processFaceRegistration} disabled={isProcessing}>
                Simpan Wajah
              </Button>
            </div>
          </div>
        </div>
      )}

      {isProfileCameraOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="p-6 text-center">
              <h2 className="text-xl font-bold text-gray-900">Ambil Foto Profil</h2>
              <p className="text-sm text-gray-500">Ambil foto baru untuk profil Anda</p>
            </div>
            <div className="relative aspect-[3/4] sm:aspect-square w-full bg-black">
              <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-56 w-56 sm:h-64 sm:w-64 rounded-full border-2 border-green-500/50 shadow-[0_0_0_1000px_rgba(0,0,0,0.5)]" />
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Loader2 className="h-12 w-12 animate-spin text-white" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6">
              <Button variant="outline" className="flex-1" onClick={() => {
                setIsProfileCameraOpen(false);
                const stream = videoRef.current?.srcObject as MediaStream;
                stream?.getTracks().forEach(track => track.stop());
              }}>Batal</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={processProfilePhotoCapture} disabled={isProcessing}>
                Ambil Foto
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
