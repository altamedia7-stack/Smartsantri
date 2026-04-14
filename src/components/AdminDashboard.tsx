import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp, query, where, orderBy, getDocs } from 'firebase/firestore';
import { UserProfile, AttendanceRecord, Tenant, Journal, Holiday, Announcement, Student, Schedule } from '../types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Users, Calendar, MapPin, Download, Camera, Loader2, Trash2, ShieldCheck, UserPlus, Check, X, Eye, EyeOff, Settings, ChevronLeft, ChevronRight, FileText, Clock, Building, Upload, Share } from 'lucide-react';
import { toast } from 'sonner';
import XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getFaceDescriptor, loadFaceModels } from '../lib/attendance';
import { createAuthUser } from '../lib/authUtils';
import { handleFirestoreError, OperationType } from '../lib/errorUtils';

export function AdminDashboard({ profile }: { profile: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AttendanceRecord[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newHoliday, setNewHoliday] = useState({ 
    date: '', 
    day: -1, 
    user_id: 'all', 
    name: '', 
    type: 'date' as 'date' | 'day' 
  });
  const [isAddingHoliday, setIsAddingHoliday] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isFaceRegOpen, setIsFaceRegOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [isDeleteUserOpen, setIsDeleteUserOpen] = useState(false);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [selectedLog, setSelectedLog] = useState<AttendanceRecord | null>(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'USER' as const });
  const [showPassword, setShowPassword] = useState(false);
  const [newRoleSelection, setNewRoleSelection] = useState<'ADMIN' | 'USER'>('USER');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [isSavingWorkHours, setIsSavingWorkHours] = useState(false);
  const [isLogDetailsOpen, setIsLogDetailsOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [exportUserId, setExportUserId] = useState<string>('all');
  const [isExcelExportDialogOpen, setIsExcelExportDialogOpen] = useState(false);
  const [isPDFExportDialogOpen, setIsPDFExportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    scope: 'all', // 'current' | 'all'
    style: 'employee', // 'default' | 'employee' | 'date'
    pageWise: true,
    includeStudentAttendance: false,
    includeGrades: false
  });
  const [pdfExportOptions, setPdfExportOptions] = useState({
    scope: 'all',
    style: 'default', // 'default' | 'employee'
    includeSummary: true,
    includeStudentAttendance: false,
    includeGrades: false
  });
  const [tenantSettings, setTenantSettings] = useState({
    name: '',
    check_in_time: '07:00',
    check_in_end_time: '09:00',
    check_out_time: '16:00',
    check_out_end_time: '18:00',
    off_days: [] as number[],
    is_journal_enabled: true
  });
  
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDayDetailsOpen, setIsDayDetailsOpen] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [showAllLogs, setShowAllLogs] = useState(false);
  const [showAllJournals, setShowAllJournals] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [studentAttendance, setStudentAttendance] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [isAddScheduleOpen, setIsAddScheduleOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({ name: '', nis: '', class_name: '' });
  const [newSchedule, setNewSchedule] = useState({ 
    user_id: '', 
    subject: '', 
    class_name: '', 
    day: 1, 
    start_time: '07:00', 
    end_time: '09:00' 
  });

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));

  const getAttendanceStatsForDate = (date: Date) => {
    const dateString = date.toISOString().split('T')[0];
    const dayOfWeek = date.getDay();
    const logsForDay = logs.filter(log => log.check_in?.toDate().toDateString() === date.toDateString());
    
    const presentUserIds = new Set(logsForDay.map(log => log.user_id));
    const presentCount = presentUserIds.size;
    
    // Users who are NOT on holiday (global or personal)
    const activeUsers = users.filter(user => {
      // Check if user has a personal holiday on this date or day
      const hasPersonalHoliday = holidays.some(h => 
        h.user_id === user.id && (h.date === dateString || h.day === dayOfWeek)
      );
      // Check if it's a global holiday
      const hasGlobalHoliday = holidays.some(h => 
        !h.user_id && (h.date === dateString || h.day === dayOfWeek)
      );
      // Check if it's a weekly off day
      const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);
      
      return !hasPersonalHoliday && !hasGlobalHoliday && !isWeeklyOff;
    });

    const absentCount = Math.max(0, activeUsers.length - presentCount);
    
    return { presentCount, absentCount, logsForDay };
  };
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    if (!profile.tenant_id) return;

    // Fetch Tenant Info
    const unsubTenant = onSnapshot(doc(db, 'tenants', profile.tenant_id), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Tenant;
        console.log("AdminDashboard: Loaded Tenant Data:", {
          id: docSnap.id,
          name: data.name
        });
        setTenant({ id: docSnap.id, ...data });
        setTenantSettings({
          name: data.name || '',
          check_in_time: data.check_in_time || '07:00',
          check_in_end_time: data.check_in_end_time || '09:00',
          check_out_time: data.check_out_time || '16:00',
          check_out_end_time: data.check_out_end_time || '18:00',
          off_days: data.off_days || [],
          is_journal_enabled: data.is_journal_enabled ?? true
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'tenants');
    });

    // Fetch Users
    const usersQuery = query(collection(db, 'users'), where('tenant_id', '==', profile.tenant_id));
    const unsubUsers = onSnapshot(usersQuery, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    // Fetch Logs
    const logsQuery = query(
      collection(db, 'attendance'), 
      where('tenant_id', '==', profile.tenant_id),
      orderBy('check_in', 'desc')
    );
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'attendance');
    });

    // Fetch Journals
    const journalsQuery = query(
      collection(db, 'journals'),
      where('tenant_id', '==', profile.tenant_id),
      orderBy('createdAt', 'desc')
    );
    const unsubJournals = onSnapshot(journalsQuery, (snapshot) => {
      setJournals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Journal)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'journals');
    });

    // Fetch Holidays
    const holidaysQuery = query(
      collection(db, 'holidays'),
      where('tenant_id', '==', profile.tenant_id)
    );
    const unsubHolidays = onSnapshot(holidaysQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Holiday));
      // Sort manually since we can't orderBy a field that might be missing in some docs
      const sortedData = [...data].sort((a, b) => {
        if (a.date && b.date) return a.date.localeCompare(b.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return (a.day || 0) - (b.day || 0);
      });
      setHolidays(sortedData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'holidays');
    });

    // Fetch Announcements
    const announcementsQuery = query(
      collection(db, 'announcements'),
      where('tenant_id', '==', profile.tenant_id),
      orderBy('createdAt', 'desc')
    );
    const unsubAnnouncements = onSnapshot(announcementsQuery, (snapshot) => {
      setAnnouncements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Announcement)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'announcements');
    });

    // Fetch Students
    const studentsQuery = query(
      collection(db, 'students'),
      where('tenant_id', '==', profile.tenant_id),
      orderBy('class_name', 'asc'),
      orderBy('name', 'asc')
    );
    const unsubStudents = onSnapshot(studentsQuery, (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'students');
    });

    // Fetch Schedules
    const schedulesQuery = query(
      collection(db, 'schedules'),
      where('tenant_id', '==', profile.tenant_id),
      orderBy('day', 'asc'),
      orderBy('start_time', 'asc')
    );
    const unsubSchedules = onSnapshot(schedulesQuery, (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'schedules');
    });

    // Fetch Student Attendance
    const studentAttendanceQuery = query(
      collection(db, 'student_attendance'),
      where('tenant_id', '==', profile.tenant_id)
    );
    const unsubStudentAttendance = onSnapshot(studentAttendanceQuery, (snapshot) => {
      setStudentAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'student_attendance');
    });

    // Fetch Grades
    const gradesQuery = query(
      collection(db, 'grades'),
      where('tenant_id', '==', profile.tenant_id)
    );
    const unsubGrades = onSnapshot(gradesQuery, (snapshot) => {
      setGrades(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'grades');
    });

    return () => {
      unsubTenant();
      unsubUsers();
      unsubLogs();
      unsubJournals();
      unsubHolidays();
      unsubAnnouncements();
      unsubStudents();
      unsubSchedules();
      unsubStudentAttendance();
      unsubGrades();
    };
  }, [profile.tenant_id]);

  const handleAddStudent = async () => {
    if (!newStudent.name || !newStudent.class_name) {
      toast.error('Nama dan Kelas wajib diisi');
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'students'), {
        ...newStudent,
        tenant_id: profile.tenant_id,
        createdAt: serverTimestamp()
      });
      setIsAddStudentOpen(false);
      setNewStudent({ name: '', nis: '', class_name: '' });
      toast.success('Siswa berhasil ditambahkan');
    } catch (error) {
      toast.error('Gagal menambahkan siswa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSchedule = async () => {
    if (!newSchedule.user_id || !newSchedule.subject || !newSchedule.class_name) {
      toast.error('Semua kolom wajib diisi');
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'schedules'), {
        ...newSchedule,
        tenant_id: profile.tenant_id,
        createdAt: serverTimestamp()
      });
      setIsAddScheduleOpen(false);
      setNewSchedule({ 
        user_id: '', 
        subject: '', 
        class_name: '', 
        day: 1, 
        start_time: '07:00', 
        end_time: '09:00' 
      });
      toast.success('Jadwal berhasil ditambahkan');
    } catch (error) {
      toast.error('Gagal menambahkan jadwal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deleteStudent = async (id: string) => {
    if (!confirm('Hapus siswa ini?')) return;
    try {
      await deleteDoc(doc(db, 'students', id));
      toast.success('Siswa dihapus');
    } catch (error) {
      toast.error('Gagal menghapus siswa');
    }
  };

  const deleteSchedule = async (id: string) => {
    if (!confirm('Hapus jadwal ini?')) return;
    try {
      await deleteDoc(doc(db, 'schedules', id));
      toast.success('Jadwal dihapus');
    } catch (error) {
      toast.error('Gagal menghapus jadwal');
    }
  };

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error('Harap isi semua kolom termasuk kata sandi');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('Kata sandi minimal 6 karakter');
      return;
    }

    setIsSubmitting(true);
    try {
      // Allow username by appending a default domain if no @ is present
      const userEmail = newUser.email.includes('@') ? newUser.email : `${newUser.email}@attendance.local`;

      // 1. Create Auth User
      const uid = await createAuthUser(userEmail, newUser.password);

      // 2. Create Firestore Profile
      await setDoc(doc(db, 'users', uid), {
        name: newUser.name,
        email: userEmail,
        role: newUser.role,
        tenant_id: profile.tenant_id,
        createdAt: serverTimestamp()
      });

      setIsAddUserOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'USER' });
      toast.success('Pengguna berhasil ditambahkan');
    } catch (error: any) {
      console.error(error);
      let errorMessage = error.message || 'Error tidak diketahui';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Username atau email ini sudah digunakan. Silakan gunakan yang lain.';
      }
      toast.error('Gagal menambahkan pengguna: ' + errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const downloadTemplate = () => {
    const template = [
      { 'Nama Lengkap': 'Budi Santoso', 'Email/Username': 'budi123', 'Peran (USER/ADMIN)': 'USER' },
      { 'Nama Lengkap': 'Siti Aminah', 'Email/Username': 'siti@gmail.com', 'Peran (USER/ADMIN)': 'USER' }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Tambah_Karyawan.xlsx');
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingBulk(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length === 0) {
          toast.error('File kosong atau format tidak sesuai');
          setIsProcessingBulk(false);
          return;
        }

        setBulkProgress({ current: 0, total: data.length });
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const name = row['Nama Lengkap'];
          const emailInput = row['Email/Username'];
          const role = (row['Peran (USER/ADMIN)'] || 'USER').toString().toUpperCase() === 'ADMIN' ? 'ADMIN' : 'USER';
          
          if (!name || !emailInput) {
            failCount++;
            continue;
          }

          try {
            const userEmail = emailInput.toString().includes('@') ? emailInput.toString() : `${emailInput}@attendance.local`;
            const password = 'password123'; // Default password for bulk upload

            const uid = await createAuthUser(userEmail, password);
            await setDoc(doc(db, 'users', uid), {
              name: name.toString(),
              email: userEmail,
              role,
              tenant_id: profile.tenant_id,
              createdAt: serverTimestamp()
            });
            successCount++;
          } catch (err) {
            console.error(`Gagal menambahkan ${name}:`, err);
            failCount++;
          }
          setBulkProgress(prev => ({ ...prev, current: i + 1 }));
        }

        toast.success(`Selesai! ${successCount} berhasil, ${failCount} gagal.`);
        setIsBulkUploadOpen(false);
      } catch (error) {
        console.error(error);
        toast.error('Gagal memproses file Excel');
      } finally {
        setIsProcessingBulk(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const startFaceCapture = async (user: UserProfile) => {
    setSelectedUser(user);
    setIsFaceRegOpen(true);
    await loadFaceModels();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      toast.error('Tidak dapat mengakses kamera');
    }
  };

  const captureFace = async () => {
    if (!videoRef.current || !selectedUser) return;
    setIsCapturing(true);
    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (descriptor) {
        // Capture image
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }
        const imageUrl = canvas.toDataURL('image/jpeg', 0.8);

        await updateDoc(doc(db, 'users', selectedUser.id), {
          face_descriptor: Array.from(descriptor),
          face_image_url: imageUrl
        });
        toast.success('Wajah berhasil didaftarkan');
        setIsFaceRegOpen(false);
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      } else {
        toast.error('Wajah tidak terdeteksi. Coba lagi.');
      }
    } catch (error) {
      toast.error('Pendaftaran wajah gagal');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleUpdateRole = async () => {
    if (!selectedUser) return;
    try {
      await updateDoc(doc(db, 'users', selectedUser.id), {
        role: newRoleSelection
      });
      toast.success('Peran pengguna berhasil diperbarui');
      setIsEditRoleOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast.error('Gagal memperbarui peran pengguna');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    try {
      await deleteDoc(doc(db, 'users', selectedUser.id));
      toast.success('Pengguna berhasil dihapus');
      setIsDeleteUserOpen(false);
      setSelectedUser(null);
    } catch (error) {
      toast.error('Gagal menghapus pengguna');
    }
  };

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();
    const startDate = new Date(exportStartDate);
    const endDate = new Date(exportEndDate);
    
    // Filter logs based on date range and user
    const filteredLogs = logs.filter(log => {
      if (!log.check_in) return false;
      const logDate = log.check_in.toDate();
      const start = new Date(exportStartDate);
      const end = new Date(exportEndDate);
      end.setHours(23, 59, 59, 999);
      
      const dateInRange = logDate >= start && logDate <= end;
      const userMatches = exportUserId === 'all' || log.user_id === exportUserId;
      
      return dateInRange && userMatches;
    });

    const headerStyle = {
      fill: { fgColor: { rgb: "4F81BD" } },
      font: { color: { rgb: "FFFFFF" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" }
      }
    };

    const holidayStyle = {
      fill: { fgColor: { rgb: "FFC7CE" } },
      font: { color: { rgb: "9C0006" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" }
      }
    };

    const normalStyle = {
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" }
      }
    };

    const getReportHeader = (title: string, email: string) => [
      [`Laporan Kehadiran: ${title}`],
      [`Organisasi: ${tenant?.name || '-'}`],
      [`Email: ${email}`],
      [`Periode: ${exportStartDate} s/d ${exportEndDate}`],
      [`Dicetak pada: ${new Date().toLocaleString('id-ID')}`],
      []
    ];

    if (exportOptions.style === 'default') {
      const targetUsers = exportUserId === 'all' ? users : users.filter(u => u.id === exportUserId);
      const allData: any[] = [];
      const holidayRows: number[] = [];
      let currentRow = 7;

      targetUsers.forEach(user => {
        const userLogs = filteredLogs.filter(log => log.user_id === user.id);
        let currentDate = new Date(startDate);

        while (currentDate <= endDate) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayOfWeek = currentDate.getDay();
          const log = userLogs.find(l => l.check_in?.toDate().toISOString().split('T')[0] === dateStr);
          
          const globalHoliday = holidays.find(h => !h.user_id && (h.date === dateStr || h.day === dayOfWeek));
          const userHoliday = holidays.find(h => h.user_id === user.id && (h.date === dateStr || h.day === dayOfWeek));
          const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);
          const holiday = globalHoliday || userHoliday;

          if (holiday || isWeeklyOff) holidayRows.push(currentRow);

          allData.push({
            'Nama Karyawan': user.name,
            'Tanggal': currentDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
            'Clock In': log?.check_in?.toDate ? log.check_in.toDate().toLocaleTimeString('id-ID') : '-',
            'Clock Out': log?.check_out?.toDate ? log.check_out.toDate().toLocaleTimeString('id-ID') : '-',
            'Status': log ? (log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan') : (holiday || isWeeklyOff ? 'LIBUR' : 'ABSEN'),
            'Keterangan': log?.rejection_reason || holiday?.name || (isWeeklyOff ? 'Libur Mingguan' : '-')
          });
          
          currentDate.setDate(currentDate.getDate() + 1);
          currentRow++;
        }
      });

      const headerInfo = getReportHeader(
        exportUserId === 'all' ? 'Semua Karyawan' : users.find(u => u.id === exportUserId)?.name || 'User',
        exportUserId === 'all' ? '-' : users.find(u => u.id === exportUserId)?.email || '-'
      );
      const ws = XLSX.utils.aoa_to_sheet(headerInfo);
      XLSX.utils.sheet_add_json(ws, allData, { origin: "A7" });
      
      // Apply styles
      const range = XLSX.utils.decode_range(ws['!ref']!);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (!cell) continue;
          if (R < 6) continue;
          if (R === 6) cell.s = headerStyle;
          else if (holidayRows.includes(R)) cell.s = holidayStyle;
          else cell.s = normalStyle;
        }
      }

      XLSX.utils.book_append_sheet(workbook, ws, "Data Absensi");
    } else if (exportOptions.style === 'employee') {
      const targetUsers = exportUserId === 'all' ? users : users.filter(u => u.id === exportUserId);

      // Summary Sheet
      const summaryData = targetUsers.map((user, index) => {
        const userLogs = filteredLogs.filter(log => log.user_id === user.id);
        return {
          'No': index + 1,
          'Nama Karyawan': user.name,
          'Email': user.email,
          'Total Kehadiran': userLogs.length,
          'Status Terakhir': userLogs.length > 0 ? (userLogs[0].status === 'valid' ? 'Hadir' : 'Ditolak') : 'Tidak Ada Data'
        };
      });
      const summaryHeader = getReportHeader("Ringkasan Karyawan", "-");
      const summaryWS = XLSX.utils.aoa_to_sheet(summaryHeader);
      XLSX.utils.sheet_add_json(summaryWS, summaryData, { origin: "A7" });
      const sRange = XLSX.utils.decode_range(summaryWS['!ref']!);
      for (let R = sRange.s.r; R <= sRange.e.r; ++R) {
        for (let C = sRange.s.c; C <= sRange.e.c; ++C) {
          const cell = summaryWS[XLSX.utils.encode_cell({ r: R, c: C })];
          if (!cell) continue;
          if (R < 6) continue;
          cell.s = R === 6 ? headerStyle : normalStyle;
        }
      }
      XLSX.utils.book_append_sheet(workbook, summaryWS, "Ringkasan Karyawan");

      // Individual Sheets
      targetUsers.forEach(user => {
        const userLogs = filteredLogs.filter(log => log.user_id === user.id);
        const userData: any[] = [];
        const holidayRows: number[] = [];
        let currentDate = new Date(startDate);
        let dataRowIndex = 7;
        let noCounter = 1;

        while (currentDate <= endDate) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayOfWeek = currentDate.getDay();
          const log = userLogs.find(l => l.check_in?.toDate().toISOString().split('T')[0] === dateStr);
          
          const globalHoliday = holidays.find(h => !h.user_id && (h.date === dateStr || h.day === dayOfWeek));
          const userHoliday = holidays.find(h => h.user_id === user.id && (h.date === dateStr || h.day === dayOfWeek));
          const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);
          const holiday = globalHoliday || userHoliday;

          if (holiday || isWeeklyOff) holidayRows.push(dataRowIndex);

          userData.push({
            'No': noCounter++,
            'Tanggal': currentDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
            'Clock In': log?.check_in?.toDate ? log.check_in.toDate().toLocaleTimeString('id-ID') : '-',
            'Clock Out': log?.check_out?.toDate ? log.check_out.toDate().toLocaleTimeString('id-ID') : '-',
            'Status': log ? (log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan') : (holiday || isWeeklyOff ? 'LIBUR' : 'ABSEN'),
            'Keterangan': log?.rejection_reason || holiday?.name || (isWeeklyOff ? 'Libur Mingguan' : '-')
          });

          currentDate.setDate(currentDate.getDate() + 1);
          dataRowIndex++;
        }

        const userHeader = getReportHeader(user.name, user.email);
        const userWS = XLSX.utils.aoa_to_sheet(userHeader);
        XLSX.utils.sheet_add_json(userWS, userData, { origin: "A7" });
        const uRange = XLSX.utils.decode_range(userWS['!ref']!);
        for (let R = uRange.s.r; R <= uRange.e.r; ++R) {
          for (let C = uRange.s.c; C <= uRange.e.c; ++C) {
            const cell = userWS[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell) continue;
            if (R < 6) continue;
            if (R === 6) cell.s = headerStyle;
            else if (holidayRows.includes(R)) cell.s = holidayStyle;
            else cell.s = normalStyle;
          }
        }
        const sheetName = user.name.substring(0, 31).replace(/[\\*?:/[\]]/g, '_');
        XLSX.utils.book_append_sheet(workbook, userWS, sheetName);
      });
    } else if (exportOptions.style === 'date') {
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = currentDate.getDay();
        const dateLogs = filteredLogs.filter(l => l.check_in?.toDate().toISOString().split('T')[0] === dateStr);
        
        const dateData = users.map((user, index) => {
          const log = dateLogs.find(l => l.user_id === user.id);
          const globalHoliday = holidays.find(h => !h.user_id && (h.date === dateStr || h.day === dayOfWeek));
          const userHoliday = holidays.find(h => h.user_id === user.id && (h.date === dateStr || h.day === dayOfWeek));
          const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);
          const holiday = globalHoliday || userHoliday;

          return {
            'No': index + 1,
            'Nama': user.name,
            'Clock In': log?.check_in?.toDate ? log.check_in.toDate().toLocaleTimeString('id-ID') : '-',
            'Clock Out': log?.check_out?.toDate ? log.check_out.toDate().toLocaleTimeString('id-ID') : '-',
            'Status': log ? (log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan') : (holiday || isWeeklyOff ? 'LIBUR' : 'ABSEN'),
            'Keterangan': holiday?.name || (isWeeklyOff ? 'Libur Mingguan' : '-')
          };
        });

        const dateHeader = getReportHeader(`Laporan Tanggal ${dateStr}`, "-");
        const ws = XLSX.utils.aoa_to_sheet(dateHeader);
        XLSX.utils.sheet_add_json(ws, dateData, { origin: "A7" });
        const dRange = XLSX.utils.decode_range(ws['!ref']!);
        
        // Check if this date is a global holiday or weekly off for all
        const isGlobalHoliday = holidays.some(h => !h.user_id && (h.date === dateStr || h.day === dayOfWeek)) || tenant?.off_days?.includes(dayOfWeek);

        for (let R = dRange.s.r; R <= dRange.e.r; ++R) {
          for (let C = dRange.s.c; C <= dRange.e.c; ++C) {
            const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
            if (!cell) continue;
            
            if (R < 6) continue;
            if (R === 6) {
              cell.s = headerStyle;
            } else {
              // For date-wise, we check if the specific user has a holiday
              const user = users[R-7];
              if (!user) continue;
              const globalHoliday = holidays.find(h => !h.user_id && (h.date === dateStr || h.day === dayOfWeek));
              const userHoliday = holidays.find(h => h.user_id === user.id && (h.date === dateStr || h.day === dayOfWeek));
              const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);
              
              if (globalHoliday || userHoliday || isWeeklyOff) {
                cell.s = holidayStyle;
              } else {
                cell.s = normalStyle;
              }
            }
          }
        }

        const sheetName = dateStr;
        XLSX.utils.book_append_sheet(workbook, ws, sheetName);
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    // Add Student Attendance Sheet if requested
    if (exportOptions.includeStudentAttendance) {
      const studentAttData = studentAttendance.filter(att => {
        const attDate = new Date(att.date);
        const startDate = new Date(exportStartDate);
        const endDate = new Date(exportEndDate);
        endDate.setHours(23, 59, 59, 999);
        return attDate >= startDate && attDate <= endDate;
      }).map(att => {
        const student = students.find(s => s.id === att.student_id);
        const schedule = schedules.find(sch => sch.id === att.schedule_id);
        return {
          'Tanggal': att.date,
          'Siswa': student?.name || 'Unknown',
          'Kelas': student?.class_name || 'Unknown',
          'Mapel': schedule?.subject || 'Unknown',
          'Status': att.status === 'H' ? 'Hadir' : att.status === 'S' ? 'Sakit' : att.status === 'I' ? 'Izin' : 'Alpha'
        };
      });

      if (studentAttData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(studentAttData);
        XLSX.utils.book_append_sheet(workbook, ws, "Absensi Siswa");
      }
    }

    // Add Grades Sheet if requested
    if (exportOptions.includeGrades) {
      const gradesData = grades.map(g => {
        const student = students.find(s => s.id === g.student_id);
        return {
          'Tanggal': g.createdAt?.toDate().toLocaleDateString('id-ID'),
          'Siswa': student?.name || 'Unknown',
          'Kelas': student?.class_name || 'Unknown',
          'Mapel': g.subject,
          'Nilai': g.score
        };
      });

      if (gradesData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(gradesData);
        XLSX.utils.book_append_sheet(workbook, ws, "Nilai Siswa");
      }
    }

    XLSX.writeFile(workbook, `Laporan_Absensi_${tenant?.name || 'Organisasi'}_${exportStartDate}_sd_${exportEndDate}.xlsx`);
    toast.success('Excel berhasil diunduh');
    setIsExcelExportDialogOpen(false);
  };

  const exportToCSV = () => {
    const filteredLogs = logs.filter(log => {
      if (!log.check_in) return false;
      const logDate = log.check_in.toDate();
      const startDate = new Date(exportStartDate);
      const endDate = new Date(exportEndDate);
      endDate.setHours(23, 59, 59, 999);
      return (logDate >= startDate && logDate <= endDate) && (exportUserId === 'all' || log.user_id === exportUserId);
    });

    if (filteredLogs.length === 0) {
      toast.error('Tidak ada data untuk diekspor');
      return;
    }

    const data = filteredLogs.map(log => ({
      'Nama': users.find(u => u.id === log.user_id)?.name || log.user_id,
      'Tanggal': log.check_in?.toDate().toLocaleDateString('id-ID'),
      'Check-in': log.check_in?.toDate().toLocaleTimeString('id-ID'),
      'Check-out': log.check_out?.toDate().toLocaleTimeString('id-ID'),
      'Status': log.status
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    
    const headerInfo = [
      `Laporan Kehadiran: ${exportUserId === 'all' ? 'Semua Karyawan' : users.find(u => u.id === exportUserId)?.name || 'User'}`,
      `Organisasi: ${tenant?.name || '-'}`,
      `Periode: ${exportStartDate} s/d ${exportEndDate}`,
      `Dicetak pada: ${new Date().toLocaleString('id-ID')}`,
      ''
    ].join('\n');

    const csvContent = headerInfo + '\n' + csv;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Absensi_${exportStartDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV berhasil diunduh');
  };

  const exportToTXT = () => {
    const filteredLogs = logs.filter(log => {
      if (!log.check_in) return false;
      const logDate = log.check_in.toDate();
      const startDate = new Date(exportStartDate);
      const endDate = new Date(exportEndDate);
      endDate.setHours(23, 59, 59, 999);
      return (logDate >= startDate && logDate <= endDate) && (exportUserId === 'all' || log.user_id === exportUserId);
    });

    if (filteredLogs.length === 0) {
      toast.error('Tidak ada data untuk diekspor');
      return;
    }

    let txtContent = `LAPORAN ABSENSI - ${tenant?.name || 'ORGANISASI'}\n`;
    txtContent += `Periode: ${exportStartDate} s/d ${exportEndDate}\n`;
    txtContent += `--------------------------------------------------\n\n`;

    filteredLogs.forEach(log => {
      const name = users.find(u => u.id === log.user_id)?.name || log.user_id;
      const date = log.check_in?.toDate().toLocaleDateString('id-ID');
      const ci = log.check_in?.toDate().toLocaleTimeString('id-ID');
      const co = log.check_out?.toDate().toLocaleTimeString('id-ID');
      txtContent += `[${date}] ${name.padEnd(20)} | In: ${ci} | Out: ${co} | Status: ${log.status}\n`;
    });

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Absensi_${exportStartDate}.txt`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('TXT berhasil diunduh');
  };

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Filter logs based on date range and user
      const filteredLogs = logs.filter(log => {
        if (!log.check_in) return false;
        const logDate = log.check_in.toDate();
        const startDate = new Date(exportStartDate);
        const endDate = new Date(exportEndDate);
        endDate.setHours(23, 59, 59, 999);
        
        const dateInRange = logDate >= startDate && logDate <= endDate;
        const userMatches = exportUserId === 'all' || log.user_id === exportUserId;
        
        return dateInRange && userMatches;
      });

      if (filteredLogs.length === 0) {
        toast.error('Tidak ada data absensi untuk periode dan filter yang dipilih');
        return;
      }

      const drawHeader = (title: string, subtitle?: string) => {
        doc.setFontSize(18);
        doc.setTextColor(0);
        doc.text(title, 14, 22);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Periode: ${exportStartDate} s/d ${exportEndDate}`, 14, 30);
        if (subtitle) {
          doc.text(subtitle, 14, 36);
        }
        doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, subtitle ? 42 : 36);
        return subtitle ? 50 : 44;
      };

      if (pdfExportOptions.style === 'default') {
        const startY = drawHeader(`Laporan Kehadiran - ${tenant?.name || 'Organisasi'}`, 
          `Filter Karyawan: ${exportUserId === 'all' ? 'Semua' : users.find(u => u.id === exportUserId)?.name}`);

        const tableColumn = ["Nama", "Tanggal", "Check-in", "Check-out", "Status"];
        const tableRows: any[] = [];

        filteredLogs.forEach(log => {
          const userName = users.find(u => u.id === log.user_id)?.name || 'Tidak Diketahui';
          const date = log.check_in?.toDate().toLocaleDateString('id-ID') || '-';
          const checkIn = log.check_in?.toDate().toLocaleTimeString('id-ID') || '-';
          const checkOut = log.check_out?.toDate().toLocaleTimeString('id-ID') || '-';
          const status = log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan';

          const logData = [userName, date, checkIn, checkOut, status];
          tableRows.push(logData);
        });

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: startY,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 163, 74] }
        });
      } else if (pdfExportOptions.style === 'employee') {
        const targetUsers = exportUserId === 'all' ? users : users.filter(u => u.id === exportUserId);

        targetUsers.forEach((user, index) => {
          if (index > 0) doc.addPage();
          
          const userLogs = filteredLogs.filter(log => log.user_id === user.id);
          const startY = drawHeader(`Laporan Kehadiran: ${user.name}`, `Email: ${user.email}`);

          const tableColumn = ["No", "Tanggal", "Check-in", "Check-out", "Status", "Keterangan"];
          const tableRows = userLogs.length > 0 ? userLogs.map((log, i) => [
            i + 1,
            log.check_in?.toDate().toLocaleDateString('id-ID') || '-',
            log.check_in?.toDate().toLocaleTimeString('id-ID') || '-',
            log.check_out?.toDate().toLocaleTimeString('id-ID') || '-',
            log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan',
            log.rejection_reason || '-'
          ]) : [[ "-", "Tidak ada data absensi", "-", "-", "-", "-" ]];

          autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: startY,
            theme: 'grid',
            styles: { fontSize: 8 },
            headStyles: { fillColor: [22, 163, 74] }
          });
        });
      }

      doc.save(`Kehadiran_${tenant?.name || 'Laporan'}_${exportStartDate}_${exportEndDate}.pdf`);

      // 3. Optional Student Attendance Page
      if (pdfExportOptions.includeStudentAttendance) {
        doc.addPage();
        const startY = drawHeader(`Laporan Absensi Siswa - ${tenant?.name || 'Organisasi'}`);
        
        const studentAttData = studentAttendance.filter(att => {
          const attDate = new Date(att.date);
          const startDate = new Date(exportStartDate);
          const endDate = new Date(exportEndDate);
          endDate.setHours(23, 59, 59, 999);
          return attDate >= startDate && attDate <= endDate;
        });

        const tableColumn = ["Tanggal", "Siswa", "Kelas", "Mapel", "Status"];
        const tableRows = studentAttData.map(att => {
          const student = students.find(s => s.id === att.student_id);
          const schedule = schedules.find(sch => sch.id === att.schedule_id);
          return [
            att.date,
            student?.name || 'Unknown',
            student?.class_name || 'Unknown',
            schedule?.subject || 'Unknown',
            att.status === 'H' ? 'Hadir' : att.status === 'S' ? 'Sakit' : att.status === 'I' ? 'Izin' : 'Alpha'
          ];
        });

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: startY,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 163, 74] }
        });
      }

      // 4. Optional Grades Page
      if (pdfExportOptions.includeGrades) {
        doc.addPage();
        const startY = drawHeader(`Laporan Nilai Siswa - ${tenant?.name || 'Organisasi'}`);
        
        const tableColumn = ["Tanggal", "Siswa", "Kelas", "Mapel", "Nilai"];
        const tableRows = grades.map(g => {
          const student = students.find(s => s.id === g.student_id);
          return [
            g.createdAt?.toDate().toLocaleDateString('id-ID'),
            student?.name || 'Unknown',
            student?.class_name || 'Unknown',
            g.subject,
            g.score
          ];
        });

        autoTable(doc, {
          head: [tableColumn],
          body: tableRows,
          startY: startY,
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 163, 74] }
        });
      }

      doc.save(`Laporan_Lengkap_${tenant?.name || 'Organisasi'}_${exportStartDate}.pdf`);
      toast.success('PDF berhasil diunduh');
      setIsPDFExportDialogOpen(false);
    } catch (error) {
      console.error('PDF Export Error:', error);
      toast.error('Gagal mengekspor PDF');
    }
  };

  const exportUserAttendancePDF = (user: UserProfile) => {
    try {
      const doc = new jsPDF();
      const userLogs = logs.filter(log => log.user_id === user.id);
      
      doc.setFontSize(18);
      doc.text(`Laporan Kehadiran: ${user.name}`, 14, 22);
      
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Organisasi: ${tenant?.name || '-'}`, 14, 30);
      doc.text(`Email: ${user.email}`, 14, 36);
      doc.text(`Periode: ${currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`, 14, 42);
      doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 48);

      const tableColumn = ["Tanggal", "Check-in", "Check-out", "Status", "Keterangan"];
      const tableRows: any[] = [];

      // Sort logs by date safely
      const sortedLogs = [...userLogs].sort((a, b) => {
        const timeA = a.check_in?.seconds || 0;
        const timeB = b.check_in?.seconds || 0;
        return timeB - timeA;
      });

      sortedLogs.forEach(log => {
        const date = log.check_in?.toDate ? log.check_in.toDate().toLocaleDateString('id-ID') : '-';
        const checkIn = log.check_in?.toDate ? log.check_in.toDate().toLocaleTimeString('id-ID') : '-';
        const checkOut = log.check_out?.toDate ? log.check_out.toDate().toLocaleTimeString('id-ID') : '-';
        const status = log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan';
        const reason = log.rejection_reason || '-';

        const logData = [date, checkIn, checkOut, status, reason];
        tableRows.push(logData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 55,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [22, 163, 74] }
      });

      doc.save(`Absensi_${user.name}_${currentMonth.getMonth() + 1}_${currentMonth.getFullYear()}.pdf`);
      toast.success(`Laporan ${user.name} berhasil diunduh`);
    } catch (error) {
      console.error('User PDF Export Error:', error);
      toast.error('Gagal mengekspor PDF karyawan');
    }
  };

  const updateJournalStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, 'journals', id), { status });
      toast.success(`Jurnal ${status === 'approved' ? 'disetujui' : 'ditolak'}`);
    } catch (error) {
      toast.error('Gagal memperbarui status jurnal');
    }
  };

  const handleSaveAllSettings = async () => {
    if (!tenant) return;
    setIsSavingOrg(true);
    setIsSavingWorkHours(true);
    try {
      await updateDoc(doc(db, 'tenants', tenant.id), {
        name: tenantSettings.name,
        is_journal_enabled: tenantSettings.is_journal_enabled,
        check_in_time: tenantSettings.check_in_time,
        check_in_end_time: tenantSettings.check_in_end_time,
        check_out_time: tenantSettings.check_out_time,
        check_out_end_time: tenantSettings.check_out_end_time,
        off_days: tenantSettings.off_days
      });
      toast.success('Semua pengaturan berhasil disimpan');
    } catch (error) {
      toast.error('Gagal menyimpan pengaturan');
    } finally {
      setIsSavingOrg(false);
      setIsSavingWorkHours(false);
    }
  };

  const toggleOffDay = (day: number) => {
    const current = [...tenantSettings.off_days];
    if (current.includes(day)) {
      setTenantSettings({ ...tenantSettings, off_days: current.filter(d => d !== day) });
    } else {
      setTenantSettings({ ...tenantSettings, off_days: [...current, day] });
    }
  };

  const handleAddHoliday = async () => {
    if (!newHoliday.name) {
      toast.error('Harap isi nama hari libur');
      return;
    }

    if (newHoliday.type === 'date' && !newHoliday.date) {
      toast.error('Harap isi tanggal libur');
      return;
    }

    if (newHoliday.type === 'day' && newHoliday.day === -1) {
      toast.error('Harap pilih hari libur');
      return;
    }
    
    const tenantId = profile.tenant_id || tenant?.id;
    if (!tenantId) {
      toast.error('ID Organisasi tidak ditemukan. Silakan muat ulang halaman.');
      return;
    }

    setIsAddingHoliday(true);
    try {
      const holidayData: any = {
        tenant_id: tenantId,
        name: newHoliday.name,
        createdAt: serverTimestamp()
      };

      if (newHoliday.type === 'date') {
        holidayData.date = newHoliday.date;
      } else {
        holidayData.day = newHoliday.day;
      }

      if (newHoliday.user_id !== 'all') {
        holidayData.user_id = newHoliday.user_id;
      }

      await addDoc(collection(db, 'holidays'), holidayData);
      setNewHoliday({ 
        date: '', 
        day: -1, 
        user_id: 'all', 
        name: '', 
        type: 'date' 
      });
      toast.success('Hari libur berhasil ditambahkan');
    } catch (error: any) {
      console.error("Error adding holiday:", error);
      const message = error.code === 'permission-denied' 
        ? 'Gagal: Izin ditolak. Pastikan akun Anda memiliki hak akses Admin.' 
        : `Gagal menambahkan hari libur: ${error.message}`;
      toast.error(message);
    } finally {
      setIsAddingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'holidays', id));
      toast.success('Hari libur berhasil dihapus');
    } catch (error) {
      toast.error('Gagal menghapus hari libur');
    }
  };

  const [isAddingAnnouncement, setIsAddingAnnouncement] = useState(false);
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    message: '',
    type: 'info' as 'info' | 'birthday' | 'warning',
    active: true
  });

  const handleAddAnnouncement = async () => {
    if (!newAnnouncement.title || !newAnnouncement.message) {
      toast.error('Judul dan pesan harus diisi');
      return;
    }

    setIsAddingAnnouncement(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        ...newAnnouncement,
        tenant_id: profile.tenant_id,
        createdAt: serverTimestamp()
      });
      toast.success('Pengumuman berhasil ditambahkan');
      setNewAnnouncement({ title: '', message: '', type: 'info', active: true });
    } catch (error: any) {
      console.error("Error adding announcement:", error);
      toast.error('Gagal menambahkan pengumuman');
    } finally {
      setIsAddingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
      toast.success('Pengumuman berhasil dihapus');
    } catch (error) {
      toast.error('Gagal menghapus pengumuman');
    }
  };

  const toggleAnnouncementStatus = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'announcements', id), {
        active: !currentStatus
      });
      toast.success('Status pengumuman diperbarui');
    } catch (error) {
      toast.error('Gagal memperbarui status pengumuman');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dasbor {tenant?.name || 'Organisasi'}</h1>
          <p className="text-gray-500">Kelola karyawan Anda dan pantau absensi</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
            <DialogTrigger render={<Button variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" />}>
              <Upload className="mr-2 h-4 w-4" /> Tambah Banyak
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Karyawan Sekaligus</DialogTitle>
                <DialogDescription>
                  Gunakan fitur ini untuk menambahkan banyak karyawan sekaligus menggunakan file Excel.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-6 py-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Langkah 1: Unduh Template</h4>
                  <p className="text-xs text-gray-500">Unduh file template Excel dan isi data karyawan Anda sesuai format.</p>
                  <Button variant="outline" size="sm" onClick={downloadTemplate} className="w-full">
                    <Download className="mr-2 h-4 w-4" /> Unduh Template Excel
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Langkah 2: Unggah File</h4>
                  <p className="text-xs text-gray-500">Pilih file Excel yang sudah Anda isi untuk diproses.</p>
                  <div className="relative">
                    <Input 
                      type="file" 
                      accept=".xlsx, .xls" 
                      onChange={handleBulkUpload}
                      disabled={isProcessingBulk}
                      className="cursor-pointer"
                    />
                    {isProcessingBulk && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-md border">
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                          <span className="text-xs font-medium">Memproses {bulkProgress.current} dari {bulkProgress.total}...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-blue-50 p-3 border border-blue-100">
                  <h4 className="text-xs font-bold text-blue-700 mb-1 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Informasi Penting
                  </h4>
                  <ul className="text-[10px] text-blue-600 space-y-1 list-disc pl-3">
                    <li>Kata sandi default untuk semua karyawan adalah: <span className="font-bold">password123</span></li>
                    <li>Karyawan disarankan segera mengganti kata sandi setelah login pertama kali.</li>
                    <li>Jika email tidak diisi lengkap (tanpa @), sistem akan otomatis menambahkan @attendance.local.</li>
                  </ul>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsBulkUploadOpen(false)} disabled={isProcessingBulk}>Tutup</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
            <DialogTrigger render={<Button className="bg-green-600 hover:bg-green-700" />}>
              <UserPlus className="mr-2 h-4 w-4" /> Tambah Pengguna
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Karyawan Baru</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="userName">Nama Lengkap</Label>
                  <Input id="userName" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="userEmail">Email / Username</Label>
                  <Input id="userEmail" type="text" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="contoh: budi123" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="userPassword">Kata Sandi</Label>
                  <div className="relative">
                    <Input 
                      id="userPassword" 
                      type={showPassword ? "text" : "password"} 
                      value={newUser.password} 
                      onChange={e => setNewUser({...newUser, password: e.target.value})} 
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
                  <p className="text-[10px] text-gray-500">Berikan kata sandi ini kepada karyawan untuk masuk.</p>
                </div>
                <div className="grid gap-2">
                  <Label>Peran</Label>
                  <Select value={newUser.role} onValueChange={(v: any) => setNewUser({...newUser, role: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USER">Karyawan</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddUserOpen(false)} disabled={isSubmitting}>Batal</Button>
                <Button onClick={handleAddUser} className="bg-green-600 hover:bg-green-700" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Tambah Pengguna
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600" />
            Filter Ekspor Laporan
          </CardTitle>
          <CardDescription>Tentukan periode dan karyawan untuk mengunduh laporan PDF/Excel</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-end gap-4">
            <div className="grid gap-2 w-full md:w-auto">
              <Label htmlFor="startDate" className="text-xs font-bold">Start Date</Label>
              <Input 
                id="startDate" 
                type="date" 
                value={exportStartDate} 
                onChange={(e) => setExportStartDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="grid gap-2 w-full md:w-auto">
              <Label htmlFor="endDate" className="text-xs font-bold">End Date</Label>
              <Input 
                id="endDate" 
                type="date" 
                value={exportEndDate} 
                onChange={(e) => setExportEndDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="grid gap-2 w-full md:flex-1">
              <Label htmlFor="employee" className="text-xs font-bold">Employee</Label>
              <Select value={exportUserId} onValueChange={setExportUserId}>
                <SelectTrigger id="employee" className="h-9">
                  <SelectValue placeholder="Pilih Karyawan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Karyawan</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button 
                    className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white h-9"
                  />
                }>
                  <Share className="mr-2 h-4 w-4" /> Export
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setIsPDFExportDialogOpen(true)} className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4 text-red-600" /> PDF Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsExcelExportDialogOpen(true)} className="cursor-pointer">
                    <Download className="mr-2 h-4 w-4 text-green-600" /> Excel Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToCSV} className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4 text-blue-600" /> CSV Export
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToTXT} className="cursor-pointer">
                    <FileText className="mr-2 h-4 w-4 text-gray-600" /> TXT Export
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isPDFExportDialogOpen} onOpenChange={setIsPDFExportDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>PDF Export Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Export Scope:</Label>
              <RadioGroup 
                value={pdfExportOptions.scope} 
                onValueChange={(v) => setPdfExportOptions({...pdfExportOptions, scope: v})}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="current" id="pdf-scope-current" />
                  <Label htmlFor="pdf-scope-current" className="font-normal">Current Page</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="pdf-scope-all" />
                  <Label htmlFor="pdf-scope-all" className="font-normal">All Data</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pdf-export-style" className="text-sm font-medium col-span-1">
                Export Style:
              </Label>
              <div className="col-span-3 flex items-center gap-4">
                <Select 
                  value={pdfExportOptions.style} 
                  onValueChange={(v) => setPdfExportOptions({...pdfExportOptions, style: v})}
                >
                  <SelectTrigger id="pdf-export-style" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (Flat List)</SelectItem>
                    <SelectItem value="employee">Employee Wise (New Page per User)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="include-summary" 
                checked={pdfExportOptions.includeSummary}
                onCheckedChange={(checked) => setPdfExportOptions({...pdfExportOptions, includeSummary: !!checked})}
              />
              <Label htmlFor="include-summary" className="text-sm font-normal">Include Summary Header</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="pdf-include-student-att" 
                checked={pdfExportOptions.includeStudentAttendance}
                onCheckedChange={(checked) => setPdfExportOptions({...pdfExportOptions, includeStudentAttendance: !!checked})}
              />
              <Label htmlFor="pdf-include-student-att" className="text-sm font-normal">Include Student Attendance</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="pdf-include-grades" 
                checked={pdfExportOptions.includeGrades}
                onCheckedChange={(checked) => setPdfExportOptions({...pdfExportOptions, includeGrades: !!checked})}
              />
              <Label htmlFor="pdf-include-grades" className="text-sm font-normal">Include Student Grades</Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button onClick={exportToPDF} className="bg-red-600 hover:bg-red-700 text-white">Confirm PDF Export</Button>
            <Button variant="outline" onClick={() => setIsPDFExportDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExcelExportDialogOpen} onOpenChange={setIsExcelExportDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Excel Export</DialogTitle>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Export Scope:</Label>
              <RadioGroup 
                value={exportOptions.scope} 
                onValueChange={(v) => setExportOptions({...exportOptions, scope: v})}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="current" id="scope-current" />
                  <Label htmlFor="scope-current" className="font-normal">Current Page</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="scope-all" />
                  <Label htmlFor="scope-all" className="font-normal">All Data</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="export-style" className="text-sm font-medium col-span-1">
                Export Style:
              </Label>
              <div className="col-span-3 flex items-center gap-4">
                <Select 
                  value={exportOptions.style} 
                  onValueChange={(v) => setExportOptions({...exportOptions, style: v})}
                >
                  <SelectTrigger id="export-style" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default</SelectItem>
                    <SelectItem value="employee">Employee Wise</SelectItem>
                    <SelectItem value="date">Date Wise</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="page-wise" 
                    checked={exportOptions.pageWise}
                    onCheckedChange={(checked) => setExportOptions({...exportOptions, pageWise: !!checked})}
                  />
                  <Label htmlFor="page-wise" className="text-sm font-normal">Page Wise</Label>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="excel-include-student-att" 
                checked={exportOptions.includeStudentAttendance}
                onCheckedChange={(checked) => setExportOptions({...exportOptions, includeStudentAttendance: !!checked})}
              />
              <Label htmlFor="excel-include-student-att" className="text-sm font-normal">Include Student Attendance</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="excel-include-grades" 
                checked={exportOptions.includeGrades}
                onCheckedChange={(checked) => setExportOptions({...exportOptions, includeGrades: !!checked})}
              />
              <Label htmlFor="excel-include-grades" className="text-sm font-normal">Include Student Grades</Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700">Confirm</Button>
            <Button variant="outline" onClick={() => setIsExcelExportDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Ringkasan & Absensi</TabsTrigger>
          <TabsTrigger value="calendar">Kalender</TabsTrigger>
          <TabsTrigger value="students">Siswa</TabsTrigger>
          <TabsTrigger value="schedules">Jadwal</TabsTrigger>
          <TabsTrigger value="journals">Jurnal Guru</TabsTrigger>
          <TabsTrigger value="announcements">Pengumuman</TabsTrigger>
          <TabsTrigger value="settings">Pengaturan</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Total Karyawan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length}</div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Hadir Hari Ini</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {logs.filter(l => l.check_in?.toDate().toDateString() === new Date().toDateString()).length}
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Radius Geofence</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{tenant?.radius}m</div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Status Keamanan</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge className="bg-green-100 text-green-700">Terlindungi</Badge>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <Card className="border-none shadow-sm lg:col-span-1">
              <CardHeader>
                <CardTitle>Manajemen Pengguna</CardTitle>
                <CardDescription>Daftarkan wajah dan kelola peran</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(showAllUsers ? users : users.slice(0, 10)).map(user => (
                    <div key={user.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div 
                        className="cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors"
                        onClick={() => {
                          setSelectedUser(user);
                          setIsUserDetailsOpen(true);
                        }}
                      >
                        <div className="font-medium text-blue-600 hover:underline">{user.name}</div>
                        <div className="text-xs text-gray-500">{user.role === 'USER' ? 'Karyawan' : 'Admin'}</div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedUser(user);
                            setNewRoleSelection(user.role as 'ADMIN' | 'USER');
                            setIsEditRoleOpen(true);
                          }}
                          className="text-blue-500 hover:text-blue-700"
                          title="Ubah Peran"
                        >
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => startFaceCapture(user)}
                          className={user.face_descriptor ? 'text-green-600' : 'text-gray-400'}
                          title="Daftarkan Wajah"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-red-400 hover:text-red-600" 
                          title="Hapus Pengguna"
                          onClick={() => {
                            setSelectedUser(user);
                            setIsDeleteUserOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {users.length > 10 && (
                    <Button 
                      variant="ghost" 
                      className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      onClick={() => setShowAllUsers(!showAllUsers)}
                    >
                      {showAllUsers ? 'Tampilkan Lebih Sedikit' : `Tampilkan Semua (${users.length})`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle>Absensi Terbaru</CardTitle>
                <CardDescription>Log real-time dengan validasi GPS dan Wajah</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pengguna</TableHead>
                      <TableHead>Check-in</TableHead>
                      <TableHead>Check-out</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Validasi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(showAllLogs ? logs : logs.slice(0, 10)).map(log => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">
                          {users.find(u => u.id === log.user_id)?.name || 'Tidak Diketahui'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.check_in?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.check_out ? log.check_out.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-bold text-gray-400 uppercase">IN:</span>
                              <Badge variant={log.status === 'valid' ? 'default' : log.status === 'rejected' ? 'destructive' : 'secondary'}
                                className={log.status === 'valid' ? 'bg-green-100 text-green-700 hover:bg-green-100 text-[9px] px-1.5 py-0' : 'text-[9px] px-1.5 py-0'}>
                                {log.status === 'valid' ? 'Valid' : log.status === 'rejected' ? 'Ditolak' : 'Mencurigakan'}
                              </Badge>
                            </div>
                            {log.check_out && (
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] font-bold text-gray-400 uppercase">OUT:</span>
                                <Badge variant={log.check_out_status === 'valid' ? 'default' : log.check_out_status === 'rejected' ? 'destructive' : 'secondary'}
                                  className={log.check_out_status === 'valid' ? 'bg-green-100 text-green-700 hover:bg-green-100 text-[9px] px-1.5 py-0' : 'text-[9px] px-1.5 py-0'}>
                                  {log.check_out_status === 'valid' ? 'Valid' : log.check_out_status === 'rejected' ? 'Ditolak' : 'Mencurigakan'}
                                </Badge>
                              </div>
                            )}
                            {(log.status !== 'valid' && log.rejection_reason) && (
                              <span className="text-[10px] text-red-500 italic max-w-[120px] truncate" title={log.rejection_reason}>
                                IN: {log.rejection_reason}
                              </span>
                            )}
                            {(log.check_out_status !== 'valid' && log.check_out_reason) && (
                              <span className="text-[10px] text-red-500 italic max-w-[120px] truncate" title={log.check_out_reason}>
                                OUT: {log.check_out_reason}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-[10px] text-gray-500">
                              <MapPin className="h-3 w-3" />
                              IN: {log.rejection_reason || 'Terverifikasi'}
                            </div>
                            {log.check_out && (
                              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                <MapPin className="h-3 w-3" />
                                OUT: {log.check_out_reason || 'Terverifikasi'}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {logs.length > 10 && (
                  <Button 
                    variant="ghost" 
                    className="w-full mt-4 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => setShowAllLogs(!showAllLogs)}
                  >
                    {showAllLogs ? 'Tampilkan Lebih Sedikit' : `Tampilkan Semua Log (${logs.length})`}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Kalender Absensi</CardTitle>
                <CardDescription>Tinjauan kehadiran karyawan per hari</CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={prevMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="font-bold text-lg min-w-[150px] text-center">
                  {currentMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </div>
                <Button variant="outline" size="icon" onClick={nextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2 text-center mb-2">
                {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map(day => (
                  <div key={day} className="font-semibold text-gray-500 py-2">{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {getDaysInMonth(currentMonth).map((date, i) => {
                  if (!date) {
                    return <div key={`empty-${i}`} className="h-24 rounded-xl bg-gray-50/50 border border-transparent"></div>;
                  }
                  
                  const { presentCount, absentCount } = getAttendanceStatsForDate(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const dateString = date.toISOString().split('T')[0];
                  const dayOfWeek = date.getDay();
                  
                  const globalHoliday = holidays.find(h => !h.user_id && (h.date === dateString || h.day === dayOfWeek));
                  const userSpecificHolidays = holidays.filter(h => h.user_id && (h.date === dateString || h.day === dayOfWeek));
                  const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);
                  
                  return (
                    <div 
                      key={date.toISOString()} 
                      onClick={() => {
                        setSelectedDate(date);
                        setIsDayDetailsOpen(true);
                      }}
                      className={`h-24 p-2 rounded-xl border cursor-pointer transition-all hover:border-blue-400 hover:shadow-md flex flex-col ${isToday ? 'bg-blue-50 border-blue-200' : (globalHoliday || isWeeklyOff) ? 'bg-red-50 border-red-100' : 'bg-white'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className={`text-sm font-bold ${isToday ? 'text-blue-700' : (globalHoliday || isWeeklyOff) ? 'text-red-600' : 'text-gray-700'}`}>
                          {date.getDate()}
                        </div>
                        {(globalHoliday || isWeeklyOff) && (
                          <Badge className="bg-red-100 text-red-700 text-[8px] px-1 py-0 border-none">Libur</Badge>
                        )}
                        {!globalHoliday && !isWeeklyOff && userSpecificHolidays.length > 0 && (
                          <Badge className="bg-orange-100 text-orange-700 text-[8px] px-1 py-0 border-none">{userSpecificHolidays.length} Guru Libur</Badge>
                        )}
                      </div>
                      
                      {globalHoliday && (
                        <div className="text-[9px] text-red-500 font-medium truncate mt-1" title={globalHoliday.name}>
                          {globalHoliday.name}
                        </div>
                      )}
                      {isWeeklyOff && !globalHoliday && (
                        <div className="text-[9px] text-red-500 font-medium truncate mt-1">
                          Libur Mingguan
                        </div>
                      )}
                      {!globalHoliday && !isWeeklyOff && userSpecificHolidays.length > 0 && (
                        <div className="text-[8px] text-orange-600 truncate mt-1 italic">
                          {userSpecificHolidays.map(h => users.find(u => u.id === h.user_id)?.name).join(', ')}
                        </div>
                      )}

                      <div className="flex flex-col gap-1 mt-auto">
                        {!(globalHoliday || isWeeklyOff) && presentCount > 0 && (
                          <div className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium flex justify-between">
                            <span>Hadir</span>
                            <span>{presentCount}</span>
                          </div>
                        )}
                        {!(globalHoliday || isWeeklyOff) && absentCount > 0 && date <= new Date() && (
                          <div className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium flex justify-between">
                            <span>Absen</span>
                            <span>{absentCount}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students">
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Manajemen Siswa</CardTitle>
                <CardDescription>Kelola data siswa per kelas</CardDescription>
              </div>
              <Dialog open={isAddStudentOpen} onOpenChange={setIsAddStudentOpen}>
                <DialogTrigger render={<Button className="bg-blue-600 hover:bg-blue-700" />}>
                  <Plus className="mr-2 h-4 w-4" /> Tambah Siswa
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Siswa Baru</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Nama Lengkap</Label>
                      <Input value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label>NIS (Opsional)</Label>
                      <Input value={newStudent.nis} onChange={e => setNewStudent({...newStudent, nis: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Kelas</Label>
                      <Input value={newStudent.class_name} onChange={e => setNewStudent({...newStudent, class_name: e.target.value})} placeholder="Contoh: X-IPA-1" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddStudent} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                      Simpan Siswa
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>NIS</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map(student => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell>{student.nis || '-'}</TableCell>
                      <TableCell>{student.class_name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteStudent(student.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {students.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-gray-500">Belum ada data siswa.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedules">
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Jadwal Mengajar</CardTitle>
                <CardDescription>Kelola jadwal mengajar guru</CardDescription>
              </div>
              <Dialog open={isAddScheduleOpen} onOpenChange={setIsAddScheduleOpen}>
                <DialogTrigger render={<Button className="bg-blue-600 hover:bg-blue-700" />}>
                  <Plus className="mr-2 h-4 w-4" /> Tambah Jadwal
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Jadwal Baru</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Guru</Label>
                      <Select value={newSchedule.user_id} onValueChange={v => setNewSchedule({...newSchedule, user_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Pilih Guru" /></SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.role === 'USER').map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Mata Pelajaran</Label>
                      <Input value={newSchedule.subject} onChange={e => setNewSchedule({...newSchedule, subject: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Kelas</Label>
                      <Input value={newSchedule.class_name} onChange={e => setNewSchedule({...newSchedule, class_name: e.target.value})} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Hari</Label>
                      <Select value={newSchedule.day.toString()} onValueChange={v => setNewSchedule({...newSchedule, day: parseInt(v)})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Senin</SelectItem>
                          <SelectItem value="2">Selasa</SelectItem>
                          <SelectItem value="3">Rabu</SelectItem>
                          <SelectItem value="4">Kamis</SelectItem>
                          <SelectItem value="5">Jumat</SelectItem>
                          <SelectItem value="6">Sabtu</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-4">
                      <div className="grid gap-2 flex-1">
                        <Label>Jam Mulai</Label>
                        <Input type="time" value={newSchedule.start_time} onChange={e => setNewSchedule({...newSchedule, start_time: e.target.value})} />
                      </div>
                      <div className="grid gap-2 flex-1">
                        <Label>Jam Selesai</Label>
                        <Input type="time" value={newSchedule.end_time} onChange={e => setNewSchedule({...newSchedule, end_time: e.target.value})} />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddSchedule} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                      Simpan Jadwal
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hari</TableHead>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Guru</TableHead>
                    <TableHead>Mapel</TableHead>
                    <TableHead>Kelas</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedules.map(schedule => (
                    <TableRow key={schedule.id}>
                      <TableCell className="font-medium">
                        {['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][schedule.day]}
                      </TableCell>
                      <TableCell>{schedule.start_time} - {schedule.end_time}</TableCell>
                      <TableCell>{users.find(u => u.id === schedule.user_id)?.name}</TableCell>
                      <TableCell>{schedule.subject}</TableCell>
                      <TableCell>{schedule.class_name}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => deleteSchedule(schedule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {schedules.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-gray-500">Belum ada jadwal.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journals">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle>Jurnal Guru</CardTitle>
              <CardDescription>Tinjau dan setujui jurnal mengajar yang dikirimkan selama absensi</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guru</TableHead>
                    <TableHead>Tanggal & Waktu</TableHead>
                    <TableHead>Mata Pelajaran / Kelas</TableHead>
                    <TableHead>Materi</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(showAllJournals ? journals : journals.slice(0, 10)).map(journal => (
                    <TableRow key={journal.id}>
                      <TableCell className="font-medium">
                        {users.find(u => u.id === journal.user_id)?.name || 'Tidak Diketahui'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {journal.createdAt?.toDate().toLocaleDateString()} <br/>
                        <span className="text-gray-500">{journal.time || journal.createdAt?.toDate().toLocaleTimeString()}</span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{journal.subject}</div>
                        <div className="text-xs text-gray-500">Kelas: {journal.class_name}</div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={journal.description}>
                        {journal.material}
                      </TableCell>
                      <TableCell>
                        <Badge variant={journal.status === 'approved' ? 'default' : journal.status === 'rejected' ? 'destructive' : 'secondary'}
                          className={journal.status === 'approved' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                          {journal.status === 'approved' ? 'Disetujui' : journal.status === 'rejected' ? 'Ditolak' : 'Menunggu'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="text-green-600 hover:bg-green-50"
                            onClick={() => updateJournalStatus(journal.id, 'approved')}
                            disabled={journal.status === 'approved'}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => updateJournalStatus(journal.id, 'rejected')}
                            disabled={journal.status === 'rejected'}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {journals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                        Belum ada jurnal yang dikirimkan.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {journals.length > 10 && (
                <Button 
                  variant="ghost" 
                  className="w-full mt-4 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowAllJournals(!showAllJournals)}
                >
                  {showAllJournals ? 'Tampilkan Lebih Sedikit' : `Tampilkan Semua Jurnal (${journals.length})`}
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pengumuman & Flyer</CardTitle>
                <CardDescription>Kelola informasi dan ucapan yang tampil di beranda karyawan</CardDescription>
              </div>
              <Dialog>
                <DialogTrigger render={
                  <Button className="bg-blue-600 hover:bg-blue-700" />
                }>
                  <Plus className="mr-2 h-4 w-4" /> Tambah Pengumuman
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Pengumuman Baru</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Tipe Pengumuman</Label>
                      <Select 
                        value={newAnnouncement.type} 
                        onValueChange={(v: any) => setNewAnnouncement({...newAnnouncement, type: v})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="info">Informasi Umum</SelectItem>
                          <SelectItem value="birthday">Ulang Tahun</SelectItem>
                          <SelectItem value="warning">Peringatan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Judul / Nama</Label>
                      <Input 
                        placeholder={newAnnouncement.type === 'birthday' ? "Nama yang berulang tahun..." : "Judul pengumuman..."}
                        value={newAnnouncement.title}
                        onChange={e => setNewAnnouncement({...newAnnouncement, title: e.target.value})}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Pesan / Keterangan</Label>
                      <Textarea 
                        placeholder="Isi pesan pengumuman..."
                        value={newAnnouncement.message}
                        onChange={e => setNewAnnouncement({...newAnnouncement, message: e.target.value})}
                        rows={3}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleAddAnnouncement} disabled={isAddingAnnouncement} className="bg-blue-600 hover:bg-blue-700">
                      {isAddingAnnouncement ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Simpan Pengumuman
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {announcements.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    Belum ada pengumuman
                  </div>
                ) : (
                  announcements.map((announcement) => (
                    <div key={announcement.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-full ${
                          announcement.type === 'birthday' ? 'bg-orange-100 text-orange-600' :
                          announcement.type === 'warning' ? 'bg-red-100 text-red-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {announcement.type === 'birthday' ? <Calendar className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{announcement.title}</h4>
                          <p className="text-sm text-gray-500 mt-1">{announcement.message}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className="text-xs">
                              {announcement.type === 'birthday' ? 'Ulang Tahun' : announcement.type === 'warning' ? 'Peringatan' : 'Info'}
                            </Badge>
                            <Badge variant={announcement.active ? "default" : "secondary"} className={announcement.active ? "bg-green-100 text-green-700 hover:bg-green-100" : ""}>
                              {announcement.active ? 'Aktif' : 'Nonaktif'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => toggleAnnouncementStatus(announcement.id, announcement.active)}
                        >
                          {announcement.active ? 'Nonaktifkan' : 'Aktifkan'}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteAnnouncement(announcement.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5 text-blue-600" />
                  Pengaturan Organisasi
                </CardTitle>
                <CardDescription>Atur identitas resmi unit atau sekolah Anda</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 rounded-xl border bg-blue-50/30 p-4">
                  <Label htmlFor="orgName" className="text-blue-700 font-bold">Nama Sekolah / Organisasi</Label>
                  <Input 
                    id="orgName" 
                    placeholder="Masukkan nama sekolah lengkap" 
                    value={tenantSettings.name}
                    onChange={(e) => setTenantSettings({...tenantSettings, name: e.target.value})}
                    className="bg-white border-blue-200"
                  />
                  <p className="text-[10px] text-blue-600 italic">Nama ini akan muncul di kop surat laporan PDF dan Excel agar terlihat profesional.</p>
                </div>

                <div className="space-y-2 rounded-xl border bg-blue-50/30 p-4 flex items-center justify-between">
                  <div>
                    <Label className="text-blue-700 font-bold">Fitur Jurnal Guru</Label>
                    <p className="text-[10px] text-blue-600 italic">Aktifkan atau nonaktifkan fitur jurnal untuk karyawan/guru.</p>
                  </div>
                  <div className="flex items-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={tenantSettings.is_journal_enabled}
                        onChange={(e) => setTenantSettings({...tenantSettings, is_journal_enabled: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
                
                <Button 
                  onClick={handleSaveAllSettings} 
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  disabled={isSavingOrg}
                >
                  {isSavingOrg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Simpan Pengaturan Organisasi
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  Pengaturan Jam Kerja
                </CardTitle>
                <CardDescription>Atur rentang waktu absensi untuk karyawan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-4 rounded-xl border bg-gray-50/50 p-4">
                    <div className="flex items-center gap-2 font-bold text-gray-900">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                      Check-in
                    </div>
                    <div className="grid gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="checkInTime" className="text-[11px]">Mulai</Label>
                        <Input 
                          id="checkInTime" 
                          type="time" 
                          value={tenantSettings.check_in_time}
                          onChange={(e) => setTenantSettings({...tenantSettings, check_in_time: e.target.value})}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="checkInEndTime" className="text-[11px]">Selesai</Label>
                        <Input 
                          id="checkInEndTime" 
                          type="time" 
                          value={tenantSettings.check_in_end_time}
                          onChange={(e) => setTenantSettings({...tenantSettings, check_in_end_time: e.target.value})}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border bg-gray-50/50 p-4">
                    <div className="flex items-center gap-2 font-bold text-gray-900">
                      <div className="h-2 w-2 rounded-full bg-orange-500" />
                      Check-out
                    </div>
                    <div className="grid gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="checkOutTime" className="text-[11px]">Mulai</Label>
                        <Input 
                          id="checkOutTime" 
                          type="time" 
                          value={tenantSettings.check_out_time}
                          onChange={(e) => setTenantSettings({...tenantSettings, check_out_time: e.target.value})}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="checkOutEndTime" className="text-[11px]">Selesai</Label>
                        <Input 
                          id="checkOutEndTime" 
                          type="time" 
                          value={tenantSettings.check_out_end_time}
                          onChange={(e) => setTenantSettings({...tenantSettings, check_out_end_time: e.target.value})}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <Button 
                  onClick={handleSaveAllSettings} 
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  disabled={isSavingWorkHours}
                >
                  {isSavingWorkHours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Simpan Jam Kerja
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Hari Libur Mingguan
                </CardTitle>
                <CardDescription>Pilih hari libur rutin mingguan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 rounded-xl border bg-gray-50/50 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { id: 1, name: 'Senin' },
                      { id: 2, name: 'Selasa' },
                      { id: 3, name: 'Rabu' },
                      { id: 4, name: 'Kamis' },
                      { id: 5, name: 'Jumat' },
                      { id: 6, name: 'Sabtu' },
                      { id: 0, name: 'Minggu' }
                    ].map((day) => (
                      <div key={day.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`day-${day.id}`} 
                          checked={tenantSettings.off_days.includes(day.id)}
                          onCheckedChange={() => toggleOffDay(day.id)}
                        />
                        <Label htmlFor={`day-${day.id}`} className="text-sm font-medium leading-none">
                          {day.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                <Button 
                  onClick={handleSaveAllSettings} 
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
                  disabled={isSavingWorkHours}
                >
                  {isSavingWorkHours ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Simpan Hari Libur Mingguan
                </Button>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-red-600" />
                  Hari Libur Khusus
                </CardTitle>
                <CardDescription>Tambah libur tambahan (per tanggal atau per hari rutin)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4 rounded-xl border bg-red-50/30 p-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label>Tipe Libur</Label>
                      <Select 
                        value={newHoliday.type} 
                        onValueChange={(v: any) => setNewHoliday({...newHoliday, type: v})}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date">Tanggal Tertentu</SelectItem>
                          <SelectItem value="day">Hari Rutin (Mingguan)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {newHoliday.type === 'date' ? (
                      <div className="space-y-2">
                        <Label htmlFor="holidayDate">Tanggal Libur</Label>
                        <Input 
                          id="holidayDate" 
                          type="date" 
                          value={newHoliday.date}
                          onChange={(e) => setNewHoliday({...newHoliday, date: e.target.value})}
                          className="bg-white"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Pilih Hari</Label>
                        <Select 
                          value={newHoliday.day.toString()} 
                          onValueChange={(v) => setNewHoliday({...newHoliday, day: parseInt(v)})}
                        >
                          <SelectTrigger className="bg-white">
                            <SelectValue placeholder="Pilih Hari" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Senin</SelectItem>
                            <SelectItem value="2">Selasa</SelectItem>
                            <SelectItem value="3">Rabu</SelectItem>
                            <SelectItem value="4">Kamis</SelectItem>
                            <SelectItem value="5">Jumat</SelectItem>
                            <SelectItem value="6">Sabtu</SelectItem>
                            <SelectItem value="0">Minggu</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Berlaku Untuk</Label>
                      <Select 
                        value={newHoliday.user_id} 
                        onValueChange={(v) => setNewHoliday({...newHoliday, user_id: v})}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Semua Karyawan</SelectItem>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="holidayName">Keterangan / Nama Libur</Label>
                      <Input 
                        id="holidayName" 
                        placeholder="Contoh: Libur Tambahan Guru" 
                        value={newHoliday.name}
                        onChange={(e) => setNewHoliday({...newHoliday, name: e.target.value})}
                        className="bg-white"
                      />
                    </div>
                  </div>
                  <Button 
                    onClick={handleAddHoliday} 
                    className="w-full bg-red-600 hover:bg-red-700"
                    disabled={isAddingHoliday}
                  >
                    {isAddingHoliday ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    Tambah Hari Libur
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-gray-500" />
                Daftar Hari Libur Khusus
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border overflow-hidden">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>Waktu / Hari</TableHead>
                      <TableHead>Berlaku Untuk</TableHead>
                      <TableHead>Keterangan</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holidays.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-gray-500 italic">
                          Belum ada hari libur yang ditambahkan
                        </TableCell>
                      </TableRow>
                    ) : (
                      holidays.map((holiday) => (
                        <TableRow key={holiday.id}>
                          <TableCell className="font-medium">
                            {holiday.date ? (
                              new Date(holiday.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                            ) : (
                              `Setiap ${['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][holiday.day || 0]}`
                            )}
                          </TableCell>
                          <TableCell>
                            {holiday.user_id ? (
                              <Badge variant="outline" className="text-blue-600 border-blue-200">
                                {users.find(u => u.id === holiday.user_id)?.name || 'Karyawan'}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-gray-600 border-gray-200">Semua</Badge>
                            )}
                          </TableCell>
                          <TableCell>{holiday.name}</TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleDeleteHoliday(holiday.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isFaceRegOpen} onOpenChange={setIsFaceRegOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Daftarkan Wajah: {selectedUser?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="relative h-64 w-full overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} autoPlay muted className="h-full w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center border-4 border-dashed border-white/30">
                <div className="h-48 w-48 rounded-full border-2 border-green-500/50" />
              </div>
            </div>
            <p className="text-center text-sm text-gray-500">
              Pastikan wajah Anda mendapat cahaya yang baik dan berada di tengah bingkai.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFaceRegOpen(false)}>Batal</Button>
            <Button onClick={captureFace} disabled={isCapturing} className="bg-green-600 hover:bg-green-700">
              {isCapturing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Ambil & Daftarkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditRoleOpen} onOpenChange={setIsEditRoleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah Peran Pengguna</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm text-gray-500">
              Anda akan mengubah peran untuk <strong>{selectedUser?.name}</strong>. Silakan pilih peran baru di bawah ini.
            </p>
            <div className="grid gap-2">
              <Label>Peran Baru</Label>
              <Select value={newRoleSelection} onValueChange={(v: any) => setNewRoleSelection(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">Karyawan</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditRoleOpen(false)}>Batal</Button>
            <Button onClick={handleUpdateRole} className="bg-blue-600 hover:bg-blue-700">Simpan Perubahan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteUserOpen} onOpenChange={setIsDeleteUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus Pengguna</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Apakah Anda yakin ingin menghapus pengguna <strong>{selectedUser?.name}</strong>? Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteUserOpen(false)}>Batal</Button>
            <Button onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog */}
      <Dialog open={isUserDetailsOpen} onOpenChange={setIsUserDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detail Pengguna</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label className="text-gray-500">Nama Lengkap</Label>
              <div className="font-medium text-lg">{selectedUser?.name}</div>
            </div>
            <div>
              <Label className="text-gray-500">Email / Username</Label>
              <div>{selectedUser?.email}</div>
            </div>
            <div>
              <Label className="text-gray-500">Peran</Label>
              <div>{selectedUser?.role === 'USER' ? 'Karyawan' : 'Admin'}</div>
            </div>
            <div>
              <Label className="text-gray-500">Status Wajah</Label>
              <div className="mt-2">
                {selectedUser?.face_image_url ? (
                  <div className="space-y-2">
                    <Badge className="bg-green-100 text-green-700">Wajah Terdaftar</Badge>
                    <div className="mt-2 overflow-hidden rounded-lg border">
                      <img 
                        src={selectedUser.face_image_url} 
                        alt={`Wajah ${selectedUser.name}`} 
                        className="w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                ) : selectedUser?.face_descriptor ? (
                  <Badge className="bg-green-100 text-green-700">Wajah Terdaftar (Tanpa Gambar)</Badge>
                ) : (
                  <Badge variant="destructive">Wajah Belum Terdaftar</Badge>
                )}
              </div>
            </div>
            <div className="pt-4 border-t space-y-4">
              <Label className="text-gray-500 uppercase text-xs font-bold">Aktivitas Terbaru</Label>
              <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                {logs.filter(l => l.user_id === selectedUser?.id).slice(0, 5).length > 0 ? (
                  logs.filter(l => l.user_id === selectedUser?.id).slice(0, 5).map(log => (
                    <div key={log.id} className="text-xs p-2 rounded bg-gray-50 border flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="font-medium">{log.check_in?.toDate().toLocaleDateString('id-ID')}</span>
                        <span className="text-gray-500">{log.check_in?.toDate().toLocaleTimeString('id-ID')} - {log.check_out?.toDate().toLocaleTimeString('id-ID') || 'Belum Keluar'}</span>
                      </div>
                      <Badge variant={log.status === 'valid' ? 'default' : 'destructive'} className="text-[8px] h-4">
                        {log.status === 'valid' ? 'Valid' : 'Ditolak'}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-center text-gray-500 py-4 italic">Tidak ada catatan kehadiran terbaru</div>
                )}
              </div>
              
              <Button 
                className="w-full bg-red-600 hover:bg-red-700" 
                onClick={() => selectedUser && exportUserAttendancePDF(selectedUser)}
              >
                <FileText className="mr-2 h-4 w-4" /> Cetak Laporan Kehadiran (PDF)
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUserDetailsOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Details Dialog */}
      <Dialog open={isLogDetailsOpen} onOpenChange={setIsLogDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detail Log Kehadiran</DialogTitle>
            <DialogDescription>
              {selectedUser?.name} - {selectedDate?.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500 uppercase">Waktu Check-in</Label>
                <div className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-green-600" />
                  {selectedLog?.check_in?.toDate().toLocaleTimeString('id-ID') || '-'}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500 uppercase">Waktu Check-out</Label>
                <div className="font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-600" />
                  {selectedLog?.check_out?.toDate().toLocaleTimeString('id-ID') || '-'}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-500 uppercase">Status Validasi</Label>
              <div>
                <Badge variant={selectedLog?.status === 'valid' ? 'default' : selectedLog?.status === 'rejected' ? 'destructive' : 'secondary'}
                  className={selectedLog?.status === 'valid' ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                  {selectedLog?.status === 'valid' ? 'Valid' : selectedLog?.status === 'rejected' ? 'Ditolak' : 'Mencurigakan'}
                </Badge>
              </div>
            </div>

            {selectedLog?.rejection_reason && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500 uppercase">Keterangan / Alasan</Label>
                <div className="text-sm p-2 bg-gray-50 rounded border italic text-gray-600">
                  {selectedLog.rejection_reason}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-gray-500 uppercase">Koordinat Lokasi</Label>
              <div className="text-sm flex items-center gap-2 text-gray-600">
                <MapPin className="h-4 w-4" />
                {selectedLog?.lat}, {selectedLog?.lng}
              </div>
            </div>
          </div>
          <DialogFooter className="flex sm:justify-between gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsLogDetailsOpen(false);
                setIsUserDetailsOpen(true);
              }}
            >
              <Users className="mr-2 h-4 w-4" /> Lihat Profil
            </Button>
            <Button onClick={() => setIsLogDetailsOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDayDetailsOpen} onOpenChange={setIsDayDetailsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detail Kehadiran: {selectedDate?.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama Karyawan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu Check-in</TableHead>
                  <TableHead>Waktu Check-out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => {
                  const userLog = selectedDate ? getAttendanceStatsForDate(selectedDate).logsForDay.find(l => l.user_id === user.id) : null;
                  const isPresent = !!userLog;
                  const dateString = selectedDate?.toISOString().split('T')[0];
                  const dayOfWeek = selectedDate?.getDay() || -1;
                  const holiday = holidays.find(h => 
                    (!h.user_id || h.user_id === user.id) && 
                    (h.date === dateString || h.day === dayOfWeek)
                  );
                  const isWeeklyOff = tenant?.off_days?.includes(dayOfWeek);
                  
                  // Only show absent if the date is today or in the past
                  if (!isPresent && selectedDate && selectedDate > new Date() && !holiday && !isWeeklyOff) {
                    return null;
                  }

                  return (
                    <TableRow key={user.id}>
                      <TableCell 
                        className="font-medium cursor-pointer text-blue-600 hover:underline"
                        onClick={() => {
                          if (userLog) {
                            setSelectedLog(userLog);
                            setSelectedUser(user);
                            setIsLogDetailsOpen(true);
                          } else {
                            toast.info(holiday ? `Hari ini adalah hari libur: ${holiday.name}` : isWeeklyOff ? 'Hari ini adalah libur mingguan.' : `${user.name} tidak memiliki catatan kehadiran pada hari ini.`);
                          }
                        }}
                      >
                        {user.name}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {isPresent ? (
                            <>
                              <Badge className={userLog.status === 'valid' ? 'bg-green-100 text-green-700 hover:bg-green-100' : userLog.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                                {userLog.status === 'valid' ? 'Hadir' : userLog.status === 'rejected' ? 'Ditolak' : 'Mencurigakan'}
                              </Badge>
                              {userLog.status !== 'valid' && userLog.rejection_reason && (
                                <span className="text-[10px] text-red-500 italic max-w-[120px] truncate" title={userLog.rejection_reason}>
                                  {userLog.rejection_reason}
                                </span>
                              )}
                            </>
                          ) : (holiday || isWeeklyOff) ? (
                            <Badge className="bg-red-50 text-red-600 hover:bg-red-50 border-red-100">Libur</Badge>
                          ) : (
                            <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Absen</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{userLog?.check_in?.toDate().toLocaleTimeString('id-ID') || '-'}</TableCell>
                      <TableCell>{userLog?.check_out?.toDate().toLocaleTimeString('id-ID') || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDayDetailsOpen(false)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
