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

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setInvites([]);
      setActiveGroup(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // We need to find groups where the user is a member
    const membershipsPath = `users/${user.uid}/memberships`;
    const unsubscribe = onSnapshot(collection(db, membershipsPath), async (snapshot) => {
      try {
        const membershipPromises = snapshot.docs.map(async (membershipDoc) => {
          const groupId = membershipDoc.id;
          const mData = membershipDoc.data();
          const groupDoc = await getDocs(query(collection(db, "groups"), where("id", "==", groupId)));
          
          let groupInfo: Group;
          if (!groupDoc.empty) {
            groupInfo = { id: groupId, ...groupDoc.docs[0].data(), status: mData.status || "active" } as Group;
          } else {
            // Fallback for direct doc access if ID matches doc name
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
        
        const activeGroups = fetchedMemberships.filter(m => m.status === "active");
        const pendingGroups = fetchedMemberships.filter(m => m.status === "pending");

        setGroups(activeGroups);
        setInvites(pendingGroups);

        // Restore active group from localStorage or pick first active
        const savedGroupId = localStorage.getItem("activeGroupId");
        const found = activeGroups.find(g => g.id === savedGroupId);
        if (found) {
          setActiveGroup(found);
        } else if (activeGroups.length > 0) {
          setActiveGroup(activeGroups[0]);
        } else {
          setActiveGroup(null);
        }
        setLoading(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, membershipsPath);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, membershipsPath);
    });

    return () => unsubscribe();
  }, [user]);

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
     try {
       // In a real app, this would send an invite or use a cloud function to find UID by email
       // For this demo, we'll assume we know the email and search for the user in our 'users' collection
       const userQuery = query(collection(db, "users"), where("email", "==", email));
       const userSnap = await getDocs(userQuery);
       
       if (userSnap.empty) {
         throw new Error("User not found. They must login to the app first.");
       }

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
         groupName: groups.find(g => g.id === groupId)?.name || "New Group",
         role: "member",
         status: "pending"
       });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${groupId}/members`);
    }
  };

  const acceptInvite = async (groupId: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
      // Update membership status
      await setDoc(doc(db, `users/${user.uid}/memberships`, groupId), {
        status: "active"
      }, { merge: true });

      // Update group member status
      await setDoc(doc(db, `groups/${groupId}/members`, user.uid), {
        status: "active",
        joinedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/memberships/${groupId}`);
    }
  };

  return (
    <GroupContext.Provider value={{ groups, invites, activeGroup, loading, setActiveGroupId, createGroup, inviteUser, acceptInvite }}>
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
