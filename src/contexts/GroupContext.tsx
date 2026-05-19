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
  collectionGroup,
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
  status?: "active" | "pending" | "removed" | "terminated";
  active?: boolean;
  ativo?: boolean;
  role?: string;
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
  terminateGroup: (groupId: string) => Promise<void>;
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
  const [companyName, setCompanyName] = useState("Dr. Agent");

  useEffect(() => {
    setCompanyName("Dr. Agent");
  }, [activeGroup?.groupType]);
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
            
            // Skip automatic name sync to keep app brand as Dr. Agent
            if (data.name && data.name !== companyName && !companyName) {
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
  const [ownedGroups, setOwnedGroups] = useState<Group[]>([]);
  const [emailInvites, setEmailInvites] = useState<Group[]>([]);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setInvites([]);
      setActiveGroup(null);
      setLoading(false);
      setRawMemberships([]);
      setOwnedGroups([]);
      setEmailInvites([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    // 1. Listen to memberships
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
    
    // 2. Listen to groups created by user (admins)
    const groupsQuery = query(
      collection(db, "groups"),
      where("createdBy", "==", user.uid)
    );
    const unsubscribeOwnedGroups = onSnapshot(
      groupsQuery,
      (snapshot) => {
        if (!isMounted) return;
        const owned = snapshot.docs.map((doc) => {
          const data = doc.data();
          const status = data.status || "active";
          return {
            id: doc.id,
            name: data.name || "Grupo",
            createdBy: data.createdBy,
            groupType: data.groupType || "professional",
            photoURL: data.photoURL || "",
            status: status as any,
            active: data.active !== false && data.ativo !== false,
            ativo: data.ativo !== false && data.active !== false,
          } as Group;
        });
        setOwnedGroups(owned);
      },
      (error) => {
        console.error("Owned groups listener error", error);
      }
    );

    // 3. Listen to invitations by email
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
          const items = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: data.groupId,
              name: data.groupName || "Novo Grupo",
              createdBy: data.inviterId,
              status: "pending" as const,
              groupType: data.groupType || "professional",
            } as Group;
          });
          setEmailInvites(items);
        },
        (error) => {
          console.error("Invitations listener error", error);
        },
      );
    }

    // 4. Self-healing membership finder (userId check)
    let unsubscribeGroupByUid = () => {};
    try {
      unsubscribeGroupByUid = onSnapshot(
        query(collectionGroup(db, "members"), where("userId", "==", user.uid)),
        async (snapshot) => {
          if (!isMounted) return;
          for (const memberDoc of snapshot.docs) {
            const memberData = memberDoc.data();
            const parentGroupRef = memberDoc.ref.parent?.parent;
            if (parentGroupRef) {
              const groupId = parentGroupRef.id;
              try {
                const membershipRef = doc(db, `users/${user.uid}/memberships`, groupId);
                const mSnap = await getDoc(membershipRef);
                if (!mSnap.exists()) {
                  const groupSnap = await getDoc(parentGroupRef);
                  if (groupSnap.exists()) {
                    const groupData = groupSnap.data();
                    const status = memberData.status === "conectado" ? "active" : (memberData.status || "active");
                    await setDoc(membershipRef, {
                      groupId,
                      groupName: groupData.name || "Grupo",
                      groupType: groupData.groupType || "professional",
                      role: memberData.role || "member",
                      status: status,
                    }, { merge: true });
                  }
                }
              } catch (err) {
                console.warn("Failed self-healing sync by UID for group", groupId, err);
              }
            }
          }
        },
        (error) => {
          console.warn("Collection group members UID listener error:", error);
        }
      );
    } catch (e) {
      console.warn("Member UID group query failed to initialize", e);
    }

    // 5. Self-healing membership finder (userEmail check)
    let unsubscribeGroupByEmail = () => {};
    if (user.email) {
      const cleanEmail = user.email.trim().toLowerCase();
      try {
        unsubscribeGroupByEmail = onSnapshot(
          query(collectionGroup(db, "members"), where("userEmail", "==", cleanEmail)),
          async (snapshot) => {
            if (!isMounted) return;
            for (const memberDoc of snapshot.docs) {
              const memberData = memberDoc.data();
              const parentGroupRef = memberDoc.ref.parent?.parent;
              if (parentGroupRef) {
                const groupId = parentGroupRef.id;
                
                // If the group member document has no userId associated, heal it in the background
                if (!memberData.userId) {
                  try {
                    await setDoc(memberDoc.ref, { userId: user.uid }, { merge: true });
                  } catch (err) {
                    console.warn("Failed self-healing userId sync for member document:", err);
                  }
                }

                try {
                  const membershipRef = doc(db, `users/${user.uid}/memberships`, groupId);
                  const mSnap = await getDoc(membershipRef);
                  if (!mSnap.exists()) {
                    const groupSnap = await getDoc(parentGroupRef);
                    if (groupSnap.exists()) {
                      const groupData = groupSnap.data();
                      const status = memberData.status === "conectado" ? "active" : (memberData.status || "active");
                      await setDoc(membershipRef, {
                        groupId,
                        groupName: groupData.name || "Grupo",
                        groupType: groupData.groupType || "professional",
                        role: memberData.role || "member",
                        status: status,
                      }, { merge: true });
                    }
                  }
                } catch (err) {
                  console.warn("Failed self-healing sync by Email for group", groupId, err);
                }
              }
            }
          },
          (error) => {
            console.warn("Collection group members Email listener error:", error);
          }
        );
      } catch (e) {
        console.warn("Member Email group query failed to initialize", e);
      }
    }

    return () => {
      isMounted = false;
      unsubscribeMemberships();
      unsubscribeOwnedGroups();
      unsubscribeInvitations();
      unsubscribeGroupByUid();
      unsubscribeGroupByEmail();
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
    const defaultName = "Dr. Agent";
    if (activeGroup?.name) {
      document.title = activeGroup.name;
    } else {
      document.title = defaultName;
    }
  }, [activeGroup?.name, activeGroup?.groupType]);

  // Effect to populate groups and invites when rawData change
  useEffect(() => {
    if (!user) return; // Wait for user

    // 1. Process memberships
    const membershipGroups = rawMemberships.map((m) => {
      let status = m.status || "active";
      if (status === "conectado") status = "active" as const;

      return {
        id: m.id,
        name: m.groupName || m.name || "Grupo",
        groupType: m.groupType || "professional",
        status: status as "active" | "pending" | "removed" | "terminated",
        photoURL: m.groupPhotoURL || m.photoURL || "",
        active: status === "active",
        ativo: status === "active",
        createdBy: m.createdBy || "",
        role: m.role || ""
      } as Group;
    });

    // 2. Merge logic using Map for deduplication
    // We prioritize ownedGroups first because they come directly from the groups collection
    const groupsMap = new Map<string, Group>();
    
    // Map of owned groups for quick lookup
    const ownedIds = new Set(ownedGroups.map(og => og.id));

    // Add all from memberships, but FILTER OUT those that claim to be owned by user 
    // but are NOT in the groups collection (stale memberships for deleted groups)
    membershipGroups.forEach(mg => {
      const isClaimedOwner = mg.createdBy === user.uid || mg.role === "owner";
      
      // If user is owner/creator but group is NOT in ownedGroups, it's likely deleted
      // We only filter if ownedGroups has potentially loaded (at least checked once)
      if (isClaimedOwner && !ownedIds.has(mg.id)) {
        return; 
      }
      
      groupsMap.set(mg.id, mg);
    });
    
    // Supplement/Override with ownedGroups (direct from groups collection)
    ownedGroups.forEach(g => {
      if (g.status === "terminated") return;
      
      const existing = groupsMap.get(g.id);
      if (existing) {
        groupsMap.set(g.id, {
          ...g,
          status: existing.status,
          active: existing.status === "active",
          ativo: existing.status === "active",
        });
      } else if (g.active) {
        groupsMap.set(g.id, g);
      }
    });

    const combinedGroupsList = Array.from(groupsMap.values());

    // 3. Filter and Sort Active Groups
    const activeList = combinedGroupsList
      .filter((g) => g.status === "active")
      .sort((a, b) => {
        return a.name.localeCompare(b.name);
      });

    setGroups(activeList);

    // 4. Consolidate Invites (Pending memberships + Email invites)
    const pendingFromMemberships = combinedGroupsList.filter(
      (g) => g.status === "pending",
    );
    
    const invitesMap = new Map<string, Group>();
    pendingFromMemberships.forEach(i => invitesMap.set(i.id, i));
    emailInvites.forEach(i => {
      if (!invitesMap.has(i.id)) {
        invitesMap.set(i.id, i);
      }
    });

    setInvites(Array.from(invitesMap.values()));

    // 5. Restore active group or handle removal
    const savedGroupId = safeLocalStorage.getItem("activeGroupId");
    const foundSaved = activeList.find((g) => g.id === savedGroupId);
    const foundCurrent = activeList.find((g) => g.id === activeGroup?.id);

    if (foundSaved) {
      // Restore from storage if valid (priority)
      setActiveGroup((prev) => (prev?.id === foundSaved.id ? prev : foundSaved));
    } else if (foundCurrent) {
      // Maintain current if current is valid
      setActiveGroup(foundCurrent);
    } else if (activeList.length > 0) {
      // Default to first active group if none saved/found
      const firstActive = activeList[0];
      setActiveGroup(firstActive);
      safeLocalStorage.setItem("activeGroupId", firstActive.id);
    } else {
      setActiveGroup(null);
    }
    
    setLoading(false);
  }, [rawMemberships, ownedGroups, emailInvites, user?.uid]); // Consolidate into a stable dependency list

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

      // --- Drive Automation ---
      if (type === "personal") {
        try {
          console.log("[Drive] Triggering automatic setup for personal group:", name);
          const driveRes = await apiFetch("/api/drive/setup", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "x-group-id": groupId
            },
            body: JSON.stringify({ 
              rootFolderName: name,
              adminEmail: user.email 
            }),
          });
          
          if (!driveRes.ok) {
            console.warn("[Drive] Automatic setup returned non-OK status:", driveRes.status);
          } else {
            console.log("[Drive] Automatic setup completed successfully");
          }
        } catch (driveErr) {
          console.error("[Drive] Automatic setup failed:", driveErr);
          // Do not fail group creation because Drive failed
        }
      }

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

      // --- Drive Sharing ---
      if (activeGroup?.groupType === "personal") {
        try {
          console.log(`[Drive] Triggering manual share for ${cleanEmail}`);
          await apiFetch("/api/drive/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: cleanEmail }),
          });
        } catch (driveErr) {
          console.error("[Drive] Sharing failed:", driveErr);
        }
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

      // --- Drive Sharing (on Accept) ---
      if (user.email) {
        try {
          const groupSnap = await getDoc(doc(db, "groups", groupId));
          if (groupSnap.exists() && groupSnap.data()?.groupType === "personal") {
            await apiFetch("/api/drive/share", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                email: user.email, 
                forceSync: true 
              }),
            });
          }
        } catch (driveErr) {
          console.error("[Drive] Auto-share on accept failed:", driveErr);
        }
      }
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

      // 2. Check membership role (owner) - look in groups list first for current user's role if possible
      // or just assume if they got this far they might be allowed, but we'll check firestore memberships for safety
      const myMembershipSnap = await getDoc(doc(db, `users/${user.uid}/memberships`, groupId));
      const myMembershipData = myMembershipSnap.exists() ? myMembershipSnap.data() : null;
      const isOwner = myMembershipData?.role === "owner";

      if (!isOwner && !isCreator) {
        throw new Error("Apenas o administrador do grupo pode desativá-lo.");
      }

      const newStatus = active ? "active" : "removed";

      // 3. Update the document with both field names to ensure compatibility
      await setDoc(
        groupDocRef,
        {
          active: active,
          ativo: active,
          status: newStatus,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 4. Update the CURRENT user's membership immediately for fast local UI sync
      await setDoc(
        doc(db, `users/${user.uid}/memberships`, groupId),
        {
          status: newStatus,
        },
        { merge: true },
      );

      // 5. Update other members' memberships as best effort
      const membersSnap = await getDocs(
        collection(db, `groups/${groupId}/members`),
      );
      
      const otherMembersUpdates = membersSnap.docs
        .filter(doc => doc.id !== user.uid)
        .map((memberDoc) => {
          const memberId = memberDoc.id;
          return setDoc(
            doc(db, `users/${memberId}/memberships`, groupId),
            {
              status: newStatus,
            },
            { merge: true },
          ).catch(e => console.warn(`Failed to update membership for member ${memberId}`, e));
        });
      
      await Promise.all(otherMembersUpdates);

      // 6. Update local state immediately
      if (activeGroup?.id === groupId) {
        setActiveGroup((prev) =>
          prev
            ? {
                ...prev,
                active,
                ativo: active,
                status: newStatus as any,
              }
            : null,
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${groupId}`);
    }
  };

  const terminateGroup = async (groupId: string) => {
    if (!user) throw new Error("Must be logged in");
    try {
      const groupDocRef = doc(db, "groups", groupId);
      const groupSnap = await getDoc(groupDocRef);
      const groupData = groupSnap.data();
      const isCreator = groupData?.createdBy === user.uid;

      if (!isCreator) {
        throw new Error(
          "Apenas o criador do grupo pode terminá-lo definitivamente.",
        );
      }

      // 1. Update group doc
      await setDoc(
        groupDocRef,
        {
          status: "terminated",
          active: false,
          ativo: false,
          terminatedAt: serverTimestamp(),
          terminatedBy: user.uid,
        },
        { merge: true },
      );

      // 2. Update CURRENT user's membership
      await setDoc(
        doc(db, `users/${user.uid}/memberships`, groupId),
        {
          status: "terminated",
        },
        { merge: true },
      );

      // 3. Update all members' memberships to "terminated" as best effort
      const membersSnap = await getDocs(
        collection(db, `groups/${groupId}/members`),
      );
      const updatePromises = membersSnap.docs
        .filter(doc => doc.id !== user.uid)
        .map((memberDoc) => {
          const memberId = memberDoc.id;
          return setDoc(
            doc(db, `users/${memberId}/memberships`, groupId),
            {
              status: "terminated",
            },
            { merge: true },
          ).catch(e => console.warn(`Failed to terminate membership for member ${memberId}`, e));
        });
      await Promise.all(updatePromises);

      // 4. If it was the active group, switch to another one
      if (activeGroup?.id === groupId) {
        const remaining = groups.filter(
          (g) => g.id !== groupId && g.status !== "terminated" && g.status !== "removed",
        );
        if (remaining.length > 0) {
          setActiveGroupId(remaining[0].id);
        } else {
          // If no active ones, try a removed one? 
          const sortedRemaining = groups.filter(g => g.id !== groupId && g.status !== "terminated");
          if (sortedRemaining.length > 0) {
            setActiveGroupId(sortedRemaining[0].id);
          } else {
            setActiveGroup(null);
            safeLocalStorage.setItem("activeGroupId", "");
          }
        }
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
        terminateGroup,
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
