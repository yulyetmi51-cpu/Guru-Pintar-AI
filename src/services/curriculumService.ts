import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore';

export interface Curriculum {
  id?: string;
  jenjang: string;
  grade: string;
  subject: string;
  babs: {
    name: string;
    topics: string[];
  }[];
}

export async function getCurriculum(jenjang: string, grade: string, subject: string): Promise<Curriculum | null> {
  try {
    const q = query(
      collection(db, 'curriculum'),
      where('jenjang', '==', jenjang),
      where('grade', '==', grade),
      where('subject', '==', subject)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Curriculum;
    }
    return null;
  } catch (error) {
    console.error("Error fetching curriculum:", error);
    return null;
  }
}

export async function getAllCurriculums(): Promise<Curriculum[]> {
  try {
    const snapshot = await getDocs(collection(db, 'curriculum'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Curriculum));
  } catch (error) {
    console.error("Error fetching all curriculums:", error);
    return [];
  }
}

export async function saveCurriculum(curriculum: Curriculum): Promise<void> {
  try {
    const id = curriculum.id || `${curriculum.jenjang}-${curriculum.grade}-${curriculum.subject}`.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const docRef = doc(db, 'curriculum', id);
    await setDoc(docRef, {
      jenjang: curriculum.jenjang,
      grade: curriculum.grade,
      subject: curriculum.subject,
      babs: curriculum.babs,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error("Error saving curriculum:", error);
    throw error;
  }
}

export async function deleteCurriculum(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'curriculum', id));
  } catch (error) {
    console.error("Error deleting curriculum:", error);
    throw error;
  }
}
