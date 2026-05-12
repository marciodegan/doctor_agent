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
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { useAuth } from "../hooks/useAuth";
import { OperationType, handleFirestoreError } from "../lib/firestoreUtils";

interface Group {
  id: string;
  name: string;
  createdBy: string;
  groupType: "professional" | "personal";
  photoURL?: string;
  status?: "active" | "pending";
  active?: boolean;
  ativo?: boolean;
}

interface GroupMember {
  userId: string;
  userEmail: string;
  displayName?: string;
  photoURL?: string;
  whatsapp?: string;
  role: string;
  status: "active" | "pending" | "cancelled" | "removed" | "conectado";
}

interface GroupContextType {
  groups: Group[];
  invites: Group[];
  activeGroup: Group | null;
  activeGroupMembers: GroupMember[];
  loading: boolean;
  companyName: string;
  whatsappNumber: string;
  userWhatsapp: string;
  imageAnalysisPrompt: string;
  updateSettings: (
    name: string,
    wa: string,
    prompt?: string,
    groupPhotoURL?: string,
  ) => Promise<void>;
  handleBackup: () => Promise<any>;
  setActiveGroupId: (id: string) => void;
  createGroup: (
    name: string,
    type: "professional" | "personal",
  ) => Promise<string>;
  inviteUser: (groupId: string, email: string) => Promise<void>;
  acceptInvite: (groupId: string) => Promise<void>;
  declineInvite: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, userId: string) => Promise<void>;
  updateMemberRole: (groupId: string, userId: string, role: string) => Promise<void>;
  toggleGroupStatus: (groupId: string, active: boolean) => Promise<void>;
  cancelInvite: (groupId: string, email: string) => Promise<void>;
  updateProfile: (
    displayName: string,
    photoURL: string,
    whatsapp?: string,
  ) => Promise<void>;
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  isManagementOpen: boolean;
  setIsManagementOpen: (open: boolean) => void;
  managementMode: "dashboard" | "members" | "configs" | "shopping_config";
  setManagementMode: (mode: "dashboard" | "members" | "configs" | "shopping_config") => void;
  configsActiveTab: string | null;
  setConfigsActiveTab: (tab: string | null) => void;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [invites, setInvites] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [activeGroupMembers, setActiveGroupMembers] = useState<GroupMember[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("Doctor Pro");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [userWhatsapp, setUserWhatsapp] = useState("");
  const [imageAnalysisPrompt, setImageAnalysisPrompt] = useState("");
  const [isManagementOpen, setIsManagementOpen] = useState(false);
  const [managementMode, setManagementMode] = useState<"dashboard" | "members" | "configs" | "shopping_config">("dashboard");
  const [configsActiveTab, setConfigsActiveTab] = useState<string | null>(null);

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
    },
  };

  const apiFetch = (url: string, init?: RequestInit) => {
    const groupId =
      activeGroup?.id || safeLocalStorage.getItem("activeGroupId") || "";
    return fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...init?.headers,
        "x-group-id": groupId,
      },
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
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.companyName) setCompanyName(data.companyName);
        if (data.whatsappNumber) setWhatsappNumber(data.whatsappNumber);
        if (data.imageAnalysisPrompt)
          setImageAnalysisPrompt(data.imageAnalysisPrompt);
      })
      .catch((err) => console.error("Failed to fetch settings", err));

    // Listen to group members
    const membersPath = `groups/${activeGroup.id}/members`;
    let unsubscribeMembers: () => void = () => {};
    let unsubscribeGroupDoc: () => void = () => {};

    try {
      // Listen to members
      unsubscribeMembers = onSnapshot(
        collection(db, membersPath),
        (snapshot) => {
          if (!isMounted) return;
          const members = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              ...data,
              userEmail: data.userEmail || "",
            } as GroupMember;
          });
          setActiveGroupMembers(members);
        },
        (error) => {
          if (isMounted) {
            console.error("Members listener error:", error);
          }
        },
      );

      // Listen to group doc itself for real-time name/photo updates
      unsubscribeGroupDoc = onSnapshot(
        doc(db, "groups", activeGroup.id),
        (docSnap) => {
          if (!isMounted || !docSnap.exists()) return;
          const data = docSnap.data();
          setActiveGroup(prev => {
            if (!prev) return prev;
            if (prev.name === data.name && prev.photoURL === data.photoURL) return prev;
            
            // Sync companyName with group name for consistency across UI
            if (data.name && data.name !== companyName) {
              setCompanyName(data.name);
            }
            
            return {
              ...prev,
              name: data.name || prev.name,
              photoURL: data.photoURL || "",
              groupType: data.groupType || prev.groupType,
              active: data.active !== false && data.ativo !== false,
              ativo: data.ativo !== false && data.active !== false,
            };
          });
        }
      );
    } catch (e) {
      console.error("Failed to start group listeners", e);
    }

    return () => {
      isMounted = false;
      unsubscribeMembers();
      unsubscribeGroupDoc();
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
    const unsubscribeMemberships = onSnapshot(
      collection(db, membershipsPath),
      (snapshot) => {
        if (!isMounted) return;
        const memberships = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRawMemberships(memberships);
      },
      (error) => {
        if (!isMounted) return;
        handleFirestoreError(error, OperationType.GET, membershipsPath);
        setLoading(false);
      },
    );

    // Listen to invitations by email
    let unsubscribeInvitations = () => {};
    if (user.email) {
      const cleanEmail = user.email.trim().toLowerCase();
      const invitationsQuery = query(
        collection(db, "group_invitations"),
        where("email", "==", cleanEmail),
        where("status", "==", "pending"),
      );
      unsubscribeInvitations = onSnapshot(
        invitationsQuery,
        (snapshot) => {
          if (!isMounted) return;
          const emailInvites = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: data.groupId,
              name: data.groupName || "Novo Grupo",
              createdBy: data.inviterId,
              status: "pending" as const,
              groupType: data.groupType || "professional",
            };
          });

          setInvites((prev) => {
            // Keep invites that were fetched via rawMemberships (which are in groups or detailed fetch)
            // But replace the ones fetched via the invitations query
            const membershipIds = new Set(rawMemberships.map(m => m.id));
            const otherInvites = prev.filter(p => membershipIds.has(p.id));
            
            // Avoid duplicates between detailed groups and email invites
            const emailInviteIds = new Set(emailInvites.map(ei => ei.id));
            const filteredOtherInvites = otherInvites.filter(oi => !emailInviteIds.has(oi.id));
            
            return [...filteredOtherInvites, ...emailInvites];
          });
        },
        (error) => {
          console.error("Invitations listener error", error);
        },
      );
    }

    return () => {
      isMounted = false;
      unsubscribeMemberships();
      unsubscribeInvitations();
    };
  }, [user?.uid, user?.email]);

  // Listen to user profile for userWhatsapp
  useEffect(() => {
    if (!user) {
      setUserWhatsapp("");
      return;
    }

    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserWhatsapp(data.whatsapp || "");
      }
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Restore active group effect
  useEffect(() => {
    if (activeGroup?.name) {
      document.title = activeGroup.name;
    } else {
      document.title = "Doctor Pro";
    }
  }, [activeGroup?.name]);

  // Effect to populate groups when rawMemberships change
  useEffect(() => {
    if (rawMemberships.length === 0) {
      setGroups([]);
      if (!loading) setLoading(false);
      return;
    }

    // Immediately populate groups from membership data to show UI fast
    // This avoids sequential getDoc calls for each membership which was slowing down login
    const membershipGroups = rawMemberships.map(m => ({
      id: m.id,
      name: m.groupName || m.name || "Grupo",
      groupType: m.groupType || "professional",
      status: (m.status === "conectado" || m.status === "active") ? "active" : (m.status || "active"),
      photoURL: m.groupPhotoURL || m.photoURL || "",
      active: true,
      ativo: true,
      createdBy: "" 
    } as unknown as Group));

    const activeList = membershipGroups.filter(g => g.status === "active") as Group[];
    const pendingList = membershipGroups.filter(g => g.status === "pending") as Group[];

    setGroups(activeList);

    setInvites((prev) => {
      const existingIds = new Set(pendingList.map((p) => p.id));
      const emailOnly = prev.filter((p) => !existingIds.has(p.id));
      return [...pendingList, ...emailOnly];
    });

    // Restore active group
    const savedGroupId = safeLocalStorage.getItem("activeGroupId");
    const found = activeList.find((g) => g.id === savedGroupId);
    
    if (found) {
      setActiveGroup((prev) => (prev?.id === found.id ? prev : found));
    } else if (activeList.length > 0) {
      // If the group we were on is gone or we don't have one, pick the first valid one
      if (
        !activeGroup ||
        !activeList.find((g) => g.id === activeGroup.id)
      ) {
        setActiveGroup(activeList[0]);
        safeLocalStorage.setItem("activeGroupId", activeList[0].id);
      }
    } else {
      setActiveGroup(null);
      safeLocalStorage.setItem("activeGroupId", "");
    }
    
    setLoading(false);
  }, [rawMemberships]);

  const setActiveGroupId = (id: string) => {
    safeLocalStorage.setItem("activeGroupId", id);
    const group = groups.find((g) => g.id === id);
    if (group) {
      setActiveGroup(group);
    }
  };

  const createGroup = async (
    name: string,
    type: "professional" | "personal" = "professional",
  ) => {
    if (!user) throw new Error("Must be logged in");

    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const profile = userSnap.exists() ? userSnap.data() : {};

      const groupRef = await addDoc(collection(db, "groups"), {
        name,
        groupType: type,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
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
        joinedAt: serverTimestamp(),
      });

      // Add to user's memberships
      await setDoc(doc(db, `users/${user.uid}/memberships`, groupId), {
        groupId,
        groupName: name,
        groupType: type,
        role: "owner",
        status: "active",
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
      // 0. Check if already active or pending
      const existing = activeGroupMembers.find(
        (m) => m.userEmail.toLowerCase() === cleanEmail,
      );
      if (existing && (existing.status === "active" || existing.status === "conectado" || existing.status === "pending")) {
        throw new Error(
          "Este usuário já foi convidado ou já faz parte do grupo",
        );
      }

      // Verify if current user is owner (admin)
      const myMembership = activeGroupMembers.find(
        (m) => m.userId === user.uid,
      );
      if (myMembership?.role !== "owner") {
        throw new Error("Apenas o admin pode convidar membros");
      }

      // 1. Try to find if a real user exists
      let targetUid = "";
      try {
        const userQuery = query(
          collection(db, "users"),
          where("email", "==", cleanEmail),
        );
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          targetUid = userSnap.docs[0].id;
        }
      } catch (e) {
        console.warn("Could not check user existence", e);
      }

      // 2. Always create a record in group_invitations by email
      const invId = `${groupId}_${cleanEmail.replace(/\./g, "_")}`;
      await setDoc(
        doc(db, "group_invitations", invId),
        {
          email: cleanEmail,
          groupId,
          groupName: activeGroup?.name || "Novo Grupo",
          groupType: activeGroup?.groupType || "professional",
          inviterId: user.uid,
          inviterEmail: user.email,
          status: "pending",
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 3. Add to group members list so owner can see status in UI (Only one record)
      const memberDocId =
        targetUid || `invite_${cleanEmail.replace(/\./g, "_")}`;
      await setDoc(
        doc(db, `groups/${groupId}/members`, memberDocId),
        {
          userId: targetUid,
          userEmail: cleanEmail,
          role: "member",
          status: "pending",
          invitedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 4. Update target user's memberships if they exist
      if (targetUid) {
        await setDoc(
          doc(db, `users/${targetUid}/memberships`, groupId),
          {
            groupId,
            groupName: activeGroup?.name || "Novo Grupo",
            groupType: activeGroup?.groupType || "professional",
            role: "member",
            status: "pending",
          },
          { merge: true },
        );
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
      await setDoc(
        doc(db, `users/${user.uid}/memberships`, groupId),
        {
          groupId,
          groupName:
            invites.find((i) => i.id === groupId)?.name || "Novo Grupo",
          role: "member",
          status: "conectado",
        },
        { merge: true },
      );

      // 2. Update group member status
      await setDoc(
        doc(db, `groups/${groupId}/members`, user.uid),
        {
          userId: user.uid,
          userEmail: user.email || "",
          displayName: profile.displayName || "",
          photoURL: profile.photoURL || "",
          whatsapp: profile.whatsapp || "",
          status: "conectado", // This is the status requested by user
          joinedAt: serverTimestamp(),
          removedAt: null, // Clear removal timestamp if any
        },
        { merge: true },
      );

      // 3. Mark invitation as completed
      const invId = `${groupId}_${cleanEmail.replace(/\./g, "_")}`;
      await setDoc(
        doc(db, "group_invitations", invId),
        {
          status: "accepted",
          acceptedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 4. Try to cleanup the "invite_..." record from group members
      const inviteMemberId = `invite_${cleanEmail.replace(/\./g, "_")}`;
      try {
        await deleteDoc(doc(db, `groups/${groupId}/members`, inviteMemberId));
      } catch (e) {
        console.warn("Could not cleanup invite record from group members", e);
      }

      setActiveGroupId(groupId);
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `users/${user.uid}/memberships/${groupId}`,
      );
    }
  };

  const declineInvite = async (groupId: string) => {
    if (!user) throw new Error("Must be logged in");
    const cleanEmail = user.email?.trim().toLowerCase() || "";
    try {
      // 1. Update target user's membership status to cancelled
      await setDoc(
        doc(db, `users/${user.uid}/memberships`, groupId),
        {
          status: "cancelled",
        },
        { merge: true },
      );

      // 2. Update group members status to cancelled
      await setDoc(
        doc(db, `groups/${groupId}/members`, user.uid),
        {
          status: "cancelled",
        },
        { merge: true },
      );

      // 3. Update the global invitation record
      const invId = `${groupId}_${cleanEmail.replace(/\./g, "_")}`;
      await setDoc(
        doc(db, "group_invitations", invId),
        {
          status: "declined",
          declinedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 4. Try to cleanup/update the "invite_..." record from group members
      const inviteMemberId = `invite_${cleanEmail.replace(/\./g, "_")}`;
      try {
        await setDoc(
          doc(db, `groups/${groupId}/members`, inviteMemberId),
          {
            status: "cancelled",
          },
          { merge: true },
        );
      } catch (e) {
        console.warn("Could not update invite record from group members", e);
      }

      // Remove from local list
      setInvites((prev) => prev.filter((i) => i.id !== groupId));
    } catch (err) {
      console.error("Failed to decline invite", err);
    }
  };

  const removeMember = async (groupId: string, userId: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
      // Verify if current user is owner
      const myMembership = activeGroupMembers.find(
        (m) => m.userId === user.uid,
      );
      if (myMembership?.role !== "owner") {
        throw new Error("Apenas o admin pode remover membros");
      }

      // 1. Mark as removed in group members
      await setDoc(
        doc(db, `groups/${groupId}/members`, userId),
        {
          status: "removed",
          removedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 2. Mark as removed in user's memberships
      await setDoc(
        doc(db, `users/${userId}/memberships`, groupId),
        {
          status: "removed",
        },
        { merge: true },
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `groups/${groupId}/members/${userId}`,
      );
    }
  };

  const updateMemberRole = async (groupId: string, userId: string, role: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
      // Verify if current user is owner
      const myMembership = activeGroupMembers.find(
        (m) => m.userId === user.uid,
      );
      if (myMembership?.role !== "owner") {
        throw new Error("Apenas o admin pode alterar permissões");
      }

      // 1. Update in group members
      await setDoc(
        doc(db, `groups/${groupId}/members`, userId),
        {
          role: role,
        },
        { merge: true },
      );

      // 2. Update in user's memberships
      await setDoc(
        doc(db, `users/${userId}/memberships`, groupId),
        {
          role: role,
        },
        { merge: true },
      );
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.WRITE,
        `groups/${groupId}/members/${userId}`,
      );
    }
  };

  const cancelInvite = async (groupId: string, email: string) => {
    if (!user) throw new Error("Must be logged in");
    const cleanEmail = email.trim().toLowerCase();
    try {
      // Verify if current user is owner
      const myMembership = activeGroupMembers.find(
        (m) => m.userId === user.uid,
      );
      if (myMembership?.role !== "owner") {
        throw new Error("Apenas o admin pode cancelar convites");
      }

      // 1. Mark as removed in group_invitations
      const invId = `${groupId}_${cleanEmail.replace(/\./g, "_")}`;
      await setDoc(
        doc(db, "group_invitations", invId),
        {
          status: "cancelled",
          cancelledAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 2. Mark the "invite_..." record from group members as removed
      const inviteMemberId = `invite_${cleanEmail.replace(/\./g, "_")}`;
      await setDoc(
        doc(db, `groups/${groupId}/members`, inviteMemberId),
        {
          status: "removed",
        },
        { merge: true },
      );

      // 3. Try to find if a real user was linked
      const userQuery = query(
        collection(db, "users"),
        where("email", "==", cleanEmail),
      );
      const userSnap = await getDocs(userQuery);
      if (!userSnap.empty) {
        const targetUid = userSnap.docs[0].id;
        await setDoc(
          doc(db, `users/${targetUid}/memberships`, groupId),
          {
            status: "removed",
          },
          { merge: true },
        );
        await setDoc(
          doc(db, `groups/${groupId}/members`, targetUid),
          {
            status: "removed",
          },
          { merge: true },
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `group_invitations`);
    }
  };

  const toggleGroupStatus = async (groupId: string, active: boolean) => {
    if (!user) throw new Error("Must be logged in");
    try {
      // 1. Get current group data to check if user is creator
      const groupDocRef = doc(db, "groups", groupId);
      const groupSnap = await getDoc(groupDocRef);
      const groupData = groupSnap.data();
      const isCreator = groupData?.createdBy === user.uid;

      // 2. Check membership role (owner)
      const myMembership = activeGroupMembers.find(m => m.userId === user.uid);
      const isOwner = myMembership?.role === "owner";

      if (!isOwner && !isCreator) {
        throw new Error("Apenas o administrador do grupo pode desativá-lo.");
      }

      // 3. Update the document with both field names to ensure compatibility
      await setDoc(groupDocRef, {
        active: active,
        ativo: active,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 4. Update local state immediately
      if (activeGroup?.id === groupId) {
        setActiveGroup(prev => prev ? { ...prev, active, ativo: active } : null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${groupId}`);
    }
  };

  const updateSettings = async (
    name: string,
    wa: string,
    prompt?: string,
    groupPhotoURL?: string,
  ) => {
    try {
      const res = await apiFetch("/api/app/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: name,
          whatsappNumber: wa,
          imageAnalysisPrompt: prompt,
          groupPhotoURL: groupPhotoURL,
        }),
      });
      if (res.ok) {
        setCompanyName(name);
        setWhatsappNumber(wa);
        if (prompt !== undefined) setImageAnalysisPrompt(prompt);
        if (groupPhotoURL !== undefined && activeGroup) {
          setActiveGroup({ ...activeGroup, photoURL: groupPhotoURL });
        }
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

  const updateProfile = async (
    displayName: string,
    photoURL: string,
    whatsapp?: string,
  ) => {
    if (!user) return;
    try {
      // 1. Update user profile
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName,
          photoURL,
          whatsapp: whatsapp || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 2. Update current membership in active group if exists
      if (activeGroup) {
        await setDoc(
          doc(db, `groups/${activeGroup.id}/members`, user.uid),
          {
            displayName,
            photoURL,
            whatsapp: whatsapp || "",
          },
          { merge: true },
        );
      }

      // 3. Update all memberships
      const membershipsSnap = await getDocs(
        collection(db, `users/${user.uid}/memberships`),
      );
      const syncPromises = membershipsSnap.docs.map(async (mDoc) => {
        const gid = mDoc.id;
        try {
          await setDoc(
            doc(db, `groups/${gid}/members`, user.uid),
            {
              displayName,
              photoURL,
              whatsapp: whatsapp || "",
            },
            { merge: true },
          );
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
    <GroupContext.Provider
      value={{
        groups,
        invites,
        activeGroup,
        activeGroupMembers,
        loading,
        companyName,
        whatsappNumber,
        userWhatsapp,
        imageAnalysisPrompt,
        updateSettings,
        handleBackup,
        setActiveGroupId,
        createGroup,
        inviteUser,
        acceptInvite,
        declineInvite,
        removeMember,
        updateMemberRole,
        toggleGroupStatus,
        cancelInvite,
        updateProfile,
        apiFetch,
        isManagementOpen,
        setIsManagementOpen,
        managementMode,
        setManagementMode,
        configsActiveTab,
        setConfigsActiveTab,
      }}
    >
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
