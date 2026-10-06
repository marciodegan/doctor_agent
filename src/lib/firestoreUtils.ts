import { auth, db } from "./firebase";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  serverTimestamp, 
} from "firebase/firestore";

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export async function runMigration() {
  console.log("Starting doctor migration...");
  const groupsSnap = await getDocs(collection(db, "groups"));
  
  for (const groupDoc of groupsSnap.docs) {
    const groupData = groupDoc.data();
    const doctors = groupData.doctors || [];
    
    for (const docObj of doctors) {
      const doctorId = docObj.key || docObj.id;
      if (!doctorId) continue;

      // 1. Create/Update Global Doctor
      await setDoc(doc(db, "doctors", doctorId), {
        id: doctorId,
        name: docObj.name,
        specialty: docObj.specialty || "",
        crm: docObj.crm || "",
        active: docObj.active !== false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Create/Update Team Doctor relationship
      const teamDoctorId = `${groupDoc.id}_${doctorId}`;
      await setDoc(doc(db, "team_doctors", teamDoctorId), {
        id: teamDoctorId,
        teamId: groupDoc.id,
        doctorId: doctorId,
        isTeamMember: docObj.isTeamMember || false,
        participaUnimed: docObj.participaUnimed || false,
        percentualNominal: docObj.percentualNominal || 0,
        proporcaoHeart: docObj.proporcaoHeart || 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  }
  console.log("Migration finished.");
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
