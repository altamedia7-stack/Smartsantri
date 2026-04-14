import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, MapPin, Camera, CheckCircle2, XCircle, AlertTriangle, Clock, History, BookOpen, Plus, Home, User, Users, Calendar, Lock, MoreVertical, Bell, LogOut, Send, Settings, Info, ChevronRight, ChevronDown, LogIn, LogOut as LogOutIcon, Scan, RefreshCw, Filter, Check, FileText, Image, Trash2, Edit, Search, ChevronLeft, Upload, Download, Mail, Phone, CreditCard, Globe, Moon, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { validateLocation, getFaceDescriptor, loadFaceModels, compareFaces, calculateDistance } from '../lib/attendance';
import { handleFirestoreError, OperationType } from '../lib/errorUtils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, startOfWeek, endOfWeek, isSameMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const WeeklyChart = ({ data }: { data: any[] }) => {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis 
            dataKey="day" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: '#9ca3af', fontWeight: 600 }} 
          />
          <YAxis hide />
          <Tooltip 
            cursor={{ fill: '#f9fafb' }}
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
          />
          <Bar dataKey="present" radius={[4, 4, 4, 4]} barSize={24}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.present > 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const SUBJECTS = ['Matematika', 'Bahasa Indonesia', 'Bahasa Inggris', 'IPA', 'IPS', 'PAI', 'PJOK', 'Seni Budaya', 'Lainnya'];
const CLASSES = ['7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B'];
const TIMES = ['Jam ke-1', 'Jam ke-2', 'Jam ke-3', 'Jam ke-4', 'Jam ke-5', 'Jam ke-6', 'Jam ke-7', 'Jam ke-8'];

