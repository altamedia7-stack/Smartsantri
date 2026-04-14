import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../lib/errorUtils';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Use onSnapshot for real-time profile updates (e.g. role changes)
        const profileRef = doc(db, 'users', firebaseUser.uid);
        const unsubProfile = onSnapshot(profileRef, (docSnap) => {
          if (docSnap.exists()) {
            const profileData = docSnap.data();
            console.log("Fetched Profile for", firebaseUser.uid, ":", {
              name: profileData.name,
              role: profileData.role,
              tenant_id: profileData.tenant_id
            });
            setProfile({ id: docSnap.id, ...profileData } as UserProfile);
          } else if (firebaseUser.email === 'altamedia7@gmail.com') {
            setProfile({ id: firebaseUser.uid, role: 'SUPER_ADMIN', email: firebaseUser.email, name: 'Super Admin', tenant_id: 'system' } as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching profile:", error);
          setLoading(false);
          handleFirestoreError(error, OperationType.GET, 'users');
        });
        return () => unsubProfile();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, profile, loading };
}
