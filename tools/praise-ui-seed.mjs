import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST || process.env.GCLOUD_PROJECT !== 'demo-family-dashboard') throw new Error('Local disposable project only');
initializeApp({ projectId: 'demo-family-dashboard' }); const auth = getAuth(), db = getFirestore();
for (const role of ['parent','child']) { const u = await auth.createUser({ email: `praise-ui-${role}@example.test`, password: 'EmulatorOnly!praise123' }); await auth.setCustomUserClaims(u.uid, { role }); }
const root = 'households/main';
await db.doc(root+'/private/parent_config').set({ parentPin:'2468', updatedAt:FieldValue.serverTimestamp() });
for(const m of [{id:'m1',name:'부모',color:'#de9978'},{id:'m2',name:'부모',color:'#b7d2ba'},{id:'m3',name:'수호',color:'#e4b36b'}])await db.doc(root+'/members/'+m.id).set(m);
for(const [id,title,points] of [['greeting','인사 잘하기',1],['diary','일기 한번에 통과하기',2],['meal','밥 다 먹기',3]])await db.doc(root+'/missions/'+id).set({id,title,points,due:'',days:[],member:'m3',bonus:0});
await db.doc(root+'/wishlist/sticker').set({id:'sticker',title:'스티커 1판',need:200,cat:'etc',boughtAt:'',by:'m3',at:'2026-11-22'});
await db.doc(root+'/child_state/partner').set({partnerKey:'L172-25-26',sinceXp:0,updatedAt:FieldValue.serverTimestamp()});
console.log('Seeded only local demo users and example family records.');
