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
  status: "active" | "pending" | "cancelled" | "removed";
}

interface GroupContextType {
  groups: Group[];
  invites: Group[];
  activeGroup: Group | null;
  activeGroupMembers: GroupMember[];
  loading: boolean;
  companyName: string;
  whatsappNumber: string;
  imageAnalysisPrompt: string;
  updateSettings: (name: string, wa: string, prompt?: string) => Promise<void>;
  handleBackup: () => Promise<any>;
  setActiveGroupId: (id: string) => void;
  createGroup: (name: string) => Promise<string>;
  inviteUser: (groupId: string, email: string) => Promise<void>;
  acceptInvite: (groupId: string) => Promise<void>;
  declineInvite: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  cancelInvite: (groupId: string, email: string) => Promise<void>;
  updateProfile: (displayName: string, photoURL: string, whatsapp?: string) => Promise<void>;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  isManagementOpen: boolean;
  setIsManagementOpen: (open: boolean) => void;
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
  const [imageAnalysisPrompt, setImageAnalysisPrompt] = useState("");
  const [isManagementOpen, setIsManagementOpen] = useState(false);

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

    let isMounted = true;

    // Fetch Settings for active group
    apiFetch("/api/app/settings")
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (data.companyName) setCompanyName(data.companyName);
        if (data.whatsappNumber) setWhatsappNumber(data.whatsappNumber);
        if (data.imageAnalysisPrompt) setImageAnalysisPrompt(data.imageAnalysisPrompt);
      })
      .catch(err => console.error("Failed to fetch settings", err));

    // Listen to group members
    const membersPath = `groups/${activeGroup.id}/members`;
    let unsubscribeMembers: () => void = () => {};
    
    try {
      unsubscribeMembers = onSnapshot(collection(db, membersPath), (snapshot) => {
        if (!isMounted) return;
        const members = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            userEmail: data.userEmail || ""
          } as GroupMember;
        });
        setActiveGroupMembers(members);
      }, (error) => {
        if (isMounted) {
          console.error("Members listener error:", error);
          // If we get a permission error on the active group, it might be because it was deleted
          if (error.code === 'permission-denied') {
             // Let the memberships effect handle the redirection
             console.warn("Permission denied for members. Group might be deleted.");
          }
        }
      });
    } catch (e) {
      console.error("Failed to start members listener", e);
    }

    return () => {
      isMounted = false;
      unsubscribeMembers();
    };
  }, [activeGroup?.id]);

  const [rawMemberships, setRawMemberships] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setInvites([]);
      setActiveGroup(null);
      setLoading(false);
      setRawMemberships([]);
      return;
    }

    let isMounted = true;
    setLoading(true);
    
    // Listen to memberships - strictly synchronous
    const membershipsPath = `users/${user.uid}/memberships`;
    const unsubscribeMemberships = onSnapshot(collection(db, membershipsPath), (snapshot) => {
      if (!isMounted) return;
      const memberships = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRawMemberships(memberships);
    }, (error) => {
      if (!isMounted) return;
      handleFirestoreError(error, OperationType.GET, membershipsPath);
      setLoading(false);
    });

    // Listen to invitations by email
    let unsubscribeInvitations = () => {};
    if (user.email) {
      const cleanEmail = user.email.trim().toLowerCase();
      const invitationsQuery = query(collection(db, "group_invitations"), where("email", "==", cleanEmail), where("status", "==", "pending"));
      unsubscribeInvitations = onSnapshot(invitationsQuery, (snapshot) => {
        if (!isMounted) return;
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
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = emailInvites.filter(ei => !existingIds.has(ei.id));
          return [...prev, ...newOnes];
        });
      }, (error) => {
        console.error("Invitations listener error", error);
      });
    }

    return () => {
      isMounted = false;
      unsubscribeMemberships();
      unsubscribeInvitations();
    };
  }, [user?.uid, user?.email]);

  // Effect to fetch detailed group info when rawMemberships change
  useEffect(() => {
    if (rawMemberships.length === 0) {
      setGroups([]);
      if (!loading) setLoading(false);
      return;
    }

    let isSubscribed = true;

    const fetchDetailedGroups = async () => {
      try {
        const activeGroupsData: Group[] = [];
        const pendingGroupsData: Group[] = [];

        for (const mData of rawMemberships) {
          const groupId = mData.id;
          let groupInfo: Group | null = null;
          
          try {
            const groupDoc = await getDoc(doc(db, "groups", groupId));
            if (groupDoc.exists()) {
              groupInfo = { id: groupId, ...groupDoc.data(), status: mData.status || "active" } as Group;
            } else {
              // Group doc doesn't exist anymore - we ignore it to solve the "still showing" issue
              console.log(`Group ${groupId} deleted in Firestore, ignoring membership.`);
              continue; 
            }
          } catch (e) {
            console.warn(`Failed to fetch group ${groupId}, ignoring...`, e);
            continue;
          }

          if (groupInfo) {
            if (groupInfo.status === "active") {
              activeGroupsData.push(groupInfo);
            } else if (groupInfo.status === "pending") {
              pendingGroupsData.push(groupInfo);
            }
          }
        }

        if (!isSubscribed) return;

        setGroups(prev => {
          if (JSON.stringify(prev) === JSON.stringify(activeGroupsData)) return prev;
          return activeGroupsData;
        });
        
        setInvites(prev => {
          const existingIds = new Set(pendingGroupsData.map(p => p.id));
          const emailOnly = prev.filter(p => !existingIds.has(p.id));
          const next = [...pendingGroupsData, ...emailOnly];
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });

        // Restore active group
        const savedGroupId = safeLocalStorage.getItem("activeGroupId");
        const found = activeGroupsData.find(g => g.id === savedGroupId);
        if (found) {
          setActiveGroup(prev => (prev?.id === found.id ? prev : found));
        } else if (activeGroupsData.length > 0) {
          // If the group we were on is gone or we don't have one, pick the first valid one
          if (!activeGroup || !activeGroupsData.find(g => g.id === activeGroup.id)) {
            setActiveGroup(activeGroupsData[0]);
            safeLocalStorage.setItem("activeGroupId", activeGroupsData[0].id);
          }
        } else {
          setActiveGroup(null);
          safeLocalStorage.setItem("activeGroupId", "");
        }
        setLoading(false);
      } catch (err) {
        console.error("Error processing memberships details", err);
        if (isSubscribed) setLoading(false);
      }
    };

    fetchDetailedGroups();

    return () => {
      isSubscribed = false;
    };
  }, [rawMemberships]);

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
       // 0. Check if already invited or member
       const existing = activeGroupMembers.find(m => m.userEmail.toLowerCase() === cleanEmail);
       if (existing && existing.status !== "removed") {
         throw new Error("Este usuário já foi convidado ou já faz parte do grupo");
       }

       // Verify if current user is owner (admin)
       const myMembership = activeGroupMembers.find(m => m.userId === user.uid);
       if (myMembership?.role !== "owner") {
         throw new Error("Apenas o admin pode convidar membros");
       }

       // 1. Try to find if a real user exists
       let targetUid = "";
       try {
         const userQuery = query(collection(db, "users"), where("email", "==", cleanEmail));
         const userSnap = await getDocs(userQuery);
         if (!userSnap.empty) {
           targetUid = userSnap.docs[0].id;
         }
       } catch (e) {
         console.warn("Could not check user existence", e);
       }

       // 2. Always create a record in group_invitations by email
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

       // 3. Add to group members list so owner can see status in UI (Only one record)
       const memberDocId = targetUid || `invite_${cleanEmail.replace(/\./g, '_')}`;
       await setDoc(doc(db, `groups/${groupId}/members`, memberDocId), {
         userId: targetUid, 
         userEmail: cleanEmail,
         role: "member",
         status: "pending",
         invitedAt: serverTimestamp()
       }, { merge: true });

       // 4. Update target user's memberships if they exist
       if (targetUid) {
         await setDoc(doc(db, `users/${targetUid}/memberships`, groupId), {
           groupId,
           groupName: activeGroup?.name || "Novo Grupo",
           role: "member",
           status: "pending"
         }, { merge: true });
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

      // 1. Mark as removed in group members
      await setDoc(doc(db, `groups/${groupId}/members`, userId), {
        status: "removed",
        removedAt: serverTimestamp()
      }, { merge: true });
      
      // 2. Mark as removed in user's memberships
      await setDoc(doc(db, `users/${userId}/memberships`, groupId), {
        status: "removed"
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${groupId}/members/${userId}`);
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

      // 1. Mark as removed in group_invitations
      const invId = `${groupId}_${cleanEmail.replace(/\./g, '_')}`;
      await setDoc(doc(db, "group_invitations", invId), {
        status: "cancelled",
        cancelledAt: serverTimestamp()
      }, { merge: true });
      
      // 2. Mark the "invite_..." record from group members as removed
      const inviteMemberId = `invite_${cleanEmail.replace(/\./g, '_')}`;
      await setDoc(doc(db, `groups/${groupId}/members`, inviteMemberId), {
        status: "removed"
      }, { merge: true });
      
      // 3. Try to find if a real user was linked
      const userQuery = query(collection(db, "users"), where("email", "==", cleanEmail));
      const userSnap = await getDocs(userQuery);
      if (!userSnap.empty) {
        const targetUid = userSnap.docs[0].id;
        await setDoc(doc(db, `users/${targetUid}/memberships`, groupId), {
          status: "removed"
        }, { merge: true });
        await setDoc(doc(db, `groups/${groupId}/members`, targetUid), {
          status: "removed"
        }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `group_invitations`);
    }
  };

  const updateSettings = async (name: string, wa: string, prompt?: string) => {
    try {
      const res = await apiFetch("/api/app/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          companyName: name, 
          whatsappNumber: wa,
          imageAnalysisPrompt: prompt 
        })
      });
      if (res.ok) {
        setCompanyName(name);
        setWhatsappNumber(wa);
        if (prompt !== undefined) setImageAnalysisPrompt(prompt);
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
      imageAnalysisPrompt,
      updateSettings,
      handleBackup,
      setActiveGroupId, 
      createGroup, 
      inviteUser, 
      acceptInvite,
      declineInvite,
      removeMember,
      cancelInvite,
      updateProfile,
      apiFetch,
      isManagementOpen,
      setIsManagementOpen
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
