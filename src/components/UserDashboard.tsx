import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, doc, serverTimestamp, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { UserProfile, AttendanceRecord, Tenant, Journal, Holiday, Announcement } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, MapPin, Camera, CheckCircle2, XCircle, AlertTriangle, Clock, History, BookOpen, Plus, Home, User, Calendar, Lock, MoreVertical, Bell, LogOut, Send, Settings, Info, ChevronRight, LogIn, LogOut as LogOutIcon, Scan, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { validateLocation, getFaceDescriptor, loadFaceModels, compareFaces, calculateDistance } from '../lib/attendance';
import { handleFirestoreError, OperationType } from '../lib/errorUtils';

export function UserDashboard({ profile }: { profile: UserProfile }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [lastLog, setLastLog] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
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

    // Fetch Announcements
    const unsubAnnouncements = onSnapshot(
      query(
        collection(db, 'announcements'),
        where('tenant_id', '==', profile.tenant_id),
        where('active', '==', true),
        orderBy('createdAt', 'desc')
      ),
      (snapshot) => {
        setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'announcements');
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
      unsubAnnouncements();
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
          <div className="bg-gradient-to-br from-green-600 via-green-600 to-green-700 px-4 py-4 sm:px-10 sm:py-8 lg:px-12 shadow-md relative -mx-4 sm:-mx-6 lg:-mx-8 mt-0 mb-8 border-b border-green-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 overflow-hidden rounded-full border-2 border-white/40 bg-white/10 shadow-lg">
                  {profile.face_image_url ? (
                    <img src={profile.face_image_url} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-full w-full p-2 text-white" />
                  )}
                </div>
                <div className="text-white">
                  <h1 className="text-xl font-extrabold tracking-tight leading-tight">{profile.name}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-300 shadow-[0_0_8px_rgba(134,239,172,0.8)]" />
                    <p className="text-[10px] text-white/90 uppercase font-bold tracking-[0.15em]">{tenant?.name || 'SMARTSANTRI'}</p>
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="text-white hover:bg-white/20" />}>
                  <Settings className="h-6 w-6" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl">
                  <DropdownMenuItem onClick={() => signOut(auth)} className="cursor-pointer py-3 text-gray-700">
                    <LogOut className="mr-3 h-4 w-4" />
                    <span className="font-medium">Keluar</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('profile')} className="cursor-pointer py-3 text-gray-700">
                    <User className="mr-3 h-4 w-4" />
                    <span className="font-medium">Profil</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer py-3 text-gray-700">
                    <Bell className="mr-3 h-4 w-4" />
                    <span className="font-medium">Notifikasi</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {announcements.map(announcement => (
            <Card key={announcement.id} className={`mx-auto w-full max-w-md border shadow-xl rounded-3xl overflow-hidden mb-8 ${
              announcement.type === 'birthday' ? 'border-orange-100 shadow-orange-100/30 bg-[#fffdf5]' :
              announcement.type === 'warning' ? 'border-red-100 shadow-red-100/30 bg-red-50/50' :
              'border-blue-100 shadow-blue-100/30 bg-blue-50/50'
            }`}>
              <CardContent className="p-6 text-center">
                <div className="mb-4 flex justify-center">
                  {announcement.type === 'birthday' ? (
                    <img src="https://cdn-icons-png.flaticon.com/512/4213/4213958.png" alt="Happy Birthday" className="h-20 object-contain drop-shadow-sm" />
                  ) : announcement.type === 'warning' ? (
                    <AlertTriangle className="h-16 w-16 text-red-500" />
                  ) : (
                    <Info className="h-16 w-16 text-blue-500" />
                  )}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">
                  <strong className="text-gray-900">{announcement.title}</strong>
                  {announcement.type === 'birthday' ? ', ' : ' - '}
                  {announcement.message}
                </p>
              </CardContent>
            </Card>
          ))}

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
                  <div className="relative mb-8">
                    {location && (
                      <div 
                        className="absolute inset-0 rounded-full overflow-hidden opacity-40 blur-[1px]"
                        style={{
                          backgroundImage: `url(https://static-maps.yandex.ru/1.x/?ll=${location.lng},${location.lat}&z=16&l=map&size=250,250)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center'
                        }}
                      />
                    )}
                    <div className={`relative flex h-32 w-32 items-center justify-center rounded-full border-8 ${isCheckedIn ? 'border-orange-100 bg-orange-50/80 text-orange-600' : 'border-green-100 bg-green-50/80 text-green-600'} transition-all duration-500 backdrop-blur-[2px] shadow-inner`}>
                      {isCheckedIn ? <Clock className="h-16 w-16" /> : <CheckCircle2 className="h-16 w-16" />}
                    </div>
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

                  <div className="w-full space-y-4">
                    <div className="flex w-full flex-col gap-4 rounded-3xl bg-gray-50/80 p-5 border border-gray-100">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${location ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                          <MapPin className="h-6 w-6" />
                        </div>
                        <div className="text-left flex-1">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-bold text-gray-900">Status GPS</div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-gray-400 hover:text-green-600"
                              onClick={() => {
                                navigator.geolocation.getCurrentPosition(
                                  (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
                                  () => toast.error('Gagal memperbarui lokasi')
                                );
                              }}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-xs text-gray-500">
                            {location ? `Akurasi: ${location.accuracy.toFixed(1)}m` : 'Mencari lokasi...'}
                          </div>
                        </div>
                      </div>
                      {location && tenant && (
                        <div className={`w-full py-2.5 text-center rounded-xl text-xs font-semibold ${calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'Di Dalam Area' : 'Di Luar Area'}
                        </div>
                      )}
                    </div>
                    
                    <p className="text-center text-[11px] text-gray-400 italic">
                      Gunakan tombol tengah di menu bawah untuk melakukan absensi
                    </p>

                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-bold text-gray-900">Status Hari Ini</div>
                        {!lastLog || lastLog.check_in?.toDate().toDateString() !== new Date().toDateString() ? (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">Belum Check In</Badge>
                        ) : !lastLog.check_out ? (
                          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Sudah Check In</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200">Selesai (Check Out)</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {activeTab === 'journal' && (
        <div className="w-full max-w-md mx-auto space-y-6 px-4 sm:px-0 pb-24">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Jurnal Mengajar</h3>
              <p className="text-xs font-medium text-gray-500 mt-1">Dokumentasi kegiatan belajar mengajar</p>
            </div>
            <Dialog open={isJournalOpen} onOpenChange={setIsJournalOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 w-10 rounded-xl bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200 flex items-center justify-center text-white transition-all active:scale-95">
                  <Plus className="h-5 w-5" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md rounded-[2rem] p-8">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold tracking-tight">Jurnal Baru</DialogTitle>
                  <p className="text-sm text-gray-500">Catat aktivitas mengajar Anda hari ini.</p>
                </DialogHeader>
                <div className="grid gap-6 py-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="subject" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Mata Pelajaran</Label>
                      <Input 
                        id="subject" 
                        className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500" 
                        value={newJournal.subject} 
                        onChange={e => setNewJournal({...newJournal, subject: e.target.value})} 
                        placeholder="Matematika" 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="class" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Kelas</Label>
                      <Input 
                        id="class" 
                        className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500" 
                        value={newJournal.class_name} 
                        onChange={e => setNewJournal({...newJournal, class_name: e.target.value})} 
                        placeholder="10A" 
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="time" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Waktu</Label>
                    <Input 
                      id="time" 
                      type="time" 
                      className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500" 
                      value={newJournal.time} 
                      onChange={e => setNewJournal({...newJournal, time: e.target.value})} 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="material" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Materi</Label>
                    <Input 
                      id="material" 
                      className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500" 
                      value={newJournal.material} 
                      onChange={e => setNewJournal({...newJournal, material: e.target.value})} 
                      placeholder="Dasar Aljabar" 
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Catatan</Label>
                    <Textarea 
                      id="description" 
                      className="min-h-[100px] rounded-xl bg-gray-50 border-none focus-visible:ring-green-500 resize-none" 
                      value={newJournal.description} 
                      onChange={e => setNewJournal({...newJournal, description: e.target.value})} 
                      placeholder="Catatan tambahan..." 
                    />
                  </div>
                </div>
                <DialogFooter className="gap-3 sm:gap-0">
                  <Button variant="ghost" className="h-12 rounded-xl font-bold text-gray-500" onClick={() => setIsJournalOpen(false)}>Batal</Button>
                  <Button onClick={handleAddJournal} disabled={isProcessing} className="h-12 rounded-xl bg-green-600 hover:bg-green-700 font-bold px-8">
                    {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Simpan Jurnal
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          
          <div className="space-y-4">
            {journals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
                <div className="h-16 w-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                  <BookOpen className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-sm font-bold text-gray-900">Belum Ada Jurnal</p>
                <p className="text-xs text-gray-400 mt-1 max-w-[200px] mx-auto">Jurnal yang Anda buat akan muncul di sini secara otomatis</p>
              </div>
            ) : (
              journals.map((journal, index) => (
                <motion.div 
                  key={journal.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative overflow-hidden rounded-3xl border border-gray-100 bg-white p-5 shadow-sm transition-all hover:shadow-md hover:border-green-100"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700 uppercase tracking-wider">
                            {journal.class_name}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {journal.time}
                          </span>
                        </div>
                        <h4 className="text-lg font-bold text-gray-900 leading-tight group-hover:text-green-600 transition-colors">
                          {journal.subject}
                        </h4>
                      </div>
                      <Badge variant="secondary" className={`shrink-0 rounded-full px-3 py-1 text-[9px] font-bold uppercase tracking-widest border ${
                        journal.status === 'approved' ? 'bg-green-50 text-green-700 border-green-100' : 
                        journal.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' : 
                        'bg-orange-50 text-orange-700 border-orange-100'
                      }`}>
                        {journal.status === 'approved' ? 'Disetujui' : journal.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                      </Badge>
                    </div>

                    <div className="relative">
                      <p className="text-sm text-gray-600 leading-relaxed line-clamp-3 italic font-serif">
                        "{journal.material}"
                      </p>
                    </div>

                    <div className="pt-4 mt-auto border-t border-gray-50 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" /> 
                          {journal.createdAt?.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="h-6 w-6 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-green-50 group-hover:text-green-600 transition-colors">
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="w-full max-w-md mx-auto space-y-6 px-4 sm:px-0 pb-24">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Riwayat Absensi</h3>
              <p className="text-xs font-medium text-gray-500 mt-1">Rekapitulasi kehadiran Anda bulan ini</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <History className="h-5 w-5" />
            </div>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-white border border-gray-100 p-4 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Hadir</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-gray-900">{history.filter(h => h.status === 'valid').length}</span>
                <span className="text-[10px] font-bold text-green-500 mb-1">HARI</span>
              </div>
            </div>
            <div className="rounded-3xl bg-white border border-gray-100 p-4 shadow-sm">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Review</p>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-gray-900">{history.filter(h => h.status === 'pending').length}</span>
                <span className="text-[10px] font-bold text-orange-500 mb-1">LOG</span>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
                <div className="h-16 w-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                  <History className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-sm font-bold text-gray-900">Belum Ada Riwayat</p>
              </div>
            ) : (
              history.map((log, index) => (
                <motion.div 
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className="flex items-center justify-between rounded-3xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                      log.status === 'valid' ? 'bg-green-50 text-green-600' : 
                      log.status === 'rejected' ? 'bg-red-50 text-red-600' : 
                      'bg-orange-50 text-orange-600'
                    }`}>
                      {log.status === 'valid' ? <CheckCircle2 className="h-6 w-6" /> : 
                       log.status === 'rejected' ? <XCircle className="h-6 w-6" /> : 
                       <AlertTriangle className="h-6 w-6" />}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900">
                        {log.check_in?.toDate().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}
                      </div>
                      <div className="mt-1 flex items-center gap-3">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md">
                          <LogIn className="h-2.5 w-2.5" />
                          {log.check_in?.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-gray-500 bg-gray-50 px-2 py-0.5 rounded-md">
                          <LogOutIcon className="h-2.5 w-2.5" />
                          {log.check_out ? log.check_out.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className={`rounded-full px-2.5 py-0.5 text-[8px] font-bold uppercase tracking-widest border ${
                      log.status === 'valid' ? 'bg-green-50 text-green-700 border-green-100' : 
                      log.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' : 
                      'bg-orange-50 text-orange-700 border-orange-100'
                    }`}>
                      {log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Review'}
                    </Badge>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="w-full max-w-md mx-auto space-y-6 px-4 sm:px-0 pb-24">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-8"
          >
            <div className="space-y-1">
              <h3 className="text-3xl font-black text-gray-900 tracking-tight">Profil Saya</h3>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Informasi Akun & Keamanan</p>
              </div>
            </div>
            <div className="h-14 w-14 rounded-2xl bg-white border border-gray-100 shadow-xl shadow-purple-100 flex items-center justify-center text-purple-600 transition-transform hover:scale-105">
              <User className="h-7 w-7" />
            </div>
          </motion.div>
          
          <div className="overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-sm">
            <div className="relative h-32 bg-gradient-to-br from-green-600 via-green-500 to-emerald-400">
              <div className="absolute top-4 right-4">
                <Badge className="bg-white/20 text-white hover:bg-white/30 border-none backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
                  {profile.role === 'USER' ? 'Karyawan' : 'Administrator'}
                </Badge>
              </div>
            </div>
            
            <div className="relative px-6 pb-8">
              <div className="flex flex-col items-center -mt-16 mb-6">
                <div className="relative group">
                  <div className="h-32 w-32 overflow-hidden rounded-full border-[6px] border-white bg-white shadow-2xl transition-transform group-hover:scale-105">
                    {profile.face_image_url ? (
                      <img src={profile.face_image_url} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gray-50">
                        <User className="h-12 w-12 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={handleStartProfilePhotoCapture}
                    className="absolute bottom-1 right-1 flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white shadow-xl transition-all hover:bg-green-700 hover:scale-110 active:scale-95 border-4 border-white"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 text-center">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{profile.name}</h2>
                  <p className="text-sm font-medium text-gray-500 mt-0.5">{profile.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="group flex items-center justify-between rounded-2xl bg-gray-50/50 p-4 border border-transparent hover:border-green-100 hover:bg-white transition-all">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-green-600 transition-colors">
                      <Home className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Organisasi</p>
                      <p className="text-sm font-bold text-gray-900">{tenant?.name || '-'}</p>
                    </div>
                  </div>
                </div>

                <div className="group flex items-center justify-between rounded-2xl bg-gray-50/50 p-4 border border-transparent hover:border-green-100 hover:bg-white transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl bg-white shadow-sm flex items-center justify-center transition-colors ${profile.face_descriptor ? 'text-green-500' : 'text-orange-400'}`}>
                      <Scan className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Status Wajah</p>
                      <p className="text-sm font-bold text-gray-900">{profile.face_descriptor ? 'Terdaftar' : 'Belum Terdaftar'}</p>
                    </div>
                  </div>
                  {!profile.face_descriptor && (
                    <Button size="sm" className="h-8 px-4 rounded-full bg-orange-500 hover:bg-orange-600 text-[10px] font-bold uppercase tracking-widest" onClick={handleStartFaceRegistration}>
                      Daftar Sekarang
                    </Button>
                  )}
                </div>

                <div className="pt-4">
                  <Dialog open={isChangingPassword} onOpenChange={setIsChangingPassword}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-between h-14 rounded-2xl border-gray-100 bg-white text-gray-700 hover:bg-gray-50 hover:border-green-200 group transition-all">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center mr-3 group-hover:bg-green-50 group-hover:text-green-600 transition-colors">
                            <Lock className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-bold">Ganti Kata Sandi</span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md rounded-[2rem] p-8">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-bold tracking-tight">Ganti Kata Sandi</DialogTitle>
                        <p className="text-sm text-gray-500">Pastikan kata sandi baru Anda kuat dan aman.</p>
                      </DialogHeader>
                      <div className="grid gap-6 py-6">
                        <div className="grid gap-2">
                          <Label htmlFor="current-pass" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Kata Sandi Saat Ini</Label>
                          <Input 
                            id="current-pass" 
                            type="password" 
                            className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500"
                            value={passwords.current} 
                            onChange={e => setPasswords({...passwords, current: e.target.value})} 
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="new-pass" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Kata Sandi Baru</Label>
                          <Input 
                            id="new-pass" 
                            type="password" 
                            className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500"
                            value={passwords.new} 
                            onChange={e => setPasswords({...passwords, new: e.target.value})} 
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="confirm-pass" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Konfirmasi Kata Sandi</Label>
                          <Input 
                            id="confirm-pass" 
                            type="password" 
                            className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500"
                            value={passwords.confirm} 
                            onChange={e => setPasswords({...passwords, confirm: e.target.value})} 
                          />
                        </div>
                      </div>
                      <DialogFooter className="gap-3 sm:gap-0">
                        <Button variant="ghost" className="h-12 rounded-xl font-bold text-gray-500" onClick={() => setIsChangingPassword(false)}>Batal</Button>
                        <Button onClick={handleChangePassword} disabled={isUpdatingProfile} className="h-12 rounded-xl bg-green-600 hover:bg-green-700 font-bold px-8">
                          {isUpdatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Simpan Perubahan
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white/80 backdrop-blur-lg pb-safe sm:hidden">
        <div className="flex justify-between items-center px-4 py-1 relative h-16">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center py-2 min-w-[50px] transition-colors ${activeTab === 'home' ? 'text-green-600' : 'text-gray-400'}`}
          >
            <Home className="h-5 w-5 mb-1" />
            <span className="text-[9px] font-bold">BERANDA</span>
          </button>
          <button 
            onClick={() => setActiveTab('journal')}
            className={`flex flex-col items-center py-2 min-w-[50px] transition-colors ${activeTab === 'journal' ? 'text-green-600' : 'text-gray-400'}`}
          >
            <BookOpen className="h-5 w-5 mb-1" />
            <span className="text-[9px] font-bold">JURNAL</span>
          </button>

          {/* Central Check In/Out Button */}
          <div className="relative -top-6">
            <div className="absolute -inset-2 bg-white rounded-full shadow-md" />
            <button
              onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
              disabled={isProcessing || !location}
              className={`relative flex h-16 w-16 items-center justify-center rounded-full shadow-2xl transition-all active:scale-90 border-4 border-white ${
                isCheckedIn ? 'bg-orange-600 hover:bg-orange-700' : 'bg-green-600 hover:bg-green-700'
              } ${isProcessing || !location ? 'opacity-50 grayscale' : ''}`}
            >
              {isProcessing ? (
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              ) : isCheckedIn ? (
                <LogOut className="h-8 w-8 text-white" />
              ) : (
                <Camera className="h-8 w-8 text-white" />
              )}
            </button>
            <span className={`absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-black tracking-tighter whitespace-nowrap ${
              isCheckedIn ? 'text-orange-600' : 'text-green-600'
            }`}>
              {isCheckedIn ? 'CHECK OUT' : 'CHECK IN'}
            </span>
          </div>

          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center py-2 min-w-[50px] transition-colors ${activeTab === 'history' ? 'text-green-600' : 'text-gray-400'}`}
          >
            <History className="h-5 w-5 mb-1" />
            <span className="text-[9px] font-bold">RIWAYAT</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center py-2 min-w-[50px] transition-colors ${activeTab === 'profile' ? 'text-green-600' : 'text-gray-400'}`}
          >
            <User className="h-5 w-5 mb-1" />
            <span className="text-[9px] font-bold">PROFIL</span>
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
