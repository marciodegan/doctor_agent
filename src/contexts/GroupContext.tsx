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
  encryptionEnabled?: boolean;
}

interface GroupMember {
  userId: string;
  userEmail: string;
  displayName?: string;
  photoURL?: string;
  whatsapp?: string;
  role: string;
  status: "active" | "pending" | "cancelled" | "removed" | "conectado";
  encryptedGroupKey?: string;
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
  getGroupCryptoKey: (groupId: string) => Promise<Uint8Array | null>;
  isManagementOpen: boolean;
  setIsManagementOpen: (open: boolean) => void;
  managementMode: "dashboard" | "members" | "configs" | "shopping_config" | "administration";
  setManagementMode: (mode: "dashboard" | "members" | "configs" | "shopping_config" | "administration") => void;
  configsActiveTab: string | null;
  setConfigsActiveTab: (tab: string | null) => void;
}

const GroupContext = createContext<GroupContextType | undefined>(undefined);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { user, userKeys } = useAuth();
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
  const [managementMode, setManagementMode] = useState<"dashboard" | "members" | "configs" | "shopping_config" | "administration">("dashboard");
  const [configsActiveTab, setConfigsActiveTab] = useState<string | null>(null);
  const [firestoreLastGroupId, setFirestoreLastGroupId] = useState<string | null>(null);
  const [groupDocs, setGroupDocs] = useState<Record<string, any>>({});

  // In-memory cache of decrypted group symmetric key (Uint8Array)
  const groupKeysCache = React.useRef<{ [groupId: string]: Uint8Array }>({});

  const getGroupCryptoKey = async (groupId: string): Promise<Uint8Array | null> => {
    if (!user) {
      console.log("[E2E] getGroupCryptoKey missing user");
      return null;
    }

    if (groupKeysCache.current[groupId]) {
      return groupKeysCache.current[groupId];
    }

    let resolvedUserKeys = userKeys;
    if (!resolvedUserKeys) {
      console.log("[E2E] getGroupCryptoKey: userKeys is null in React state, trying to resolve from Firestore...");
      try {
        const privateKeyRef = doc(db, `users/${user.uid}/private`, "keyData");
        const privateKeySnap = await getDoc(privateKeyRef);
        if (privateKeySnap.exists()) {
          const data = privateKeySnap.data();
          resolvedUserKeys = {
            publicKeyJwk: data.publicKeyJwk,
            privateKeyJwk: data.privateKeyJwk,
          };
          console.log("[E2E] getGroupCryptoKey: Successfully resolved userKeys from Firestore on-the-fly!");
        } else {
          console.log("[E2E] getGroupCryptoKey: No userKeys found in Firestore, generating on-the-fly...");
          const { generateUserKeyPair } = await import("../lib/crypto");
          const keys = await generateUserKeyPair();
          await setDoc(privateKeyRef, {
            publicKeyJwk: keys.publicKeyJwk,
            privateKeyJwk: keys.privateKeyJwk,
            createdAt: new Date().toISOString(),
          });
          await setDoc(doc(db, "users", user.uid), {
            publicKeyJwk: keys.publicKeyJwk,
          }, { merge: true });
          resolvedUserKeys = keys;
          console.log("[E2E] getGroupCryptoKey: Successfully generated and saved new userKeys on-the-fly!");
        }
      } catch (keyErr) {
        console.error("[E2E] getGroupCryptoKey: Failed to resolve/generate userKeys on-the-fly:", keyErr);
        return null;
      }
    }

    if (!resolvedUserKeys) {
      console.log("[E2E] getGroupCryptoKey: Could not resolve userKeys");
      return null;
    }

    try {
      const memberRef = doc(db, `groups/${groupId}/members`, user.uid);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        const memberData = memberSnap.data();
        if (memberData.encryptedGroupKey) {
          console.log(`[E2E] Decrypting encryptedGroupKey for group: ${groupId}`);
          const { decryptGroupKeyWithPrivateKey } = await import("../lib/crypto");
          const rawKey = await decryptGroupKeyWithPrivateKey(memberData.encryptedGroupKey, resolvedUserKeys.privateKeyJwk);
          groupKeysCache.current[groupId] = rawKey;
          return rawKey;
        }
      }

      // Self-healing: if current user is owner/creator of an active group that doesn't have an E2E key yet, let's bootstrap it!
      const groupRef = doc(db, `groups`, groupId);
      const groupSnap = await getDoc(groupRef);
      if (groupSnap.exists()) {
        const groupData = groupSnap.data();
        if (groupData.createdBy === user.uid) {
          console.log(`[E2E] Self-healing and bootstrapping symmetric key for group: ${groupId}`);
          const { generateGroupKey, encryptGroupKeyWithPublicKey } = await import("../lib/crypto");
          const newGroupKey = await generateGroupKey();
          const encryptedGroupKey = await encryptGroupKeyWithPublicKey(newGroupKey, resolvedUserKeys.publicKeyJwk);
          
          await setDoc(memberRef, {
            encryptedGroupKey,
            keyVersion: 1
          }, { merge: true });

          await setDoc(groupRef, {
            encryptionEnabled: true
          }, { merge: true });

          groupKeysCache.current[groupId] = newGroupKey;
          return newGroupKey;
        }
      }
    } catch (e) {
      console.error("[E2E] getGroupCryptoKey failed:", e);
    }
    return null;
  };

  // Background secure key sync / rotation to other verified members of active group
  useEffect(() => {
    if (activeGroup && activeGroupMembers.length > 0 && user && userKeys) {
      const syncGroupKeys = async () => {
        try {
          const myKey = await getGroupCryptoKey(activeGroup.id);
          if (!myKey) return;

          for (const member of activeGroupMembers) {
            // Locate member documents that are active/conectado but don't have the encryptedGroupKey yet
            if (
              member.userId && 
              member.userId !== user.uid && 
              (member.status === "conectado" || member.status === "active") && 
              !member.encryptedGroupKey
            ) {
              const targetUserSnap = await getDoc(doc(db, "users", member.userId));
              if (targetUserSnap.exists()) {
                const targetData = targetUserSnap.data();
                if (targetData.publicKeyJwk) {
                  console.log(`[E2E] Encrypting group key with member public key for email: ${member.userEmail}`);
                  const { encryptGroupKeyWithPublicKey } = await import("../lib/crypto");
                  const encryptedKey = await encryptGroupKeyWithPublicKey(myKey, targetData.publicKeyJwk);
                  
                  await setDoc(
                    doc(db, `groups/${activeGroup.id}/members`, member.userId),
                    { encryptedGroupKey: encryptedKey },
                    { merge: true }
                  );
                  console.log(`[E2E] Successfully synced and updated key for member ${member.userEmail}`);
                }
              }
            }
          }
        } catch (err) {
          console.warn("[E2E] Background key sync warning:", err);
        }
      };

      // Stagger slightly to allow memberships listing to fully settle
      const timer = setTimeout(() => {
        syncGroupKeys();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [activeGroup, activeGroupMembers, user, userKeys]);

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

  const apiFetch = async (url: string, init?: RequestInit) => {
    const groupId =
      activeGroup?.id || safeLocalStorage.getItem("activeGroupId") || "";

    const token = await auth.currentUser?.getIdToken();
    const isFormData = init?.body instanceof FormData;

    return fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
        "x-group-id": groupId,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [ownedGroupsLoaded, setOwnedGroupsLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setGroups([]);
      setInvites([]);
      setActiveGroup(null);
      setLoading(false);
      setRawMemberships([]);
      setOwnedGroups([]);
      setEmailInvites([]);
      setMembershipsLoaded(false);
      setOwnedGroupsLoaded(false);
      return;
    }

    // Fast-path for Demo Doctor Preview Mode
    if (user.uid === "demo-doctor-preview") {
      const demoGroup: Group = {
        id: "demo-group-hospital",
        name: "Equipe Médica - Plantão Geral",
        createdBy: "demo-doctor-preview",
        groupType: "professional",
        status: "active",
        active: true,
        role: "admin",
        encryptionEnabled: false,
      };
      setGroups([demoGroup]);
      setActiveGroup(demoGroup);
      setActiveGroupMembers([
        {
          userId: "demo-doctor-preview",
          userEmail: "demo@doctor-agent.online",
          displayName: "Dr. Roberto Santos",
          role: "admin",
          status: "active",
        },
        {
          userId: "demo-nurse-1",
          userEmail: "enfermaria@hospital.com",
          displayName: "Enfª. Juliana Mendes",
          role: "member",
          status: "active",
        }
      ]);
      setLoading(false);
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
        setMembershipsLoaded(true);
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
        const owned = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const status = data.status || "active";
          if (!data.status) {
            setDoc(docSnap.ref, { status: "active" }, { merge: true })
              .catch(err => console.warn("Self-heal group status failed:", err));
          }
          return {
            id: docSnap.id,
            name: data.name || "Grupo",
            createdBy: data.createdBy,
            groupType: data.groupType || "professional",
            photoURL: data.photoURL || "",
            status: status as any,
            active: status === "active",
            ativo: status === "active",
            encryptionEnabled: !!data.encryptionEnabled,
          } as Group;
        });
        setOwnedGroups(owned);
        setOwnedGroupsLoaded(true);
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

    return () => {
      isMounted = false;
      unsubscribeMemberships();
      unsubscribeOwnedGroups();
      unsubscribeInvitations();
    };
  }, [user?.uid, user?.email]);

  // Listen to user profile for userWhatsapp and lastActiveGroupId
  useEffect(() => {
    if (!user) {
      setUserWhatsapp("");
      setFirestoreLastGroupId(null);
      setGroupDocs({});
      return;
    }

    const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserWhatsapp(data.whatsapp || "");
        if (data.lastActiveGroupId) {
          setFirestoreLastGroupId(data.lastActiveGroupId);
        } else {
          setFirestoreLastGroupId(null);
        }
      }
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // Real-time listener for each of the user's groups to get central/synchronized group data (such as name and photoURL)
  useEffect(() => {
    if (!user) {
      setGroupDocs({});
      return;
    }

    const uniqueIds = Array.from(new Set([
      ...rawMemberships.map((m) => m.id),
      ...ownedGroups.map((o) => o.id),
    ])).filter(Boolean);

    const activeListeners = new Map<string, () => void>();

    uniqueIds.forEach((gid) => {
      const docRef = doc(db, "groups", gid);
      const unsub = onSnapshot(docRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setGroupDocs((prev) => {
            const prevGroup = prev[gid];
            if (
              prevGroup &&
              prevGroup.name === data.name &&
              prevGroup.photoURL === data.photoURL &&
              prevGroup.groupType === data.groupType &&
              prevGroup.status === data.status
            ) {
              return prev;
            }
            return {
              ...prev,
              [gid]: {
                id: snap.id,
                ...data,
              },
            };
          });
        }
      }, (error) => {
        console.warn(`[GroupContext] Listener error for group ${gid}:`, error);
      });
      activeListeners.set(gid, unsub);
    });

    return () => {
      activeListeners.forEach((unsub) => unsub());
    };
  }, [user?.uid, rawMemberships.map(m => m.id).join(","), ownedGroups.map(o => o.id).join(",")]);

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

      // Centralized group document data check
      const centralDoc = groupDocs[m.id];
      const name = centralDoc?.name || m.groupName || m.name || "Grupo";
      const photoURL = centralDoc?.photoURL || m.groupPhotoURL || m.photoURL || "";
      const groupType = centralDoc?.groupType || m.groupType || "professional";

      return {
        id: m.id,
        name,
        groupType,
        status: status as "active" | "pending" | "removed" | "terminated",
        photoURL,
        active: status === "active",
        ativo: status === "active",
        createdBy: centralDoc?.createdBy || m.createdBy || "",
        role: m.role || "",
        encryptionEnabled: centralDoc?.encryptionEnabled || false,
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
      
      const centralDoc = groupDocs[g.id];
      const name = centralDoc?.name || g.name;
      const photoURL = centralDoc?.photoURL || g.photoURL;
      const groupType = centralDoc?.groupType || g.groupType;

      const existing = groupsMap.get(g.id);
      if (existing) {
        groupsMap.set(g.id, {
          ...g,
          name,
          photoURL,
          groupType,
          status: g.status || existing.status || "active",
          active: (g.status || existing.status || "active") === "active",
          ativo: (g.status || existing.status || "active") === "active",
          encryptionEnabled: centralDoc?.encryptionEnabled || g.encryptionEnabled || existing.encryptionEnabled || false,
        });
      } else {
        groupsMap.set(g.id, {
          ...g,
          name,
          photoURL,
          groupType,
          active: g.status === "active",
          ativo: g.status === "active",
          encryptionEnabled: centralDoc?.encryptionEnabled || g.encryptionEnabled || false,
        });
      }
    });

    const combinedGroupsList = Array.from(groupsMap.values()).filter(g => g.status !== "terminated");

    // 3. Filter and Sort Groups
    const activeList = combinedGroupsList
      .filter((g) => g.status === "active")
      .sort((a, b) => {
        return a.name.localeCompare(b.name);
      });

    const removedList = combinedGroupsList
      .filter((g) => g.status === "removed")
      .sort((a, b) => {
        return a.name.localeCompare(b.name);
      });

    const sortedGroups = [...activeList, ...removedList];
    setGroups(sortedGroups);

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

    if (!membershipsLoaded || !ownedGroupsLoaded) {
      // Do not run active group resolution until both Firestore snapshots are ready
      return;
    }

    // 5. Restore active group or handle removal
    const savedGroupId = safeLocalStorage.getItem("activeGroupId");
    const lastSavedId = firestoreLastGroupId || savedGroupId;

    if (lastSavedId) {
      const foundSaved = activeList.find((g) => g.id === lastSavedId);
      if (foundSaved) {
        // Restore if found and active
        setActiveGroup((prev) => (prev?.id === foundSaved.id ? prev : foundSaved));
        safeLocalStorage.setItem("activeGroupId", foundSaved.id);
      } else {
        // Rule 4 & 5: The last active group is either removed, terminated, or not permitted.
        // We do not load any group automatically, and redirect to the selection list of groups.
        setActiveGroup(null);
        safeLocalStorage.setItem("activeGroupId", "");

        // Opcionalmente limpar esse último grupo salvo se o usuário estiver logado
        if (user) {
          setDoc(doc(db, "users", user.uid), {
            lastActiveGroupId: "",
            lastActiveGroupType: ""
          }, { merge: true }).catch(err => {
            console.error("Failed to clear lastActiveGroupId:", err);
          });
        }
      }
    } else {
      const foundCurrent = activeList.find((g) => g.id === activeGroup?.id);
      if (foundCurrent) {
        setActiveGroup(foundCurrent);
      } else if (activeList.length > 0) {
        // Default to first active group if none saved/found
        const firstActive = activeList[0];
        setActiveGroup(firstActive);
        safeLocalStorage.setItem("activeGroupId", firstActive.id);
        // Also save to Firestore for initial setup consistency
        if (user) {
          setDoc(doc(db, "users", user.uid), {
            lastActiveGroupId: firstActive.id,
            lastActiveGroupType: firstActive.groupType,
            updatedAt: serverTimestamp(),
          }, { merge: true }).catch(err => {
            console.error("Failed to save default active group:", err);
          });
        }
      } else {
        setActiveGroup(null);
        safeLocalStorage.setItem("activeGroupId", "");
      }
    }
    
    setLoading(false);
  }, [rawMemberships, ownedGroups, emailInvites, user?.uid, firestoreLastGroupId, membershipsLoaded, ownedGroupsLoaded, groupDocs]); // Consolidate into a stable dependency list

  const saveLastActiveGroupToFirestore = async (groupId: string, groupType: string) => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          lastActiveGroupId: groupId,
          lastActiveGroupType: groupType,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error("Error updating last active group in Firestore:", err);
    }
  };

  const setActiveGroupId = (id: string) => {
    const group = groups.find((g) => g.id === id);
    if (group) {
      safeLocalStorage.setItem("activeGroupId", id);
      setActiveGroup(group);
      saveLastActiveGroupToFirestore(group.id, group.groupType);
    }
  };

  const createGroup = async (
    name: string,
    type: "professional" | "personal" = "professional",
  ) => {
    const activeUser = user || auth.currentUser;
    if (!activeUser) throw new Error("Aguardando sincronização com o banco de dados. Por favor, tente novamente em alguns segundos.");

    try {
      const userSnap = await getDoc(doc(db, "users", activeUser.uid));
      const profile = userSnap.exists() ? userSnap.data() : {};

      const groupRef = await addDoc(collection(db, "groups"), {
        name,
        groupType: type,
        createdBy: activeUser.uid,
        createdAt: serverTimestamp(),
        status: "active",
        active: true,
        ativo: true,
      });

      const groupId = groupRef.id;
      // Update the doc with its own ID for easier querying later
      await setDoc(groupRef, { id: groupId }, { merge: true });

      // Add self as member
      await setDoc(doc(db, `groups/${groupId}/members`, activeUser.uid), {
        userId: activeUser.uid,
        userEmail: activeUser.email || "",
        displayName: profile.displayName || "",
        photoURL: profile.photoURL || "",
        whatsapp: profile.whatsapp || "",
        role: "owner",
        status: "active",
        joinedAt: serverTimestamp(),
      });

      // E2E Encryption Bootstrapping
      try {
        let activeUserKeys = userKeys;
        if (!activeUserKeys) {
          console.log("[E2E] userKeys not in context state yet during group creation, loading from database...");
          const privateKeyRef = doc(db, `users/${user.uid}/private`, "keyData");
          const privateKeySnap = await getDoc(privateKeyRef);
          if (privateKeySnap.exists()) {
            const data = privateKeySnap.data();
            activeUserKeys = {
              publicKeyJwk: data.publicKeyJwk,
              privateKeyJwk: data.privateKeyJwk,
            };
          } else {
            console.log("[E2E] Generating keys on-the-fly during group creation...");
            const { generateUserKeyPair } = await import("../lib/crypto");
            const keys = await generateUserKeyPair();
            await setDoc(privateKeyRef, {
              publicKeyJwk: keys.publicKeyJwk,
              privateKeyJwk: keys.privateKeyJwk,
              createdAt: new Date().toISOString(),
            });
            await setDoc(doc(db, "users", user.uid), {
              publicKeyJwk: keys.publicKeyJwk,
            }, { merge: true });
            activeUserKeys = keys;
          }
        }

        if (activeUserKeys) {
          console.log("[E2E] Bootstrapping symmetric key for new group:", groupId);
          const { generateGroupKey, encryptGroupKeyWithPublicKey } = await import("../lib/crypto");
          const newGroupKey = await generateGroupKey();
          const encryptedGroupKey = await encryptGroupKeyWithPublicKey(newGroupKey, activeUserKeys.publicKeyJwk);

          // Update member document with the encryptedGroupKey
          await setDoc(doc(db, `groups/${groupId}/members`, user.uid), {
            encryptedGroupKey,
            keyVersion: 1
          }, { merge: true });

          // Update group document to set encryptionEnabled
          await setDoc(groupRef, {
            encryptionEnabled: true
          }, { merge: true });

          // Cache the decrypted key in-memory
          groupKeysCache.current[groupId] = newGroupKey;
        }
      } catch (cryptoErr) {
        console.error("[E2E] Failed to bootstrap E2E key on group creation:", cryptoErr);
      }

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
      // Google Drive integration is disabled. File storage is being migrated to Firebase Storage.

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
      // Google Drive integration is disabled. File storage is being migrated to Firebase Storage.

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
      // Google Drive integration is disabled. File storage is being migrated to Firebase Storage.
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

      const myMembershipSnap = await getDoc(doc(db, `users/${user.uid}/memberships`, groupId));
      const myMembershipData = myMembershipSnap.exists() ? myMembershipSnap.data() : null;
      const isOwner = myMembershipData?.role === "owner";

      if (!isOwner && !isCreator) {
        throw new Error(
          "Apenas o administrador do grupo pode terminá-lo.",
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
          updatedAt: serverTimestamp(),
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
          setActiveGroup(null);
          safeLocalStorage.setItem("activeGroupId", "");
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
        getGroupCryptoKey,
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
