export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export interface Tenant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  status: 'active' | 'inactive';
  subscription_plan: string;
  check_in_time?: string;
  check_in_end_time?: string;
  check_out_time?: string;
  check_out_end_time?: string;
  off_days?: number[]; // 0 for Sunday, 1 for Monday, etc.
  createdAt: any;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenant_id: string;
  face_descriptor?: number[];
  face_image_url?: string;
  createdAt: any;
}

export interface AttendanceRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  check_in: any;
  check_out?: any;
  lat: number;
  lng: number;
  photo_url?: string;
  status: 'valid' | 'rejected' | 'suspicious';
  rejection_reason?: string;
}

export interface Journal {
  id: string;
  tenant_id: string;
  user_id: string;
  attendance_id: string;
  subject: string;
  class_name: string;
  time: string;
  material: string;
  description: string;
  photo_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

export interface Holiday {
  id: string;
  tenant_id: string;
  date?: string;
  day?: number; // 0-6 for recurring day off
  user_id?: string; // Optional: if set, holiday only applies to this user
  name: string;
  createdAt: any;
}
