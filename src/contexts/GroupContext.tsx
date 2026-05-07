import React, { createContext, useContext, useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc,
  setDoc, 
  addDoc, 
  deleteDoc,
  serverTimestamp,
  getDocs
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";

interface Group {
  id: string;
  name: string;
  createdBy: string;
  status?: "active" | "pending";
}

interface GroupMember {
  userId: string;
  userEmail: string;
  displayName?: string;
  photoURL?: string;
  whatsapp?: string;
  role: string;
  status: "active" | "pending" | "cancelled";
}

interface GroupContextType {
  groups: Group[];
  invites: Group[];
  activeGroup: Group | null;
  activeGroupMembers: GroupMember[];
  loading: boolean;
  companyName: string;
  whatsappNumber: string;
  updateSettings: (name: string, wa: string) => Promise<void>;
  handleBackup: () => Promise<any>;
  setActiveGroupId: (id: string) => void;
  createGroup: (name: string) => Promise<string>;
  inviteUser: (groupId: string, email: string) => Promise<void>;
  acceptInvite: (groupId: string) => Promise<void>;
  declineInvite: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  cancelInvite: (groupId: string, email: string) => Promise<void>;
  updateProfile: (displayName: string, photoURL: string, whatsapp?: string) => Promise<void>;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [activeGroupMembers, setActiveGroupMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("Doctor Pro");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  const safeLocalStorage = {
    getItem: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        return null;
      }
    },
    setItem: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch (e) {}
    }
  };

  const apiFetch = (url: string, init?: RequestInit) => {
    const groupId = activeGroup?.id || safeLocalStorage.getItem("activeGroupId") || "";
    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        "x-group-id": groupId
      }
    });
  };

  useEffect(() => {
    if (!activeGroup) {
      setActiveGroupMembers([]);
      return;
    }

    // Fetch Settings for active group
    apiFetch("/api/app/settings")
      .then(res => res.json())
      .then(data => {
        setCompanyName(data.companyName || "Doctor Pro");
        setWhatsappNumber(data.whatsappNumber || "");
      })
      .catch(err => console.error("Failed to fetch settings", err));

    // Listen to group members
    const membersPath = `groups/${activeGroup.id}/members`;
    const unsubscribeMembers = onSnapshot(collection(db, membersPath), (snapshot) => {
      const members = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          userEmail: data.userEmail || ""
        } as GroupMember;
      });
      setActiveGroupMembers(members);
    });

    return () => unsubscribeMembers();
  }, [activeGroup?.id]);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setInvites([]);
      setActiveGroup(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Listen to memberships
    const membershipsPath = `users/${user.uid}/memberships`;
    const unsubscribeMemberships = onSnapshot(collection(db, membershipsPath), async (snapshot) => {
      try {
        const membershipPromises = snapshot.docs.map(async (membershipDoc) => {
          const groupId = membershipDoc.id;
          const mData = membershipDoc.data();
          
          let groupInfo: Group;
          try {
            // Using getDocs query for backward compatibility with some docs that have 'id' field,
            // but preferring direct doc lookup if possible
            const groupQuery = query(collection(db, "groups"), where("id", "==", groupId));
            const groupSnap = await getDocs(groupQuery);
            
            if (!groupSnap.empty) {
              groupInfo = { id: groupId, ...groupSnap.docs[0].data(), status: mData.status || "active" } as Group;
            } else {
              groupInfo = { 
                id: groupId, 
                name: mData.groupName || "Group " + groupId, 
                createdBy: "", 
                status: mData.status || "active" 
              } as Group;
            }
          } catch (e) {
            groupInfo = { 
              id: groupId, 
              name: mData.groupName || "Group " + groupId, 
              createdBy: "", 
              status: mData.status || "active" 
            } as Group;
          }
          return groupInfo;
        });

        const fetchedMemberships = await Promise.all(membershipPromises);
        
        // We will merge this with invitations by email later
        const activeGroups = fetchedMemberships.filter(m => m.status === "active");
        const pendingGroups = fetchedMemberships.filter(m => m.status === "pending");

        setGroups(activeGroups);
        
        // Set pending groups from memberships (existing users)
        setInvites(prev => {
          // Merge logic: prefer memberships for now, but keep email-only invites if not in memberships
          const merged = [...pendingGroups];
          // We'll update invites fully in the other listener
          return merged;
        });

        // Restore active group
        const savedGroupId = safeLocalStorage.getItem("activeGroupId");
        const found = activeGroups.find(g => g.id === savedGroupId);
        if (found) {
          setActiveGroup(found);
        } else if (activeGroups.length > 0 && !activeGroup) {
          setActiveGroup(activeGroups[0]);
        }
        setLoading(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, membershipsPath);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, membershipsPath);
    });

    // Listen to invitations by email (for users who were invited before joining)
    let unsubscribeInvitations = () => {};
    if (user.email) {
      const cleanEmail = user.email.trim().toLowerCase();
      const invitationsQuery = query(collection(db, "group_invitations"), where("email", "==", cleanEmail), where("status", "==", "pending"));
      unsubscribeInvitations = onSnapshot(invitationsQuery, (snapshot) => {
        const emailInvites = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: data.groupId,
            name: data.groupName || "Novo Grupo",
            createdBy: data.inviterId,
            status: "pending" as const
          };
        });

        setInvites(prev => {
          // Merge: get unique group IDs
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = emailInvites.filter(ei => !existingIds.has(ei.id));
          return [...prev, ...newOnes];
        });
      });
    }

    return () => {
      unsubscribeMemberships();
      unsubscribeInvitations();
    };
  }, [user, user?.email]);

  const setActiveGroupId = (id: string) => {
    safeLocalStorage.setItem("activeGroupId", id);
    const group = groups.find(g => g.id === id);
    if (group) {
      setActiveGroup(group);
    }
  };

  const createGroup = async (name: string) => {
    if (!user) throw new Error("Must be logged in");

    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const profile = userSnap.exists() ? userSnap.data() : {};

      const groupRef = await addDoc(collection(db, "groups"), {
        name,
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });

      const groupId = groupRef.id;
      // Update the doc with its own ID for easier querying later
      await setDoc(groupRef, { id: groupId }, { merge: true });

      // Add self as member
      await setDoc(doc(db, `groups/${groupId}/members`, user.uid), {
        userId: user.uid,
        userEmail: user.email || "",
        displayName: profile.displayName || "",
        photoURL: profile.photoURL || "",
        whatsapp: profile.whatsapp || "",
        role: "owner",
        status: "active",
        joinedAt: serverTimestamp()
      });

      // Add to user's memberships
      await setDoc(doc(db, `users/${user.uid}/memberships`, groupId), {
        groupId,
        groupName: name,
        role: "owner",
        status: "active"
      });

      // Set as active
      setActiveGroupId(groupId);

      return groupId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "groups");
      throw err; // Should not reach here as handleFirestoreError throws
    }
  };

  const inviteUser = async (groupId: string, email: string) => {
    if (!user) throw new Error("Must be logged in");
    const cleanEmail = email.trim().toLowerCase();
    
    try {
       // Verify if current user is owner (admin)
       const myMembership = activeGroupMembers.find(m => m.userId === user.uid);
       if (myMembership?.role !== "owner") {
         throw new Error("Apenas o admin pode convidar membros");
       }

       // 1. Always create a record in group_invitations by email
       const invId = `${groupId}_${cleanEmail.replace(/\./g, '_')}`;
       await setDoc(doc(db, "group_invitations", invId), {
         email: cleanEmail,
         groupId,
         groupName: activeGroup?.name || "Novo Grupo",
         inviterId: user.uid,
         inviterEmail: user.email,
         status: "pending",
         createdAt: serverTimestamp()
       }, { merge: true });

       // 2. Add to group members list so owner can see status in UI
       const memberDocId = `invite_${cleanEmail.replace(/\./g, '_')}`;
       await setDoc(doc(db, `groups/${groupId}/members`, memberDocId), {
         userId: "", 
         userEmail: cleanEmail,
         role: "member",
         status: "pending",
         invitedAt: serverTimestamp()
       }, { merge: true });

       // 3. Try to notify user directly if they exist
       try {
         const userQuery = query(collection(db, "users"), where("email", "==", cleanEmail));
         const userSnap = await getDocs(userQuery);
         
         if (!userSnap.empty) {
           const targetUid = userSnap.docs[0].id;
           
           // Also add with real UID to group members
           await setDoc(doc(db, `groups/${groupId}/members`, targetUid), {
             userId: targetUid,
             userEmail: cleanEmail,
             role: "member",
             status: "pending",
             joinedAt: serverTimestamp()
           });

           // Add to target user's memberships
           await setDoc(doc(db, `users/${targetUid}/memberships`, groupId), {
             groupId,
             groupName: activeGroup?.name || "Novo Grupo",
             role: "member",
             status: "pending"
           });
         }
       } catch (e) {
         console.warn("Could not link invite to existing user profile during creation", e);
       }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `group_invitations`);
    }
  };

  const acceptInvite = async (groupId: string) => {
    if (!user) throw new Error("Must be logged in");
    const cleanEmail = user.email?.trim().toLowerCase() || "";
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const profile = userSnap.exists() ? userSnap.data() : {};

      // 1. Update membership status
      await setDoc(doc(db, `users/${user.uid}/memberships`, groupId), {
        groupId,
        groupName: invites.find(i => i.id === groupId)?.name || "Novo Grupo",
        role: "member",
        status: "active"
      }, { merge: true });

      // 2. Update group member status
      await setDoc(doc(db, `groups/${groupId}/members`, user.uid), {
        userId: user.uid,
        userEmail: user.email || "",
        displayName: profile.displayName || "",
        photoURL: profile.photoURL || "",
        whatsapp: profile.whatsapp || "",
        status: "active",
        joinedAt: serverTimestamp()
      }, { merge: true });

      // 3. Mark invitation as completed
      const invId = `${groupId}_${cleanEmail.replace(/\./g, '_')}`;
      await setDoc(doc(db, "group_invitations", invId), {
        status: "accepted",
        acceptedAt: serverTimestamp()
      }, { merge: true });

      // 4. Try to cleanup the "invite_..." record from group members
      const inviteMemberId = `invite_${cleanEmail.replace(/\./g, '_')}`;
      try {
        await deleteDoc(doc(db, `groups/${groupId}/members`, inviteMemberId));
      } catch (e) {
        console.warn("Could not cleanup invite record from group members", e);
      }

      setActiveGroupId(groupId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/memberships/${groupId}`);
    }
  };

  const declineInvite = async (groupId: string) => {
    if (!user) throw new Error("Must be logged in");
    const cleanEmail = user.email?.trim().toLowerCase() || "";
    try {
      // 1. Update target user's membership status to cancelled
      await setDoc(doc(db, `users/${user.uid}/memberships`, groupId), {
        status: "cancelled"
      }, { merge: true });

      // 2. Update group members status to cancelled
      await setDoc(doc(db, `groups/${groupId}/members`, user.uid), {
        status: "cancelled"
      }, { merge: true });

      // 3. Update the global invitation record
      const invId = `${groupId}_${cleanEmail.replace(/\./g, '_')}`;
      await setDoc(doc(db, "group_invitations", invId), {
        status: "declined",
        declinedAt: serverTimestamp()
      }, { merge: true });

      // 4. Try to cleanup/update the "invite_..." record from group members
      const inviteMemberId = `invite_${cleanEmail.replace(/\./g, '_')}`;
      try {
        await setDoc(doc(db, `groups/${groupId}/members`, inviteMemberId), {
          status: "cancelled"
        }, { merge: true });
      } catch (e) {
        console.warn("Could not update invite record from group members", e);
      }

      // Remove from local list
      setInvites(prev => prev.filter(i => i.id !== groupId));
    } catch (err) {
      console.error("Failed to decline invite", err);
    }
  };

  const removeMember = async (groupId: string, userId: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
      // Verify if current user is owner
      const myMembership = activeGroupMembers.find(m => m.userId === user.uid);
      if (myMembership?.role !== "owner") {
        throw new Error("Apenas o admin pode remover membros");
      }

      // 1. Remove from group members
      await deleteDoc(doc(db, `groups/${groupId}/members`, userId));
      // 2. Remove from user's memberships
      await deleteDoc(doc(db, `users/${userId}/memberships`, groupId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `groups/${groupId}/members/${userId}`);
    }
  };

  const cancelInvite = async (groupId: string, email: string) => {
    if (!user) throw new Error("Must be logged in");
    const cleanEmail = email.trim().toLowerCase();
    try {
      // Verify if current user is owner
      const myMembership = activeGroupMembers.find(m => m.userId === user.uid);
      if (myMembership?.role !== "owner") {
        throw new Error("Apenas o admin pode cancelar convites");
      }

      // 1. Remove from group_invitations
      const invId = `${groupId}_${cleanEmail.replace(/\./g, '_')}`;
      await deleteDoc(doc(db, "group_invitations", invId));
      
      // 2. Remove the "invite_..." record from group members
      const inviteMemberId = `invite_${cleanEmail.replace(/\./g, '_')}`;
      await deleteDoc(doc(db, `groups/${groupId}/members`, inviteMemberId));
      
      // 3. Try to find if a real user was linked
      const userQuery = query(collection(db, "users"), where("email", "==", cleanEmail));
      const userSnap = await getDocs(userQuery);
      if (!userSnap.empty) {
        const targetUid = userSnap.docs[0].id;
        await deleteDoc(doc(db, `users/${targetUid}/memberships`, groupId));
        await deleteDoc(doc(db, `groups/${groupId}/members`, targetUid));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `group_invitations`);
    }
  };

  const updateSettings = async (name: string, wa: string) => {
    try {
      const res = await apiFetch("/api/app/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: name, whatsappNumber: wa })
      });
      if (res.ok) {
        setCompanyName(name);
        setWhatsappNumber(wa);
      }
    } catch (err) {
      console.error("Failed to update settings", err);
      throw err;
    }
  };

  const handleBackup = async () => {
    try {
      const res = await apiFetch("/api/app/backup", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    } catch (err) {
      console.error("Backup failed", err);
      throw err;
    }
  };

  const updateProfile = async (displayName: string, photoURL: string, whatsapp?: string) => {
    if (!user) return;
    try {
      // 1. Update user profile
      await setDoc(doc(db, "users", user.uid), {
        displayName,
        photoURL,
        whatsapp: whatsapp || "",
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Update current membership in active group if exists
      if (activeGroup) {
        await setDoc(doc(db, `groups/${activeGroup.id}/members`, user.uid), {
          displayName,
          photoURL,
          whatsapp: whatsapp || ""
        }, { merge: true });
      }

      // 3. Update all memberships
      const membershipsSnap = await getDocs(collection(db, `users/${user.uid}/memberships`));
      const syncPromises = membershipsSnap.docs.map(async (mDoc) => {
        const gid = mDoc.id;
        try {
          await setDoc(doc(db, `groups/${gid}/members`, user.uid), {
            displayName,
            photoURL,
            whatsapp: whatsapp || ""
          }, { merge: true });
        } catch (e) {
          console.error(`Failed to sync profile to group ${gid}`, e);
        }
      });
      await Promise.all(syncPromises);

    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  return (
    <GroupContext.Provider value={{ 
      groups, 
      invites, 
      activeGroup, 
      activeGroupMembers,
      loading, 
      companyName,
      whatsappNumber,
      updateSettings,
      handleBackup,
      setActiveGroupId, 
      createGroup, 
      inviteUser, 
      acceptInvite,
      declineInvite,
      removeMember,
      cancelInvite,
      updateProfile
    }}>
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  const context = useContext(GroupContext);
  if (context === undefined) {
    throw new Error("useGroup must be used within a GroupProvider");
  }
  return context;
}