export function UserDashboard({ profile }: { profile: UserProfile }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [lastLog, setLastLog] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [historyFilterMonth, setHistoryFilterMonth] = useState<number>(new Date().getMonth());
  const [historyFilterYear, setHistoryFilterYear] = useState<number>(new Date().getFullYear());
  const [historyFilterStatus, setHistoryFilterStatus] = useState<string>('all');
  const [historySearchDate, setHistorySearchDate] = useState<string>('');
  const [showHistoryFilter, setShowHistoryFilter] = useState<boolean>(false);
  const [selectedHistory, setSelectedHistory] = useState<AttendanceRecord | null>(null);
  const [historyView, setHistoryView] = useState<'list' | 'detail'>('list');
  const [journals, setJournals] = useState<Journal[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [location, setLocation] = useState<{ lat: number, lng: number, accuracy: number } | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [isProfileCameraOpen, setIsProfileCameraOpen] = useState(false);
  const [newJournal, setNewJournal] = useState({ subject: '', class_name: '', time: '', material: '', description: '', is_draft: false });
  const [journalView, setJournalView] = useState<'list' | 'form' | 'detail'>('list');
  const [selectedJournal, setSelectedJournal] = useState<Journal | null>(null);
  const [journalFilter, setJournalFilter] = useState({ subject: 'all', class_name: 'all', status: 'all' });
  const [isFiltering, setIsFiltering] = useState(false);
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'check-in' | 'check-out' | null>(null);
  
  const [activeTab, setActiveTab] = useState<'home' | 'journal' | 'history' | 'profile'>('home');
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [editProfileData, setEditProfileData] = useState({
    name: '',
    phone: '',
    nip_nis: '',
    address: ''
  });
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isFaceScanning, setIsFaceScanning] = useState(false);
  const [faceStatus, setFaceStatus] = useState<'detecting' | 'detected' | 'not_detected' | 'idle'>('idle');
  const [unreadNotifications, setUnreadNotifications] = useState(2);
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
      limit(100)
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

  useEffect(() => {
    if (tenant?.is_journal_enabled === false && activeTab === 'journal') {
      setActiveTab('home');
    }
  }, [tenant?.is_journal_enabled, activeTab]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    if (theme === 'light') {
      setTheme('dark');
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      setTheme('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleSaveProfile = async () => {
    if (!profile.id) return;
    setIsUpdatingProfile(true);
    try {
      await updateDoc(doc(db, 'users', profile.id), {
        name: editProfileData.name,
        phone: editProfileData.phone,
        nip_nis: editProfileData.nip_nis,
        address: editProfileData.address
      });
      toast.success('Profil berhasil diperbarui');
      setIsEditProfileOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Gagal memperbarui profil: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const openEditProfile = () => {
    setEditProfileData({
      name: profile.name || '',
      phone: profile.phone || '',
      nip_nis: profile.nip_nis || '',
      address: profile.address || ''
    });
    setIsEditProfileOpen(true);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
      toast.error('Gagal keluar akun');
    }
  };

  const openVerificationCamera = async (mode: 'check-in' | 'check-out') => {
    setCameraMode(mode);
    setIsCameraOpen(true);
    setFaceStatus('detecting');
    await loadFaceModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Face detection loop
        const interval = setInterval(async () => {
          if (!videoRef.current || !isCameraOpen) {
            clearInterval(interval);
            return;
          }
          const descriptor = await getFaceDescriptor(videoRef.current);
          setFaceStatus(descriptor ? 'detected' : 'not_detected');
        }, 1000);
      }
    } catch (err) {
      toast.error('Akses kamera diperlukan untuk verifikasi wajah');
      setIsCameraOpen(false);
    }
  };

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

    await openVerificationCamera('check-in');
  };

  const handleStartFaceRegistration = async () => {
    setIsRegisteringFace(true);
    setFaceStatus('detecting');
    await loadFaceModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;

        // Face detection loop
        const interval = setInterval(async () => {
          if (!videoRef.current || !isRegisteringFace) {
            clearInterval(interval);
            return;
          }
          const descriptor = await getFaceDescriptor(videoRef.current);
          setFaceStatus(descriptor ? 'detected' : 'not_detected');
        }, 1000);
      }
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
      let isLate = false;

      if (tenant.check_in_end_time) {
        const [h, m] = tenant.check_in_end_time.split(':').map(Number);
        const now = new Date();
        const target = new Date();
        target.setHours(h, m, 0);
        // Consider late if more than 1 minute past end time
        if (now.getTime() > target.getTime() + 60000) {
          isLate = true;
        }
      }

      if (!locStatus.isValid) {
        status = 'rejected';
        reason = locStatus.reason || 'Validasi lokasi gagal';
      } else if (locStatus.isSuspicious || !faceMatch) {
        status = 'suspicious';
        if (!faceMatch) {
          reason = 'Wajah tidak cocok';
        } else {
          reason = locStatus.reason || 'Lokasi mencurigakan';
        }
      }

      // 4. Save Record
      await addDoc(collection(db, 'attendance'), {
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        check_in: serverTimestamp(),
        lat: location.lat,
        lng: location.lng,
        status,
        is_late: isLate,
        rejection_reason: reason
      });

      if (status === 'valid') toast.success('Check-in berhasil!');
      else if (status === 'suspicious') {
        if (!faceMatch) {
          toast.warning('Wajah tidak cocok. Pastikan pencahayaan cukup, wajah tidak tertutup, atau daftar ulang wajah di tab Profil.');
        } else {
          toast.warning('Check-in ditandai: ' + reason);
        }
      }
      else toast.error('Check-in ditolak: ' + reason);

      setIsCameraOpen(false);
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
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
    
    // Check if journal is submitted for this attendance (only if journal feature is enabled)
    if (tenant?.is_journal_enabled !== false) {
      const hasJournal = journals.some(j => j.attendance_id === lastLog.id);
      if (!hasJournal) {
        toast.error('Anda harus mengirimkan jurnal mengajar sebelum check-out.');
        setActiveTab('journal');
        setJournalView('form');
        return;
      }
    }

    await openVerificationCamera('check-out');
  };

  const processCheckOut = async () => {
    if (!videoRef.current || !location || !tenant || !lastLog) return;
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
        faceMatch = true; // Allow if not registered
      }

      // 3. Determine if suspicious
      let isSuspicious = !locStatus.isValid || locStatus.isSuspicious || !faceMatch;
      let status: 'valid' | 'suspicious' | 'rejected' = isSuspicious ? (locStatus.isValid ? 'suspicious' : 'rejected') : 'valid';
      
      let reason = '';
      if (!locStatus.isValid) {
        reason = locStatus.reason || 'Lokasi di luar jangkauan';
      } else if (locStatus.isSuspicious) {
        reason = locStatus.reason || 'Lokasi mencurigakan';
      } else if (!faceMatch) {
        reason = 'Wajah tidak cocok';
      }

      await updateDoc(doc(db, 'attendance', lastLog.id), {
        check_out: serverTimestamp(),
        check_out_lat: location.lat,
        check_out_lng: location.lng,
        check_out_status: status,
        check_out_reason: reason
      });

      if (status === 'valid') toast.success('Check-out berhasil!');
      else if (status === 'suspicious') toast.warning('Check-out ditandai mencurigakan: ' + reason);
      else toast.error('Check-out ditolak: ' + reason);

      setIsCameraOpen(false);
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
    } catch (error) {
      toast.error('Check-out gagal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setTempPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddJournal = async (isDraft = false) => {
    if (!newJournal.subject || !newJournal.class_name || !newJournal.material) {
      toast.error('Harap isi semua kolom yang wajib diisi');
      return;
    }
    if (!lastLog) {
      toast.error('Anda harus check-in terlebih dahulu');
      return;
    }

    setIsProcessing(true);
    try {
      await addDoc(collection(db, 'journals'), {
        ...newJournal,
        is_draft: isDraft,
        photo_url: tempPhoto || null,
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        attendance_id: lastLog.id,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      toast.success(isDraft ? 'Jurnal disimpan sebagai draft' : 'Jurnal berhasil dikirim');
      setJournalView('list');
      setNewJournal({ subject: '', class_name: '', time: '', material: '', description: '', is_draft: false });
      setTempPhoto(null);
    } catch (error) {
      toast.error('Gagal mengirim jurnal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteJournal = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'journals', id));
      toast.success('Jurnal berhasil dihapus');
      setJournalView('list');
    } catch (error) {
      toast.error('Gagal menghapus jurnal');
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
  
  const baseFilteredHistory = history.filter(log => {
    const logDate = log.check_in?.toDate();
    if (!logDate) return false;
    
    const matchMonth = logDate.getMonth() === historyFilterMonth;
    const matchYear = logDate.getFullYear() === historyFilterYear;
    
    let matchDate = true;
    if (historySearchDate) {
      const searchDateObj = new Date(historySearchDate);
      matchDate = logDate.getDate() === searchDateObj.getDate() &&
                  logDate.getMonth() === searchDateObj.getMonth() &&
                  logDate.getFullYear() === searchDateObj.getFullYear();
    }
    
    return matchMonth && matchYear && matchDate;
  });

  const filteredHistory = baseFilteredHistory.filter(log => {
    let matchStatus = true;
    if (historyFilterStatus === 'hadir') matchStatus = log.status === 'valid' && !log.is_late;
    if (historyFilterStatus === 'terlambat') matchStatus = !!log.is_late && log.status !== 'rejected';
    if (historyFilterStatus === 'mencurigakan') matchStatus = log.status === 'suspicious';
    if (historyFilterStatus === 'alpha') matchStatus = log.status === 'rejected';
    return matchStatus;
  });

  const totalHadir = baseFilteredHistory.filter(h => h.status === 'valid' && !h.is_late).length;
  const totalTerlambat = baseFilteredHistory.filter(h => !!h.is_late && h.status !== 'rejected').length;
  const totalMencurigakan = baseFilteredHistory.filter(h => h.status === 'suspicious').length;
  const totalRejected = baseFilteredHistory.filter(h => h.status === 'rejected').length;
  
  const getWorkingDays = (year: number, month: number) => {
    let days = 0;
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const lastDay = isCurrentMonth ? today.getDate() : new Date(year, month + 1, 0).getDate();
    
    for (let d = 1; d <= lastDay; d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      const isOffDay = tenant?.off_days?.includes(dayOfWeek);
      const isHoliday = holidays.some(h => !h.user_id && h.date === date.toISOString().split('T')[0]);
      
      if (!isOffDay && !isHoliday) days++;
    }
    return days;
  };
  const hariKerja = getWorkingDays(historyFilterYear, historyFilterMonth);
  
  // Alpha = Hari Kerja - (Hadir + Terlambat + Mencurigakan)
  const totalAlpha = Math.max(0, hariKerja - (totalHadir + totalTerlambat + totalMencurigakan));

  const handleExportHistory = () => {
    if (filteredHistory.length === 0) {
      toast.error('Tidak ada data untuk diekspor');
      return;
    }
    
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const periode = `${monthNames[historyFilterMonth]} ${historyFilterYear}`;
    const dicetakPada = new Date().toLocaleString('id-ID');

    const headerInfo = [
      `Laporan Kehadiran: ${profile.name}`,
      `Organisasi: ${tenant?.name || '-'}`,
      `Email: ${profile.email}`,
      `Periode: ${periode}`,
      `Dicetak pada: ${dicetakPada}`,
      '' // Baris kosong sebelum tabel
    ].join('\n');

    const headers = ['Tanggal', 'Jam Masuk', 'Jam Keluar', 'Status', 'Keterangan'];
    const csvData = filteredHistory.map(log => {
      const date = log.check_in?.toDate().toLocaleDateString('id-ID');
      const checkIn = log.check_in?.toDate().toLocaleTimeString('id-ID');
      const checkOut = log.check_out ? log.check_out.toDate().toLocaleTimeString('id-ID') : '-';
      const status = log.status === 'rejected' ? 'Alpha' : 
                     log.status === 'suspicious' ? 'Mencurigakan' : 
                     log.is_late ? 'Terlambat' : 'Hadir';
      const reason = log.rejection_reason || '-';
      return [date, checkIn, checkOut, status, reason].join(',');
    });
    
    const csvContent = headerInfo + '\n' + [headers.join(','), ...csvData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Laporan_Kehadiran_${profile.name.replace(/\s+/g, '_')}_${historyFilterMonth + 1}_${historyFilterYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Berhasil mengekspor data');
  };

  const weeklyData = [
    { day: 'Sen', present: filteredHistory.some(h => h.check_in?.toDate().getDay() === 1) ? 1 : 0 },
    { day: 'Sel', present: filteredHistory.some(h => h.check_in?.toDate().getDay() === 2) ? 1 : 0 },
    { day: 'Rab', present: filteredHistory.some(h => h.check_in?.toDate().getDay() === 3) ? 1 : 0 },
    { day: 'Kam', present: filteredHistory.some(h => h.check_in?.toDate().getDay() === 4) ? 1 : 0 },
    { day: 'Jum', present: filteredHistory.some(h => h.check_in?.toDate().getDay() === 5) ? 1 : 0 },
    { day: 'Sab', present: filteredHistory.some(h => h.check_in?.toDate().getDay() === 6) ? 1 : 0 },
    { day: 'Min', present: filteredHistory.some(h => h.check_in?.toDate().getDay() === 0) ? 1 : 0 },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 pb-24 sm:pb-8">
      {activeTab === 'home' && (
        <>
          {/* PREMIUM HEADER */}
          <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-400 px-6 pt-14 pb-12 shadow-2xl relative -mx-4 sm:-mx-6 lg:-mx-8 -mt-12 mb-8 rounded-b-[2.5rem]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="h-16 w-16 overflow-hidden rounded-full border-4 border-white/30 bg-card text-card-foreground dark:border-gray-800/10 shadow-xl backdrop-blur-md">
                    {profile.face_image_url ? (
                      <img src={profile.face_image_url} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-full w-full p-3 text-white" />
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 h-4 w-4 rounded-full border-2 border-white bg-green-500 shadow-sm" />
                </div>
                <div className="text-white">
                  <h1 className="text-xl font-black tracking-tight leading-tight">{profile.name}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-white/80 uppercase font-bold tracking-[0.15em]">{tenant?.name || 'SMARTSANTRI'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-2xl h-12 w-12">
                    <Bell className="h-6 w-6" />
                  </Button>
                  {unreadNotifications > 0 && (
                    <span className="absolute top-2 right-2 h-4 w-4 bg-red-500 border-2 border-green-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white">
                      {unreadNotifications}
                    </span>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 rounded-2xl h-12 w-12">
                      <Settings className="h-6 w-6" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-[1.5rem] p-2 shadow-2xl border-gray-100">
                    <DropdownMenuItem onClick={() => signOut(auth)} className="cursor-pointer py-3 rounded-xl text-red-600 focus:text-red-600 focus:bg-red-50">
                      <LogOut className="mr-3 h-4 w-4" />
                      <span className="font-bold">Keluar</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setActiveTab('profile')} className="cursor-pointer py-3 rounded-xl">
                      <User className="mr-3 h-4 w-4" />
                      <span className="font-bold">Profil</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* MAIN CHECK-IN CARD */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative -mt-20 px-4 sm:px-0"
          >
            <Card className="mx-auto w-full max-w-md border-none shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-[2.5rem] overflow-hidden bg-white/80 backdrop-blur-xl">
              <CardContent className="flex flex-col items-center py-10">
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={isCheckedIn ? 'checked-in' : 'not-checked-in'}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    className={`relative flex h-36 w-36 items-center justify-center rounded-full border-[10px] ${isCheckedIn ? 'border-orange-50 bg-orange-100/50 text-orange-600' : 'border-green-50 bg-green-100/50 text-green-600'} transition-all duration-500 shadow-inner mb-8`}
                  >
                    {isCheckedIn ? (
                      <Clock className="h-16 w-16 animate-pulse" />
                    ) : (
                      <motion.div
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                      >
                        <CheckCircle2 className="h-16 w-16" />
                      </motion.div>
                    )}
                  </motion.div>
                </AnimatePresence>

                <div className="text-center space-y-1 mb-8">
                  <h2 className="text-5xl font-black tracking-tighter text-foreground">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </h2>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                    {new Date().toLocaleDateString('id-ID', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </p>
                </div>

                <div className="flex items-center gap-2 bg-muted px-4 py-2 rounded-2xl border border-gray-100">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-bold text-muted-foreground">
                    {isCheckedIn 
                      ? `Check-out: ${tenant?.check_out_time || '16:00'}`
                      : `Check-in: ${tenant?.check_in_time || '07:00'}`
                    }
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ANALYTICS & SUMMARY */}
          <div className="w-full max-w-md mx-auto space-y-6 px-4 sm:px-0 mt-8">
            {/* WEEKLY CHART */}
            <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] overflow-hidden bg-white">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-black uppercase tracking-widest text-gray-400">Kehadiran Mingguan</CardTitle>
                  <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100">7 Hari Terakhir</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <WeeklyChart data={weeklyData} />
              </CardContent>
            </Card>

            {/* GPS & LOCATION STATUS */}
            <Card className={`border-none shadow-xl rounded-[2rem] overflow-hidden transition-all duration-500 ${location && tenant && calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'bg-green-50/50 shadow-green-100/50' : 'bg-red-50/50 shadow-red-100/50'}`}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-2xl ${location ? 'bg-white shadow-sm text-green-600' : 'bg-white shadow-sm text-gray-400'}`}>
                      <MapPin className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Live GPS Status</p>
                      <p className="text-sm font-bold text-gray-900">
                        {location ? `Akurasi: ${location.accuracy.toFixed(1)}m` : 'Mencari lokasi...'}
                      </p>
                    </div>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-10 w-10 rounded-xl bg-white shadow-sm text-gray-400 hover:text-green-600"
                    onClick={() => {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
                        () => toast.error('Gagal memperbarui lokasi')
                      );
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                
                {location && (
                  <div className="relative h-32 w-full rounded-2xl overflow-hidden border border-white shadow-inner mb-4">
                    <div 
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url(https://static-maps.yandex.ru/1.x/?ll=${location.lng},${location.lat}&z=16&l=map&size=450,250&pt=${location.lng},${location.lat},pm2gnm)`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  </div>
                )}

                {location && tenant && (
                  <div className={`w-full py-3 text-center rounded-2xl text-xs font-black uppercase tracking-widest ${calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'bg-green-500 text-white shadow-lg shadow-green-200' : 'bg-red-500 text-white shadow-lg shadow-red-200'}`}>
                    {calculateDistance(location.lat, location.lng, tenant.lat, tenant.lng) <= tenant.radius ? 'Dalam Area Sekolah' : 'Di Luar Area Sekolah'}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* DAILY SUMMARY */}
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                    <LogIn className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Jam Masuk</p>
                </div>
                <p className="text-xl font-black text-gray-900">
                  {lastLog?.check_in ? lastLog.check_in.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </p>
              </Card>
              <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-8 w-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                    <LogOutIcon className="h-4 w-4" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Jam Keluar</p>
                </div>
                <p className="text-xl font-black text-gray-900">
                  {lastLog?.check_out ? lastLog.check_out.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </p>
              </Card>
            </div>
          </div>
        </>
      )}

      {activeTab === 'journal' && tenant?.is_journal_enabled !== false && (
        <div className="w-full max-w-md mx-auto space-y-6 px-4 pt-4 pb-24 sm:px-0">
          {journalView === 'list' && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* HEADER */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h3 className="text-3xl font-black text-gray-900 tracking-tight">Jurnal Harian</h3>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">
                      {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setIsFiltering(!isFiltering)}
                    className={`h-12 w-12 rounded-2xl border border-gray-100 shadow-sm transition-all ${isFiltering ? 'bg-green-50 text-green-600 border-green-100' : 'bg-white text-gray-400'}`}
                  >
                    <Filter className="h-6 w-6" />
                  </Button>
                  <Button 
                    onClick={() => {
                      setNewJournal({ subject: '', class_name: '', time: '', material: '', description: '', is_draft: false });
                      setTempPhoto(null);
                      setJournalView('form');
                    }}
                    className="h-12 w-12 rounded-2xl bg-green-600 hover:bg-green-700 shadow-xl shadow-green-100 flex items-center justify-center text-white transition-all active:scale-95"
                  >
                    <Plus className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              {/* FILTER BAR */}
              <AnimatePresence>
                {isFiltering && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Mapel</Label>
                          <Select onValueChange={(val) => setJournalFilter({...journalFilter, subject: val})}>
                            <SelectTrigger className="h-10 rounded-xl bg-gray-50 border-none text-xs font-bold">
                              <SelectValue placeholder="Semua Mapel" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-gray-100 shadow-xl">
                              <SelectItem value="all">Semua Mapel</SelectItem>
                              {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Status</Label>
                          <Select onValueChange={(val) => setJournalFilter({...journalFilter, status: val})}>
                            <SelectTrigger className="h-10 rounded-xl bg-gray-50 border-none text-xs font-bold">
                              <SelectValue placeholder="Semua Status" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-gray-100 shadow-xl">
                              <SelectItem value="all">Semua Status</SelectItem>
                              <SelectItem value="sent">Terkirim</SelectItem>
                              <SelectItem value="draft">Draft</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* JOURNAL LIST */}
              <div className="space-y-4">
                {journals.filter(j => {
                  const matchSubject = journalFilter.subject === 'all' || j.subject === journalFilter.subject;
                  const matchStatus = journalFilter.status === 'all' || (journalFilter.status === 'draft' ? j.is_draft : !j.is_draft);
                  return matchSubject && matchStatus;
                }).length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-gray-100 bg-gray-50/30 py-20 text-center">
                    <div className="h-20 w-20 rounded-full bg-white shadow-xl shadow-gray-100 flex items-center justify-center mb-6">
                      <BookOpen className="h-10 w-10 text-gray-200" />
                    </div>
                    <p className="text-lg font-black text-gray-900 tracking-tight">Belum ada jurnal hari ini</p>
                    <p className="text-xs text-gray-400 mt-2 max-w-[220px] mx-auto font-medium">Catat kegiatan mengajar Anda untuk dokumentasi yang lebih baik.</p>
                  </div>
                ) : (
                  journals.filter(j => {
                    const matchSubject = journalFilter.subject === 'all' || j.subject === journalFilter.subject;
                    const matchStatus = journalFilter.status === 'all' || (journalFilter.status === 'draft' ? j.is_draft : !j.is_draft);
                    return matchSubject && matchStatus;
                  }).map((journal, index) => (
                    <motion.div 
                      key={journal.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        setSelectedJournal(journal);
                        setJournalView('detail');
                      }}
                      className="group relative overflow-hidden rounded-[2rem] border border-gray-50 bg-white p-4 shadow-xl shadow-gray-100/30 transition-all hover:shadow-2xl hover:shadow-green-100/20 hover:border-green-100 cursor-pointer active:scale-[0.98]"
                    >
                      <div className="flex flex-col gap-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100 rounded-lg text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
                                {journal.class_name}
                              </Badge>
                              <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">
                                {journal.time}
                              </span>
                            </div>
                            <h4 className="text-xl font-black text-gray-900 leading-tight group-hover:text-green-600 transition-colors">
                              {journal.subject}
                            </h4>
                          </div>
                          <Badge className={`rounded-full px-3 py-1 text-[8px] font-black uppercase tracking-[0.15em] border-none shadow-sm ${
                            journal.is_draft ? 'bg-gray-100 text-muted-foreground' : 'bg-green-500 text-white'
                          }`}>
                            {journal.is_draft ? 'Draft' : 'Terkirim'}
                          </Badge>
                        </div>

                        <div className="relative">
                          <p className="text-sm text-gray-500 leading-relaxed line-clamp-2 font-medium">
                            {journal.material}
                          </p>
                        </div>

                        <div className="pt-5 mt-auto border-t border-gray-50 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                              <Calendar className="h-4 w-4" />
                            </div>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              {journal.createdAt?.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <div className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-green-600 group-hover:text-white transition-all shadow-sm">
                            <ChevronRight className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {journalView === 'form' && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setJournalView('list')}
                  className="h-12 w-12 rounded-2xl border border-gray-100 shadow-sm bg-white text-gray-400 hover:text-gray-900"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Jurnal Baru</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Catat aktivitas mengajar</p>
                </div>
              </div>

              <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white overflow-hidden">
                <div className="p-4 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Mata Pelajaran</Label>
                      <div className="relative">
                        <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                        <Select value={newJournal.subject} onValueChange={(val) => setNewJournal({...newJournal, subject: val})}>
                          <SelectTrigger className="h-12 pl-11 rounded-2xl bg-gray-50 border-none focus:ring-green-500">
                            <SelectValue placeholder="Pilih Mapel" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-gray-100 shadow-xl">
                            {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Kelas</Label>
                      <div className="relative">
                        <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                        <Select value={newJournal.class_name} onValueChange={(val) => setNewJournal({...newJournal, class_name: val})}>
                          <SelectTrigger className="h-12 pl-11 rounded-2xl bg-gray-50 border-none focus:ring-green-500">
                            <SelectValue placeholder="Pilih Kelas" />
                          </SelectTrigger>
                          <SelectContent className="rounded-2xl border-gray-100 shadow-xl">
                            {CLASSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Jam Ke</Label>
                    <div className="relative">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
                      <Select value={newJournal.time} onValueChange={(val) => setNewJournal({...newJournal, time: val})}>
                        <SelectTrigger className="h-12 pl-11 rounded-2xl bg-gray-50 border-none focus:ring-green-500">
                          <SelectValue placeholder="Pilih Jam" />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl border-gray-100 shadow-xl">
                          {TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Topik Pembelajaran</Label>
                    <div className="relative">
                      <FileText className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input 
                        className="h-12 pl-11 rounded-2xl bg-gray-50 border-none focus-visible:ring-green-500" 
                        value={newJournal.material} 
                        onChange={e => setNewJournal({...newJournal, material: e.target.value})} 
                        placeholder="Contoh: Dasar Aljabar" 
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Deskripsi Kegiatan</Label>
                    <div className="relative">
                      <Edit className="absolute left-4 top-4 h-4 w-4 text-gray-400 z-10" />
                      <Textarea 
                        className="min-h-[120px] pl-11 rounded-2xl bg-gray-50 border-none focus-visible:ring-green-500 resize-none py-4 pr-4" 
                        value={newJournal.description} 
                        onChange={e => setNewJournal({...newJournal, description: e.target.value})} 
                        placeholder="Tuliskan detail kegiatan belajar mengajar..." 
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Kehadiran Siswa</Label>
                      <Badge variant="outline" className="text-[9px] font-bold text-green-600 border-green-100 bg-green-50">Opsional</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Button 
                        type="button"
                        variant="outline" 
                        className="h-12 rounded-xl border-gray-100 bg-gray-50 text-xs font-bold hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all"
                      >
                        <Check className="mr-2 h-4 w-4" /> Semua Hadir
                      </Button>
                      <Button 
                        type="button"
                        variant="outline" 
                        className="h-12 rounded-xl border-gray-100 bg-gray-50 text-xs font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                      >
                        <XCircle className="mr-2 h-4 w-4" /> Ada Absen
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Foto Kegiatan</Label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="relative h-32 w-full rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:border-green-500 hover:bg-green-50 transition-all overflow-hidden"
                    >
                      {tempPhoto ? (
                        <img src={tempPhoto} alt="Preview" className="h-full w-full object-cover" />
                      ) : (
                        <>
                          <Image className="h-8 w-8 text-gray-300 mb-2" />
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Klik untuk upload</p>
                        </>
                      )}
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={handlePhotoUpload} 
                      />
                    </div>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 flex flex-col gap-3">
                  <Button 
                    onClick={() => handleAddJournal(false)} 
                    disabled={isProcessing} 
                    className="h-14 rounded-2xl bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 font-black uppercase tracking-widest text-white shadow-xl shadow-green-200"
                  >
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Simpan Jurnal'}
                  </Button>
                  <Button 
                    variant="ghost" 
                    onClick={() => handleAddJournal(true)}
                    disabled={isProcessing}
                    className="h-14 rounded-2xl font-bold text-gray-500 hover:bg-gray-100"
                  >
                    Simpan sebagai Draft
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {journalView === 'detail' && selectedJournal && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setJournalView('list')}
                  className="h-12 w-12 rounded-2xl border border-gray-100 shadow-sm bg-white text-gray-400 hover:text-gray-900"
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">Detail Jurnal</h3>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Informasi lengkap</p>
                </div>
              </div>

              <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white overflow-hidden">
                <div className={`p-4 text-white ${selectedJournal.is_draft ? 'bg-gray-500' : 'bg-gradient-to-br from-green-600 to-emerald-500'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <Badge className="bg-white/20 text-white border-none backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">
                      {selectedJournal.is_draft ? 'Draft' : 'Terkirim'}
                    </Badge>
                  </div>
                  <h3 className="text-3xl font-black tracking-tight">{selectedJournal.subject}</h3>
                  <div className="flex items-center gap-3 mt-2 text-white/80 text-xs font-bold uppercase tracking-widest">
                    <span>{selectedJournal.class_name}</span>
                    <div className="h-1 w-1 rounded-full bg-white/40" />
                    <span>{selectedJournal.time}</span>
                  </div>
                </div>
                
                <div className="p-4 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Topik Pembelajaran</Label>
                    <p className="text-lg font-bold text-gray-900 leading-tight">{selectedJournal.material}</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Deskripsi Kegiatan</Label>
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                      <p className="text-sm text-gray-600 leading-relaxed font-medium whitespace-pre-wrap">{selectedJournal.description}</p>
                    </div>
                  </div>

                  {selectedJournal.photo_url && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Foto Kegiatan</Label>
                      <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-gray-100 shadow-lg">
                        <img src={selectedJournal.photo_url} alt="Kegiatan" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-4 pt-4">
                    <div className="flex-1 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                      <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Dibuat Pada</p>
                      <p className="text-xs font-bold text-gray-900">
                        {selectedJournal.createdAt?.toDate().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-gray-50 flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1 h-14 rounded-2xl font-bold text-gray-500 border-gray-200 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all"
                    onClick={() => handleDeleteJournal(selectedJournal.id)}
                  >
                    <Trash2 className="mr-2 h-5 w-5" /> Hapus
                  </Button>
                  <Button 
                    className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest bg-green-600 hover:bg-green-700 shadow-lg shadow-green-100"
                    onClick={() => {
                      setNewJournal({
                        subject: selectedJournal.subject,
                        class_name: selectedJournal.class_name,
                        time: selectedJournal.time,
                        material: selectedJournal.material,
                        description: selectedJournal.description,
                        is_draft: selectedJournal.is_draft || false
                      });
                      setTempPhoto(selectedJournal.photo_url || null);
                      setJournalView('form');
                    }}
                  >
                    <Edit className="mr-2 h-5 w-5" /> Edit
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="w-full max-w-md mx-auto space-y-6 px-4 sm:px-0 pb-24">
          {historyView === 'list' ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 tracking-tight">Riwayat Absensi</h3>
                  <p className="text-xs font-medium text-gray-500 mt-1">
                    {new Date(historyFilterYear, historyFilterMonth).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowHistoryFilter(!showHistoryFilter)}
                    className={`h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${showHistoryFilter ? 'bg-green-100 text-green-600' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                  >
                    <Filter className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={handleExportHistory}
                    className="h-10 w-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Filter Card */}
              <AnimatePresence>
                {showHistoryFilter && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Bulan</Label>
                          <Select value={historyFilterMonth.toString()} onValueChange={(v) => setHistoryFilterMonth(parseInt(v))}>
                            <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {Array.from({ length: 12 }).map((_, i) => (
                                <SelectItem key={i} value={i.toString()} className="rounded-lg">
                                  {new Date(2000, i).toLocaleDateString('id-ID', { month: 'long' })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Tahun</Label>
                          <Select value={historyFilterYear.toString()} onValueChange={(v) => setHistoryFilterYear(parseInt(v))}>
                            <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-none">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              {[2024, 2025, 2026].map((y) => (
                                <SelectItem key={y} value={y.toString()} className="rounded-lg">{y}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Status</Label>
                        <Select value={historyFilterStatus} onValueChange={setHistoryFilterStatus}>
                          <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-none">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="all" className="rounded-lg">Semua Status</SelectItem>
                            <SelectItem value="hadir" className="rounded-lg">Hadir</SelectItem>
                            <SelectItem value="terlambat" className="rounded-lg">Terlambat</SelectItem>
                            <SelectItem value="mencurigakan" className="rounded-lg">Mencurigakan</SelectItem>
                            <SelectItem value="alpha" className="rounded-lg">Tidak Hadir</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[9px] font-black uppercase tracking-widest text-gray-400 ml-1">Cari Tanggal</Label>
                        <div className="relative">
                          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <Input 
                            type="date"
                            className="h-12 pl-10 rounded-xl bg-gray-50 border-none w-full"
                            value={historySearchDate}
                            onChange={(e) => setHistorySearchDate(e.target.value)}
                          />
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Summary Statistics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-3xl bg-white border border-gray-100 p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tepat Waktu</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black text-gray-900 leading-none">{totalHadir}</span>
                    <span className="text-[10px] font-bold text-gray-500 mb-1">HARI</span>
                  </div>
                </div>
                <div className="rounded-3xl bg-white border border-gray-100 p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-orange-500" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Terlambat</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black text-gray-900 leading-none">{totalTerlambat}</span>
                    <span className="text-[10px] font-bold text-gray-500 mb-1">HARI</span>
                  </div>
                </div>
                <div className="rounded-3xl bg-white border border-gray-100 p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-yellow-500" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Mencurigakan</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black text-gray-900 leading-none">{totalMencurigakan}</span>
                    <span className="text-[10px] font-bold text-gray-500 mb-1">HARI</span>
                  </div>
                </div>
                <div className="rounded-3xl bg-white border border-gray-100 p-4 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Alpha</p>
                  </div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-black text-gray-900 leading-none">{totalAlpha}</span>
                    <span className="text-[10px] font-bold text-gray-500 mb-1">HARI</span>
                  </div>
                </div>
                <div className="rounded-3xl bg-white border border-gray-100 p-4 shadow-sm flex flex-col justify-between col-span-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Hari Kerja (s/d Hari Ini)</p>
                    </div>
                    <div className="flex items-end gap-1">
                      <span className="text-2xl font-black text-gray-900 leading-none">{hariKerja}</span>
                      <span className="text-[10px] font-bold text-gray-500">HARI</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual Analytics */}
              <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1">Grafik Kehadiran</p>
                <WeeklyChart data={weeklyData} />
              </Card>

              {/* Daily Attendance List */}
              <div className="space-y-3">
                {filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-gray-200 bg-gray-50/50 py-16 text-center">
                    <div className="h-16 w-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4">
                      <History className="h-8 w-8 text-gray-300" />
                    </div>
                    <p className="text-sm font-bold text-gray-900">Belum ada riwayat absensi</p>
                    <p className="text-xs text-gray-500 mt-1">Data kehadiran Anda akan muncul di sini</p>
                  </div>
                ) : (
                  filteredHistory.map((log, index) => (
                    <motion.div 
                      key={log.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => {
                        setSelectedHistory(log);
                        setHistoryView('detail');
                      }}
                      className="group relative overflow-hidden rounded-[2rem] border border-gray-50 bg-white p-4 shadow-xl shadow-gray-100/30 transition-all hover:shadow-2xl hover:shadow-green-100/20 hover:border-green-100 cursor-pointer active:scale-[0.98]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-2xl bg-gray-50 text-gray-900">
                            <span className="text-xl font-black leading-none">{log.check_in?.toDate().getDate()}</span>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-1">
                              {log.check_in?.toDate().toLocaleDateString('id-ID', { weekday: 'short' })}
                            </span>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1.5">
                              <Badge variant="secondary" className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest border ${
                                log.status === 'valid' ? 'bg-green-50 text-green-700 border-green-100' : 
                                log.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' : 
                                'bg-yellow-50 text-yellow-700 border-yellow-100'
                              }`}>
                                {log.status === 'rejected' ? 'Alpha' : 
                                 log.status === 'suspicious' ? 'Mencurigakan' : 
                                 log.is_late ? 'Terlambat' : 'Hadir'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                                <LogIn className="h-3.5 w-3.5 text-green-500" />
                                {log.check_in?.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs font-bold text-gray-600">
                                <LogOutIcon className="h-3.5 w-3.5 text-orange-500" />
                                {log.check_out ? log.check_out.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          log.status === 'valid' ? 'bg-green-50 text-green-600' : 
                          log.status === 'rejected' ? 'bg-red-50 text-red-600' : 
                          'bg-yellow-50 text-yellow-600'
                        }`}>
                          {log.status === 'valid' ? <CheckCircle2 className="h-5 w-5" /> : 
                           log.status === 'rejected' ? <XCircle className="h-5 w-5" /> : 
                           <AlertTriangle className="h-5 w-5" />}
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          ) : selectedHistory && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setHistoryView('list')}
                  className="h-10 w-10 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight">Detail Absensi</h3>
                  <p className="text-xs font-medium text-gray-500">
                    {selectedHistory.check_in?.toDate().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <Card className="border-none shadow-xl shadow-gray-100/50 rounded-[2rem] bg-white overflow-hidden">
                <div className={`p-4 text-white ${
                  selectedHistory.status === 'valid' ? 'bg-gradient-to-br from-green-600 to-emerald-500' : 
                  selectedHistory.status === 'rejected' ? 'bg-gradient-to-br from-red-600 to-rose-500' : 
                  'bg-gradient-to-br from-yellow-500 to-orange-400'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <Badge className="bg-white/20 text-white border-none backdrop-blur-md px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">
                      {selectedHistory.status === 'rejected' ? 'Alpha' : 
                       selectedHistory.status === 'suspicious' ? 'Mencurigakan' : 
                       selectedHistory.is_late ? 'Terlambat' : 'Hadir'}
                    </Badge>
                    {selectedHistory.status === 'valid' ? <CheckCircle2 className="h-6 w-6 text-white/80" /> : 
                     selectedHistory.status === 'rejected' ? <XCircle className="h-6 w-6 text-white/80" /> : 
                     <AlertTriangle className="h-6 w-6 text-white/80" />}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-1">Jam Masuk</p>
                      <p className="text-2xl font-black">{selectedHistory.check_in?.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div>
                      <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mb-1">Jam Keluar</p>
                      <p className="text-2xl font-black">{selectedHistory.check_out ? selectedHistory.check_out.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Lokasi Absensi</Label>
                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-start gap-3">
                      <div className={`mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        tenant && calculateDistance(selectedHistory.lat, selectedHistory.lng, tenant.lat, tenant.lng) <= tenant.radius
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-red-100 text-red-600'
                      }`}>
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">
                          {tenant && calculateDistance(selectedHistory.lat, selectedHistory.lng, tenant.lat, tenant.lng) <= tenant.radius
                            ? 'Dalam Area Kantor'
                            : 'Di Luar Area Kantor'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">Lat: {selectedHistory.lat.toFixed(6)}, Lng: {selectedHistory.lng.toFixed(6)}</p>
                      </div>
                    </div>
                  </div>

                  {selectedHistory.photo_url && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Foto Selfie</Label>
                      <div className="relative aspect-square w-full max-w-[200px] rounded-2xl overflow-hidden border border-gray-100 shadow-lg mx-auto">
                        <img src={selectedHistory.photo_url} alt="Selfie Absensi" className="h-full w-full object-cover" />
                      </div>
                    </div>
                  )}

                  {selectedHistory.rejection_reason && (
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Keterangan</Label>
                      <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
                        <p className="text-sm text-red-800 font-medium">{selectedHistory.rejection_reason}</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="w-full max-w-md mx-auto space-y-6 px-4 sm:px-0 pb-24 pt-4">
          {/* PROFILE HEADER CARD */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[24px] bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100"
          >
            <div className="relative h-32 bg-gradient-to-br from-green-400 to-green-600">
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full">
                  <div className="h-2 w-2 rounded-full bg-green-300 animate-pulse" />
                  <span className="text-[10px] font-bold text-white uppercase tracking-widest">Online</span>
                </div>
              </div>
            </div>
            
            <div className="relative px-6 pb-6">
              <div className="flex justify-between items-end -mt-12 mb-4">
                <div className="relative group">
                  <div className="h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-white shadow-xl">
                    {profile.face_image_url ? (
                      <img src={profile.face_image_url} alt="Profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-green-50">
                        <User className="h-10 w-10 text-green-300" />
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={handleStartProfilePhotoCapture}
                    className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-600 shadow-md transition-all hover:bg-gray-50 border border-gray-100"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                </div>
                <Button onClick={openEditProfile} variant="outline" size="sm" className="h-9 rounded-xl font-semibold text-gray-600 border-gray-200 hover:bg-gray-50">
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit Profil
                </Button>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900">{profile.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-100 border-none font-semibold">
                    {profile.role === 'USER' ? 'Siswa / Guru' : 'Admin'}
                  </Badge>
                  <span className="text-sm text-gray-500 font-medium">{tenant?.name || 'Belum ada sekolah'}</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ACTIVITY SUMMARY */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-3 gap-3"
          >
            <div className="bg-white rounded-[20px] p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col items-center gap-1">
              <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600 mb-1">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="text-xl font-bold text-gray-900 leading-none">{totalHadir}</p>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Hadir</p>
            </div>
            <div className="bg-white rounded-[20px] p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col items-center gap-1">
              <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 mb-1">
                <Clock className="h-5 w-5" />
              </div>
              <p className="text-xl font-bold text-gray-900 leading-none">{totalTerlambat}</p>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Terlambat</p>
            </div>
            <div className="bg-white rounded-[20px] p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 flex flex-col items-center gap-1">
              <div className="h-10 w-10 rounded-xl bg-yellow-50 flex items-center justify-center text-yellow-600 mb-1">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <p className="text-xl font-bold text-gray-900 leading-none">{totalMencurigakan}</p>
              <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">Mencurigakan</p>
            </div>
          </motion.div>

          {/* KALENDER ABSENSI */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-[24px] p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-900">Kalender Kehadiran</h3>
              <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
                {format(new Date(), 'MMMM yyyy', { locale: id })}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(day => (
                <div key={day} className="text-[10px] font-bold text-gray-400 uppercase">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(() => {
                const today = new Date();
                const start = startOfWeek(startOfMonth(today));
                const end = endOfWeek(endOfMonth(today));
                const days = eachDayOfInterval({ start, end });

                return days.map((day, idx) => {
                  const isCurrentMonth = isSameMonth(day, today);
                  const isTodayDate = isToday(day);
                  
                  // Find log for this day
                  const log = history.find(l => l.check_in && isSameDay(l.check_in.toDate(), day));
                  
                  let statusColor = 'bg-gray-50 text-gray-400';
                  let dotColor = '';
                  
                  if (log) {
                    if (log.status === 'valid') {
                      if (log.is_late) {
                        statusColor = 'bg-orange-50 text-orange-700 border border-orange-200';
                        dotColor = 'bg-orange-500';
                      } else {
                        statusColor = 'bg-green-50 text-green-700 border border-green-200';
                        dotColor = 'bg-green-500';
                      }
                    } else if (log.status === 'suspicious') {
                      statusColor = 'bg-yellow-50 text-yellow-700 border border-yellow-200';
                      dotColor = 'bg-yellow-500';
                    } else if (log.status === 'rejected') {
                      statusColor = 'bg-red-50 text-red-700 border border-red-200';
                      dotColor = 'bg-red-500';
                    }
                  } else if (isCurrentMonth && day < today) {
                     // Check if it's a holiday or weekend
                     const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                     if (isWeekend) {
                       statusColor = 'bg-gray-100 text-gray-400';
                     } else {
                       statusColor = 'bg-red-50 text-red-700 border border-red-100 opacity-50'; // Alpha
                     }
                  }

                  if (!isCurrentMonth) {
                    statusColor = 'opacity-0 pointer-events-none';
                  }

                  return (
                    <div 
                      key={idx} 
                      className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-xs font-medium ${statusColor} ${isTodayDate ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}
                    >
                      {isCurrentMonth && format(day, 'd')}
                      {dotColor && <div className={`absolute bottom-1 w-1 h-1 rounded-full ${dotColor}`} />}
                    </div>
                  );
                });
              })()}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-[10px] font-medium text-gray-500">
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div>Hadir</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div>Terlambat</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500"></div>Mencurigakan</div>
              <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div>Alpha</div>
            </div>
          </motion.div>

          {/* INFORMASI PRIBADI */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden"
          >
            <div 
              className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center cursor-pointer"
              onClick={() => setShowPersonalInfo(!showPersonalInfo)}
            >
              <h3 className="text-sm font-bold text-gray-900">Informasi Pribadi</h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                {showPersonalInfo ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
              </Button>
            </div>
            <AnimatePresence>
              {showPersonalInfo && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2">
                    <div className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 font-medium">Nama Lengkap</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{profile.name}</p>
                      </div>
                    </div>
                    <div className="h-[1px] bg-gray-50 mx-4" />
                    <div className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 font-medium">Email</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{profile.email}</p>
                      </div>
                    </div>
                    <div className="h-[1px] bg-gray-50 mx-4" />
                    <div className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                        <Phone className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 font-medium">Nomor HP</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{profile.phone || '-'}</p>
                      </div>
                    </div>
                    <div className="h-[1px] bg-gray-50 mx-4" />
                    <div className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 font-medium">NIP / NIS</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{profile.nip_nis || '-'}</p>
                      </div>
                    </div>
                    <div className="h-[1px] bg-gray-50 mx-4" />
                    <div className="flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 font-medium">Alamat</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{profile.address || '-'}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* PENGATURAN AKUN */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 overflow-hidden"
          >
            <div 
              className="p-5 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center cursor-pointer"
              onClick={() => setShowAccountSettings(!showAccountSettings)}
            >
              <h3 className="text-sm font-bold text-gray-900">Pengaturan Akun</h3>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                {showAccountSettings ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
              </Button>
            </div>
            <AnimatePresence>
              {showAccountSettings && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-2">
                    <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
                      <DialogContent className="sm:max-w-md rounded-[2rem] p-8">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold tracking-tight">Edit Profil</DialogTitle>
                    <p className="text-sm text-gray-500">Perbarui informasi pribadi Anda.</p>
                  </DialogHeader>
                  <div className="grid gap-6 py-6">
                    <div className="grid gap-2">
                      <Label htmlFor="edit-name" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nama Lengkap</Label>
                      <Input 
                        id="edit-name" 
                        className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500"
                        value={editProfileData.name} 
                        onChange={e => setEditProfileData({...editProfileData, name: e.target.value})} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-phone" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Nomor HP</Label>
                      <Input 
                        id="edit-phone" 
                        className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500"
                        value={editProfileData.phone} 
                        onChange={e => setEditProfileData({...editProfileData, phone: e.target.value})} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-nip" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">NIP / NIS</Label>
                      <Input 
                        id="edit-nip" 
                        className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500"
                        value={editProfileData.nip_nis} 
                        onChange={e => setEditProfileData({...editProfileData, nip_nis: e.target.value})} 
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="edit-address" className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Alamat</Label>
                      <Input 
                        id="edit-address" 
                        className="h-12 rounded-xl bg-gray-50 border-none focus-visible:ring-green-500"
                        value={editProfileData.address} 
                        onChange={e => setEditProfileData({...editProfileData, address: e.target.value})} 
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-3 sm:gap-0">
                    <Button variant="ghost" className="h-12 rounded-xl font-bold text-gray-500" onClick={() => setIsEditProfileOpen(false)}>Batal</Button>
                    <Button onClick={handleSaveProfile} disabled={isUpdatingProfile} className="h-12 rounded-xl bg-green-600 hover:bg-green-700 font-bold px-8">
                      {isUpdatingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Simpan
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <Dialog open={isChangingPassword} onOpenChange={setIsChangingPassword}>
                <DialogTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600">
                        <Lock className="h-5 w-5" />
                      </div>
                      <span className="text-sm font-semibold text-gray-900">Ubah Password</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </button>
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

              <button className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600">
                    <Bell className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Pengaturan Notifikasi</span>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </button>

              <button className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600">
                    <Globe className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Bahasa</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium">Indonesia</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </button>

              <button onClick={toggleTheme} className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-600">
                    <Moon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Tema</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-medium capitalize">{theme}</span>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </div>
              </button>
            </div>
            </motion.div>
            )}
            </AnimatePresence>
          </motion.div>

          {/* FACE REGISTRATION (if not registered) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-orange-50 rounded-[24px] p-5 border border-orange-100 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 shrink-0">
                <Scan className="h-6 w-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">
                  {profile.face_descriptor ? 'Wajah Sudah Terdaftar' : 'Wajah Belum Terdaftar'}
                </h4>
                <p className="text-xs text-gray-600 mt-0.5">
                  {profile.face_descriptor ? 'Klik untuk mendaftarkan ulang wajah' : 'Daftarkan wajah untuk absensi'}
                </p>
              </div>
            </div>
            <Button size="sm" className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold" onClick={handleStartFaceRegistration}>
              {profile.face_descriptor ? 'Ulangi' : 'Daftar'}
            </Button>
          </motion.div>

          {/* SECURITY */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="pt-4"
          >
            <Button 
              variant="outline" 
              className="w-full h-14 rounded-[20px] border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-bold text-base transition-colors"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5 mr-2" />
              Keluar Akun
            </Button>
          </motion.div>
        </div>
      )}

      {/* Bottom Navigation Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white/80 backdrop-blur-2xl pb-safe sm:hidden rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="flex justify-around items-center px-2 py-2 relative h-20">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all ${activeTab === 'home' ? 'text-green-600 bg-green-50' : 'text-gray-400'}`}
          >
            <Home className="h-6 w-6" />
            <span className="text-[8px] font-black mt-1 uppercase tracking-widest">Home</span>
          </button>
          
          <button 
            onClick={() => {
              if (tenant?.is_journal_enabled === false) {
                toast.error('Fitur Jurnal Guru sedang dinonaktifkan oleh Admin');
              } else {
                setActiveTab('journal');
              }
            }}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all ${activeTab === 'journal' ? 'text-green-600 bg-green-50' : 'text-gray-400'} ${tenant?.is_journal_enabled === false ? 'opacity-50' : ''}`}
          >
            <BookOpen className="h-6 w-6" />
            <span className="text-[8px] font-black mt-1 uppercase tracking-widest">Jurnal</span>
          </button>

          {/* Central Floating Button */}
          <div className="relative -top-8">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.9 }}
              onClick={isCheckedIn ? handleCheckOut : handleCheckIn}
              disabled={isProcessing || !location}
              className={`flex h-20 w-20 items-center justify-center rounded-full shadow-[0_15px_30px_rgba(34,197,94,0.3)] transition-all border-8 border-white ${
                isCheckedIn ? 'bg-orange-500 shadow-orange-200' : 'bg-green-500 shadow-green-200'
              } ${isProcessing || !location ? 'opacity-50 grayscale' : ''}`}
            >
              {isProcessing ? (
                <Loader2 className="h-10 w-10 animate-spin text-white" />
              ) : isCheckedIn ? (
                <LogOut className="h-10 w-10 text-white" />
              ) : (
                <Camera className="h-10 w-10 text-white" />
              )}
            </motion.button>
          </div>

          <button 
            onClick={() => setActiveTab('history')}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all ${activeTab === 'history' ? 'text-green-600 bg-green-50' : 'text-gray-400'}`}
          >
            <History className="h-6 w-6" />
            <span className="text-[8px] font-black mt-1 uppercase tracking-widest">Riwayat</span>
          </button>
          <button 
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all ${activeTab === 'profile' ? 'text-green-600 bg-green-50' : 'text-gray-400'}`}
          >
            <User className="h-6 w-6" />
            <span className="text-[8px] font-black mt-1 uppercase tracking-widest">Profil</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isCameraOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl"
          >
            <div className="w-full max-w-md overflow-hidden rounded-[3rem] bg-white shadow-2xl">
              <div className="p-8 text-center space-y-2">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Verifikasi Wajah</h2>
                <div className="flex items-center justify-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${faceStatus === 'detected' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {faceStatus === 'detected' ? 'Wajah Terdeteksi' : 'Mencari Wajah...'}
                  </p>
                </div>
              </div>
              <div className="relative aspect-square w-full bg-black overflow-hidden">
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover scale-x-[-1]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`h-64 w-64 rounded-full border-4 ${faceStatus === 'detected' ? 'border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.5)]' : 'border-white/30'} transition-all duration-500 shadow-[0_0_0_1000px_rgba(0,0,0,0.6)]`} />
                  
                  {/* SCANNING ANIMATION */}
                  <motion.div 
                    animate={{ top: ['20%', '80%', '20%'] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute left-1/2 -translate-x-1/2 w-64 h-1 bg-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.8)] z-10"
                  />
                </div>
              </div>
              <div className="flex gap-4 p-8">
                <Button variant="outline" className="flex-1 h-14 rounded-2xl font-bold text-gray-500 border-gray-100" onClick={() => {
                  setIsCameraOpen(false);
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach(track => track.stop());
                }}>Batal</Button>
                <Button 
                  className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200" 
                  onClick={cameraMode === 'check-in' ? processCheckIn : processCheckOut} 
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verifikasi'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRegisteringFace && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl"
          >
            <div className="w-full max-w-md overflow-hidden rounded-[3rem] bg-white shadow-2xl">
              <div className="p-8 text-center space-y-2">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Daftarkan Wajah</h2>
                <div className="flex items-center justify-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${faceStatus === 'detected' ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                    {faceStatus === 'detected' ? 'Wajah Terdeteksi' : 'Mencari Wajah...'}
                  </p>
                </div>
              </div>
              <div className="relative aspect-square w-full bg-black overflow-hidden">
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover scale-x-[-1]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className={`h-64 w-64 rounded-full border-4 ${faceStatus === 'detected' ? 'border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.5)]' : 'border-blue-500 shadow-[0_0_50px_rgba(59,130,246,0.3)]'} transition-all duration-500 shadow-[0_0_0_1000px_rgba(0,0,0,0.6)]`} />
                </div>
              </div>
              <div className="flex gap-4 p-8">
                <Button variant="outline" className="flex-1 h-14 rounded-2xl font-bold text-gray-500 border-gray-100" onClick={() => {
                  setIsRegisteringFace(false);
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach(track => track.stop());
                }}>Batal</Button>
                <Button 
                  className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200" 
                  onClick={processFaceRegistration} 
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Simpan Wajah'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProfileCameraOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl"
          >
            <div className="w-full max-w-md overflow-hidden rounded-[3rem] bg-white shadow-2xl">
              <div className="p-8 text-center space-y-2">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Ambil Foto Profil</h2>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Ambil foto baru untuk profil Anda</p>
              </div>
              <div className="relative aspect-square w-full bg-black overflow-hidden">
                <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover scale-x-[-1]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-64 w-64 rounded-full border-4 border-green-500 shadow-[0_0_50px_rgba(34,197,94,0.3)] shadow-[0_0_0_1000px_rgba(0,0,0,0.6)]" />
                </div>
              </div>
              <div className="flex gap-4 p-8">
                <Button variant="outline" className="flex-1 h-14 rounded-2xl font-bold text-gray-500 border-gray-100" onClick={() => {
                  setIsProfileCameraOpen(false);
                  const stream = videoRef.current?.srcObject as MediaStream;
                  stream?.getTracks().forEach(track => track.stop());
                }}>Batal</Button>
                <Button 
                  className="flex-1 h-14 rounded-2xl font-black uppercase tracking-widest bg-green-600 hover:bg-green-700 shadow-lg shadow-green-200" 
                  onClick={processProfilePhotoCapture} 
                  disabled={isProcessing}
                >
                  {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Ambil Foto'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
