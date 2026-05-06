import React, { createContext, useContext, useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
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

interface GroupContextType {
  groups: Group[];
  invites: Group[];
  activeGroup: Group | null;
  loading: boolean;
  companyName: string;
  whatsappNumber: string;
  updateSettings: (name: string, wa: string) => Promise<void>;
  handleBackup: () => Promise<any>;
  setActiveGroupId: (id: string) => void;
  createGroup: (name: string) => Promise<string>;
  inviteUser: (groupId: string, email: string) => Promise<void>;
  acceptInvite: (groupId: string) => Promise<void>;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("Doctor Pro");
  const [whatsappNumber, setWhatsappNumber] = useState("");

  const apiFetch = (url: string, init?: RequestInit) => {
    const groupId = activeGroup?.id || localStorage.getItem("activeGroupId") || "";
    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        "x-group-id": groupId
      }
    });
  };

  useEffect(() => {
    if (!activeGroup) return;
    
    // Fetch Settings for active group
    apiFetch("/api/app/settings")
      .then(res => res.json())
      .then(data => {
        setCompanyName(data.companyName || "Doctor Pro");
        setWhatsappNumber(data.whatsappNumber || "");
      })
      .catch(err => console.error("Failed to fetch settings", err));
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
          const groupDoc = await getDocs(query(collection(db, "groups"), where("id", "==", groupId)));
          
          let groupInfo: Group;
          if (!groupDoc.empty) {
            groupInfo = { id: groupId, ...groupDoc.docs[0].data(), status: mData.status || "active" } as Group;
          } else {
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
        const savedGroupId = localStorage.getItem("activeGroupId");
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
    const invitationsQuery = query(collection(db, "group_invitations"), where("email", "==", user.email), where("status", "==", "pending"));
    const unsubscribeInvitations = onSnapshot(invitationsQuery, (snapshot) => {
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

    return () => {
      unsubscribeMemberships();
      unsubscribeInvitations();
    };
  }, [user, user?.email]);

  const setActiveGroupId = (id: string) => {
    const group = groups.find(g => g.id === id);
    if (group) {
      setActiveGroup(group);
      localStorage.setItem("activeGroupId", id);
    }
  };

  const createGroup = async (name: string) => {
    if (!user) throw new Error("Must be logged in");

    try {
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
        userEmail: user.email,
        role: "owner",
        joinedAt: serverTimestamp()
      });

      // Add to user's memberships
      await setDoc(doc(db, `users/${user.uid}/memberships`, groupId), {
        groupId,
        groupName: name,
        role: "owner",
        status: "active"
      });

      return groupId;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, "groups");
      throw err; // Should not reach here as handleFirestoreError throws
    }
  };

  const inviteUser = async (groupId: string, email: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
       // 1. Always create a record in group_invitations by email
       // This handles users who are not yet in the system
       const invId = `${groupId}_${email.replace(/\./g, '_')}`;
       await setDoc(doc(db, "group_invitations", invId), {
         email,
         groupId,
         groupName: activeGroup?.name || "Novo Grupo",
         inviterId: user.uid,
         inviterEmail: user.email,
         status: "pending",
         createdAt: serverTimestamp()
       }, { merge: true });

       // 2. Try to find user to notify them directly if they exist
       const userQuery = query(collection(db, "users"), where("email", "==", email));
       const userSnap = await getDocs(userQuery);
       
       if (!userSnap.empty) {
         const targetUid = userSnap.docs[0].id;
         
         // Add to group members
         await setDoc(doc(db, `groups/${groupId}/members`, targetUid), {
           userId: targetUid,
           userEmail: email,
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
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `group_invitations`);
    }
  };

  const acceptInvite = async (groupId: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
      // 1. Update membership status (record might not exist yet if they were invited by email)
      await setDoc(doc(db, `users/${user.uid}/memberships`, groupId), {
        groupId,
        groupName: invites.find(i => i.id === groupId)?.name || "Novo Grupo",
        role: "member",
        status: "active"
      }, { merge: true });

      // 2. Update group member status
      await setDoc(doc(db, `groups/${groupId}/members`, user.uid), {
        userId: user.uid,
        userEmail: user.email,
        status: "active",
        joinedAt: serverTimestamp()
      }, { merge: true });

      // 3. Mark invitation as completed
      const invId = `${groupId}_${user.email?.replace(/\./g, '_')}`;
      await setDoc(doc(db, "group_invitations", invId), {
        status: "accepted",
        acceptedAt: serverTimestamp()
      }, { merge: true });

      setActiveGroupId(groupId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/memberships/${groupId}`);
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

  return (
    <GroupContext.Provider value={{ 
      groups, 
      invites, 
      activeGroup, 
      loading, 
      companyName,
      whatsappNumber,
      updateSettings,
      handleBackup,
      setActiveGroupId, 
      createGroup, 
      inviteUser, 
      acceptInvite 
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
